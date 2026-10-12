---
'@ontahi/core': minor
'@ontahi/react': minor
'@ontahi/runtime-langgraph': patch
'@ontahi/supabase': patch
---

Represent a Task suspended on a typed Interaction with an explicit `waiting` lifecycle state.
Native and LangGraph execution now return to `running` only after one authorized, correlated
response is atomically claimed, including after runtime recreation.

Preserve waiting snapshots through Runtime Protocol transports, expose `isWaiting` from
`useDurableOperation`, and keep observation active until the run reaches a terminal state.
