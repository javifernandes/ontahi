# @ontahi/runtime-express

Express runtime adapters for Ontahi applications.

`@ontahi/runtime-express/operation-invocation` exposes an Express request handler for the transport-neutral operation invocation protocol from `@ontahi/core`. Applications are responsible for installing Express JSON body parsing before the handler, for example with `express.json()`.
