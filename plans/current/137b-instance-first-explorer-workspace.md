# 137b. Instance-First Explorer Workspace

Status: current

Canonical ID: `ontahi://plans/137b-instance-first-explorer-workspace`

Parent plan: [137. Reflected Relation Affordances](./137-reflected-relation-affordances.md)

## Summary

Turn Explorer's Entity data surface into a useful automatic application UI centered on Entity
instances. A caller should be able to select an Entity, browse its visible instances, inspect one
instance and traverse its References and direct or inverse Relations without first understanding
the reflected schema.

The same Explorer must work for a narrowly scoped regular user and a broadly authorized operator.
Explorer does not decide which one the caller is: it presents only the descriptors, rows, related
data, mutations, Operations, and future affordance decisions projected by the runtime for the
current Principal.

## Product Thesis

An Ontahi application that declares Entities, Relations, policies, and Operations should receive a
usable generic UI immediately. Application authors may later build a custom UI with Ontahi hooks,
headless components, and application-specific interaction design, but they should not need to
author boilerplate CRUD screens before the model can be exercised.

Explorer therefore has two compatible deployment modes rather than two separate products:

1. an application surface where a regular Principal sees and mutates only its authorized graph;
2. an operational surface where an administrator receives a broader graph and broader
   capabilities from the same runtime contracts.

An administrator is not an Explorer-side authorization bypass. Runtime policy remains active and
grants that Principal the broader scope explicitly. Explorer must never infer elevated access from
a client prop, reveal inaccessible population facts, or fall back to an unscoped provider read.

## Current Evidence

1. Explorer already opens on Entity data when a reflected reader is present and uses a floating,
   searchable Entity picker.
2. reflected Entity Mutation Commands already provide generic create, scalar update, and delete
   controls when the server snapshot exposes an authorized mutation policy.
3. Plan 137a reflects Reference identity and direct or derived-inverse Relation topology, and reads
   related rows through an injected Query-backed capability.
4. identified rows open reflected instance windows rather than appending Relation blocks to the
   table, preserving the graph-node context while adjacent nodes are inspected.
5. Operations and Schema remain available as secondary surfaces, which is compatible with an
   instance-first workspace.

## First Vertical Slice

Make a selected Entity instance a first-class interaction state:

1. selecting a table row opens a non-blocking inspector over the instance canvas;
2. the inspector derives its title from reflected display metadata and falls back to portable
   identity;
3. scalar Fields, nulls, and References remain legible, with References linking to the target
   Entity and locator;
4. direct and derived-inverse to-many Relations appear in the inspector with authorized counts and
   navigable related instances;
5. relation loading continues through the Plan 137a Query-backed related reader;
6. inline mutation controls, generic create, filtering, sorting, and pagination keep working;
7. the first slice closes stale singleton state when Entity or query context changes;
8. mouse and keyboard users can open and close the inspector without introducing a permanent
   action column.

This slice rearranges already-authorized information. It does not add a new read path, policy
decision, or Relation mutation protocol.

## Second Vertical Slice

Turn the selected instance into a small ephemeral workspace rather than a singleton inspector:

1. selecting another identified row keeps already-open instance windows available for comparison;
2. selecting an already-open row restores and activates its existing window rather than
   duplicating it;
3. each window can collapse in place into a compact canvas node, expand, activate, or close
   independently;
4. `Escape` closes only the active expanded window;
5. the first implementation clears the complete workspace when Entity or table-query context
   changes;
6. window state stores Entity identity and presentation state, not a detached copy of authoritative
   Entity state;
7. expanded windows use intrinsic content height with a viewport cap and internal overflow rather
   than stretching sparse instances into full-height panels.

This slice remains DOM-based. New windows receive automatic initial positions, then their headers
support free pointer placement and overlap while activation raises one above its siblings. It does
not introduce resizing, persistence, or a canvas protocol.

## Third Vertical Slice

Reuse reflected Entity mutation affordances inside an instance window:

1. scalar Fields listed by the authorized update descriptor are editable in place;
2. identity, derived, Reference, and non-authorized Fields remain read-only;
3. saving uses the same identity-scoped Entity Mutation Command as table-cell editing;
4. a successful update re-reads the authoritative row and refreshes both window values and its
   reflected display label;
5. cancelling with `Escape` keeps the window open and restores the previous value.

## Fourth Vertical Slice

Make table cells and instance windows two contexts for one reflected value editor:

1. non-nullable booleans use immediate switches instead of entering a text-edit form;
2. enums, numbers, dates, JSON, nullable values, and simple or composite References receive
   controls derived from their reflected shape;
