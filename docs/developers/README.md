# Ontahí for Developers

Model the domain once. Let runtimes interpret it.

This book teaches the current Ontahí application model through its public declarations, executable
examples, and runtime contracts. It begins with a working application, then names each core
concept directly and shows how those concepts compose.

It does not reconstruct Ontahí's history or translate the model into the vocabulary of another
technology.

This directory is the canonical source. It was moved from
`javifernandes/ontahi-library/library/02-ontahi-for-developers` at commit
`57867d771de35c21281dcb11a70571d281925960`; the original repository retains only a relocation
notice. Keeping the book beside the packages, examples, Plans, Atlas, and release process lets one
candidate release reconcile its code and documentation in the same review.

## Shape

### Part I — Getting Started

1. [One Application](01-getting-started/01-one-application.md)
2. [Your First Entity](01-getting-started/02-your-first-entity.md)

### Part II — Core Concepts

3. [Entities](02-core-concepts/01-entities.md)
4. [Identity, Locators, and Refs](02-core-concepts/02-identity-locators-and-refs.md)
5. [Relations](02-core-concepts/03-relations.md)
6. [Selections](02-core-concepts/04-selections.md)
7. [Queries](02-core-concepts/05-queries.md)
8. [Commands](02-core-concepts/06-commands.md)
9. [Operations](02-core-concepts/07-operations.md)
10. [Operation Contracts and Failures](02-core-concepts/08-operation-contracts-and-failures.md)
11. [Durable Operations](02-core-concepts/09-durable-operations.md)

### Part III — Runtimes

12. [Runtime Composition and Capabilities](03-runtimes/01-runtime-composition-and-capabilities.md)
13. [Storage Adapters](03-runtimes/02-storage-adapters.md)
14. [Transport and HTTP Ingress](03-runtimes/03-transport-and-http-ingress.md)
15. [Authentication and Principals](03-runtimes/04-authentication-and-principals.md)

### Part IV — Reflection and Clients

16. [Reflection and Explorer](04-reflection-and-clients/01-reflection-and-explorer.md)
17. [Browser Client and Projection](04-reflection-and-clients/02-browser-client-and-projection.md)

### Part V — Further Directions

18. [Further Directions](05-further-directions/01-further-directions.md)
19. [AI Operations](05-further-directions/02-ai-operations.md)
20. [Selection as an Editable Language](05-further-directions/03-selection-as-an-editable-language.md)
21. [Runtime Data Reflection](05-further-directions/04-runtime-data-reflection.md)
22. [Alive UI](05-further-directions/05-alive-ui.md)
23. [Continuous Execution and First-Class Events](05-further-directions/06-continuous-execution-and-first-class-events.md)
24. [Semantic Operational Policy](05-further-directions/07-semantic-operational-policy.md)
25. [A Topology of Graphs](05-further-directions/08-a-topology-of-graphs.md)
26. [More Adapters, Same Contracts](05-further-directions/09-more-adapters-same-contracts.md)
27. [Living Entities](05-further-directions/10-living-entities.md)
28. [Data Graph Across Boundaries](05-further-directions/11-data-graph-across-boundaries.md)

Part I gets a small application running. Part II is the semantic backbone: Entity, Ref, Relation,
Selection, Query, Command, and Operation each carry a distinct job. Part III explains where that
model executes. Part IV explains how it reflects and projects into clients.

## Executable spine

The code builds progressively: a fence may omit imports or defaults introduced earlier, but its
public identifiers and call shapes match the current packages unless the text labels a surface as
draft or transitional. The complete
[`todo-express` application](https://github.com/javifernandes/ontahi/tree/main/examples/todo-express)
checks the canonical path through code generation, server and browser typechecking, and integration
tests. Its server declarations live in
[`src/todo.ts`](https://github.com/javifernandes/ontahi/blob/main/examples/todo-express/src/todo.ts),
its React use in
[`client/src/App.tsx`](https://github.com/javifernandes/ontahi/blob/main/examples/todo-express/client/src/App.tsx),
and its end-to-end assertions in
[`test/application.test.ts`](https://github.com/javifernandes/ontahi/blob/main/examples/todo-express/test/application.test.ts).

Todo stays deliberately small. The headless
[`classroom` example](https://github.com/javifernandes/ontahi/tree/main/examples/classroom) is the
focused proof for conditional to-one transitions, Association Entity lifecycle, schema-native Ref
resolution, PostgreSQL transaction coordination, and post-commit Reactions. Chapters link to it
where those richer Relation semantics become relevant.

## Writing posture

Lead with executable form. Getting Started uses one continuous application and postpones details
that are not needed for the first result. Core Concepts may use compact, independent examples when
that makes an operator or contract clearer; they are demonstrations, not reader exercises.

Keep the main narrative in Ontahí's own vocabulary. Mark a formal concept when it is introduced.
A short margin note may contrast a familiar transport or framework pattern when that contrast
makes the pressure behind an Ontahí abstraction concrete; it must not turn into a second tutorial.

React support stays transparent on the main path. Cache behavior and invalidation mechanics belong
to the advanced browser-client chapter. The main path uses canonical APIs. When no semantic
replacement exists, a required draft surface is labeled explicitly rather than becoming doctrine
by appearing in the book.

Use diagrams where runtime distribution, execution paths, or lifecycle boundaries are harder to
see in prose. They clarify the model; they do not decorate every chapter.
