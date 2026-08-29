# 142. Declarative Model Semantics And Execution Planning

Status: current

Canonical ID: `ontahi://plans/142-declarative-model-semantics-and-execution-planning`

Related plans:

1. [74b. Schema-Native Operation Refs](../done/74b-schema-native-operation-refs.md)
2. [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
3. [136. Relation Constraints And Eligibility Semantics](../current/136-relation-constraints-and-eligibility.md)
4. [139a. Composable Data Graph Transactions](../done/139a-composable-data-graph-transactions.md)
5. [139b. Transaction-Scoped Unit Of Work](../done/139b-transaction-scoped-unit-of-work.md)
6. [139d. PostgreSQL Classroom Transfer](../done/139d-postgres-classroom-transfer.md)
7. [142d. Existing Operation Refs](../done/142d-existing-operation-refs.md)
8. [142e. Portable Operation Condition Bridge](../done/142e-portable-operation-condition-bridge.md)
9. [142f. Virtual Derived Fields And Classroom Capacity](../done/142f-virtual-derived-fields-and-classroom-capacity.md)
10. [136h. Authority-Serialized Relation Count Constraints](../done/136h-authority-serialized-relation-count-constraints.md)

## Summary

Evolve Ontahí's existing Operation `contracts.pre` / `contracts.post` categories so input
resolution requirements, preconditions, postconditions, permanent Entity/Relation invariants,
derived graph fields, and execution requirements can participate in one statically analyzable
TypeScript vocabulary. Compile the declarative authoring form into portable reflection and
expression IR so clients can provide advisory validation and documentation while the selected
authoritative runtime preserves the declared execution guarantees.

Do not introduce a parallel `preconditions` / `postconditions` namespace as if Operation contracts
did not already exist. At the start of this plan, contract callbacks were real public runtime
behavior but an anticipatory, code-bearing surface with no application adoption in this
repository. Plan 142e reused `contracts.pre` for named portable conditions and moved arbitrary
server-only pre/post callbacks to the explicit `contract(...)` concern during the alpha.

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

1. before Plan 142d, three input Refs were resolved and checked for existence imperatively;
2. an expected-current Relation mismatch is converted manually from `not-applied` into a domain
   failure;
3. a known-full Course is checked in the Operation even though capacity should constrain every
   mutation path;
4. `availableSeats` is maintained as a stored counter even though it can be derived from Course
   capacity and current students;
5. before Plan 142c, the body called `app.graph.transaction(effect)` even though atomicity is part
   of the Operation's execution contract;
6. the remaining stateful capacity and expected-current rules are not yet reflected for clients,
   Explorer, agents, execution routing, or documentation;
7. before Plan 142e, callback-valued `contracts.pre/post` could not represent portable meaning;
   Classroom now uses the first named portable input condition for same-Course rejection.

The example also exposes a distribution boundary. A client can determine from local data that a
Course is already full and avoid an unnecessary invocation, but a locally satisfied check is not
proof that capacity remains available at authoritative execution time. Two offline replicas can
each make a locally atomic decision and still violate an authority-serialized global capacity
invariant after merge unless the topology provides serialization or a convergence mechanism such
as escrow.

## Former Operation Callback Surface

Before Plan 142e, Core exposed `OperationContracts<TInput, TResult, TFailure>`:

```ts
contracts: {
  pre: input => checkBeforeBody(input),
  post: (input, result) => checkAfterBody(input, result),
},
```

Plan 142a characterized that runtime contract:

1. `pre` and `post` each accept one callback or an ordered array;
2. a callback may return synchronously, through a Promise, or as an Effect;
3. callbacks may return one or several `OperationFailure` values;
4. pre-checks run sequentially before the body and stop on the first failing check;
5. post-checks run sequentially after a successful body and receive the unwrapped success value;
6. a post-check failure changes the Operation result but does not undo body effects;
7. callbacks also receive the low-level `LayerConcernRuntime`.

That breadth made the surface useful before Refs, locators, UnitOfWork, portable Selection
predicates, Relationship Command preconditions, and compositional transactions existed. It also
makes the callbacks opaque: arbitrary code cannot be serialized, reflected, evaluated advisory on
a client, lowered into a guarded Command, or used to derive execution requirements.

Repository evidence was intentionally weak adoption evidence: the only direct use was Core's focused
contract test suite plus the developer-book example. No executable application or package behavior
declared callback-valued `contracts.pre` or `contracts.post`. Plan 142e therefore removed that
top-level callback shape during the alpha. The behavior remains available deliberately through
`contract(...)`, while top-level `contracts.pre` now owns named portable conditions.

## Semantic Categories

| Category               | Example                                             | Evaluation boundary                                 | Failure meaning                           |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| Input constraint       | previous and next Course differ                     | pure input validation; client-safe when portable    | expected invalid input                    |
| Resolution requirement | Student Ref resolves exactly once                   | authorized UnitOfWork selected for execution        | expected missing/inaccessible participant |
| Operation precondition | Student is still assigned to previous Course        | future guarded Command or atomic Operation boundary | expected stale/domain rejection           |
| Permanent invariant    | Course students never exceed capacity               | every affected mutation's authoritative boundary    | model mutation rejection                  |
| Postcondition          | successful transfer leaves Student in next Course   | after the body and before commit                    | contract or implementation violation      |
| Derived Field          | available seats equals capacity minus student count | graph read or provider-owned materialization        | definition/evaluation failure             |

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
    occupiedSeats: field.derived(({ students }) => students.count()),
    availableSeats: field.derived(({ capacity, students }) => capacity - students.count()),
  },

  relations: {
    students: relation.hasMany(StudentRef, {
      via: 'currentCourse',
    }),
  },

  invariants: {
    withinCapacity: invariant(({ capacity, students }) => students.count() <= capacity, {
      enforcement: 'authority-serialized',
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

  contracts: {
    pre: {
      differentCourses: ({ previousCourse, nextCourse }) => !previousCourse.is(nextCourse),

      studentStillAssigned: ({ student, previousCourse }) =>
        student.currentCourse.is(previousCourse),
    },

    post: {
      studentWasTransferred: ({ student, nextCourse }) => student.currentCourse.is(nextCourse),
    },
  },

  run: ({ student, nextCourse }) => student.ref.currentCourse.assign(nextCourse.ref),
});
```

Derived values remain Fields because callers select, project, reflect, display, and navigate them
through the same Entity field surface. `field.derived(...)` distinguishes their read-only semantic
definition from stored Fields; Commands cannot assign them. Relation declarations remain the
structural edge surface that a derived Field may reference. This follows the same rule as
schema-native input Refs: express a semantic distinction in the Field definition rather than
creating a parallel container that callers must learn and traverse.

Plan 142e accepted the named object form for portable `contracts.pre`. Portable
`contracts.post` remains provisional until its result/state dependencies and rollback meaning are
proved.

`existingRef(Entity)` has a conventional structured `entity_not_found` rejection derived from the
Entity and input path. A custom rejection remains an override, not required boilerplate. Named
preconditions likewise have a conventional safe rejection identity; domain-specific codes and
messages are optional authoring refinements. A failed postcondition normally reports a contract
violation rather than an expected user rejection.

The target Operation contains no manual capacity read or update. The Relation invariant rejects an
addition that would exceed Course capacity, while the derived Fields observe the resulting
membership. An unlink remains possible even when an existing Course has become invalid under a
newer rule.

### Canonical Relation Mutation And Invariant Enforcement

Forward and inverse APIs are authoring surfaces over one canonical Relation fact, not independent
mutation paths. Before storage execution, every structural command must produce its complete
prospective `RelationshipDelta`:

1. `student.currentCourse.assign(nextCourse)` removes the existing
   `Student.currentCourse -> previousCourse` fact, when present, and adds the
   `Student.currentCourse -> nextCourse` fact;
2. `nextCourse.students.add(student)` produces the same canonical added fact as the forward
   assignment;
3. `student.currentCourse.clear()` and `course.students.remove(student)` produce the same canonical
   removed fact.

An invariant dependency on `Course.students` is registered against that canonical Relation
identity. The runtime therefore evaluates `withinCapacity` for every Course endpoint affected by
the complete prospective delta, regardless of which authoring direction produced it. A transfer
evaluates the destination with the added Student already included and the previous Course with the
removal already applied, before any part of the delta becomes visible.

Aggregate upper-bound invariants use repair-safe enforcement. An addition or another change that
increases a violation must leave the prospective state satisfying the invariant. A removal or
capacity increase that only reduces an existing violation may proceed even if older invalid data is
not repaired completely by that one mutation. An empty delta does not trigger aggregate
revalidation; an Operation may separately reject a domain-level no-op such as a same-Course
transfer through an input precondition.

If an affected endpoint rejects the prospective state, the entire Relationship Command or atomic
Operation fails: no edge is changed, no derived value is invalidated as if committed, and no
post-commit Reaction observes an Applied Mutation Outcome. The aggregate-invariant slice must add
semantic tests proving identical rejection and unchanged state for both
`student.currentCourse.assign(fullCourse)` and `fullCourse.students.add(student)`, plus successful
coverage through both directions and removal from already-invalid data.

The Operation invoker recognizes a closed set of canonical Ontahí executable values, including
Graph Commands, Relationship Commands, and graph reads, and executes a returned value through the
current runtime. It must not duck-type and invoke arbitrary objects that happen to expose `run()`.
This makes a single returned Relationship Command executable without `.run()`. The declared
`studentStillAssigned` precondition is lowered into the command's atomic compare-and-set, so the
body does not repeat it as `ifCurrent` or translate `not-applied` with a `.pipe(...)`. An explicitly
requested observable `onMismatch: 'skip'` remains available for lower-level workflows that want to
handle that outcome themselves. Sequencing multiple Commands inside an imperative Effect remains a
separate ergonomics question; automatic execution of the Operation's returned value does not imply
recursive execution of arbitrary nested values.

Effect sequencing itself does not require an `Effect.gen(function* () { ... })` wrapper inside
`run`. Operations accept `Effect.fn(...)` and direct `*run(...)` Effect generators; the invoker
adapts the latter to the ordinary Effect path while preserving contextual input typing, UnitOfWork,
contracts, atomicity, failures, and defects. Recognition is limited to actual generator functions,
not arbitrary objects implementing the iterator protocol.

## Contract Compatibility Decision

Plan 142a answered the compatibility questions with tests and repository evidence; Plan 142e made
the alpha migration:

1. callback-valued top-level contracts were historical generality, not portable model semantics;
2. mixing callbacks and declarations would make typing, execution, and reflection ambiguous, so
   top-level `contracts.pre` accepts named portable declarations only;
3. opaque pre/post callbacks remain explicit through `contract(...)`, with no reflected
   dependencies or advisory result;
4. opaque post failures preserve their characterized expected-failure behavior, including rollback
   when enclosed by `operation.atomic(...)`;
5. portable postcondition violation remains open and was not disguised by retaining the old
   callback spelling.

The public removal carries an alpha Changeset and developer migration note. There is one portable
top-level contract model and one deliberately opaque concern escape hatch.

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

### Language Experiment Decision

Plan 142b proved that the three target Classroom expressions can be parsed without executing their
callbacks and lowered deterministically into one versioned, JSON-safe IR. A closed AST visitor can
preserve ordinary subtraction, less-than-or-equal, boolean not, Ref identity, and Relation count
syntax while rejecting arbitrary calls, captures, unsupported operators, block bodies, and invalid
semantic receivers with stable source-located diagnostics.

Static callbacks and an explicit builder should therefore be two frontends over one model, not two
contract languages. Natural TypeScript is the preferred build-time authoring form. The explicit
builder remains the honest runtime-only fallback because it creates the same IR without needing
source text. It is more verbose and repeats model member names as strings, so it should not become
the default merely because it is easier to implement.

Plan 142e supplied the publication evidence for the first consumer: codegen derives Operation input
Ref symbols from the real schema, while technology-independent Core owns the canonical IR,
dependency collection, and evaluator. No callback is serialized or evaluated at runtime, and the
explicit builder supplies runtime-only parity for every promoted node. Field and Relation symbol
discovery still belongs to the derived-Field and invariant slices that consume those nodes.

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
behavior cannot drift. Within this plan, it has one precise meaning: all authorized Data Graph
reads, state-dependent preconditions, Commands, invariant enforcement, and state-dependent
postconditions performed by the Operation share one commit-or-rollback boundary. Post-commit
Reactions and external services are outside that boundary unless a later coordination model says
otherwise.

Do not add an execution `scope` property. The existing Operation scope identifies an Operation for
telemetry, failures, cache keys, and concerns; it is not a transaction resource selector. Plan 142
only promises Data Graph atomicity. A future contract that coordinates an event log, workflow
engine, or external resource needs explicit semantics rather than overloading `scope: 'data-graph'`.

### Execution Vocabulary

| Term                           | Meaning                                                                                                             | Does not claim                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Operation scope                | Stable identity used by invocation concerns such as telemetry, failures, and cache keys.                            | A selectable transaction resource or consistency boundary.                  |
| Data Graph atomicity           | The Operation's covered Data Graph work commits completely or leaves no mutation visible.                           | Atomic external APIs, post-commit Reactions, or globally distributed state. |
| Capability requirement         | A compiler-derived, provider-neutral guarantee needed to execute the compiled program honestly.                     | A provider choice or manually duplicated author declaration.                |
| Runtime capability             | A live runtime claim, backed by conformance evidence, that it can satisfy a requirement for the compiled program.   | Permission to execute; Policy and authority still apply.                    |
| Authority-serialized invariant | Relevant mutations pass through one authority that checks prospective state and prevents conflicting valid commits. | Global serializability of unrelated state or offline merge safety.          |
| Merge-safe invariant           | A future topology-specific proof that concurrent accepted changes preserve the invariant after convergence.         | Ordinary local transactions being sufficient.                               |
| Runtime execution affordance   | The current binding result: execute locally, bridge, queue, or report unavailable.                                  | Static model metadata or a choice delegated to UI code.                     |

One possible portable reflection shape is:

```ts
{
  execution: {
    atomicity: 'required',
    requiredCapabilities: [
      { kind: 'relation.compare-and-set' },
      {
        kind: 'relation.aggregate-invariant',
        enforcement: 'authority-serialized',
      },
    ],
  },
}
```

These capabilities are compiler-derived requirements, not another author-maintained list:

1. `relation.compare-and-set` means the runtime can test the current Relation endpoint and apply the
   corresponding mutation as one indivisible provider operation; it cannot implement this as an
   unguarded read followed by a write.
2. `relation.aggregate-invariant` with `enforcement: 'authority-serialized'` means every mutation
   that can affect the declared aggregate is evaluated against the prospective graph state and
   applied or rejected within one authority-controlled serialization boundary.

`atomicity: 'required'` is itself a semantic guarantee rather than shorthand for the current
`data-graph.transaction` runtime API. A runtime may satisfy it by compiling the complete Operation
to one atomic statement or RPC, or by using a compositional storage transaction. This distinction
allows a focused Supabase RPC to satisfy one atomic Operation without falsely advertising general
compositional transactions.

The vocabulary must stay small, versioned, technology-independent, and backed by conformance tests.
`operation.atomic`, lowered state preconditions, and permanent invariants contribute requirements;
a runtime advertises only guarantees it actually implements. PostgreSQL, Supabase, a browser
database, and a remote bridge can therefore satisfy different subsets without appearing in model
metadata. Binding an Application to a concrete runtime produces a separate authority-dependent
affordance:

```ts
type OperationExecutionAffordance =
  | { status: 'local'; runtime: string }
  | { status: 'bridge'; authority: string; bridge: string }
  | { status: 'queued'; topology: string }
  | {
      status: 'unavailable';
      missingCapabilities: readonly ExecutionCapabilityRequirement[];
    };
```

UI application code invokes the same Operation facade in every case. It may inspect the affordance
to present availability, but it does not choose a provider or duplicate routing logic.

Do not use a generic `consistency: 'strict'` flag: it conflates atomic commit, transaction isolation,
freshness, authority, and replica convergence. The first aggregate-invariant slice requires
`authority-serialized` enforcement: all relevant mutations pass through an authority that prevents
concurrent commits from violating the invariant. This does not claim global serializability for
unrelated state or safe convergence across replicas. A future topology may instead advertise a
separately defined `merge-safe` guarantee backed by bounded counters, escrow, or another proven
algorithm; Plan 142 does not design or equate that guarantee.

## Derived Fields And Materialization

A derived Field has one semantic definition and at least two possible execution strategies:

1. virtual: compile the expression into graph reads and calculate it on demand;
2. materialized: persist provider-specific projection state and update it atomically from committed
   mutation deltas.

Materialization is an optimization and execution capability, not a second authored Field formula.
An applied Relationship Delta already identifies removals and additions across both Course
endpoints, making incremental maintenance possible inside the same storage commit. A post-commit
Reaction is too late to preserve an invariant and must not become the materialization mechanism.

The first implementation slice should prove virtual derivation. Provider-owned materialization,
rebuilds, drift detection, and repair require a later focused plan.

### Classroom Migration And Compatibility Contract

Plan 139d intentionally keeps `Course.availableSeats` backed by
`courses.available_seats` as an explicit coordination proof. Plan 142 must not silently reinterpret
that stored value as total capacity. The derived-Field slice introduces a new ordered migration
after `001-create-classroom.sql` with this contract:

1. run the example migration with Course and Student writes paused inside one database transaction;
2. add nullable `courses.capacity` and backfill each Course as
   `available_seats + count(students where current_course_id = course.id)`;
3. validate `capacity >= count(Course.students)`, make `capacity` non-null with a non-negative check,
   and abort rather than clamp or guess when legacy state is inconsistent;
4. drop `courses.available_seats` in the same migration after validation, because the private
   example does not support a mixed-version rolling deployment or a dual-write transition.

Migration history remains append-only: do not rewrite `001-create-classroom.sql`. Fresh integration
databases apply all migration files in order and then insert fixtures using `capacity`; a dedicated
upgrade fixture inserts legacy `available_seats` plus current Student assignments before the new
migration and proves the backfilled capacity. Schema-contract validation should reject running the
new model against the old database shape rather than falling back to the stored counter.

After the migration, the Ontahí model and provider mapping expose stored `Course.capacity` plus
read-only derived `occupiedSeats` and `availableSeats`; no command or mapping references
`available_seats`. `Student.transfer(...)` returns the applied Relationship Command outcome instead
of the previous and next counter-update rows. Integration assertions query stored capacity and the
derived Fields through authorized Views/Queries, and verify both the success result shape and graph
state without direct counter updates.

The authoritative formula is exactly `capacity - count(Course.students)` over the canonical
`Student.currentCourse` Relation; Enrollment rows do not participate. A provider must evaluate that
virtual Field as an authorized graph projection, not by counting whichever Student rows happen to
be present in a client cache or visible through a separately filtered Relation panel. Policy decides
whether the caller may receive the derived Field without granting access to its participant rows.
If the selected runtime cannot evaluate the dependency without violating graph-read policy, the
projection or advisory evaluation is unavailable/`unknown`; it must never return a partial count.

## Execution Slices

1. **Existing contract characterization (complete):** add Operation-level tests for current callback ordering,
   failure meaning, schema-native Ref hydration, UnitOfWork visibility, post-body mutation behavior,
   and interaction with `app.graph.transaction(...)`. Record the compatibility decision before
   adding another authoring shape. Delivered through
   [142a. Existing Operation Contract Compatibility Baseline](../done/142a-existing-operation-contract-compatibility-baseline.md).
2. **Language and IR experiment (complete):** prove a minimal arithmetic/boolean/Ref/relation-aggregate
   TypeScript subset against three Classroom expressions. Compare static analysis with an explicit
   builder and stop before publishing a public DSL. Delivered through
   [142b. Classroom Model Expression Language Experiment](../done/142b-classroom-model-expression-language-experiment.md).
3. **Reflected atomic Operation requirement (complete):** add the smallest static metadata and
   `operation.atomic(...)` factory, make the server runner own the transaction boundary, and expose
   local/bridge/unavailable execution planning without implementing replication. Extracted as
   [142c. Reflected Atomic Operation Execution](../done/142c-reflected-atomic-operation-execution.md).
4. **Existing Ref resolution requirement (complete):** add conventional `existingRef`, safe
   rejection, portable identity, UnitOfWork materialization, and reflection without coupling it to
   the not-yet-production expression compiler. Delivered through
   [142d. Existing Operation Refs](../done/142d-existing-operation-refs.md).
5. **Portable condition bridge (complete):** promote the experimental IR and real model symbol discovery,
   then explicitly replace callback-valued top-level `contracts.pre` / `contracts.post` with named
   portable conditions, rejection defaults, dependency reflection, and tri-state advisory
   evaluation. Extracted as
   [142e. Portable Operation Condition Bridge](../done/142e-portable-operation-condition-bridge.md).
6. **Derived graph Fields and Classroom migration (complete):** append and verify the `capacity` migration,
   remove the stored counter from the model and result shape, then prove virtual
   `Course.availableSeats` in memory and through one authorized provider read. Delivered through
   [142f. Virtual Derived Fields And Classroom Capacity](../done/142f-virtual-derived-fields-and-classroom-capacity.md).
7. **Aggregate Relation invariant (complete):** extract a linked Plan 136 child that rejects prospective
   `Course.students` additions atomically in memory and one provider through both the forward
   `Student.currentCourse` and inverse `Course.students` APIs. Preserve unlink repair and concurrent
   conflict semantics. Extracted as
   [136h. Authority-Serialized Relation Count Constraints](../done/136h-authority-serialized-relation-count-constraints.md).
8. **Distribution follow-up:** only after runtime planning is real, specify storage topology,
   offline queueing, replication, convergence evidence, and authority-serialized versus merge-safe
   invariant requirements in a separate plan.

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
9. No generic transaction over external services or capabilities hidden behind an execution
   `scope` string.
10. No parallel top-level `preconditions` / `postconditions` API that ignores the existing
    `contracts.pre` / `contracts.post` surface and leaves two competing sources of truth.

## Acceptance Checklist

- [ ] One Classroom sketch distinguishes input constraints, Ref resolution requirements,
      preconditions, permanent invariants, postconditions, and derived Fields without manual
      counter maintenance.
- [x] Existing `contracts.pre` / `contracts.post` behavior and real repository adoption are covered
      by evidence; the plan records a compatible evolution or an explicit alpha deprecation path
      before publishing declarative condition syntax.
- [x] The authoring experiment permits natural arithmetic and boolean expressions or records
      concrete evidence that an explicit builder is required.
- [x] Every accepted expression lowers to stable JSON-safe IR with source-located diagnostics for
      unsupported code.
- [x] `existingRef(Entity)` has a conventional safe failure and preserves portable Ref identity
      separately from authorized resolved data.
- [x] Client condition evaluation is reflected as satisfied, rejected, or unknown and never skips
      authoritative validation after a local success.
- [ ] State preconditions compile into one guarded Command when possible; otherwise their required
      atomic Operation boundary is explicit.
- [ ] Permanent invariants apply to every relevant mutation path and distinguish
      authority-serialized requirements from future merge-safe execution.
- [x] Forward assignment and inverse has-many mutation produce one canonical prospective delta and
      enforce the same aggregate invariant, rejection, rollback, and Applied Mutation Outcome rules.
- [x] Derived Fields share the ordinary Field reflection/query surface, remain read-only to
      Commands, and have one semantic definition independent from virtual or materialized execution.
- [x] The Classroom migration backfills `capacity` from the stored available seats plus canonical
      Student membership, removes the counter, and proves both upgrade and fresh-install fixtures.
- [x] Static Operation execution requirements remain separate from runtime local/bridge/queued/
      unavailable affordances.
- [x] Required capabilities are derived from model semantics, have explicit testable guarantees,
      and are never a manually duplicated list in Operation authoring.
- [x] UI invocation remains provider- and topology-transparent while availability stays inspectable.
- [x] The first executable slice remains small and extracts aggregate enforcement, materialization,
      and distribution into linked follow-ups.

## Open Questions

1. Which preconditions can be proven to lower into one Command, and how does the compiler explain
   when Operation-level atomicity is still required?
2. What is the smallest versioned capability vocabulary that can express the selected Operation's
   derived requirements without turning provider implementation details into model metadata?
3. How are conventional rejection codes named and localized without forcing boilerplate or making
   domain failures unstable?
4. Which dependencies make a client evaluation `unknown`, and how does graph-read policy redact
   inaccessible condition evidence?
5. Can virtual relation aggregates compose with existing Queries and Views through the ordinary
   Field surface without a parallel computed-field query language?
6. How should generated clients expose execution availability while keeping the ordinary invocation
   spelling unchanged?
