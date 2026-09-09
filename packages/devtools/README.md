# `@ontahi/devtools`

Experimental, development-only diagnostics for Ontahí web clients.

The package currently provides a bounded in-memory diagnostic store, a compositional
`RuntimeTransport` instrument, and an opt-in React panel. The panel leads with application intent,
keeps transport families as supporting metadata, and lets each request and response move between a
semantic projection, body JSON, and its complete Runtime Protocol envelope. It does not patch
`fetch`, `WebSocket`, or browser globals, and it does not persist or upload diagnostic data.

Activity Graph Read summaries follow Settings → Authoring language in the list, detail heading,
and Visual request (Selection and ordering included). Filtering matches the displayed dialect.
This is a pure projection of captured canonical data, not a CodeMirror editor or a conversion of
previously rendered text. Changing the preference reprojects existing entries without traffic or
payload mutation; Body JSON, Envelope, and copied JSON remain the captured protocol data.
Summaries are compact diagnostic labels, not guaranteed executable Console documents: they may
include Views, multiple ordering keys, redacted values, or Reference selections outside today's
Console grammar. Nullable `get` is shown as `first`, not guessed to be `exists`. Command and
Operation labels remain unchanged until those authoring dialects are defined.

```tsx
import { entity, field } from '@ontahi/core/data-graph';
import { createRuntimeTransportRouter } from '@ontahi/core/runtime/protocol';
import { createOntahiDiagnostics, instrumentRuntimeTransport } from '@ontahi/devtools';
import { OntahiDevtools } from '@ontahi/devtools/react';
import { createFetchRuntimeTransport, createWebSocketRuntimeTransport } from '@ontahi/react/graph';

const TodoItem = entity('TodoItem', {
  id: field.id(),
  completed: field.boolean(),
});
const diagnostics = createOntahiDiagnostics();
const runtimeTransport = createRuntimeTransportRouter({
  transports: {
    http: instrumentRuntimeTransport({
      diagnostics,
      id: 'http',
      kind: 'fetch',
      transport: createFetchRuntimeTransport(),
    }),
    websocket: instrumentRuntimeTransport({
      diagnostics,
      id: 'websocket',
      kind: 'websocket',
      transport: createWebSocketRuntimeTransport(),
    }),
  },
  routing: {
    'graph.read': 'websocket',
    'graph.command': 'websocket',
    operation: 'websocket',
    'durable.operation.observe': 'websocket',
  },
});

<OntahiDevtools
  console={{
    entities: [TodoItem],
    initialDocument: 'TodoItem.where(completed = false).many()',
  }}
  diagnostics={diagnostics}
  runtimeTransport={runtimeTransport}
/>;
```

The Console supports filtered and unfiltered read terminals. `Tag.count()` and
`TodoItem.where(completed = false).count()` lower directly to the canonical Graph Read `count`
mode; count requests do not inherit the Console row limit or a row cardinality.
`Tag.exists()` and `TodoItem.where(completed = false).exists()` return a Boolean in both Visual
and JSON. They reuse nullable `get` with a limit of one and the existing read policy, then project
the successful result to presence/absence. Errors remain errors, never `false`. `exists()` accepts
neither `limit` nor `orderBy`, and has no table controls. Activity retains the actual `get` exchange.
Many reads may override the default row limit in source, for example `Tag.limit(10).many()` or
`TodoItem.where(completed = false).limit(5).many()`.

The composer includes **TS / Declarative** controls. For example, `TodoItem where completed = false`
selects many by default; append `order by title descending limit 10`, or an explicit terminal such
as `first`, `one`, `count`, or `exists` with the existing modifier restrictions. Both dialects keep
the same runtime and policy boundary, Boolean/enum controls, and permission-aware completion.
Header sorting and limit changes edit the active dialect and submit through Runtime Transport.

Switching dialect does not run a query. Undo/redo restores the original source and dialect together;
equivalent converted queries keep the current result without a false stale notice. Invalid drafts
(including unsupported comments) block switching with an explanation and are never discarded.
Empty drafts may switch unchanged. Settings → Authoring language saves the preferred dialect for
Ontahí authoring editors on this browser origin, including other tabs. With no saved preference,
TS is the default. The Console switch is a local override; it does not change Settings. Visiting
Settings or Activity preserves the mounted Console draft, result, and undo history. A preference
change converts valid drafts without running; incomplete drafts retain their dialect with a notice.

An explicit `console.initialDialect` is a host override of the saved preference. If supplied,
`initialDocument` must use that initial dialect (TS when omitted); a saved preference then converts
it safely. Explorer Selection predicates already share their syntax across both dialects, and
plain-text searches remain plain text. Syntax highlighting uses a dedicated dark palette for the
Console, including `where`, `many`, other clauses, Fields, and literals.

Query ordering is shared by the source editor and the Visual result table:

```text
Tag.orderBy(name).limit(10).many()
Tag.orderBy(name, desc).many()
```

