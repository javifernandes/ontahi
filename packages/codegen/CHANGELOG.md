# @ontahi/codegen

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
