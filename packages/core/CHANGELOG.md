# @ontahi/core

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
