## Chat Tool Activity Persistence: Production-Grade Design & Implementation Plan

### Purpose
Persist per-question tool activity (start → complete/error) so that when a user revisits a thread, the tool call boxes remain attached to the question that produced them. This document defines an industry-grade design, SQL schema, API surfaces, service orchestration, testing, rollout, and operations.

---

### Goals
- Accurate, real-time surface of tool lifecycle during streaming.
- Durable, per-question (run) persistence with minimal PII.
- Deterministic rehydration when navigating back to a thread.
- Server-side writes only; trust-minimized client; RLS-enforced access.
- Low-latency; no added head-of-line blocking for SSE.

---

### High-Level Architecture
- Client generates a `run_id` per user question and includes it in `POST /api/conversations/stream-chat`.
- Server starts a `chat_runs` record and streams from LangGraph.
- The streaming layer derives tool events and writes them to `chat_tool_calls` through a small, concurrency-limited event store (non-blocking relative to SSE).
- On stream completion/error, finalize run status.
- When loading a thread, the UI fetches persisted runs and tool calls and renders them grouped by `run_id` beneath the originating user message.

---

### Data Model (Supabase / Postgres)

#### Tables
```sql
-- 1) Per-question run/turn
create table if not exists public.chat_runs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  user_id uuid not null,
  account_id text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null check (status in ('running','complete','error')) default 'running'
);

create index if not exists chat_runs_thread_started_idx on public.chat_runs (thread_id, started_at desc);
create index if not exists chat_runs_user_started_idx on public.chat_runs (user_id, started_at desc);

-- 2) Per tool invocation inside a run
create table if not exists public.chat_tool_calls (
  id bigserial primary key,
  run_id uuid not null references public.chat_runs(id) on delete cascade,
  tool_key text not null,
  tool_label text not null,
  agent text,
  status text not null check (status in ('running','complete','error')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb
);

create index if not exists chat_tool_calls_run_started_idx on public.chat_tool_calls (run_id, started_at);
create index if not exists chat_tool_calls_run_status_idx on public.chat_tool_calls (run_id, status);
-- prevents duplicate tool calls for the same run and tool (excluding started_at for proper deduplication)
create unique index if not exists chat_tool_calls_dedupe on public.chat_tool_calls (run_id, tool_key);
```

#### Row-Level Security (RLS)
```sql
alter table public.chat_runs enable row level security;
alter table public.chat_tool_calls enable row level security;

-- chat_runs: user can only see own
create policy chat_runs_select on public.chat_runs for select using (user_id = auth.uid());
create policy chat_runs_insert on public.chat_runs for insert with check (user_id = auth.uid());
create policy chat_runs_update on public.chat_runs for update using (user_id = auth.uid());

-- chat_tool_calls: join through run
create policy chat_tool_calls_select on public.chat_tool_calls for select using (
  exists (
    select 1 from public.chat_runs r
    where r.id = chat_tool_calls.run_id and r.user_id = auth.uid()
  )
);
create policy chat_tool_calls_insert on public.chat_tool_calls for insert with check (
  exists (
    select 1 from public.chat_runs r
    where r.id = chat_tool_calls.run_id and r.user_id = auth.uid()
  )
);
create policy chat_tool_calls_update on public.chat_tool_calls for update using (
  exists (
    select 1 from public.chat_runs r
    where r.id = chat_tool_calls.run_id and r.user_id = auth.uid()
  )
);
```

PII: do not store user content; keep only `tool_key`, `tool_label`, `agent`, timestamps, and minimal `metadata`.

---

### API Changes

#### 1) Start streaming with run_id
- Request body extension for `POST /api/conversations/stream-chat`:
```json
{
  "thread_id": "...",
  "run_id": "uuid-v4-from-client",
  "input": { ... },
  "account_id": "..."
}
```
- Route behavior:
  - Authenticate/authorize as today.
  - If `run_id` missing, generate server-side; otherwise trust client-provided UUID after validation.
  - Insert `chat_runs` (status=running) immediately.
  - Pass `run_id` into the streaming service for event persistence.

#### 2) Fetch persisted tool activities for a thread
- New route: `GET /api/conversations/get-tool-activities`
  - Input: `{ thread_id: string, limit?: number }`
  - Output: array of runs with tool calls:
```json
[
  {
    "run_id": "...",
    "started_at": "...",
    "ended_at": "...",
    "status": "complete",
    "tool_calls": [
      {"tool_key":"get_portfolio_summary","tool_label":"Get Portfolio Summary","agent":"portfolio_management_agent","status":"complete","started_at":"...","completed_at":"..."}
    ]
  }
]
```

---

### Streaming Layer Changes (Server)
- Add a `ToolEventStore` with methods:
  - `startRun({ runId, threadId, userId, accountId })`
  - `finalizeRun({ runId, status })`
  - `upsertToolStart({ runId, toolKey, toolLabel, agent, at })`
  - `upsertToolComplete({ runId, toolKey, status: 'complete'|'error', at })`
- Implement an internal queue (Promise pool, e.g., concurrency=2–4) to avoid blocking SSE.
- On derived events (`tool_update`, `agent_transfer`):
  - For tool start: upsert `running` if not present.
  - For complete/error: update latest running entry for that tool.
- On stream end/error: finalize run.

---

### Client Changes
- Generate a fresh `run_id` per send (already implemented as in-memory). Include it in the POST body.
- During live streaming, we keep showing real-time boxes. On hydrate (when revisiting), we call `get-tool-activities` to render persisted items for historical runs.
- Tag runtime tool boxes with the current `run_id` so subsequent queries do not shift prior boxes.

