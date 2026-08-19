# 128d. Relationship Command Policy And Dispatcher

Status: done

Parent plan: [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)

Source plan: [128c. Relationship Command Wire Protocol](../done/128c-relationship-command-wire-protocol.md)

Canonical ID: `ontahi://plans/128d-relationship-command-policy-dispatcher`

## Summary

Add a transport-neutral, default-deny boundary for Relationship Commands. A request must parse,
match an explicitly registered canonical Relation policy, resolve against server-owned topology,
and allow the requested structural action before an injected executor can reach storage.

## Scope

1. Declare policies by canonical source Entity, Reference Field, and allowed `link/unlink` actions.
2. Validate policies when installing the dispatcher.
3. Deny commands for unregistered Relations and actions without invoking execution.
4. Resolve accepted requests against only the policy-owned server topology.
5. Return a JSON-safe Relationship Delta result or a structured protocol error.
6. Preserve an authority context seam for Plan 78 without evaluating authorization here.

## Non-Goals

1. No Principal/role evaluator, authority-derived row scope, CASL/OpenFGA/Cedar/RLS integration, or
   domain invariant callback.
2. No HTTP, Express, Next.js, Fetch, React, codegen, cache, telemetry, or Explorer integration.
3. No generic Entity Command policy or transport.
4. No Operation wrapping, effects, domain events, retries, or durability.

## Acceptance Checklist

- [x] Missing policy and denied actions return `access_denied` without calling the executor.
- [x] Invalid policies and duplicate canonical Relation policies fail during dispatcher creation.
- [x] Accepted commands are resolved from server-owned definitions before execution.
- [x] Executor failures become `execution_unavailable` and may be reported without leaking causes.
- [x] Successful execution returns a JSON-safe `graph-command-result` Relationship Delta.
- [x] Authority context is accepted by the boundary but cannot be authored into the request.
- [x] Core tests, typecheck, lint, formatting, and Changeset status pass.

## Decisions

1. Policies name canonical source Entity plus Reference Field and enumerate `link/unlink`; inverse
   authoring does not create a second policy identity.
2. Missing Relation policy and missing action are indistinguishable `access_denied` responses.
3. The dispatcher resolves with only the policy-owned source and target Entities before execution.
4. Authority context crosses the trusted boundary to the executor, but this slice deliberately adds
   no evaluator callback or row-scope semantics owned by plan 78.
5. Applied deltas are cloned as JSON before returning so executor-owned objects do not cross the
   protocol boundary by reference.

## Closure

- Status: done
- Closed on: 2026-08-19
- Effective effort: ~1h focused implementation and verification
- Outcome: Relationship Commands now have a default-deny, transport-neutral execution boundary
  without enabling any HTTP or remote runtime capability.
- Verification:
  - full Core suite: 68 files and 503 tests passed;
  - Core typecheck and lint passed;
  - formatting, `git diff --check`, and Changeset status passed.
- Next slice: bind the dispatcher to the in-memory application runtime and then expose the same
  capability through the remote runtime without adding HTTP yet.
