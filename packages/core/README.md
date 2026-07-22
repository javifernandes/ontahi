# Ontahi Core

`@ontahi/core` contains Ontahi's technology-independent graph, operation, task, runtime, computation, and value primitives.

It also contains the zero-infrastructure in-memory graph and task-run implementations used by local hosts, examples, and tests.

This package is not fully standalone yet. BookOps is still the host application that wires real domain models, runtime adapters, and product-specific policies. The extraction direction is tracked in:

1. [Plan 100: Ontahi Framework Extraction](../../../plans/current/100-ontahi-framework-extraction.md)
2. [Plan 99: Semantic Editorial Workflows](../../../plans/backlog/99-semantic-editorial-workflows.md)

Current docs:

1. [Current Mental Model](./docs/current-mental-model.md) - working explanation of Ontahi core, layer purpose, runtime boundaries, and current frictions
2. [Boundary Schemas](./docs/boundary-schemas.md) - graph-native operation contracts and the narrower role of transport validation adapters
3. [Entity Lifecycle Modules](./docs/entity-lifecycle.md) - current house style for richer domain areas that need entity folders, policy modules, lifecycle transitions, and explicit event outputs

## In-Memory Graph

`createInMemoryDataGraphRuntime` implements the full `DataGraphExecutionRuntime` surface over a live seeded dataset: queries, relation-root reads, streams, counts, inserts, bulk inserts, upserts, updates, and deletes. Commands support the same `returning` and cardinality contracts used by persistence adapters.

`createInMemoryReflectedEntityDataReader` exposes that same state to Ontahi Explorer with search, filters, sorting, and pagination.

The implementation is intentionally process-local. It provides no restart durability, transactions, indexes, migrations, or database constraints; production adapters such as `@ontahi/supabase` own those guarantees.
