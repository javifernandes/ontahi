# @ontahi/runtime-http

## 1.0.0-alpha.18

### Patch Changes

- Updated dependencies [e91ded6]
- Updated dependencies [a3c8aa9]
- Updated dependencies [823e87f]
  - @ontahi/core@1.0.0-alpha.18

## 1.0.0-alpha.17

### Minor Changes

- 8d9e2b5: Add the generic HTTP adapter for managed Event egress with stable delivery headers, explicit status
  classification, bounded timeouts, manual redirects, and optional HMAC-SHA256 signing over the exact
  transmitted JSON bytes.
- a999fe0: Add framework-neutral Operation and Event ingress composition plus a minimal bounded `node:http`
  host to `@ontahi/runtime-http`. Express and Next.js now reuse the same handler, and PostgreSQL proves
  durable signed HTTP Event egress across retry, runtime recreation, and final acknowledgement.
- 0f5b417: Add durable delayed-retry and terminal-failure outcomes for Event delivery, prove them through the
  provider-neutral conformance suite, and classify terminal HTTP egress responses without retrying.

### Patch Changes

- Updated dependencies [0f5b417]
- Updated dependencies [59bb878]
- Updated dependencies [dd8cba4]
- Updated dependencies [0454782]
  - @ontahi/core@1.0.0-alpha.17
