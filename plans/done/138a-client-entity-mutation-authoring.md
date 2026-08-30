# 138a. Client Entity Mutation Authoring

Status: done

Parent plan: [138. Entity Mutation Command Authoring And Lifecycle Ergonomics](./138-entity-mutation-command-authoring.md)

Canonical ID: `ontahi://plans/138a-client-entity-mutation-authoring`

## Summary

Replace application-level `mutateEntity(Entity).create/update/delete` ceremony with one typed
lifecycle vocabulary on generated client Entity facades and their canonical Refs:

```ts
const createEnrollment = Enrollment.create({ student, course, status: 'active' });
const endEnrollment = Enrollment.refById('enrollment-1').delete();

await graphExecutor.runEntityMutationCommand(createEnrollment);
```

When the client Entity is bound to a Data Graph runtime, the same authored Commands gain a local,
non-enumerable execution affordance:

```ts
yield * BoundEnrollment.create({ student, course, status: 'active' }).run();
yield * BoundEnrollment.refById('enrollment-1').delete().run();
```

The semantic Entity definition remains a declarative metamodel value. The client facade supplies
authoring, and runtime binding supplies execution; neither portable Commands nor Refs carry runtime
objects.

## Evidence And Decisions

1. `mutateEntity(Entity)` already produces the canonical portable Command and enforces required
   stored Fields. `EntityMutationCommandExecutionRuntime` already executes that value in-memory,
   PostgreSQL, Supabase, and through the remote bridge.
2. `defineClientEntity(Entity)` is already the generated application-facing facade for Views,
   Queries, Operations, locator methods, and structural Relation Commands. It is the narrowest
   coherent owner for universal Entity mutation authoring.
3. Runtime-bound Queries consistently add `.run()` without changing their serialized semantic
   value. Entity Mutation Commands should use the same local-binding rule.
4. `create` is Entity-scoped; exact `update` and `delete` are Ref-scoped. Selection mutation remains
   the separate vocabulary for affected sets.
5. Lifecycle verbs are reserved structural Ref methods. A Domain Operation with the same name
   remains available through `Entity.domain.<name>`; a Ref proxy must not hide its own structural
   properties.
6. `mutateEntity(Entity)` remains the explicit lower-level and compatibility constructor. Existing
   `insert`, upsert, and Selection mutation APIs keep their current semantics.

## Scope

1. Add typed portable `create` authoring to client Entity facades and typed portable `update` and
   `delete` authoring to their locator-produced Refs.
2. Keep Ref methods and executable `.run()` bindings non-enumerable so JSON contains data only.
3. Upgrade the same methods when a client Entity is bound through `RuntimeBoundDataGraphApi`,
   resolving the focused capability lazily from the current runtime.
4. Preserve required stored Field and reference participant inference, including Association Entity
   construction with canonical participant Refs.
5. Prove compile-time types, complete portable values, execution options, capability absence, and
   direct versus remote-equivalent delta behavior with focused tests.
6. Replace the Todo client Tag creation ceremony with the generated facade as a small application
   proof.
7. Update Plan 138, Atlas, durable developer guidance where appropriate, and a public Changeset.

## Non-Goals

1. No revision, compare-and-set, or other update/delete preconditions; the parent Plan retains that
   concurrency slice.
2. No bulk/upsert facade, generic remote `GraphCommandSpec`, new transport, policy, or provider work.
3. No mutation hooks, cache invalidation redesign, optimistic UI, or Explorer UI.
4. No mutation methods on raw semantic Entity definitions and no mutable state on Refs.
5. No migration of existing Domain Operations whose business behavior happens to be named create,
   update, or delete.

## Acceptance Checklist

- [x] The generated client facade authors `Entity.create(values)`, `ref.update(values)`, and
      `ref.delete()` as the existing canonical portable Commands.
- [x] Runtime-bound client facades expose the same methods with `.run(options?)` and exact portable
      deltas.
- [x] Portable Command and Ref JSON contains no methods, Entity definitions, runtime, or executor.
- [x] Types require every non-optional stored Field for create, exclude derived Fields, and require
      canonical participant Refs for reference Fields.
- [x] Ref structural mutation methods take precedence over same-named Domain Operation proxy
      shortcuts; the Domain Operation remains available through `Entity.domain`.
- [x] Missing runtime capability fails before any provider work rather than silently falling back.
- [x] Todo authors Tag creation through `Tag.create(...)` without changing its UI behavior.
- [x] Focused tests, affected package/example tests, typecheck, lint, formatting, build, artifact
      verification, and Changeset status pass.

## Closure

- Status: done
- Closed on: 2026-08-30
- Outcome: generated client Entity facades now author exact portable create Commands, their canonical
  Refs author exact update/delete Commands, and runtime binding adds lazy non-enumerable `.run()`
  execution without adding runtime state to semantic Entities, Refs, or serialized Commands.
- Verification:
  - Core: 98 files and 707 tests passed with coverage; 90.23% statements, 81.30% branches,
    92.64% functions, and 90.70% lines;
  - React: 11 files and 76 tests passed; typecheck and lint passed;
  - Todo: 6 files and 45 tests passed; codegen check, server/client typecheck, lint, and production
    build passed;
  - Core typecheck and lint, repository formatting, all package builds, Changeset status, diff
    checks, and clean-room package artifact install/type/runtime verification passed.
- Follow-up: [Plan 138b](./138b-conditional-exact-entity-mutations.md) added portable conditional
  evidence and, when a conditional mutation affects no target, the single authority-safe
  `entity_mutation_condition_not_met` outcome; it does not distinguish missing, stale, replaced,
  or policy-hidden targets. An unconditional missing target remains an exact-cardinality failure.
