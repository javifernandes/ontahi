# 142b. Classroom Model Expression Language Experiment

Status: done

Canonical ID: `ontahi://plans/142b-classroom-model-expression-language-experiment`

Parent: [142. Declarative Model Semantics And Execution Planning](./142-declarative-model-semantics-and-execution-planning.md)

## Summary

Test whether Ontahí codegen can turn a small, natural TypeScript expression subset into stable,
JSON-safe model expression IR without executing author callbacks. Compare the same three Classroom
expressions with a minimal explicit builder, then record which authoring strategy should advance.
Keep every implementation surface private and test-only so the experiment cannot accidentally
become a public DSL or runtime contract.

## Risk To Prove

JavaScript cannot overload arithmetic and comparison operators, so a runtime proxy cannot observe
`capacity - students.count()` or `students.count() <= capacity`. Static TypeScript analysis may
preserve that domain spelling, but it could also produce fragile source coupling, weak diagnostics,
or a build-only path that excludes runtime-authored applications. Conversely, an explicit builder
is runtime-safe but may impose enough ceremony to obscure the model. The next public abstraction
should follow evidence rather than preference.

## Scope

1. Define one private, versioned, JSON-safe IR for the exact nodes needed by the experiment:
   Field, input Ref, Relation count, subtraction, less-than-or-equal, Ref identity, and boolean not.
2. Compile expression-bodied arrow functions from TypeScript source without evaluating them.
3. Resolve callback bindings from a compiler-owned semantic symbol table representing known Entity
   Fields, Relations, and Operation input Refs; this table is fixture/compiler context, not authored
   duplicate metadata.
4. Prove the three Classroom expressions:
   - `capacity - students.count()`;
   - `students.count() <= capacity`;
   - `!previousCourse.is(nextCourse)`.
5. Reject arbitrary calls, captures, unsupported operators, block bodies, and invalid semantic
   member use with stable codes and exact source locations.
6. Build the same IR through a minimal explicit builder and compare the authoring and execution
   tradeoffs durably.

## Non-Goals

1. No public export, Core type, Entity/Field factory, reflection payload, or generated artifact.
2. No TypeScript transformer, source rewriting, Babel/SWC plugin, or callback serialization.
3. No IR interpreter, Query/provider compiler, advisory evaluator, or authorization behavior.
4. No derived Field, invariant, Operation contract, or Classroom runtime migration.
5. No complete JavaScript expression grammar, type checker integration, imported helper analysis,
   closure capture support, or generic method-call allowlist.

## Proposed Experimental Boundary

The static analyzer receives ordinary source plus compiler-resolved symbol meaning:

```ts
const availableSeats = ({ capacity, students }) => capacity - students.count();
```

and emits canonical data:

```ts
{
  version: 1,
  expression: {
    kind: 'arithmetic',
    operator: 'subtract',
    left: { kind: 'field', field: 'capacity' },
    right: {
      kind: 'relation-aggregate',
      relation: 'students',
      aggregate: 'count',
    },
  },
}
```

The explicit fallback must create that exact object graph through named builder operations. Neither
surface is exported. Stable equality and JSON round-tripping are the contract of the experiment;
formatting or generated-source snapshots are not.

## Acceptance Checklist

- [x] Each Classroom expression compiles from natural TypeScript into the complete expected IR.
- [x] The explicit builder produces structurally identical IR for all three expressions.
- [x] IR is JSON-safe and carries an explicit version.
- [x] Unsupported syntax reports stable diagnostic codes plus exact source path, line, and column.
- [x] Tests prove arbitrary calls and closure captures are rejected rather than serialized.
- [x] No new module is exported or included as a supported package entrypoint.
- [x] Plan 142 and the narrow durable Atlas item record the strategy decision and remaining risk.
- [x] Focused and complete codegen tests, typecheck, lint, build, format, and an empty Changeset pass.

## Split Point

Stop after one evidence-backed strategy decision. Do not wire the prototype into Entity authoring or
reflection. A later slice may promote a deliberately smaller IR into Core or extend codegen only
after deciding how runtime-only authoring obtains equivalent semantics and diagnostics.

## Experiment Decision

Advance one canonical model expression IR with two semantically equivalent frontends:

1. natural expression-bodied TypeScript callbacks are the preferred build-time form;
2. an explicit builder is the runtime-only fallback and produces the exact same IR;
3. neither frontend executes or serializes an author callback;
4. unsupported source fails closed with a stable diagnostic and exact location.

The natural form preserved all three Classroom expressions with substantially less ceremony. The
builder proved that runtime-only authoring does not need source analysis, but it repeats Field,
Relation, and input names as strings and makes ordinary arithmetic/boolean structure procedural.
It should remain parity infrastructure rather than the default vocabulary.

The unresolved implementation risk is semantic symbol resolution. The private prototype receives
a compiler-owned Field/Relation/input-Ref table directly; author code does not declare that table.
Before publication, codegen must derive it from the real model and Core must own the promoted IR so
reflection, interpreters, and runtimes do not depend on TypeScript AST nodes or `@ontahi/codegen`.

## Delivery

A colocated, test-only codegen prototype now parses expression-bodied arrow functions through the
existing TypeScript source utilities. Its closed visitor lowers only the experimental Field,
Operation input Ref, Relation count, subtraction, less-than-or-equal, Ref identity, and boolean-not
nodes. Unknown captures, arbitrary calls, unsupported operators, block bodies, invalid receivers,
and malformed parameter shapes fail closed through structured diagnostics.

The explicit builder constructs the same versioned object graph, and all three natural Classroom
expressions compare by complete structural equality against it and survive JSON round-tripping.
Both implementation files use the repository's `.test.js` / `.test-support.js` convention. They are
not exported, and npm pack inspection proves no model-expression or test-support file enters the
published `@ontahi/codegen` artifact. The new Model Expression Atlas item records the single-IR,
two-frontend decision and the semantic symbol-resolution work that remains.

## Verification

1. The focused experiment suite passed all eight cases.
2. Codegen passed all 81 tests across nine files.
3. Codegen typecheck, lint, and build passed.
4. Repository formatting and `git diff --check` passed.
5. The `@ontahi/codegen` npm pack dry-run contained no model-expression or test-support file.
6. Changesets status accepted the empty package decision and scheduled no package bump.
