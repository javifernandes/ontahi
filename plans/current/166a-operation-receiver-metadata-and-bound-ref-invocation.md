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
  | { kind: 'entity-type'; entityName: string; source: 'declaration' }
  | {
      kind: 'input';
      path: string;
      entityName: string;
      participant: 'ref';
      requirement: 'portable' | 'existing';
      source: 'declaration';
    };
```

The live Entity definition is authoring input only. Reflection, generated code, Devtools, Explorer,
and alternate runtimes receive the normalized descriptor.

## Validation boundary

Composition rejects a new canonical receiver declaration when:

1. an Entity-type receiver does not reference a registered Entity definition;
2. an input receiver path is absent or not a top-level field of an object/value input;
3. the field is optional or nullable;
4. the field is not a portable or existing Entity Ref participant;
5. the Ref target is absent from the composed application's registered Entity catalog;
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
input. A bound call rejects ordinary arguments that contain the receiver path, even when that value
is equal to the bound Ref; `workspaceA.askPlans({ workspace: workspaceB, question })` can therefore
never redirect the invocation. Binding must also reject a bound Entity Ref whose Entity does not
match the descriptor. Complete-input functional calls remain the explicit way to supply a receiver.

An Entity-type declaration documents and reflects why the existing Entity-qualified callable is a
type operation. It adds no second wire value and no mutable class object.

## Compatibility

1. Complete-input invocation is unchanged.
2. Operations without a receiver remain valid and callable through the functional API.
3. `graphOps` remains available for locator traversal metadata, but no longer declares receivers.
4. Ref facade binding uses an explicit canonical declaration before historical unique-schema
   inference for Operations that do not declare a receiver. Inference is not reflected as canonical meaning.
5. Optional, nullable, and one-cardinality Selection inputs remain ordinary explicit inputs until
   Selection receiver semantics have their own executable slice.
6. Todo, Classroom, generated clients, React hooks, Explorer, and codegen migrate in the same
   release before consumer applications do.
7. Removing either compatibility path requires inventory, migration evidence, a breaking-change
   plan, and release notes.

## Implementation slices

- [x] Add declaration and normalized receiver types to Core.
- [x] Validate and normalize type and required Ref input receivers during Operation resolution.
- [x] Validate canonical receiver targets against the complete registered Entity catalog after
      application composition.
- [x] Reflect the descriptor in application discovery and generated client declarations.
- [x] Make Entity Ref binding consume canonical metadata before compatibility inference.
- [x] Make Explorer consume only the canonical descriptor and remove `graphOps.receiver`.
- [x] Prove bound and complete-input calls reconstruct identical invocation input.
- [x] Prove bound calls reject an explicit receiver argument and a wrong-Entity bound Ref.
- [x] Prove React lifecycle callbacks, invalidation, and cache keys receive complete input.
- [x] Migrate Todo type/Ref receivers and its generated client.
- [x] Migrate Classroom enrollment type/Ref receivers.
- [x] Document owner versus receiver and the functional escape hatch.
- [x] Add traceable Core, React, Explorer, and Codegen Changesets across the implementation slices.
- [x] Rehearse packed packages and consumer typechecking before alpha.20.

## Non-goals

1. Selection, Relation, Module, and Application receivers.
2. Receiver-derived Resource scope, provider selection, Governance, or Authorization.
3. A new Runtime Protocol request shape or receiver-selected execution placement.
4. Removing the receiver participant from Operation input.
5. Automatic bulk fan-out, partial-failure semantics, or Selection lifecycle.
6. Migrating Atlas or BookOps before a published package release.

## Acceptance

- [x] Every migrated Operation reflects one stable portable receiver descriptor.
- [x] Ambiguous same-Entity participants bind through the declared path without schema guessing.
- [x] Invalid, optional, nullable, or mismatched receiver declarations fail during composition.
- [x] Canonical input receiver targets must be registered in the composed Entity catalog.
- [x] Bound server, generated-client, and React use lower to the unchanged complete invocation.
- [x] Bound calls reject a supplied receiver field and a Ref whose Entity differs from the receiver
      descriptor.
- [x] Explorer instance actions consume only canonical required-Ref receiver descriptors.
- [x] Runtime Protocol compatibility tests prove no new receiver field is transported.
- [x] Todo and Classroom retain their existing behavior with both bound and functional calls.
- [x] Package tests, typechecks, artifact verification, Changesets, and packed-consumer rehearsal pass.
