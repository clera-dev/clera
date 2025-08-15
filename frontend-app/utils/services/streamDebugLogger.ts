import 'server-only';
import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';

interface StreamDebugLoggerOptions {
  filePath?: string | null;
}

/**
 * Minimal server-side debug logger for LangGraph stream diagnostics.
 * Writes sanitized event metadata to a newline-delimited .txt file.
 * Disabled unless LANGGRAPH_DEBUG_LOG=1 or in development.
 */
type SharedLoggerState = {
  stream: fs.WriteStream | null;
  queue: string[];
  isFlushing: boolean;
  enabled: boolean;
};

export class StreamDebugLogger {
  private logFilePath: string;
  private enabled: boolean;
  // Shared state across all instances by file path
  private static sharedByPath: Map<string, SharedLoggerState> = new Map();

  private safeStringify(value: any): string {
    const seen = new WeakSet();
    const replacer = (_key: string, val: any) => {
      if (typeof val === 'bigint') return val.toString();
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    };
    try {
      return JSON.stringify(value, replacer);
    } catch {
      try {
        return String(value);
      } catch {
        return '[Unserializable]';
      }
    }
  }

  constructor(options: StreamDebugLoggerOptions = {}) {
    // Default path inside project tmp dir
    const defaultPath = path.resolve(process.cwd(), 'tmp', 'langgraph_stream_debug.txt');
    this.logFilePath = (options.filePath && options.filePath.trim().length > 0)
      ? options.filePath
      : defaultPath;

    // Enable based on env flags
    this.enabled = process.env.LANGGRAPH_DEBUG_LOG === '1' || process.env.NODE_ENV === 'development';

    // Asynchronously ensure directory exists exactly once per process and then init stream.
    // Avoids blocking the event loop on every request.
    if (this.enabled) {
      ensureLogDir(this.logFilePath)
        .then(() => {
          // Initialize shared state lazily
          StreamDebugLogger.ensureShared(this.logFilePath, this.enabled);
        })
        .catch((e) => {
          console.error('[StreamDebugLogger] Failed to ensure log directory:', e);
          this.enabled = false;
        });
    }
  }

  log(line: string) {
    if (!this.enabled) return;
    try {
      StreamDebugLogger.enqueue(this.logFilePath, line, this.enabled);
    } catch (e) {
      // Never throw from logger
    }
  }

  private static ensureShared(filePath: string, enabled: boolean): SharedLoggerState | null {
    let state = this.sharedByPath.get(filePath);
    if (!state) {
      state = { stream: null, queue: [], isFlushing: false, enabled };
      this.sharedByPath.set(filePath, state);
    } else {
      state.enabled = state.enabled || enabled;
    }
    if (!state.enabled) return null;
    if (!state.stream) {
      try {
        const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
        stream.on('error', () => {
          // Disable logging on stream errors to avoid impacting request path
          state!.enabled = false;
          try { stream.destroy(); } catch {}
          state!.stream = null;
          state!.queue = [];
        });
        state.stream = stream;
      } catch {
        state.enabled = false;
        state.stream = null;
        state.queue = [];
      }
    }
    return state;
  }

  private static enqueue(filePath: string, line: string, enabled: boolean) {
    const state = this.ensureShared(filePath, enabled);
    if (!state || !state.enabled || !state.stream) return;
    state.queue.push(line + '\n');
    this.flush(filePath, state);
  }

  private static flush(filePath: string, state?: SharedLoggerState) {
    const s = state || this.sharedByPath.get(filePath);
    if (!s || !s.stream || s.isFlushing) return;
    s.isFlushing = true;
    const writeNext = () => {
      if (!s.stream) { s.isFlushing = false; return; }
      let chunk: string | undefined;
      while ((chunk = s.queue.shift())) {
        const canContinue = s.stream.write(chunk);
        if (!canContinue) {
          s.stream.once('drain', writeNext);
          return;
        }
      }
      s.isFlushing = false;
    };
    writeNext();
  }

