# 155. Declarative Basic Entity Mutations

Status: current

Canonical ID: `ontahi://plans/155-declarative-basic-entity-mutations`

Related plans:

1. [123. Ontahí Declarative Entity Invariants](../next/123-ontahi-declarative-entity-invariants.md)
2. [135. Applied Mutation Outcomes And Reactions](../done/135-applied-mutation-outcomes-and-reactions.md)
3. [138. Entity Mutation Command Authoring](../done/138-entity-mutation-command-authoring.md)
4. [153. Model-Backed Todo Command Spike](./153-model-backed-todo-command-spike.md)
5. [153b. Declarative Operation Context Scope](../backlog/153b-declarative-operation-context-scope.md)
6. [154. Semantic Program Kernel And Distributed Evaluation](../research/154-semantic-program-kernel-and-distributed-evaluation.md)

## Summary

Remove application-authored Domain Operations that only wrap basic Entity creation, update, or
deletion. Ontahí already represents those effects as canonical Entity Mutation Commands. The model
must additionally declare the defaults, reference requirements, lifecycle rules, reactions,
authority, and exposure that currently force applications to repeat structural behavior in
Operation bodies.

This plan deliberately precedes further Model Support generalization. Devtools, application code,
model interpretation, generated forms, and future frontends should consume the same reflected
mutation affordances instead of separate operation catalogs and bindings.

## Boundaries

1. An Entity declaration does not grant mutation authority. Hosts still expose explicit command
   policies and receivers still enforce them.
2. Domain Operations remain appropriate for named business behavior, custom outcomes, external
   effects, transactions, interactions, or durable execution.
3. Structural lifecycle semantics belong to the model only when every mutation path must honor
   them. UI-only defaults or model prompt instructions are insufficient.
4. The work proceeds through Todo vertical slices and retains compatibility for existing Operation
   callers until their replacement is proven.

## Ordered Slices

### 1. Stored Field defaults

- Declare a scalar Field default in the Entity model.
- Make the defaulted Field optional to create authoring while keeping it present in stored Entity
  values.
- Materialize the effective value in local authoring and transported command resolution.
- Reflect it through schema descriptors, JSON Schema, and code generation.
- Prove `TodoItem.completed = false` without an Operation-owned assignment.

### 2. Required existing references

- Let a stored reference declare that creation and replacement require an existing target.
- Enforce the requirement at the authoritative mutation boundary under current authority.
- Reflect candidate identity and resolution requirements without granting read access.
- Prove that basic `TodoItem` creation cannot reference a missing `TodoList`.

### 3. Generated creation values

- Declare receiver-generated creation values such as IDs and stable application defaults.
- Keep generated values absent from untrusted writable inputs and present in the applied command
  outcome.
- Distinguish deterministic defaults from runtime-generated values.

### 4. Mutation lifecycle and reactions

- Express relation cleanup, cascade, restrict, or nullification as model lifecycle policy.
- Execute lifecycle changes atomically where the storage/runtime supports atomic commands.
- Route portable mutation outcomes through declared reactions such as notifications.
- Prove Todo item/tag cleanup and list/item deletion without wrapper Operations.

### 5. Reflected mutation affordances

- Project authorized create, update, and delete contracts from Entity schema plus explicit command
  policy.
- Reuse the projection in Runtime Protocol, Devtools, generated UI, and Model Support.
- Preserve separate discovery and authorization decisions.

### 6. Todo migration

- Replace structural `createList`, `createItem`, `setCompleted`, item deletion, and list deletion
  Operations when their complete behavior is represented by Commands and declarations.
- Retain `completeAll` when its named outcome remains useful.
- Retain `deleteFromNamedList` as the interactive durable Operation example.

### 7. Model Support activation cleanup

- Derive the model-visible command catalog and schemas from reflected affordances.
- Remove Todo-specific bindings that duplicate mutation contracts.
- Reduce activation to provider, authorized exposure/scope, and optional application context or
  presentation overrides.
- Validate the resulting setup in a second host application before freezing a public convenience
  API.

## First Checkpoint

The first implementation slice adds stored scalar Field defaults and applies it to
`TodoItem.completed`. It does not remove a Todo Operation yet: required-reference validation and
receiver-generated identity remain necessary before generic creation is behaviorally equivalent to
`TodoItem.createItem`.

Implemented on 2026-09-30: Core now supports `field.default`, uses defaults in typed Entity create
authoring and Runtime Protocol command resolution, and reflects them through graph descriptors and
JSON Schema. Todo declares `TodoItem.completed = false` in the Entity model and exposes generic
TodoItem creation under its explicit command policy. A remote application test proves creation
without supplying `completed`.

## Acceptance

- [ ] Every removed Todo Operation has an equivalent canonical command path with the same model,
      authority, lifecycle, reaction, cache, and result semantics.
- [ ] Default, generated, caller-required, optional, nullable, and derived Fields remain distinct in
      types and reflection.
- [ ] Remote command payloads cannot bypass defaults, reference requirements, or lifecycle rules.
- [ ] Devtools and Model Support consume reflected mutation contracts rather than Todo-owned copies.
- [ ] A second application enables the same capabilities with materially less setup.
