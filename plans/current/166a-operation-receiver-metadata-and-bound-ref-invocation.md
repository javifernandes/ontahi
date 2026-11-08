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
      source: 'declaration' | 'legacy-graph-ops';
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
6. legacy `graphOps.receiver` and canonical `receiver` disagree when both identify Ref participants;
7. the declaration attempts a Selection, nested path, Relation, Module, or Application receiver in
   this slice.

The normalized Entity name is derived from the schema. Authors do not repeat it. Legacy metadata
that cannot satisfy these rules remains on the compatibility path below; upgrading must not turn an
already composed application into a startup failure.

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

The strict no-receiver-field rule applies to descriptors whose source is `declaration`. A descriptor
derived from legacy `graphOps.receiver` preserves an existing same-Ref argument: it accepts the
receiver path only when its normalized Entity and locator equal the bound Ref, and rejects any
redirect to another Ref. This exception is migration behavior, not the contract for newly authored
receivers.

An Entity-type declaration documents and reflects why the existing Entity-qualified callable is a
type operation. It adds no second wire value and no mutable class object.

## Compatibility

1. Complete-input invocation is unchanged.
2. Operations without a receiver remain valid and callable through the functional API.
3. `graphOps.receiver` is accepted temporarily and normalized as an input receiver only when it
   identifies a required Ref participant that satisfies the canonical rules. Its descriptor retains
   `source: 'legacy-graph-ops'`; provenance is not erased by normalization.
4. Optional, nullable, and one-cardinality Selection receivers expressed only through
   `graphOps.receiver` remain composable and retain their existing Explorer instance actions. They
   are reflected as legacy receiver metadata, not widened into the first canonical descriptor.
5. Ref facade binding uses this precedence:
   1. an explicit canonical declaration binds only its declared receiver and disables inference;
   2. a compatible Ref matching a legacy normalized descriptor binds the legacy receiver path;
   3. a Ref of another Entity falls back to the historical unique schema match, preserving
      source-bound calls when legacy `graphOps.receiver` names a destination participant;
   4. legacy metadata that could not normalize uses the historical inference unchanged.
      None of the fallback results is reflected as canonical meaning.
6. Canonical metadata controls new bound projection. Explorer additionally consumes the isolated
   legacy projection until Selection and migration semantics have their own executable slice.
7. Todo, Classroom, generated clients, React hooks, Explorer, and codegen migrate in the same
   release before consumer applications do.
8. Removing either compatibility path requires inventory, migration evidence, a breaking-change
   plan, and release notes.

## Implementation slices

- [x] Add declaration and normalized receiver types to Core.
- [x] Validate and normalize type and required Ref input receivers during Operation resolution.
- [x] Validate canonical receiver targets against the complete registered Entity catalog after
      application composition.
- [ ] Reflect the descriptor in application discovery and generated client declarations.
- [x] Make Entity Ref binding consume canonical metadata before compatibility inference.
- [ ] Make Explorer prefer the canonical descriptor while preserving tested legacy Ref and
      one-cardinality Selection projections.
- [x] Prove bound and complete-input calls reconstruct identical invocation input.
- [x] Prove bound calls reject an explicit receiver argument and a wrong-Entity bound Ref.
- [x] Prove legacy same-Ref arguments remain valid while different-Ref redirects fail.
- [x] Prove legacy cross-participant Ref inference remains callable without becoming canonical.
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
- [ ] Canonical input receiver targets must be registered in the composed Entity catalog.
- [ ] Bound server, generated-client, and React use lower to the unchanged complete invocation.
- [ ] Bound calls reject a supplied receiver field and a Ref whose Entity differs from the receiver
      descriptor.
- [ ] Legacy normalized bound calls accept a supplied identical Ref but reject receiver redirects.
- [ ] Legacy optional/nullable Ref and one-cardinality Selection receiver actions remain available
      in Explorer, and legacy cross-participant Ref calls retain their prior binding behavior.
- [ ] Runtime Protocol compatibility tests prove no new receiver field is transported.
- [ ] Todo and Classroom retain their existing behavior with both bound and functional calls.
- [ ] Package tests, typechecks, artifact verification, Changesets, and packed-consumer rehearsal pass.
