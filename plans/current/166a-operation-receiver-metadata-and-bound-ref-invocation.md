# 166a. Operation Receiver Metadata And Bound Ref Invocation

Status: current

Canonical ID: `ontahi://plans/166a-operation-receiver-metadata-and-bound-ref-invocation`

Shapes: [Domain Operation](../../atlas/items/model/domain-operation.md),
[Operation Invocation](../../atlas/items/model/operation-invocation.md), and
[Semantic Program Kernel](../../atlas/items/model/semantic-program-kernel.md).

Derived from
[166. Semantic Operation Receivers And Bound Invocation](../research/166-semantic-operation-receivers-and-bound-invocation.md).

## Summary

Introduce the first executable Operation receiver contract without changing the closed Operation
invocation or Runtime Protocol. An Operation may explicitly declare either its Entity definition or
one required Entity Ref input as receiver. Binding that receiver is partial application: it rebuilds
the same complete validated input that functional invocation already accepts.

This slice replaces schema guessing and UI-only `graphOps.receiver` metadata with one canonical,
portable descriptor. It proves the contract through Todo and Classroom before consumer applications
migrate.

## Public authoring contract

The first declaration algebra is deliberately closed:

```ts
create: operation({
  receiver: { kind: 'entity-type', entity: self },
  input: CreateWorkspaceInput,
  output: self,
  run: createWorkspace,
});

askPlans: operation({
  receiver: { kind: 'input', path: 'workspace' },
  input: graphSchema.object({
    workspace: graphSchema.ref(self),
    question: graphSchema.string(),
  }),
  output: Answer,
  run: askPlans,
});
```

Composition normalizes those declarations to portable metadata:

```ts
type OperationReceiverDescriptor =
  | { kind: 'entity-type'; entityName: string }
  | {
      kind: 'input';
      path: string;
      entityName: string;
      participant: 'ref';
      requirement: 'portable' | 'existing';
    };
```

The live Entity definition is authoring input only. Reflection, generated code, Devtools, Explorer,
and alternate runtimes receive the normalized descriptor.

## Validation boundary

Composition rejects a receiver declaration when:

1. an Entity-type receiver does not reference a registered Entity definition;
2. an input receiver path is absent or not a top-level field of an object/value input;
3. the field is optional or nullable;
4. the field is not a portable or existing Entity Ref participant;
5. legacy `graphOps.receiver` and `receiver` disagree;
6. the declaration attempts a Selection, nested path, Relation, Module, or Application receiver in
   this slice.

The normalized Entity name is derived from the schema. Authors do not repeat it.

## Invocation semantics

The complete functional form remains permanent:

```ts
invoke(Workspace.askPlans, { workspace, question });
```

An Entity Ref facade consumes only an explicit compatible input receiver:

```ts
workspace.askPlans({ question });
```

It lowers to the same closed invocation:

```ts
Workspace.askPlans({ workspace, question });
```

The receiver remains inside `input`; Runtime Protocol stays
`{ version: 1, kind: 'invoke', operationId, input?, view? }`. Permission checks, callbacks, cache
invalidation, retries, Tasks, evidence, and implementations observe the reconstructed complete
input. Binding cannot override an explicitly supplied receiver value and must reject an Entity Ref
whose Entity does not match the descriptor.

An Entity-type declaration documents and reflects why the existing Entity-qualified callable is a
type operation. It adds no second wire value and no mutable class object.

## Compatibility

1. Complete-input invocation is unchanged.
2. Operations without a receiver remain valid and callable through the functional API.
3. `graphOps.receiver` is accepted temporarily and normalized as an input receiver when valid.
4. Ref facade schema inference remains only as a deprecated compatibility fallback for Operations
   with neither canonical nor legacy receiver metadata; it is never reflected as canonical meaning.
5. Todo, Classroom, generated clients, React hooks, Explorer, and codegen migrate in the same
   release before consumer applications do.
6. Removing the compatibility paths requires a later breaking-change plan and release note.

## Implementation slices

- [ ] Add declaration and normalized receiver types to Core.
- [ ] Validate and normalize type and required Ref input receivers during Operation resolution.
- [ ] Reflect the descriptor in application discovery and generated client declarations.
- [ ] Make Entity Ref binding consume canonical metadata before compatibility inference.
- [ ] Make Explorer projection consume the canonical descriptor instead of `graphOps.receiver`.
- [ ] Prove bound and complete-input calls reconstruct identical invocation input.
- [ ] Prove React lifecycle callbacks, invalidation, and cache keys receive complete input.
- [ ] Migrate Todo type/Ref receivers and its generated client.
- [ ] Migrate Classroom enrollment type/Ref receivers.
- [ ] Document owner versus receiver and the functional escape hatch.
- [ ] Add traceable Core, React, Explorer, and Codegen Changesets.
- [ ] Rehearse packed packages and consumer typechecking before alpha.20.

## Non-goals

1. Selection, Relation, Module, and Application receivers.
2. Receiver-derived Resource scope, provider selection, Governance, or Authorization.
3. A new Runtime Protocol request shape or receiver-selected execution placement.
4. Removing the receiver participant from Operation input.
5. Automatic bulk fan-out, partial-failure semantics, or Selection lifecycle.
6. Migrating Atlas or BookOps before a published package release.

## Acceptance

- [ ] Every migrated Operation reflects one stable portable receiver descriptor.
- [ ] Ambiguous same-Entity participants bind through the declared path without schema guessing.
- [ ] Invalid, optional, nullable, or mismatched receiver declarations fail during composition.
- [ ] Bound server, generated-client, and React use lower to the unchanged complete invocation.
- [ ] Runtime Protocol compatibility tests prove no new receiver field is transported.
- [ ] Todo and Classroom retain their existing behavior with both bound and functional calls.
- [ ] Package tests, typechecks, artifact verification, Changesets, and packed-consumer rehearsal pass.
