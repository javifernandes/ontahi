# 128c. Relationship Command Wire Protocol

Status: done

Parent plan: [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)

Source plan: [131a. Relationship Command And Delta Core Experiment](../done/131a-relationship-command-delta-core-experiment.md)

Canonical ID: `ontahi://plans/128c-relationship-command-wire-protocol`

## Summary

Carry the canonical Relationship Command IR across a JSON boundary and rebuild it against
server-owned Entity and Relation definitions without degrading it to an Entity patch or accepting
client-owned schema metadata.

## Scope

1. Define a versioned `graph-command` request envelope for the Relationship Command variant.
2. Encode only JSON-safe canonical Relation identity, action, source Ref, and optional target Ref.
3. Parse untrusted JSON into a bounded structural request.
4. Resolve and validate the request against server-owned Entities, Reference Fields, endpoints,
   locator fields, action requirements, and nullability.
5. Prove forward and inverse authoring produce the same transported `link` command.

## Non-Goals

1. No dispatcher execution, write policy, HTTP adapter, remote runtime, React, codegen, cache, or
   Explorer integration.
2. No generic Entity insert/update/delete wire protocol.
3. No Association Entity wire specialization; it continues to use ordinary Entity lifecycle.
4. No Operation wrapping, effects, authorization evaluation, or durable execution.

## Proposed Form

```json
{
  "version": 1,
  "kind": "graph-command",
  "command": {
    "kind": "relationship-command",
    "action": "link",
    "relation": {
      "sourceEntityName": "Student",
      "fieldName": "course",
      "targetEntityName": "Course"
    },
    "source": {
      "kind": "entity-ref",
      "entityName": "Student",
      "locator": { "id": "student-1" }
    },
    "target": {
      "kind": "entity-ref",
      "entityName": "Course",
      "locator": { "id": "course-1" }
    }
  }
}
```

## Acceptance Checklist

- [x] The request round-trips through JSON and resolves to the same canonical semantic command.
- [x] Resolution uses server-owned definitions and never trusts executable or provider metadata.
- [x] Unsupported versions, malformed envelopes, unknown Entities, invalid Reference Fields,
      endpoint mismatches, invalid locators, missing link targets, and required-Relation clears fail
      with structured protocol errors.
- [x] Unknown envelope keys are dropped rather than entering the semantic command.
- [x] Core tests, typecheck, lint, formatting, and Changeset status pass.

## Decisions

1. The v1 envelope is `graph-command`; `relationship-command` is its first semantic variant rather
   than a separate transport family.
2. The wire Relation identity is the canonical source Entity, Reference Field, and target Entity
   triple. The server never accepts client-authored Relation definitions or mappings.
3. Entity Refs must use one of the server Entity's declared locators, not merely arbitrary fields.
4. All `unlink` commands against a required Relation are rejected during resolution.
5. Parsing sanitizes the request before semantic resolution, dropping unknown keys and untrusted
   context such as authority or provider instructions.

## Closure

- Status: done
- Closed on: 2026-08-19
- Effective effort: ~1h focused implementation and verification
- Outcome: Relationship Command intent round-trips through JSON and resolves against authoritative
  server topology without enabling remote execution.
- Verification:
  - focused protocol and semantic tests: 17 passed;
  - full Core suite: 67 files and 499 tests passed;
  - Core typecheck and lint passed;
  - formatting and Changeset status passed.
- Next slice: add default-deny Relationship Command policy and a transport-neutral dispatcher before
  connecting any HTTP or remote runtime capability.
