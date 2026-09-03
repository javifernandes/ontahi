# 136b. Many-To-Many Participant Eligibility

Status: done

Canonical ID: `ontahi://plans/136b-many-to-many-participant-eligibility`

Parent plan: [136. Relation Constraints And Eligibility](./136-relation-constraints-and-eligibility.md)

## Summary

Apply the portable source/target participant constraints from Plan 136a to Selection-valued
many-to-many Relationship Commands. Resolve and validate the complete affected participant set
before changing relationship facts, then exercise the rule in Todo without adding model fields or
new interaction flows.

## Evidence

1. The in-memory many-to-many executor already resolves both endpoint Selections before mutating its
   relationship fact store.
2. Explicit Ref selections already fail when any named participant is missing; filtered empty
   Selections already resolve to a no-op.
3. `TodoItem.tags` is the existing real many-to-many mutation path, and `TodoItem.completed` is a
   natural source-participant fact: completed todos should not receive new tags.
4. The server owns Relation definitions after command transport, so eligibility remains
   authoritative and does not need to travel as a client authority claim.

## Scope

1. Let Core and server Entity DSL many-to-many declarations accept existing Relation constraints.
2. Evaluate every selected source and target participant before a `link` mutation.
3. Reject the whole batch with the stable declared rejection when any participant is ineligible.
4. Preserve vacuous success for empty filtered Selections and bypass link eligibility on `unlink`.
5. Add the completed-todo source constraint to `TodoItem.tags` without adding UI or data fields.
6. Prove server-owned enforcement through the existing default-deny remote Relationship Command
   route.

## Non-Goals

1. No aggregate limits, uniqueness, current-population predicates, retries, or conflict protocol.
2. No adapter-backed transactional compilation in this child.
3. No new remote rejection envelope or generic Entity Command bridge.
4. No Explorer mutation controls or duplicated eligibility logic in React.
5. No advisory client preflight or arbitrary Relation callbacks.

## Acceptance Checklist

- [x] Many-to-many Relations accept reflected portable source/target constraints.
- [x] Every selected participant must satisfy its applicable constraints before any fact changes.
- [x] A mixed eligible/ineligible batch is all-or-nothing.
- [x] Empty filtered Selections remain successful no-ops.
- [x] `unlink` remains available for currently ineligible participants.
- [x] Remote execution evaluates server-owned constraints after policy dispatch.
- [x] Todo rejects adding tags to completed items without duplicating the rule in its UI.
- [x] Core and Todo focused tests, affected typechecks, lint, and format pass.
- [x] Public Core changes have a Changeset and Relation Atlas records the durable semantics.

## Deferred to Parent

Provider-backed atomic enforcement, concurrent conflicts, structured rejection transport,
aggregate/cardinality constraints, and advisory eligibility remain in Plan 136.

## Closure

- Status: done
- Closed on: 2026-08-22
- Landed shape:
  - Core and the server Entity DSL accept constraints on many-to-many declarations;
  - in-memory link execution resolves both endpoint Selections and checks every applicable source
    and target constraint before changing facts;
  - mixed batches reject atomically, filtered empty batches remain no-ops, and unlink bypasses link
    eligibility;
  - lazy server constraint authoring supports source self-reference but materializes to AST-only
    Relation metadata;
  - Todo declares that completed items cannot receive tags and proves the rule through its existing
    HTTP Relationship Command endpoint.
- Verification: 543 Core tests, 29 Todo tests, Core and Todo typecheck/lint, package builds, Codegen
  freshness, repository format check, Changeset status, and diff check.
