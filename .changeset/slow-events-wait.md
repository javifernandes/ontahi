---
'@ontahi/core': minor
'@ontahi/supabase': patch
'@ontahi/runtime-langgraph': patch
---

Add durable, correlated Event waits to native Task executions. Task snapshots now describe their
typed waiting reason, retained Event deliveries resume a persisted continuation once across runtime
recreation, and waits can time out or be cancelled without deleting the occurrence. Supabase Task
storage implements the corresponding atomic wait claim and cancellation transitions.
LangGraph rejects this native-runtime-only transition explicitly instead of treating it as a
continuation.
