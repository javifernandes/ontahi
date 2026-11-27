---
'@ontahi/runtime-langgraph': patch
'@ontahi/core': patch
'@ontahi/postgres': patch
---

Use atomic Task Storage admission for explicit LangGraph tasks. Retain the prepared checkpoint after ambiguous external effects so equivalent start requests return the original run with `reconciliation-required`.

Fence LangGraph execution writes with a Task Storage lease. A worker can recover an expired run from its Task checkpoint while late writes from the former owner are rejected.

Support active-run cancellation for LangGraph with conditional Task Storage. Revoking the lease prevents later execution writes and preserves ambiguous admission for reconciliation.

Renew the execution lease while a LangGraph invocation is active so long-running steps retain ownership.

Resume LangGraph Tasks from retained Events with a configured durable Event Runtime and conditional Task Storage. Use the atomic Task checkpoint claim to prevent competing hosts from consuming the wait twice.