3. authorized References become editable as portable Entity Refs while identity and derived Fields
   remain immutable;
4. conventional color strings receive a paired picker and text input as a provisional presentation
   heuristic;
5. Todo proves the slice by authorizing `TodoItem.list/title/completed`,
   `TodoList.name/color`, and `Tag.name/color` through the same runtime policy boundary.

This slice does not claim that `Color` is a primitive. Reflection currently exposes only `string`,
so semantic value packages and presentation metadata remain a model-design follow-up.

## Fifth Vertical Slice

Recognize instance windows as Explorer view state rather than Entity-table state:

1. own the workspace above Entity selection and the Data/Actions/Schema surfaces;
2. key every window by portable `{ entityName, locator }` identity and resolve its own reflected
   Entity descriptor when rendering;
3. preserve expanded and collapsed nodes across Entity, filter, sort, page, and tab navigation;
4. allow windows from different Entity types to coexist for comparison;
5. re-read a collapsed instance by exact identity when it is expanded and invalidate active Entity
   and Relation queries after a window mutation;
6. keep this first workspace in React memory only, without hiding persistence in local storage;
7. retain each freely placed viewport position across Entity navigation, collapse, and expansion.

This makes the view-state boundary explicit without yet deciding how a saved workspace becomes an
Entity, per-user state, browser-local state, or synchronized state.

## Sixth Vertical Slice

Add the first authority-reflected Relation editor:

1. project configured many-to-many `link` and `unlink` policy as `add` and `remove` affordances;
2. keep structural Relation verbs descriptive rather than treating them as permission;
3. let an instance window search and link currently unassigned participants;
4. let it unlink existing participants with compact hover/focus controls;
5. normalize forward and inverse interactions into canonical Relationship Commands;
6. show server rejection messages and re-read authoritative related data after applied outcomes.

This slice does not yet model portable eligibility, optimistic Relationship Deltas, or lifecycle
semantics for composition-like direct Relations.

## Later Slices

1. Extend authority-aware Relation affordances from many-to-many `add`/`remove` to direct
   `assign`/`clear` and composition lifecycle semantics.
2. Replace raw Reference inputs in generic create/update forms with reflected, searchable Entity
   pickers when the runtime exposes a safe target Selection.
3. Present rich Operations contextually for one instance or a Selection using the same reflected
   contracts consumed by headless UI.
4. Let Reference or Relation traversal open a target instance directly in the existing cross-Entity
   workspace instead of merely navigating to a filtered table.
5. Explore persistent filters, views, and saved window boards only after their state and Selection
   semantics are explicit.
6. Expose an optional runtime-projected access-scope description if it helps operators understand
   why a surface is narrow or broad. Such a description is diagnostic evidence, never client-side
   authority.
7. Explore explicit container nodes—boards, sectors, bags, or cells—that own visual membership and
   can collapse or reveal their contained instance nodes. Keep visual containment distinct from a
   domain Relation until the application models them as the same concept deliberately.

## Non-Goals

1. No ownership, tenancy, workspace, or super-admin role model in this child plan.
2. No Explorer-side filtering by the current user and no `isAdmin`/`bypassPolicy` UI switch.
3. No new provider access or separate administrative data endpoint.
4. No direct or composition-like Relation mutation before lifecycle and eligibility semantics are
   explicit.
5. No saved canvas, window resizing, local-storage persistence, offline replication, or CRDT
   semantics.
6. No final Ontahi design system or application-specific Todo dashboard behavior.

## Execution Slices

1. Add component tests for selecting an instance, rendering display/identity, following Reference
   links, traversing direct and inverse Relations, and closing stale selection.
2. Extract an instance inspector from the existing data panel so relation-query behavior remains
   focused and testable.
3. Integrate row selection without interfering with links, inputs, inline mutation controls, or
   destructive confirmation.
4. Verify the Todo Explorer against its existing remote readers and mutation executor.
5. Record the reusable product shape in the Explorer Atlas item and add the required public package
   Changeset.
6. Add multi-window comparison and ephemeral collapse/expansion behavior without introducing saved
   layout state.
7. Reuse authorized scalar mutation controls inside instance windows and refresh their remote row
   after successful updates.
8. Replace the scalar-only editor with one shared reflected value editor across table and window
   contexts, then prove boolean and color behavior in Todo.
9. Lift the instance workspace above Entity navigation and preserve mixed-Entity windows without
   adding persistence.
10. Project authorized many-to-many Relation mutations and consume them through a generic
    participant picker and unlink controls.
11. Model ephemeral node position explicitly and support pointer dragging, overlap, activation
    order, and position-preserving collapse/expansion for both full and compact representations.

