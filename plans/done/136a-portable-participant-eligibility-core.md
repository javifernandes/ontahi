# 136a. Portable Participant Eligibility Core

Status: done

Canonical ID: `ontahi://plans/136a-portable-participant-eligibility-core`

Parent plan: [136. Relation Constraints And Eligibility](../current/136-relation-constraints-and-eligibility.md)

## Summary

Prove the smallest authoritative Relation-eligibility path: a Relation may declare a portable
Selection predicate over its target participant, with a stable versioned rejection descriptor.
Core reflects that static metadata and the in-memory Relationship Command runtime evaluates it
before applying a link, independently of policy and authoring direction.

## Evidence

1. Selection already provides a serializable predicate AST and in-memory Entity-aware evaluator.
2. Forward `assign` and inverse `add` already normalize to the same canonical Relationship Command.
3. The in-memory executor resolves both participant rows before edge mutation, providing an
   authoritative boundary for this local proof.
4. Relation reflection already separates static structural metadata from authority-dependent
   runtime affordances.

## Scope

1. Add versioned, portable source/target participant Selection constraints to Relation definitions.
2. Require a stable code, safe message, and JSON-safe scalar parameters for rejection.
3. Expose constraints through static Relation reflection.
4. Enforce constraints on `link` before in-memory mutation.
5. Prove that forward and inverse authoring enforce the same declared constraint.

## Non-Goals

1. No arbitrary Relation callbacks or executable predicates in reflected metadata.
2. No authorization, Principal facts, secrets, time, external services, or domain coordination.
3. No cardinality aggregates, uniqueness, many-to-many batch semantics, adapter transactions, or
   concurrent retry policy in this child slice.
4. No remote Relationship Command protocol changes or generic remote Entity Command bridge.
5. No Explorer mutation controls, eligibility preflight, or reactions/post-effects.

## Acceptance Checklist

- [x] Constraint and rejection contracts are portable and JSON-safe at declaration time.
- [x] Static reflection preserves the constraint AST and rejection identity.
- [x] In-memory link execution rejects ineligible participants before mutation.
- [x] Forward and inverse authoring share enforcement through canonical Relation identity.
- [x] Existing policy remains an independent default-deny boundary.
- [x] Focused tests, Core tests, typecheck, lint, and format checks pass.
- [x] Public Core changes have a Changeset and the Relation Atlas item records the durable shape.

## Deferred to Parent

Many-to-many affected-set semantics, aggregate constraints, adapter-backed atomic enforcement,
conflict detection/retry, advisory client evaluation, and authority-sensitive eligibility remain in
Plan 136.

## Closure

- Status: done
- Closed on: 2026-08-21
- Landed shape:
  - Core Relation definitions and the server Entity DSL accept JSON-safe source/target participant
    Selection constraints with versioned stable rejections;
  - typed `relationConstraint.source(...)` and `.target(...)` factories reduce field-aware builders
    to the portable contract at schema construction time;
  - static Relation reflection carries the portable constraint unchanged;
  - authoritative in-memory `link` execution evaluates declared forward or inverse constraints
    after participant resolution and before mutation;
  - rejection is exposed as `relation_constraint_rejected` with the declared descriptor.
- Verification: 539 Core tests, Core typecheck, Core lint, focused format check, and diff check.
