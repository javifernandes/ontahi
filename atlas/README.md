# Ontahi Atlas

`items/` contains Ontahi's durable framework model. Plans describe interventions; Atlas items
describe the concepts and contracts intended to survive individual plans and implementations.
`sources.yaml` registers repositories used by canonical cross-source references. See
[`docs/planning-and-atlas.md`](../docs/planning-and-atlas.md).

## Ontology map

The model is intentionally compositional rather than one framework object hierarchy:

```text
Semantic Program Kernel
  -> Modules compose and extend one semantic graph
  -> Entities define identity, fields, relations, selections, and behavior ownership
  -> Refs identify Entity instances without becoming hydrated mutable objects
  -> Selections describe typed populations or deferred sets
  -> Relations connect Entity populations and may expose association behavior
  -> Domain Operations define effectful behavior and portable contracts
       owner: stable identity, organization, and implementation declaration
       receiver: distinguished type, Ref, Selection, relation, or semantic boundary
       invocation: closed request with complete validated input
       implementation binding: code, model, service, remote runtime, or composition
  -> Events state facts; Reactions derive asynchronous behavior from them
  -> Interactions represent human or machine participation in an execution
  -> Resources name governed external or consumable capabilities
  -> Principals and policies decide authority independently from receiver identity
```

Important distinctions:

1. Entity, Operation owner, receiver, authenticated Principal, Resource scope, implementation, and
   deployment placement are related but non-interchangeable identities.
2. Method-like APIs are projections over portable functional semantics. A bound receiver closes a
   declared position; it does not create a mutable active-record object.
3. Modules may compose through direct Operation use, Relations, extensions, and Events. Events are
   not the only integration mechanism.
4. Runtime Protocol transports semantic Reads, Commands, Operation Invocations, durable lifecycle,
   and Events without making HTTP, TypeScript, or one deployment topology part of their meaning.

Start with the narrow durable items rather than treating this README as their replacement:

- [`items/model/domain-operation.md`](./items/model/domain-operation.md)
- [`items/model/operation-invocation.md`](./items/model/operation-invocation.md)
- [`items/model/semantic-program-kernel.md`](./items/model/semantic-program-kernel.md)
- [`items/model/selection.md`](./items/model/selection.md)
- [`items/model/event.md`](./items/model/event.md)
- [`items/model/reaction.md`](./items/model/reaction.md)
- [`items/model/operation-interaction.md`](./items/model/operation-interaction.md)
- [`items/model/semantic-module.md`](./items/model/semantic-module.md)

Some receiver forms remain Plan 166 research and are not released public API. Atlas items and
executable examples become authoritative only as implementation and release evidence lands.