---

### Observability & Debugging
- Keep the development-only file logger (already present) for local runs: `tmp/langgraph_stream_debug.txt`.
- Add counters (optional): per-tool usage, start→complete latency, error ratio.
- Cloud logs: only non-PII metadata.

---

### Failure Modes & Handling
- Supabase write fails mid-stream: event store retries (exponential backoff with cap). If ultimately failing, the UI still streams; persistence may be partial; re-run writes on session end.
- Duplicated tool starts: unique index + upsert logic prevent duplicates.
- Missing completion: leave status `running` and finalize run with `complete`; stale rows can be closed by a periodic job if desired.

---

### Performance Considerations
- Writes are small and indexed; queue ensures SSE remains responsive.
- Batched flush at session_end for any buffered events.
- Queries for hydration hit `(thread_id, started_at desc)` and `(run_id, started_at)` indexes.

---

### Security & Privacy
- All server-to-DB writes happen server-side only.
- RLS restricts access by `user_id`.
- No user prompts or responses are stored in these tables.

---

### Rollout Plan
1) Create tables and policies in Supabase.
2) Deploy server changes (event store off by flag).
3) Dark launch: write-only behind `TOOL_ACTIVITY_PERSISTENCE` flag; no read.
4) Enable read path for hydration on a small cohort.
5) Monitor error rates and performance; then ramp to 100%.

Feature flag variable proposal (server): `TOOL_ACTIVITY_PERSISTENCE=1`.

---

### Supabase: Exact SQL to Run
Run these in Supabase SQL editor (adjust schema name if needed):
```sql
-- Enable pgcrypto for gen_random_uuid if not enabled
create extension if not exists pgcrypto;

-- Tables
create table if not exists public.chat_runs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  user_id uuid not null,
  account_id text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null check (status in ('running','complete','error')) default 'running'
);

create index if not exists chat_runs_thread_started_idx on public.chat_runs (thread_id, started_at desc);
create index if not exists chat_runs_user_started_idx on public.chat_runs (user_id, started_at desc);

create table if not exists public.chat_tool_calls (
  id bigserial primary key,
  run_id uuid not null references public.chat_runs(id) on delete cascade,
  tool_key text not null,
  tool_label text not null,
  agent text,
  status text not null check (status in ('running','complete','error')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb
);

create index if not exists chat_tool_calls_run_started_idx on public.chat_tool_calls (run_id, started_at);
create index if not exists chat_tool_calls_run_status_idx on public.chat_tool_calls (run_id, status);
create unique index if not exists chat_tool_calls_dedupe on public.chat_tool_calls (run_id, tool_key);

-- RLS
alter table public.chat_runs enable row level security;
alter table public.chat_tool_calls enable row level security;

create policy if not exists chat_runs_select on public.chat_runs for select using (user_id = auth.uid());
create policy if not exists chat_runs_insert on public.chat_runs for insert with check (user_id = auth.uid());
create policy if not exists chat_runs_update on public.chat_runs for update using (user_id = auth.uid());

create policy if not exists chat_tool_calls_select on public.chat_tool_calls for select using (
  exists (select 1 from public.chat_runs r where r.id = chat_tool_calls.run_id and r.user_id = auth.uid())
);
create policy if not exists chat_tool_calls_insert on public.chat_tool_calls for insert with check (
  exists (select 1 from public.chat_runs r where r.id = chat_tool_calls.run_id and r.user_id = auth.uid())
);
create policy if not exists chat_tool_calls_update on public.chat_tool_calls for update using (
  exists (select 1 from public.chat_runs r where r.id = chat_tool_calls.run_id and r.user_id = auth.uid())
);
```

---

### Env / Config
- Server (Next.js API routes):
  - `TOOL_ACTIVITY_PERSISTENCE=1` (enable writes)
  - Re-use existing Supabase service config (already in project).

---

### Testing Strategy
- Unit tests
  - Event store upsert semantics; de-duplication; completion update of latest running tool.
- Integration tests (frontend-app/tests/api)
  - Start a stream with `run_id`, simulate derived events; assert DB rows created/updated; assert hydration API returns expected structure.
- UI tests
  - Render previous thread and verify tool boxes appear grouped under the question; ensure new queries do not move earlier boxes.
- Security tests
  - RLS: users cannot read/write rows of others.

---

### Backfill Strategy (Optional)
- For hot threads currently open, we will only persist new runs after feature flag is on.
- If needed, parse existing `tmp/langgraph_stream_debug.txt` for development-only backfill; do not use in production.

---

### Rollback
- Disable feature flag to stop writes/reads.
- Tables remain (harmless). Data can be retained or truncated by admin.

---

### Implementation Checklist
1) Run SQL above in Supabase.
2) Add feature flag to environment.
3) Add `run_id` propagation in `POST /api/conversations/stream-chat`.
4) Implement `ToolEventStore` and wire into streaming service derived events.
5) Add `GET /api/conversations/get-tool-activities` and client hydration in `Chat.tsx`.
6) Add tests (unit, integration, UI) and run CI.
7) Dark launch, monitor, then ramp.

---

### Appendix: Operational Queries
```sql
-- Last 50 runs for a thread
select * from public.chat_runs where thread_id = :thread_id order by started_at desc limit 50;

-- Tool calls for a run
select * from public.chat_tool_calls where run_id = :run_id order by started_at asc;

-- Tool latency (ms) per tool
select tool_key, avg(extract(epoch from (completed_at - started_at))*1000) as avg_ms
from public.chat_tool_calls
where completed_at is not null
group by 1 order by 2 desc;
```