Run reflects source ordering in the table header. Clicking a scalar Field header cycles through
ascending, descending, and no explicit order: it edits only the ordering source ranges as one
undoable transaction and submits a new Graph Read. Sorting happens in the runtime before the
limit, never just over visible rows. The first slice supports one ordering Field; `first()` and
`one()` also accept textual ordering, while `count()` and `exists()` do not.

Typing or undoing does not execute. The table and arrow describe the last successful execution.
The result uses one compact toolbar: last successful round-trip duration (including transport),
editable limit for many reads, and Visual/JSON. It does not repeat the query, success message, or
row-count/limit summary above the table. Draft changes, pending reads, and failures leave the
snapshot visible with a short toolbar notice; actionable errors remain visible in the result body.
Controls are disabled while running or when the
draft is invalid, targets another Entity, or is no longer a many read. A valid same-Entity draft
is preserved and submitted with the new sort. Headers intersect intrinsically sortable Fields with
the receiver's effective ordering capabilities, requested alongside each successful read. Denied
headers remain focusable but inactive, with a tooltip explaining the policy restriction. Missing
or malformed capabilities preserve readable results but disable ordering with a refresh explanation.
Replacing Runtime Transport requires a successful Run to refresh permissions; an `access_denied`
response also invalidates the previous capabilities. Capabilities describe the successful read,
not a permanent grant: policy/authentication or routing changes inside the same transport may make
them stale. Receiver policy remains authoritative on every request, and rejections are shown
without replacing the successful result data.
The many-result toolbar's numeric
Limit control accepts non-negative safe integers, including zero. Apply or Enter edits only the
existing limit literal (or inserts `.limit(...)`) and runs the current same-Entity draft, preserving
its filters and ordering as one undoable source transaction. Typing in the control alone does not
execute; Apply appears only while its numeric draft differs from the executed limit, which is also
available in the input tooltip. Textual limit changes appear in the control after a successful Run; pending
or rejected reads retain the old result and executed limit. Invalid/non-many/other-Entity drafts,
pending reads, or a replaced transport disable the control. Server maximum-limit policy remains
authoritative; the control does not grant a higher limit. Multi-Field ordering and pagination remain
follow-ups. The existing 50-row visual preview cap is
reported separately when reached.

`orderBy(...)` autocomplete uses that same capability snapshot for the matching Entity and
transport, even in incomplete drafts. It suggests only permitted scalar Fields. Before a successful
read, or when permissions are unavailable or invalidated, it offers no ordering Fields; run a valid
read for the Entity to refresh them. Changing Entity or replacing the transport discards stale
suggestions. Other completions and manual source authoring remain schema-based; this assistance
does not grant authority or prevent the server from rejecting a manually authored order.

When ordering is the rejected capability, the receiver reports the requested Entity and Field,
for example `Ordering by TodoItem.completed is not allowed by the Graph Read policy.` The Console
displays that server message; the protocol body retains `access_denied` and optional
`details: { reason: 'ordering_not_allowed', entityName, fieldName }`. Other authorization failures
remain generic. Textual ordering can still be authored independently of header availability.

`createRuntimeTransportRouter(...)` owns effective routing, capability validation, inspection, and
subscription. Devtools recognizes that configurable Runtime Transport and owns its generic Settings
projection; applications do not provide settings UI, React state, or presets. Profiles are derived
from the registered transports and their supported capabilities. The host still chooses the
initial routing and may subscribe for application policies such as cache invalidation or local
persistence. Changing a setting never replays requests or moves an active observation between
transports.

`instrumentRuntimeTransport(...)` preserves and delegates this routing capability when it wraps a
configurable transport.

The default Visual detail projects Operation requests to their input and successful responses to
their returned value, flattening Entity Refs to their locator identity. Body JSON and Envelope keep
the complete Runtime Protocol evidence available when transport-level inspection is needed.

The React surface opens as a full-width bottom drawer at a compact default height. Drag its top
handle, or focus the handle and use the arrow keys, to resize it while the application remains
visible above.

When the host supplies Console Entity definitions, Devtools adds a Console panel backed by the
shared Ontahí Lezer and CodeMirror language packages. The first walking skeleton accepts
`Entity.where(Selection).many()`, nullable `Entity.where(Selection).first()`, and exact-cardinality
`Entity.where(Selection).one()`, lowers them to the canonical Graph Read body, and sends them through
the same configured Runtime Transport as application traffic. Submission is explicit through Run or
`Mod-Enter`; results default to the same semantic visual projection used by Activity, can be switched
to JSON, remain in the panel, and the exchange appears in Activity.

Payload capture is disabled by default. Enabling it requires a host-owned redactor:

```ts
createOntahiDiagnostics({
  capturePayloads: true,
  redact: value => removeApplicationSecrets(value),
});
```

This first release proves the behavioral boundary in Todo. Cache inspection and transport
connection state are later Plan 148 slices.