## Acceptance Checklist

- [x] Entity instances remain the primary Explorer canvas.
- [x] A row can be selected without adding a permanent open/details action column.
- [x] The selected instance inspector renders reflected display, identity, scalar, null, and
      Reference values coherently.
- [x] Reference links render authorized target display metadata while preserving portable locator
      identity and a safe unresolved fallback.
- [x] Direct and derived-inverse to-many Relations are visible and traversable from the selected
      instance.
- [x] Related data is loaded only through the injected, policy-enforced Query capability.
- [x] Entity and data-query navigation preserve explicitly opened instance windows as workspace
      state rather than coupling their lifetime to the current table.
- [x] Multiple identified rows can remain open as independently closable instance windows.
- [x] Windows collapse in place into draggable compact nodes and expand without duplicating or
      relocating the instance.
- [x] Expanded and collapsed nodes from different Entity types survive Entity navigation and can
      be expanded together for comparison.
- [x] Expanded windows can be freely dragged and overlapped, with the active window raised and each
      position retained across navigation and collapse/expansion.
- [x] `Escape` closes only the active expanded window.
- [x] Authorized Fields are editable through shared type-aware controls in both table cells and
      instance windows while identity, derived, and non-authorized Fields remain read-only.
- [x] Boolean, enum, number, date, JSON, nullable, color-string, and Reference mutation values have
      explicit tested controls.
- [x] Successful window edits re-read the authoritative row and refresh its display label.
- [x] Authorized many-to-many Relations can add and remove participants without interpreting
      structural verbs as permission.
- [x] Existing generic create, inline update, delete, filtering, sorting, and pagination behavior
      remains available.
- [x] Explorer contains no regular-user/admin branch and no client-side policy bypass.
- [x] Focused component tests, affected package tests, typecheck, lint, and format checks pass.
- [x] Consumer-visible package changes have a Changeset and durable Explorer knowledge is updated.

## Progress

The first six vertical slices are implemented on 2026-08-30. Todo Explorer proves row
selection, portable Reference navigation, Query-backed traversal from `TodoList` to the derived
inverse `TodoItem.list`, parallel instance comparison, ephemeral collapse/expansion behavior, and
authorized type-aware editing in both tables and windows. It also proves authority-reflected
many-to-many Tag linking and unlinking through canonical Relationship Commands. Its Explorer-level
workspace now keeps mixed-Entity windows across navigation and rehydrates restored rows. Persistent
view state, direct cross-Entity opening from graph links, direct/composition Relation editing, and
portable eligibility remain later work.

## Decisions

1. Access scope is runtime input to Explorer, not an Explorer mode.
2. Regular-user and administrator experiences share one component model and differ only in the
   authorized graph and capabilities they receive.
3. Static Relation verbs describe topology; they do not authorize an action.
4. The first slice improves graph navigation using existing reads before adding relation mutation.
5. Schema remains a secondary learning and documentation surface rather than the default canvas.
6. An instance node is presentation state keyed by portable Entity identity; collapsing or
   closing it never mutates the Entity.
7. The first window workspace is ephemeral: it assigns automatic initial positions, then stores
   free-form pointer placement and activation order explicitly in React state. Persistence still
   requires an owned view-state model rather than ad hoc local storage.
8. Window editing consumes the same reflected mutation descriptor and server-authorized Command
   path as table editing; window chrome does not grant mutation authority.
9. A shared editor maps reflected storage shapes to controls, but semantic value behavior belongs
   in future reflected value packages rather than permanent Field-name heuristics.
10. Window lifetime belongs to an Explorer workspace above Entity navigation. The current workspace
    is intentionally session-memory state; persistence requires an explicit state model and owner.
11. Many-to-many mutation controls require runtime-projected `add`/`remove` affordances; static
    structural verbs remain topology only, and server execution remains authoritative.

## Open Questions

1. Should one active instance or the complete window workspace be encoded in the URL independently
   from an exact-row filter?
2. What minimum runtime affordance descriptor can distinguish `allowed`, `denied`, and
   `requires-server-decision` without becoming an authorization oracle?
3. Should an operator-visible scope label be part of runtime reflection, invocation context
   diagnostics, or a host-provided shell?
4. When a Reference target is selectable, which reflected Selection constrains the picker without
   leaking inaccessible candidates?
5. Should restoring be the only automatic rehydration point, or should visible cross-Entity windows
   subscribe to identity-scoped refresh while they remain open?
6. What contract lets reusable semantic value packages such as `Color` contribute validation,
   serialization, reflection, and default controls across Explorer and custom application UIs?
