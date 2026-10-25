# @ontahi/runtime-langgraph

## 1.0.0-alpha.15

### Patch Changes

- Updated dependencies [471e2e4]
- Updated dependencies [d87afb3]
  - @ontahi/core@1.0.0-alpha.15

## 1.0.0-alpha.14

### Patch Changes

- Updated dependencies [d1fab2d]
- Updated dependencies [fa7968e]
  - @ontahi/core@1.0.0-alpha.14

## 1.0.0-alpha.13

### Minor Changes

- 8ab4218: Add an optional LangGraph Task Runtime for explicit durable Operation steps. Preserve Ontahí Task
  snapshots, Interaction authorization, atomic reply claims, and Runtime Protocol surfaces while
  using an injected LangGraph checkpointer for replay and interrupt/resume.

### Patch Changes

- 3fdc296: Represent a Task suspended on a typed Interaction with an explicit `waiting` lifecycle state.
  Native and LangGraph execution now return to `running` only after one authorized, correlated
  response is atomically claimed, including after runtime recreation.

  Preserve waiting snapshots through Runtime Protocol transports, expose `isWaiting` from
  `useDurableOperation`, and keep observation active until the run reaches a terminal state.

- 6b3f847: Add durable, correlated Event waits to native Task executions. Task snapshots now describe their
  typed waiting reason, retained Event deliveries resume a persisted continuation once across runtime
  recreation, and waits can time out or be cancelled without deleting the occurrence. Supabase Task
  storage implements the corresponding atomic wait claim and cancellation transitions.

  Durable Event waits are currently supported only by the native Task Runtime. LangGraph fails
  explicitly when it encounters this transition until it can provide equivalent durable semantics,
  instead of incorrectly treating the wait as an ordinary continuation.

- Updated dependencies [45e3083]
- Updated dependencies [7a9bb92]
- Updated dependencies [69ccf41]
- Updated dependencies [b862f5b]
- Updated dependencies [116f3ea]
- Updated dependencies [5f213e4]
- Updated dependencies [a35b2d0]
- Updated dependencies [8a7eaec]
- Updated dependencies [7eaddca]
- Updated dependencies [31b5311]
- Updated dependencies [0802a01]
- Updated dependencies [03c1af6]
- Updated dependencies [7d002a0]
- Updated dependencies [3fdc296]
- Updated dependencies [c275332]
- Updated dependencies [f335200]
- Updated dependencies [db4b8c9]
- Updated dependencies [399f7f5]
- Updated dependencies [f5e085f]
- Updated dependencies [fb78b34]
- Updated dependencies [9e769f6]
- Updated dependencies [f67fa6f]
- Updated dependencies [2305a9d]
- Updated dependencies [c01cd23]
- Updated dependencies [7c2a6b9]
- Updated dependencies [c275332]
- Updated dependencies [8ab4218]
- Updated dependencies [fb78b34]
- Updated dependencies [c275332]
- Updated dependencies [b807692]
- Updated dependencies [ddec3e7]
- Updated dependencies [3252d6c]
- Updated dependencies [c275332]
- Updated dependencies [c275332]
- Updated dependencies [f552bed]
- Updated dependencies [c275332]
- Updated dependencies [c275332]
- Updated dependencies [5668f96]
- Updated dependencies [5ea8abd]
- Updated dependencies [96d8092]
- Updated dependencies [5b13c9a]
- Updated dependencies [6d3a494]
- Updated dependencies [f552bed]
- Updated dependencies [67fc06a]
- Updated dependencies [eebeeec]
- Updated dependencies [8ff883f]
- Updated dependencies [e114d60]
- Updated dependencies [d1d3f36]
- Updated dependencies [82d155a]
- Updated dependencies [072ad16]
- Updated dependencies [6b3f847]
- Updated dependencies [27d5253]
- Updated dependencies [a2fb2b5]
- Updated dependencies [848b50d]
- Updated dependencies [24d99ef]
- Updated dependencies [9904cff]
  - @ontahi/core@1.0.0-alpha.13

## 1.0.0-alpha.12

### Minor Changes

- Add an experimental LangGraph adapter for Ontahí explicit durable Task executions, including
  choice and approval interruption, atomic response claims, runtime recreation, and injected
  checkpointers.
