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

## Second Checkpoint

Core now distinguishes two reference contracts that had previously been conflated:

- `referenceRequirement: 'existing'` controls how an Operation input reference is resolved for its
  implementation.
- `mutationRequirement: 'existing'`, authored with `field.existingRef(...)`, is a persisted model
  invariant for Entity creation and replacement.

Ontahí wraps the application Data Graph runtime so the mutation requirement is enforced for local
Operations, durable/model execution, and Runtime Protocol commands before storage receives the
mutation. The requirement is reflected in graph descriptors and JSON Schema. Todo uses it for
`TodoItem.list`, and tests prove that generic create and update commands cannot point at a missing
`TodoList`.

## Third Checkpoint

Core now supports receiver-owned creation values with
`field.generated(fieldDefinition, generatorName)`. Generated Fields remain required in stored Entity
records and query schemas, but are absent from typed mutation inputs and rejected when an untrusted
command tries to assign them. The application receiver materializes them before reference checks
and storage execution, so generated values appear in the canonical mutation delta.

Ontahí includes the portable `uuid` generator and applications may register synchronous named Field
generators in the composition root. Reflection marks generated Fields as read-only and exposes only
their generator name. Todo adoption is intentionally deferred to the migration slice so the old
`createItem({ id, ... })` Operation is removed in the same vertical change rather than retaining two
conflicting identity contracts.

## First Todo Migration

`TodoItem.createItem` has been removed. `TodoItem.id` is now receiver-generated, `completed` keeps
its model default, and `list` keeps its existing-reference invariant. The React application and
Model Support both submit the same canonical Entity Mutation Command containing only `list` and
`title`; the Runtime Protocol result carries the generated identity and effective stored values.

Model graph-command validation now receives `proposal | choice-option` context just like Operation
validation. Todo uses it to keep an unspecified list as an interaction: a direct guessed target is
rejected, while each explicit option in “Which list?” is valid and resumes through both in-process
and LangGraph Task Runtimes.

## Second Todo Migration

`TodoList.createList` has been removed. `TodoList.id` is receiver-generated and `color` defaults in
the Entity model, so React, Runtime Protocol, and Model Support now create lists through the same
canonical Entity Mutation Command. The applied mutation delta returns the generated identity to
the caller.

Core now authors Entity lifecycle reactions with
`reaction.entity(Entity).created|updated|deleted(...)` and interprets them after the authoritative
mutation succeeds, including transaction-aware post-commit deferral. Todo declares its list-created
notification as a best-effort Reaction colocated in the `TodoList` declaration, preserving the
external effect without a wrapper Operation. Application-level Reactions remain available for
cross-Entity and host composition rules, and both forms share id validation and runtime execution.

## Structural Lifecycle Migration

Core now declares `onDelete: 'cascade'` on owned `hasMany` relations and
`onDelete: 'detach'` on attribute-free `manyToMany` relations. The application mutation receiver
resolves the affected identities and executes the complete delete tree in one provider transaction
when available. Entity and Relationship Reactions are interpreted only after that transaction
commits. Runtime Protocol commands and commands resumed inside an already-atomic durable Operation
use the same decorated runtime path.

Todo declares list/item ownership and item/tag cleanup in its Entity relations. The React UI and
Model Support now use canonical Entity Mutation Commands for completion and structural deletes.
The boilerplate `setCompleted`, item delete, list delete, tag delete, and delete-all Operations have
been removed. Per-action command authorization preserves GitHub-mode protection for completion
updates without turning every TodoItem update into a named Operation. `completeAll` remains a named
business action and `deleteFromNamedList` remains the interactive durable example.

## Reflected Model Affordances

Core now projects exact Model-facing Entity mutation schemas from an Entity Mutation Command policy.
Applications select the intended action, writable fields, exact conditions, and optional literal
constraints; Core supplies the canonical command envelope, protocol version, Entity reference,
Field schemas, defaults, normalization, and policy-boundary checks. Todo's model command catalog no
longer reconstructs those contracts by hand and retains only language, presentation, and contextual
disambiguation rules.

The same projection boundary now covers graph reads. An application selects a bounded subset of
equality filters, ordering Fields, mode, and limit from its Graph Read policy, while Core authors the
canonical Selection AST schema and rejects exposure that exceeds the receiver policy. A non-Todo
Document fixture proves both projections independently of the example application. Model scopes no
longer require placeholder context or empty Operation bindings, so graph-only activation has no
artificial Operation setup.

This checkpoint intentionally keeps Todo's explicit context reader. Declarative context scoping and
automatic scope projection remain separate work; hiding those decisions behind a generic fetch
helper would preserve the coupling rather than remove it.

## Model Support Activation

Application Model Support now registers Graph capabilities as paired `{ policies, expose }`
affordances. Core derives the authoritative read/command dispatchers and the scoped model catalog
from that single registration boundary. Dynamic catalog data returned by `scope` stays local to the
receiver and is never serialized into model context unless the application explicitly projects it
there. Static applications may omit `scope` entirely.

Todo uses the paired API while retaining its genuinely application-specific context projection and
disambiguation rules. Classroom is the second-host proof: it enables a Course read and a School
create command with an injected provider and two affordance declarations, without Todo bindings or
a context reader. The API remains evolutionary until Devtools and Model Support share a broader
reflected-affordance discovery surface.

## Acceptance

- [x] Every removed Todo Operation has an equivalent canonical command path with the same model,
      authority, lifecycle, reaction, cache, and result semantics.
- [ ] Default, generated, caller-required, optional, nullable, and derived Fields remain distinct in
      types and reflection.
- [x] Remote command payloads cannot bypass defaults, reference requirements, or lifecycle rules.
- [ ] Devtools and Model Support consume reflected mutation contracts rather than Todo-owned copies.
- [x] A second application enables the same capabilities with materially less setup.
