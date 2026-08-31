# @ontahi/codegen

## 1.0.0-alpha.9

### Minor Changes

- 2ed9511: Add `graphSchema.existingRef(Entity)` for immediate Domain Operation inputs. Callers keep sending
  portable Refs, while the authorized UnitOfWork materializes typed participants before the body,
  preserves their original `.ref` identity, reports conventional missing-Entity failures, and
  reflects the requirement through JSON Schema, generated clients, and Explorer.

  Domain Operation bodies may also use `Effect.fn(function* (...) { ... })` or direct `*run(...)`
  Effect generators. The direct form keeps contextual input typing and follows the ordinary Effect
  execution path for contracts, UnitOfWork, atomicity, failures, and defects.

- 926919d: Add virtual read-only derived Fields backed by portable Model Expressions. Codegen compiles natural
  Field and Relation expressions, Core reflects and evaluates exact dependencies in memory,
  PostgreSQL lowers the same IR to authorized graph reads, and Explorer presents derived metadata and
  runtime values without exposing assignment.
- 71b3d4d: Add named portable Domain Operation input conditions backed by canonical Model Expression IR.
  Codegen compiles natural Ref-identity expressions without executing callbacks, emits one condition
  registry shared by server and generated clients, and reports unsupported syntax at its source.
  Core evaluates conditions authoritatively before the body and exposes tri-state advisory
  evaluation, dependencies, conventional rejection, reflection, and an explicit runtime-only
  builder. Explorer presents reflected condition names.

  Callback-valued top-level `contracts.pre` and `contracts.post` are removed during the alpha. Move
  arbitrary server-only checks to `contract({ pre, post })` in `concerns`; top-level
  `contracts.pre` now accepts named portable conditions.

- 015893f: Keep schema-only Entities in generated clients and add reflected Entity creation to the Explorer.

  Expose forward and inverse related-instance reads, counts, and drill-downs through in-memory and
  PostgreSQL storage, the Ontahi application runtime, Express, and the default React fetch client.
  Make the in-memory Data Graph runtime transactional so atomic Operations have the same local
  execution contract as transactional adapters.

- ea87f14: Add reflected atomic Domain Operations with `operation.atomic(...)`. Core derives the Data Graph
  atomicity requirement, the server runner owns the complete transaction boundary, generated clients
  preserve the contract, and React/Explorer report whether the current runtime can execute locally,
  bridge to an authority, or cannot satisfy the requirement.

## 1.0.0-alpha.8

## 0.1.0-alpha.7

## 0.1.0-alpha.6

## 0.1.0-alpha.5

### Patch Changes

- 140332b: Generate client Entity schema imports, declarations, and relations through the TypeScript AST emitter with deterministic printer formatting.
- 140332b: Generate task-definition registries through the TypeScript AST emitter, with deterministic printer formatting.
- 140332b: Reject syntactically invalid TypeScript sources before codegen analyzes recovered declarations.
- 4302929: Expose a serializable nominal definition inventory, report conflicting Entity and Value names during application analysis, and reuse each named Value across generated Operation contracts.
- 6ba88f1: Project every graph entity schema referenced by a named Value operation output into generated browser clients.

## 0.1.0-alpha.4

## 0.1.0-alpha.3

### Minor Changes

- face827: Add a conventional `ontahi-codegen` executable for browser client generation, drift checks, and
  watch mode so standard applications no longer need to copy a custom generation script.

## 0.1.0-alpha.2

## 0.1.0-alpha.1
