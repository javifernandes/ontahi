# Semantic Console and Devtools

Explorer projects the application model. Devtools inspects a running client's use of that model:
the reads it sends, the observations it receives and the state held in its local graph cache.
The \concept{Semantic Console} authors reads over the same reflected Entities; it is not a second
query engine or an unrestricted JavaScript evaluator.

## Connect the actual client

Instrument the transport supplied to the application's graph client, then pass the same transport
and cache to the development-only panel:

```tsx
import { createOntahiDiagnostics, instrumentRuntimeTransport } from '@ontahi/devtools';
import { OntahiDevtools } from '@ontahi/devtools/react';
import { createFetchRuntimeTransport, createRuntimeGraphClient } from '@ontahi/react/graph';
import { TodoItemSchema, TodoListSchema, TagSchema } from './generated/client-entities.js';

const diagnostics = createOntahiDiagnostics();
const runtimeTransport = instrumentRuntimeTransport({
  diagnostics,
  id: 'http',
  kind: 'fetch',
  transport: createFetchRuntimeTransport(),
});
const graphClient = createRuntimeGraphClient({ runtimeTransport });

// Supply graphClient to the application's OntahiGraphProvider as well.
<OntahiDevtools
  diagnostics={diagnostics}
  runtimeTransport={runtimeTransport}
  clientCache={graphClient.clientCache}
  console={{
    entities: [TodoListSchema, TodoItemSchema, TagSchema],
    identity,
    initialDocument: 'TodoItem.where(completed = false).many()',
  }}
/>;
```

Here `identity` is the same execution identity given to the graph provider. Keep it synchronized
when the session or cache scope changes. Generated Entity schemas supply reflection without
importing server declarations into the browser. Instantiate the diagnostics/client once per
intended client lifetime, not on every render, and mount the panel only in the development contexts
where this inspection is appropriate.

This Fetch example supports Run. For Observe, use a transport exposing `graph.observe`, with an
authorized server observer; see [WebSocket transport](../03-runtimes/03-transport-and-http-ingress.md#mount-the-socket-on-the-host-server).
A transport router can combine both. Devtools Settings projects that router's configuration; it
does not implement another routing layer or replay a failed request through a different transport.

## Two spellings, one read model

Choose **TS-like** or **Declarative** in the authoring-language setting:

```text
TodoItem.where(completed = false).orderBy(title, desc).limit(10).many()
TodoItem where completed = false order by title descending limit 10 many
```

Neither is actual TypeScript or SQL. For example, `=` is a predicate operator in the TS-like
dialect, not a JavaScript assignment. Both lower to the canonical Graph Read contract and use the
same Entity context for completion, Boolean/enum controls and ordering pickers. The preference
also affects Explorer/search predicates and Activity read descriptions. Switching dialect converts
a valid draft without executing it; an invalid draft keeps its existing spelling.

Unfiltered reads need no `where(all)` ceremony: write `Tag.many()` or `Tag many`.

| Terminal | Result                                                      |
| -------- | ----------------------------------------------------------- |
| `many`   | Matching rows, subject to the read's limit and policy       |
| `first`  | First matching row, or null; ordering chooses which         |
| `one`    | Exactly one authorized member; zero or multiple is an error |
| `count`  | Number of matching members, not the displayed page length   |
| `exists` | Whether a match exists; errors remain errors, never false   |

Submit with **Run** or **Mod-Enter**. The result offers Visual and JSON projections. `one` cannot
use a limit to hide duplicates; Console rejects explicit limits with `one`. `count` does not inherit
the row limit, and `exists` accepts neither limit nor ordering. These are explicit read consumers,
not different kinds of Entity identity.

## Factories and navigation remain authored intent

With the Tag factories declared in [Selections](../02-core-concepts/04-selections.md):

```text
Tag.by({ named: "Important" }).where(color = "#dd6658").many()
Tag by named "Important" where color = "#dd6658" many
```

Additional root factories intersect: `.by({ named: "Important" }).by({ identity: "tag-1" })`
or `by named "Important" and by identity "tag-1"`. This chaining is Console syntax; the SDK
composes factory results with `.and(...)`.

Contextual properties move to the declared destination population:

```text
TodoList.where(name = "Later").openItems.where(title = "Review").many()
TodoList where name = "Later" through openItems where title = "Review" many
```

Completion now targets TodoItem Fields after `openItems`. These are declared contextual Selections,
not arbitrary relation names. Factories belong before filters/navigation in the current grammar.
Registered variants also appear as roots, such as `Chapter many`; the receiver enforces their
classification and inherited policy. Contextual reads require Graph Read v2 support and explicit
per-hop grants, with no fallback to a less constrained query.

The authoring model retains factory names, dialect and source ranges. Execution uses expanded
Selection meaning. Therefore Activity may show `Tag where name = "Important" ...` for a read
authored with `by named`: the pure factory expanded client-side, but the receiver still validates
its predicates and applies authorization. Activity does not reverse-infer factory names or
promise that every compact diagnostic label can be pasted back into the Console.

## The result table edits the same read

Sorting an allowed column or applying a new row limit rewrites the current Console source and
executes the edited read. It is not a client-only sort over the current page. Source edits and
table controls are two views of the same read model, preserving factories, filters and navigation.

Ordering affordances and completion use capability discovery before any row query. Unavailable
metadata offers no ordering choices; this is not permission inferred from a Field's type. The
server independently checks ordering, limit, filters and scope, including manually typed input.
During a pending read or after a failure, the previous result remains the previous result; editing
the draft alone does not make that data current. The table's 50-row preview cap is separate from
the server query limit.

## Observe, then inspect the client's evidence

**Observe** starts supported Graph Read v1 many queries and **Stop** cancels while retaining the
last snapshot. There is no `.observe()` Console syntax. Scalar terminals and contextual v2 reads
cannot be observed in this slice. While observing, source/dialect edits remain drafts; stop before
executing Run or table sort/limit changes.

Activity groups an observation's snapshots and termination. Inspecting an older snapshot does not
pause the live stream. Switching Devtools tabs keeps observation active; closing the panel,
replacing its transport/cache, changing identity or unmounting cancels it. These are query-result
snapshots, not a persisted event stream or a replay guarantee.

The Cache panel groups canonical records, aliases, freshness and normalized outputs. Reference
navigation follows only locally available evidence. Missing fields do not mean null, and a row
leaving a query does not delete its canonical Entity. Console observations can normalize received
rows into the supplied cache, but do not create retained output skeletons.

**Record entity history** is opt-in, bounded and in-memory. It records a baseline and subsequent
local writes, invalidations and clears; it is not server versioning or a complete audit trail.
Output entries and Activity observations are not an inventory of React hook instances.

Payload capture starts disabled. Enable it only with a host-owned redactor if full Activity payloads
are appropriate. Cache and history inspect actual local values independently of that redactor;
enabling redacted Activity is not a security boundary for the rest of the panel.

See the [Todo browser host](../../../examples/todo-express/client/src/main.tsx) for the complete
integration and the [Devtools contract](../../../packages/devtools/README.md) for lifecycle limits.
Console Commands and Operation invocation, data-dependent Ref completion and general live query
composition remain further work; the current language is read-only.
