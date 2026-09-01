# `@ontahi/explorer-react`

Headless contracts, reflected descriptors, and React surfaces for exploring an Ontahi application.

The canonical [Reflection and Explorer](../../docs/developers/04-reflection-and-clients/01-reflection-and-explorer.md)
chapter explains semantic Ref links, read-only Relation topology, Query-backed related instances,
and the authority boundary. This README is the package-level reference.

The browser package exports the Explorer shell and focused components:

```tsx
import { ExplorerOverview, ExplorerShell } from '@ontahi/explorer-react';

export const Explorer = ({ snapshot }) => (
  <ExplorerShell basePath='/explorer'>
    <ExplorerOverview snapshot={snapshot} />
  </ExplorerShell>
);
```

Server adapters consume the framework-neutral descriptor builders through the `server` subpath:

```ts
import { buildExplorerSnapshot } from '@ontahi/explorer-react/server';
```

React, ReactDOM, TanStack Query, and Lucide remain host peers. Monaco is owned by this package
because the JSON operation editor is part of the provided Explorer UI.

`ExplorerEntityBrowser` is instance-first when the host registers a reflected Entity data reader:
the selected Entity opens as one compact collection-view node containing its rows and query
controls. Its header owns the searchable Entity switcher, and the complete node can move, minimize,
restore, and move to the front when activated without consuming the canvas as a permanent page
section. Operations appear as contextual Actions, and Schema remains available as a secondary
floating affordance. The surface intentionally omits a title and explanatory hero copy. Hosts
without a reflected reader continue to open on the reflected Entity structure. Explicit
`structure`, `operations`, and `data` tab routes remain supported for deep links.

The collection header now owns its Entity-scoped operation and Task affordance instead of sending
the user to a separate Actions page. An instance window and each collection row derive a narrower
action menu from Operations that explicitly declare the current identity as their receiver through
`graphOps.receiver`. The receiver may be an Entity Ref or a one-cardinality Entity Selection; it
stays visible as context but disappears from the mini form, which asks only for the remaining
inputs. A compatible input that is merely contextual does not become an instance action. This
keeps operations such as `TodoItem.createItem` on the `TodoList -> TodoItem` relation while
projecting `TodoItem.deleteList` onto each TodoList. Execution still depends on the registered
reflected invoker and the runtime remains authoritative; receiver projection does not add
permission.

Relation blocks reuse that same projection at two narrower contexts. A Relation header exposes
source-bound Operations only when their direct reflected result Entity is the Relation target, so
an operation such as `TodoItem.createItem` can appear beside `TodoList -> TodoItem` without admitting
an unrelated source-bound operation such as list deletion. Each identified related row also owns
the contextual Actions of that target instance. Successful actions refresh the parent window and
authoritative Relation query. This placement does not infer composition, lifecycle, or structural
Relation mutation semantics.

Selecting identified rows opens non-blocking instance windows. Multiple windows can remain open
for comparison; each can collapse in place into a compact canvas node, expand, activate, or close
without changing Entity data. Windows use reflected display and identity metadata, preserve portable
Reference links, and read direct or derived-inverse to-many Relations through the registered
related-data Query capability. Relation reads are scoped to open instances instead of issuing one
count query for every Relation on every visible row. The in-memory workspace is owned above Entity
navigation: expanded and collapsed nodes survive Entity, filter, pagination, and Schema/Actions
navigation, and windows from different Entity types can coexist for comparison. Restoring a
collapsed node re-reads its identity-scoped row when expanded. The workspace is still ephemeral across an
Explorer unmount or page reload; no browser storage is used.

Expanded windows size themselves to their content instead of stretching to the bottom of the
viewport. Their field grid and relation spacing stay compact; a window receives an internal scroll
area only when its content reaches the available viewport height.

The complete non-interactive header and the compact node are the same pointer drag surface in two
presentation states. Nodes may be freely placed and overlapped inside the viewport, and activating
one raises it above its siblings. Position survives Entity and query navigation as well as
collapse/expansion. It is not persisted across an Explorer unmount or page reload.

The current collection node represents the active Entity plus its ephemeral filter, sort, and page
state; instance nodes represent portable Entity identities. Explorer deliberately exposes only one
collection node for now. Multiple collection views, resizing, closing, persistence, and saved
Selections require an explicit view-state model rather than being inferred from this first layout.

Reference cells and instance-window values resolve their authorized target through the reflected
Entity data reader and render its declared primary and secondary display fields. The portable
locator remains the link identity and tooltip, and is shown as a fallback when display metadata or
an authorized target row is unavailable. Repeated references share the graph query cache.

Many-to-many Relations become editable only when the server snapshot projects authorized `add`
or `remove` mutations and the graph client supports Relationship Commands. Instance windows then
offer a searchable picker containing currently unlinked participants and hover/focus unlink
controls for existing participants. Explorer sends canonical source/target commands and re-reads
the authoritative Relation after an applied outcome; static structural verbs never grant the
affordance.

When reflected mutation policy authorizes updates and the graph client can execute Entity Mutation
Commands, those same fields are editable both in the table and inside an instance window. The
shared editor renders direct switches for non-nullable booleans, selects for enums, native number
and date controls, formatted JSON and composite-Reference inputs, simple identity inputs for
References, and an explicit null control for nullable Fields. Saving re-reads authoritative data so
display labels and window values do not retain a stale local draft. Identity, derived, and
non-authorized fields remain read-only.

Until reflection carries semantic value or presentation metadata, a string Field named like a
color (or containing a six-digit hex color) receives a provisional color picker paired with its
text value. This is a UI heuristic, not a `Color` domain type or validation guarantee.

When the server snapshot reflects an authorized Entity mutation policy and the React graph client
can execute Commands, allowed Fields become editable inline and deletable rows receive an
explicit destructive action. Explorer sends canonical identity-scoped Entity Mutation Commands and
re-reads the table after success; descriptors only control presentation, while the server policy
remains authoritative.
