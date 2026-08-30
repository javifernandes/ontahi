# 128f. Remote Identity-Scoped Entity Mutation Commands

Status: done

Parent plan: [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)

Source plan: [138. Entity Mutation Command Authoring And Lifecycle Ergonomics](./138-entity-mutation-command-authoring.md)

Canonical ID: `ontahi://plans/128f-remote-identity-scoped-entity-mutation-commands`

## Summary

Transport the existing portable `EntityMutationCommand` through the authoritative graph boundary
and execute exact create, identity-scoped update, and identity-scoped delete mutations through
PostgreSQL. Preserve the same `EntityMutationDelta` for direct and remote execution and require an
explicit default-deny policy over Entity, action, writable Fields, and row scope.

This is the smallest generic remote write beneath Domain Operations and Relationship Commands. It
does not add a new authoring facade: `mutateEntity(Entity)` remains the provisional canonical
constructor while Plan 138 owns Entity- and Ref-bound ergonomics.

## Scope

1. Extend the versioned graph Command protocol with the existing JSON-safe
   `EntityMutationCommand` variant.
2. Rebuild every request against server-owned Entity definitions, declared locators, stored Field
   definitions, and Graph Schema validation before execution.
3. Add a default-deny Entity mutation policy with explicit create/update/delete affordances,
   mutation Field allowlists for payload-bearing actions, and result Field allowlists for every
   action.
4. Require `scope: 'all'` in this first bounded slice. This spelling makes deliberately unscoped
   rows visible in review and leaves omission as denial; authority-derived row scopes require an
   atomic Selection intersection and remain a follow-up rather than a pre-read authorization hack.
5. Execute create, exact-Ref update, and exact-Ref delete through PostgreSQL using existing Command
   lowering and return exact created/updated/deleted facts.
6. Route the same command through the remote runtime, Fetch executor, React execution surface, and
   Express application boundary.
7. Return a portable structured rejection when an identity-scoped update/delete does not affect
   exactly one row.
8. Prove the boundary end to end with the Todo `Tag` Entity without adding Explorer UI.

## Non-Goals

1. No Selection-targeted or bulk update/delete, upsert, arbitrary patch AST, provider SQL, or
   executable callbacks on the wire.
2. No authority-derived row scope until it can be intersected atomically with the mutation target;
   do not authorize by querying first and mutating later.
3. No `Tag.create()`, `tagRef.update()`, or `tagRef.delete()` facade; Plan 138 owns authoring.
4. No remote Domain Operation replacement, Relationship lifecycle collapse, or generic remote
   `GraphCommandSpec` transport.
5. No Explorer mutation UI, optimistic cache policy, or reflected remote affordance surface.
6. No Supabase implementation. A runtime without this focused capability reports it explicitly.

## Decisions

1. `EntityMutationCommand`, not arbitrary `GraphCommandSpec`, is the first generic remote Entity
   write because its target, payload, cardinality, and delta are bounded and provider-neutral.
2. Update and delete accept only one declared Entity Ref locator and require exactly one affected
   row. Zero or multiple rows are structured failures, never successful empty deltas.
3. Create/update payloads are revalidated and normalized through server-owned stored Field schemas.
   Derived Fields and policy-denied Fields cannot reach storage.
4. Policies use explicit per-action mutation and result Field allowlists. The dispatcher projects
   returned facts before transport, so adding a stored Field cannot expose it through either input
   or outcome. Delete has only a result allowlist because it has no payload.
5. `scope: 'all'` is a deliberate initial capability, not an implicit default. Plan 78 and a later
   128 slice own authority-derived mutation scopes and their reflected eligibility.
6. Direct and remote success values are the same exact `EntityMutationDelta`; transport response
   validation rejects malformed or non-JSON-safe facts.

## Acceptance Checklist

- [x] Entity mutation requests round-trip as versioned JSON and reject malformed variants.
- [x] Server resolution rejects unknown Entities, invalid locators, invalid Field values, derived
      Fields, and incomplete create payloads before execution.
- [x] Missing policy, denied action, denied payload Field, or omitted/invalid scope cannot reach the
      executor; denied result Fields cannot cross the transport boundary.
- [x] In-memory and PostgreSQL runtimes expose the focused Entity mutation capability with identical
      exact delta semantics.
- [x] PostgreSQL create/update/delete tests cover reference lowering/lifting and exact cardinality.
- [x] Remote runtime and Fetch/React execution preserve results and structured failures.
- [x] Express derives the dispatcher from the application storage capability without trusting
      authority from the request body.
- [x] Todo proves one allowed Tag mutation and one policy denial end to end without UI changes.
- [x] Focused tests, package typechecks, lint, formatting, and Changeset status pass.
- [x] Plan 128, Plan 138, Atlas, and a public-surface Changeset describe the resulting boundary.

## Closure

- Status: done
- Closed on: 2026-08-29
- Outcome: the same portable `EntityMutationCommand` now executes directly or through Fetch and
  Express with server-owned schema rebuilding, exact PostgreSQL cardinality, projected deltas, and
  default-deny Entity/action/input/result policy.
- Verification:
  - Core: 97 files and 685 tests passed; coverage passed;
  - PostgreSQL: 11 files and 83 tests passed with Testcontainers; coverage passed;
  - React: 11 files and 73 tests passed;
  - runtime-express: 4 files and 27 tests passed;
  - Todo: 5 files and 31 tests passed, including allowed and denied remote Tag mutations;
  - all package/example typechecks and lint passed;
  - formatting, package builds, clean-room artifact verification, and Changeset status passed.
- Follow-up: add authority-derived row scopes only as an atomic target intersection, then reflect
  eligible remote mutation affordances for the Explorer; Plan 138 separately owns final Entity/Ref
  authoring ergonomics.
