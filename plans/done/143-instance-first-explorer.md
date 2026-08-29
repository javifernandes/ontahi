# 143. Instance-First Explorer

Status: done

Canonical ID: `ontahi://plans/143-instance-first-explorer`

Related plans:

1. [137. Reflected Relation Affordances](../current/137-reflected-relation-affordances.md)
2. [138. Entity Mutation Command Authoring](../next/138-entity-mutation-command-authoring.md)
3. [144. Executable Ontologies](../backlog/144-executable-ontologies.md)

## Summary

Reorient Explorer from a schema reflector with an optional Data tab into an instance-first browser.
An operator selects an Entity, browses its instances and follows reflected references in the main
canvas. Schema and Operation reflection remain available as contextual secondary affordances.

## Product Direction

Explorer has two complementary modes without making them peer sections:

1. the primary instance surface is for operating and traversing a live application;
2. the secondary schema surface is for learning the application's concepts, relationships, and
   capabilities.

The schema remains the source of the UI, but it is no longer the UI's default subject.

## First Slice

1. Open a selected Entity on its instance data whenever a reflected reader is available.
2. Replace the permanent Entity sidebar with a compact, searchable Entity switcher and keep the
   instance table as the stable canvas.
3. Present Operations as contextual actions rather than a primary tab.
4. Present Schema as a visually secondary floating affordance.
5. Preserve explicit `?tab=structure`, `?tab=operations`, and `?tab=data` URLs during the
   transition.
6. Fall back to Schema when the host has no reflected instance reader or the selected descriptor is
   a Relation owner that cannot expose ordinary rows.
7. Make the Todo Explorer root render this surface directly, without Overview, Entities,
   Operations, and Tasks navigation or explanatory hero copy.
8. Reflect statically authorized Entity mutation policies, edit allowed scalar Fields inline, and
   delete exact identity-addressable rows through remote Entity Mutation Commands.

## Deferred Slices

1. Instance selection with a durable detail/traversal history.
2. Create forms and richer multi-Field editing once the instance interaction proves the desired
   composition.
3. Relation-specific connect, disconnect, assign, and clear actions from Plan 137.
4. Rich Operation forms attached to a selected instance or collection.
5. A full-screen conceptual graph with Entity documentation and bidirectional navigation between
   concepts and instances.

## Non-Goals

1. Do not implement speculative mutation controls before runtime capabilities exist.
2. Do not build the final graph visualization in the first slice.
3. Do not remove existing routes or reflected structure components.
4. Do not begin the executable-ontology authoring experiment in this intervention.

## Acceptance Checklist

- [x] A data-capable Entity opens directly on its instances.
- [x] Selecting another data-capable Entity keeps the user in the instance workflow.
- [x] Entity selection uses one searchable dropdown instead of a permanent sidebar.
- [x] Todo opens directly on the instance surface without global Explorer section navigation.
- [x] The instance canvas has no redundant title or explanatory subtitle.
- [x] Only policy-authorized scalar Fields expose inline editing.
- [x] Only policy-authorized Entities expose exact-row delete with inline confirmation.
- [x] Update and delete execute through the canonical remote Entity Mutation Command boundary and
      refresh the authoritative rows afterward.
- [x] Schema is available as a secondary floating action.
- [x] Rich Operations are available contextually without occupying the default canvas.
- [x] Explicit legacy tab URLs remain valid.
- [x] Entities without readable data still expose their schema.
- [x] Package tests, typecheck, lint, and build pass.

## Verification

Completed on 2026-08-29:

1. React: 74 tests passed; typecheck, lint, and build passed.
2. Explorer React: 123 tests passed; typecheck, lint, and build passed.
3. Runtime Express: 28 integration tests passed; typecheck, lint, and build passed.
4. Todo Express: 31 tests passed; codegen check, typecheck, lint, and client build passed.
5. Browser verification confirmed the instance-first Tag surface receives the reflected Actions
   column while Entities without a mutation policy remain read-only.
6. `git diff --check` passed.
