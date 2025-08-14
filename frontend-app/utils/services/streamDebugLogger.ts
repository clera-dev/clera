import fs from 'fs';
import path from 'path';

interface StreamDebugLoggerOptions {
  filePath?: string | null;
}

/**
 * Minimal server-side debug logger for LangGraph stream diagnostics.
 * Writes sanitized event metadata to a newline-delimited .txt file.
 * Disabled unless LANGGRAPH_DEBUG_LOG=1 or in development.
 */
export class StreamDebugLogger {
  private logFilePath: string;
  private enabled: boolean;

  constructor(options: StreamDebugLoggerOptions = {}) {
    // Default path inside project tmp dir
    const defaultPath = path.resolve(process.cwd(), 'tmp', 'langgraph_stream_debug.txt');
    this.logFilePath = (options.filePath && options.filePath.trim().length > 0)
      ? options.filePath
      : defaultPath;

    // Ensure directory exists
    try {
      const dir = path.dirname(this.logFilePath);
      fs.mkdirSync(dir, { recursive: true });
      this.enabled = process.env.LANGGRAPH_DEBUG_LOG === '1' || process.env.NODE_ENV === 'development';
    } catch (e) {
      // If we cannot create dir, disable logging silently
      console.error('[StreamDebugLogger] Failed to ensure log directory:', e);
      this.enabled = false;
    }
  }

  log(line: string) {
    if (!this.enabled) return;
    try {
      fs.appendFileSync(this.logFilePath, line + '\n', { encoding: 'utf8' });
    } catch (e) {
      // Never throw from logger
    }
  }

  logSessionStart(threadId: string, info: Record<string, any>, runId?: string) {
    if (!this.enabled) return;
    const timestamp = new Date().toISOString();
    this.log(JSON.stringify({ type: 'session_start', timestamp, threadId, runId: runId || 'unknown', info }));
  }

  logSessionEnd(threadId: string, summary: Record<string, any>) {
    if (!this.enabled) return;
    const timestamp = new Date().toISOString();
    this.log(JSON.stringify({ type: 'session_end', timestamp, threadId, summary }));
  }

  logDerivedEvent(threadId: string, kind: string, data?: Record<string, any>, runId?: string) {
    if (!this.enabled) return;
    const timestamp = new Date().toISOString();
    this.log(JSON.stringify({ type: 'derived_event', timestamp, threadId, runId: runId || 'unknown', kind, data }));
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
      const entry = JSON.stringify({ type: 'raw_chunk', timestamp, threadId, runId: runId || 'unknown', event: safeEvent, dataSummary });
      this.log(entry);
    } catch (e) {
      // Ignore logging errors
    }
  }
}