  logSessionStart(threadId: string, info: Record<string, any>, runId?: string) {
    if (!this.enabled) return;
    const timestamp = new Date().toISOString();
    StreamDebugLogger.enqueue(this.logFilePath, this.safeStringify({ type: 'session_start', timestamp, threadId, runId: runId || 'unknown', info }), this.enabled);
  }

  logSessionEnd(threadId: string, summary: Record<string, any>) {
    if (!this.enabled) return;
    const timestamp = new Date().toISOString();
    StreamDebugLogger.enqueue(this.logFilePath, this.safeStringify({ type: 'session_end', timestamp, threadId, summary }), this.enabled);
  }

  logDerivedEvent(threadId: string, kind: string, data?: Record<string, any>, runId?: string) {
    if (!this.enabled) return;
    const timestamp = new Date().toISOString();
    StreamDebugLogger.enqueue(this.logFilePath, this.safeStringify({ type: 'derived_event', timestamp, threadId, runId: runId || 'unknown', kind, data }), this.enabled);
  }

  logChunk(threadId: string, rawChunk: any, runId?: string) {
    if (!this.enabled) return;
    try {
      const safeEvent = (rawChunk && typeof rawChunk === 'object') ? rawChunk.event : undefined;
      const data = (rawChunk && typeof rawChunk === 'object') ? rawChunk.data : undefined;

      // Extract richer, but still sanitized, metadata
      let dataSummary: any = undefined;
      if (safeEvent === 'updates' && data && typeof data === 'object') {
        const nodeName = Object.keys(data)[0];
        const nodeData = (nodeName && data[nodeName]) || undefined;
        const nodeKeys = nodeData && typeof nodeData === 'object' ? Object.keys(nodeData) : [];
        let toolCandidate: any = undefined;
        if (nodeData && typeof nodeData === 'object') {
          // If messages exist, map their shapes without content
          const msgs = Array.isArray((nodeData as any).messages) ? (nodeData as any).messages : [];
          const msgShapes = msgs.map((m: any) => ({
            type: m?.type,
            name: m?.name,
            tool: m?.tool,
            status: m?.status,
            role: m?.role,
            contentType: typeof m?.content,
            contentLen: typeof m?.content === 'string' ? m.content.length : (Array.isArray(m?.content) ? m.content.length : undefined)
          }));
          toolCandidate = msgShapes.find((s: any) => s.type === 'tool' || s.tool);
          dataSummary = { node: nodeName, nodeKeys, msgShapes, toolCandidate };
        } else {
          dataSummary = { node: nodeName, nodeKeys };
        }
      } else if ((safeEvent === 'messages' || safeEvent === 'messages/complete') && Array.isArray(data)) {
        dataSummary = {
          arrayLength: data.length,
          items: data.slice(0, 10).map((item: any) => ({
            type: item?.type,
            name: item?.name,
            tool: item?.tool,
            status: item?.status,
            role: item?.role,
            hasContent: !!item?.content,
            contentType: typeof item?.content,
            contentLen: typeof item?.content === 'string' ? item.content.length : (Array.isArray(item?.content) ? item.content.length : undefined)
          }))
        };
      } else if (typeof data === 'string') {
        dataSummary = { stringLength: data.length };
      } else if (data && typeof data === 'object') {
        dataSummary = { keys: Object.keys(data) };
      }

      const timestamp = new Date().toISOString();
      const entry = this.safeStringify({ type: 'raw_chunk', timestamp, threadId, runId: runId || 'unknown', event: safeEvent, dataSummary });
      StreamDebugLogger.enqueue(this.logFilePath, entry, this.enabled);
    } catch (e) {
      // Ignore logging errors
    }
  }
}

// --- Module-level, one-time async directory initialization ---
let dirInitPromises: Record<string, Promise<void>> = {};
function ensureLogDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  if (!dirInitPromises[dir]) {
    dirInitPromises[dir] = fsp.mkdir(dir, { recursive: true }).then(() => undefined).catch((e) => {
      // Propagate error to caller; also remove cached promise to allow retry on next request
      delete dirInitPromises[dir];
      throw e;
    });
  }
  return dirInitPromises[dir];
}


