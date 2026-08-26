# 142. Declarative Model Semantics And Execution Planning

Status: next

Canonical ID: `ontahi://plans/142-declarative-model-semantics-and-execution-planning`

Related plans:

1. [74b. Schema-Native Operation Refs](../done/74b-schema-native-operation-refs.md)
2. [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
3. [136. Relation Constraints And Eligibility Semantics](../current/136-relation-constraints-and-eligibility.md)
4. [139a. Composable Data Graph Transactions](../done/139a-composable-data-graph-transactions.md)
5. [139b. Transaction-Scoped Unit Of Work](../done/139b-transaction-scoped-unit-of-work.md)
6. [139d. PostgreSQL Classroom Transfer](../done/139d-postgres-classroom-transfer.md)

## Summary

Let an Ontahí model declare input resolution requirements, Operation preconditions and
postconditions, permanent Entity/Relation invariants, derived graph values, and execution
requirements in one statically analyzable TypeScript vocabulary. Compile that authoring form into
portable reflection and expression IR so clients can provide advisory validation and documentation
while the selected authoritative runtime preserves atomicity and consistency.

Static requirements and runtime affordances remain separate. A Domain Operation may declare that
it requires atomic Data Graph execution without naming PostgreSQL, a server, or another deployment
topology. At invocation time the runtime planner decides whether the current storage can execute it
locally, whether it must bridge to another authority, or whether no available route satisfies the
contract. The same model must leave room for a browser database, offline-first execution,
replication, convergence, and authority-serialized invariants without pretending these guarantees
are equivalent.

## Evidence From Classroom

`Student.transfer(...)` currently demonstrates the right runtime primitives but exposes too much
manual coordination in application code:

1. three input Refs are resolved and checked for existence imperatively;
2. an expected-current Relation mismatch is converted manually from `not-applied` into a domain
   failure;
3. a known-full Course is checked in the Operation even though capacity should constrain every
   mutation path;
4. `availableSeats` is maintained as a stored counter even though it can be derived from Course
   capacity and current students;
5. the body calls `app.graph.transaction(effect)` even though atomicity is part of the Operation's
   execution contract;
6. none of these requirements are currently reflected for clients, Explorer, agents, execution
   routing, or documentation.

The example also exposes a distribution boundary. A client can determine from local data that a
Course is already full and avoid an unnecessary invocation, but a locally satisfied check is not
proof that capacity remains available at authoritative execution time. Two offline replicas can
each make a locally atomic decision and still violate a strict global capacity invariant after
merge unless the topology provides serialization or a convergence mechanism such as escrow.

## Semantic Categories

| Category               | Example                                             | Evaluation boundary                              | Failure meaning                           |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| Input constraint       | previous and next Course differ                     | pure input validation; client-safe when portable | expected invalid input                    |
| Resolution requirement | Student Ref resolves exactly once                   | authorized UnitOfWork selected for execution     | expected missing/inaccessible participant |
| Operation precondition | Student is still assigned to previous Course        | guarded Command or atomic Operation boundary     | expected stale/domain rejection           |
| Permanent invariant    | Course students never exceed capacity               | every affected mutation's authoritative boundary | model mutation rejection                  |
| Postcondition          | successful transfer leaves Student in next Course   | after the body and before commit                 | contract or implementation violation      |
| Derived value          | available seats equals capacity minus student count | graph read or provider-owned materialization     | definition/evaluation failure             |

A precondition does not automatically make a whole Operation transactional. A pure input condition
requires no storage boundary. A state precondition attached to one Relationship Command should be
lowered into that Command's compare-and-set or constraint boundary. Operation-level atomicity is
required when several reads, Commands, or postconditions must share one commit/rollback scope. A
stateful postcondition that can reject execution requires a rollback-capable boundary; a pure
postcondition over the returned value does not necessarily require storage atomicity.

## Target Authoring Shape

The following syntax is a design target, not an accepted public API:

```ts
const Course = entity({
  name: 'Course',

  fields: {
    id: field.id(),
    capacity: field.nonNegativeInteger(),
  },

  relations: {
    students: relation.hasMany(StudentRef, {
      via: 'currentCourse',
    }),
  },

  derived: {
    occupiedSeats: derive(({ students }) => students.count()),
    availableSeats: derive(({ capacity, students }) => capacity - students.count()),
  },

  invariants: {
    withinCapacity: invariant(({ capacity, students }) => students.count() <= capacity, {
      consistency: 'strict',
      rejection: relationRejection.courseFull(),
    }),
  },
});
```

```ts
transfer: operation.atomic({
  input: graphSchema.object({
    student: graphSchema.existingRef(Student),
    previousCourse: graphSchema.existingRef(Course),
    nextCourse: graphSchema.existingRef(Course),
  }),

  preconditions: {
    differentCourses: ({ previousCourse, nextCourse }) => !previousCourse.is(nextCourse),

    studentStillAssigned: ({ student, previousCourse }) => student.currentCourse.is(previousCourse),
  },

  postconditions: {
    studentWasTransferred: ({ student, nextCourse }) => student.currentCourse.is(nextCourse),
  },

  run: ({ student, previousCourse, nextCourse }) =>
    student.ref.currentCourse
      .assign(nextCourse.ref, { ifCurrent: previousCourse.ref })
      .run()
      .pipe(operation.requireApplied()),
});
```

`existingRef(Entity)` has a conventional structured `entity_not_found` rejection derived from the
Entity and input path. A custom rejection remains an override, not required boilerplate. Named
preconditions likewise have a conventional safe rejection identity; domain-specific codes and
messages are optional authoring refinements. A failed postcondition normally reports a contract
violation rather than an expected user rejection.

The target Operation contains no manual capacity read or update. The Relation invariant rejects an
addition that would exceed Course capacity, while the derived value observes the resulting
membership. An unlink remains possible even when an existing Course has become invalid under a
newer rule.

## TypeScript Expression Language

Plain JavaScript does not support the operator overloading needed to turn
`capacity - students.count()` or `students.count() <= capacity` into portable IR at runtime. Avoid
forcing authors to spell every expression as `subtract(...)` and `.lte(...)` without first proving
that ceremony is necessary.

The preferred experiment is a statically analyzed, side-effect-free TypeScript expression subset.
Ontahí codegen analyzes the author callback and emits canonical JSON-safe expression IR. The first
subset should consider:

1. model Field and Relation access rooted in declared callback parameters;
2. arithmetic, comparison, boolean, and nullish operators;
3. portable Ref identity comparison through a registered semantic helper or method;
4. selected Relation aggregates beginning with `count()`;
5. pure Ontahí helpers whose compiler and interpreter semantics are registered;
6. no mutable captures, arbitrary function calls, IO, time, randomness, provider objects, or
   authority context hidden in closures.

Unsupported expressions fail with a source-located codegen diagnostic. The author function is not
serialized or treated as executable Relation metadata. Reflection, transports, storage adapters,
and client evaluation consume only the compiled IR.

For example, the Course invariant may compile to:

```ts
{
  kind: 'compare',
  operator: 'lte',
  left: {
    kind: 'relation-aggregate',
    relation: 'students',
    aggregate: 'count',
  },
  right: {
    kind: 'field',
    field: 'capacity',
  },
}
```

The experiment must compare this approach with a small explicit expression-builder fallback. Do
not commit the framework to source analysis if it cannot preserve runtime-only application
authoring, useful type diagnostics, and generated artifact correctness.

## Reflection And Advisory Evaluation

Compiled conditions expose stable identity, safe rejection metadata, data dependencies, required
capabilities, and evaluation locus. Client evaluation is tri-state rather than a misleading
boolean:

```ts
type ConditionEvaluation =
  | { status: 'satisfied' }
  | { status: 'rejected'; rejection: PortableRejection }
  | { status: 'unknown'; missing: readonly ConditionDependency[] };
```

1. `rejected` lets a UI avoid an invocation known to fail for the observed state.
2. `satisfied` improves UX but never suppresses authoritative revalidation.
3. `unknown` means required state or authority is unavailable locally; the normal execution planner
   may still bridge or queue the invocation.

Reflection must not leak inaccessible fields, actual current targets, or confidential rejection
parameters. Policy remains independent from model validity. A client that can evaluate a condition
still does not gain permission to execute the mutation.

## Execution Requirements And Runtime Planning

`operation.atomic(...)` should establish both an authoring shortcut and a reflected static
requirement. The runner, not the application body, owns the transaction boundary so declaration and
behavior cannot drift.

One possible portable shape is:

```ts
{
  execution: {
    atomicity: 'required',
    scope: 'data-graph',
    consistency: 'strict',
    capabilities: [
      'relation.compare-and-set',
      'relation.aggregate-constraint',
    ],
  },
}
```

The exact vocabulary remains open. It must describe semantic requirements without naming a server,
browser, PostgreSQL, Supabase, or transport. Binding an Application to a concrete runtime produces a
separate authority-dependent affordance:

```ts
type OperationExecutionAffordance =
  | { status: 'local'; runtime: string }
  | { status: 'bridge'; authority: string; bridge: string }
  | { status: 'queued'; topology: string }
  | { status: 'unavailable'; missingCapabilities: readonly string[] };
```

UI application code invokes the same Operation facade in every case. It may inspect the affordance
to present availability, but it does not choose a provider or duplicate routing logic.

Atomicity is scoped to the selected execution boundary. It does not imply global serializability or
safe convergence across replicas. A strict aggregate invariant may require an authority-serialized
runtime. A future storage topology may satisfy the same contract locally through a bounded counter,
escrow, or another declared convergence capability; Plan 142 does not design that algorithm.

## Derived Values And Materialization

A derived value has one semantic definition and at least two possible execution strategies:

1. virtual: compile the expression into graph reads and calculate it on demand;
2. materialized: persist provider-specific projection state and update it atomically from committed
   mutation deltas.

Materialization is an optimization and execution capability, not a second authored field formula.
An applied Relationship Delta already identifies removals and additions across both Course
endpoints, making incremental maintenance possible inside the same storage commit. A post-commit
Reaction is too late to preserve an invariant and must not become the materialization mechanism.

The first implementation slice should prove virtual derivation. Provider-owned materialization,
rebuilds, drift detection, and repair require a later focused plan.

## Execution Slices

1. **Language and IR experiment:** prove a minimal arithmetic/boolean/Ref/relation-aggregate
   TypeScript subset against three Classroom expressions. Compare static analysis with an explicit
   builder and stop before publishing a public DSL.
2. **Reflected atomic Operation requirement:** add the smallest static metadata and
   `operation.atomic(...)` factory, make the server runner own the transaction boundary, and expose
   local/bridge/unavailable execution planning without implementing replication.
3. **Existing Ref and condition contracts:** add conventional `existingRef`, named preconditions,
   postconditions, portable rejection defaults, dependency reflection, and tri-state advisory
   evaluation. State-dependent checks must execute inside the selected UnitOfWork.
4. **Derived graph values:** prove one virtual `Course.availableSeats` derived value in memory and
   through one authorized provider read without storing a counter.
5. **Aggregate Relation invariant:** extract a linked Plan 136 child that rejects prospective
   `Course.students` additions atomically in memory and one provider. Preserve unlink repair and
   concurrent conflict semantics.
6. **Distribution follow-up:** only after runtime planning is real, specify storage topology,
   offline queueing, replication, convergence evidence, and strict versus merge-safe invariant
   requirements in a separate plan.

Each slice requires TDD, semantic runtime assertions, compile-time contract coverage when public
types change, proportional provider integration evidence, and a Changeset for public package
surfaces.

## Non-Goals

1. No arbitrary JavaScript callback in portable Entity, Relation, Operation, or reflection metadata.
2. No claim that client validation is authoritative, race-free, or permission granting.
3. No inference of whole-Operation atomicity from the presence of one precondition.
4. No generic distributed transaction, replication protocol, CRDT catalog, or offline conflict UI.
5. No automatic materialization, repair daemon, retry policy, or aggregate SQL compiler in the
   language experiment.
6. No duplication of schema-native Ref declarations in `inputRefs`, graph-operation metadata, or
   implementation namespaces.
7. No replacement of Policy, authorization, Reactions, or Applied Mutation Outcomes with model
   invariants.
8. No source-language feature that cannot produce stable reflection and JSON-safe canonical IR.

## Acceptance Checklist

- [ ] One Classroom sketch distinguishes input constraints, Ref resolution requirements,
      preconditions, permanent invariants, postconditions, and derived values without manual counter
      maintenance.
- [ ] The authoring experiment permits natural arithmetic and boolean expressions or records
      concrete evidence that an explicit builder is required.
- [ ] Every accepted expression lowers to stable JSON-safe IR with source-located diagnostics for
      unsupported code.
- [ ] `existingRef(Entity)` has a conventional safe failure and preserves portable Ref identity
      separately from authorized resolved data.
- [ ] Client condition evaluation is reflected as satisfied, rejected, or unknown and never skips
      authoritative validation after a local success.
- [ ] State preconditions compile into one guarded Command when possible; otherwise their required
      atomic Operation boundary is explicit.
- [ ] Permanent invariants apply to every relevant mutation path and distinguish strict,
      authority-serialized requirements from future merge-safe execution.
- [ ] Derived values have one semantic definition independent from virtual or materialized execution.
- [ ] Static Operation execution requirements remain separate from runtime local/bridge/queued/
      unavailable affordances.
- [ ] UI invocation remains provider- and topology-transparent while availability stays inspectable.
- [ ] The first executable slice remains small and extracts aggregate enforcement, materialization,
      and distribution into linked follow-ups.

## Open Questions

1. Can the existing codegen analyzer support a useful restricted TypeScript expression subset
   without making runtime-only authoring second class?
2. What should a resolved `existingRef` expose to an Operation body so Ref identity and Entity data
   remain distinct without recreating a parallel `refs` namespace?
3. Which preconditions can be proven to lower into one Command, and how does the compiler explain
   when Operation-level atomicity is still required?
4. Is `atomicity: 'required'` sufficient, or must the contract separately name transaction scope,
   isolation, and strict versus convergent consistency?
5. How are conventional rejection codes named and localized without forcing boilerplate or making
   domain failures unstable?
6. Which dependencies make a client evaluation `unknown`, and how does graph-read policy redact
   inaccessible condition evidence?
7. Can virtual relation aggregates compose with existing Queries and Views without a parallel
   computed-field query language?
8. How should generated clients expose execution availability while keeping the ordinary invocation
   spelling unchanged?
