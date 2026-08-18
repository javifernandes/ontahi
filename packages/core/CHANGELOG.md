# @ontahi/core

## 0.1.0-alpha.5

### Minor Changes

- d48cab0: Add portable generated-client Query entry points, explicit read intents, shared execution identity,
  canonical identity-scoped React query keys, a conventional Fetch graph client, and bound
  first-class Operation invocation hooks.
- 7b4c9dc: Add a transport-neutral remote data graph runtime that executes `get`, `run`, and `count` through
  the versioned read protocol while keeping authority and credentials outside the graph request.
  Preserve structured protocol, response, transport, and unsupported-capability failures so remote
  Commands and streams remain explicitly unavailable until their protocols are implemented.
- b8765da: Expose a versioned JSON-safe data graph read request that preserves Selection, View, ordering,
  limit, cardinality, and read mode and can be rebuilt against server-owned Entity definitions. Add
  a transport-neutral, default-deny dispatcher with recursive field, filter, ordering, relation,
  cardinality, limit, and authority-scope policy enforcement. Export canonical object and JSON value
  helpers used by protocol boundaries.
- 48278b4: Add a Fetch-backed React graph-read executor, preserve typed Effect failures across the browser
  Promise boundary, and let Express applications expose policy-scoped reads from their configured
  application storage and invocation context without constructing a dispatcher manually.

### Patch Changes

- 21a8693: Expose recursive caller-owned View authoring directly from generated client Entity facades.

## 0.1.0-alpha.4

### Minor Changes

- 74dac66: Add recursive, typed entity Views with a finite JSON-safe AST that preserves relation identity,
  direction, target, cardinality, and nullability.
- be2af8f: Allow recursive entity Views to project Queries and local Selections with `.as(view)`.
- d46a878: Add final Query inspection for projectable Operations and validate reflected View relation metadata.
- 9cfa0bc: Carry recursive Views through projectable Operation invocations and expose typed `.as(view)`
  results to React Operation queries.
- 8321558: Add lazy projectable calls for Operations that return semantic entity Selections.

## 0.1.0-alpha.3

### Minor Changes

- 04b573a: Add opt-in, JSON-safe internal operation error causes for development diagnostics while keeping
  transported failures sanitized by default. Preserve transported operation failures as serializable
  React error causes.

## 0.1.0-alpha.2

### Patch Changes

- dfd0ddc: Resolve reference-field includes from semantic identity metadata so in-memory data graphs do not
  require physical storage mappings.

## 0.1.0-alpha.1

### Minor Changes

- 451eda5: Add a provider-neutral authentication Principal, invocation-scoped auth APIs and requirements, and
  Express and Next.js request hooks for supplying invocation context without coupling Ontahi to an
  identity provider.
