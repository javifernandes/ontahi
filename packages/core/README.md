# Ontahi Core

`@ontahi/core` is the first extracted framework package from BookOps.

It currently contains shared computation primitives, value helpers, validation adapters, data graph primitives, generic action metadata/result helpers, server/runtime helpers, task abstractions, and transitional adapters that are still waiting for clearer package boundaries.

This package is not fully standalone yet. BookOps is still the host application that wires real domain models, runtime adapters, and product-specific policies. The extraction direction is tracked in:

1. [Plan 100: Ontahi Framework Extraction](../../../plans/current/100-ontahi-framework-extraction.md)
2. [Plan 99: Semantic Editorial Workflows](../../../plans/backlog/99-semantic-editorial-workflows.md)

Current docs:

1. [Current Mental Model](./docs/current-mental-model.md) - working explanation of Ontahi core, layer purpose, runtime boundaries, and current frictions
2. [Boundary Schemas](./docs/boundary-schemas.md) - graph-native operation contracts and the narrower role of transport validation adapters
3. [Entity Lifecycle Modules](./docs/entity-lifecycle.md) - current house style for richer domain areas that need entity folders, policy modules, lifecycle transitions, and explicit event outputs
