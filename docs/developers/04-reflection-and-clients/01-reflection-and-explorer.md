# Reflection and Explorer

\concept{Reflection} makes the composed application inspectable. It does not reverse-engineer HTTP routes,
database tables, or TypeScript source. The same graph that executes the application exposes a
catalog of its Entities, operations, tasks, and ingress.

Explorer is one consumer of that catalog. It turns reflected meaning into a UI; it is not a second
place to declare the application.

## Inspect the application from Node

The smallest reflection surface is already on the composed application:

```ts
import { TodoApplication } from './graph.js';

const description = TodoApplication.graph.describe();

for (const operation of description.domainOperations) {
  console.log(`${operation.id} [${operation.authority}/${operation.exposure}]`);
}
```

`describe()` returns a serializable summary suitable for inspection or transport. Adapters that
need the richer runtime declarations use the same Graph API:

```ts
const graph = TodoApplication.graph;

graph.listEntities();
graph.listGraphOperations();
graph.listDomainOperations();
graph.listTaskDefinitions();
graph.listHttpIngress();
```

These catalogs contain the resolved declarations, including operation schemas and Entity
definitions. Reading them does not query application data or execute an operation.

> [!MARGIN] **The model becomes conscious.** Explorer does not guess that a field is an Entity
> identity, that an input is a Selection, or that work is durable. Those links are visible because
> the application expressed them semantically instead of leaving them implicit in handlers,
> payloads, and tables.

## Project reflection into Explorer

Explorer's server projection combines the catalogs into neutral descriptors:

- Entities include fields, semantic Relation topology, display metadata, exposure, and operation
  counts, plus statically authorized Entity mutation affordances when the host configured them;
- operations include identity, kind, authority, exposure, input and output schemas, Ref inputs,
  named portable conditions and dependencies, bridge metadata, durable lifecycle, and HTTP ingress;
- tasks include their input, progress, result, and step contracts.

Those descriptors are plain data. `@ontahi/explorer-react` consumes them to render the overview,
Entity browser, operation browser, task browser, schemas, topology, and execution forms.

![One reflected application, presented as an Explorer overview of its Entities, operations, tasks, and events.](../assets/explorer/overview.jpg)

This is distinct from the browser codegen projection. Codegen emits typed executable Entities for
application code. Runtime reflection emits data descriptors for tools that discover the
application dynamically.

![The Entity Browser follows Book's reflected fields, relations, operations, and topology.](../assets/explorer/entity-book.jpg)

## Mount the reflective surface

The Express adapter can expose reflection and mount an Explorer application alongside the
operation bridge:

```ts
server.use(
  ontahiExpress(TodoApplication, {
    mountPath: '/runtime/ontahi',
    explorer: { indexFile: explorerIndexFile },
  }),
);
```

This configuration supplies four different surfaces:

- `GET /runtime/ontahi/application` returns the compact Graph API description;
- `GET /runtime/ontahi/explorer/snapshot` returns Explorer descriptors;
- `POST /runtime/ontahi/explorer/entities` reads paged Entity data when a reflected data reader is
  available;
- `/runtime/ontahi/explorer/*` serves the host's Explorer UI.

The UI remains optional. A service can expose only `/application`, disable it with
`applicationPath: false`, mount Explorer only in selected environments, or protect both behind
host middleware.

## Supply runtime powers explicitly

Explorer components can render descriptors without being allowed to read data or execute
Operations. The conventional client provides those Fetch capabilities lazily; a non-default mount
root configures them once:

```tsx
const mountPath = '/runtime/ontahi';

const client = createFetchGraphClient({
  graphRead: {
    endpoint: `${mountPath}/graph/reads`,
    commandEndpoint: `${mountPath}/graph/commands`,
  },
  operations: { mountPath },
  reflectedEntityData: { endpoint: `${mountPath}/explorer/entities` },
});

<OntahiGraphProvider runtime={browserRuntime} client={client}>
  <ExplorerShell basePath={`${mountPath}/explorer`} currentPath={pathname}>
    <ExplorerOverview snapshot={snapshot} />
  </ExplorerShell>
</OntahiGraphProvider>;
```

At the conventional root, the provider needs neither `client` nor individual reader and invoker
props. A fully explicit host can replace one capability or set `client={false}` and supply all of
them itself.

The package owns Explorer routes below `basePath`, its default shell, theme handling, operation
input projection, and generic Entity, operation, and task views. The host chooses the outer route,
loads the snapshot, and selects which reflected runtime capabilities to register.

Invoking from Explorer is not a special execution path. The reflected invoker sends
`operationId + input` through the same canonical dispatcher as the generated client. Input is
validated and only bridge-exposed domain operations are available through the Fetch invoker.

![The Operation Catalog reflects the Fetch Chapter contract as an inspectable schema.](../assets/explorer/operation-fetch-chapter.jpg)

Entity browsing is also explicit. In-memory and PostgreSQL storage bindings can supply reflected
data reading with the application storage; Supabase has its own reader adapter. The host still
chooses the concrete client, credentials, and database policy used for that inspection.

The instance-first Entity browser opens directly on authorized rows. It switches Entity through a
searchable picker rather than reserving a permanent schema sidebar; Operations are contextual
Actions and Schema remains a secondary conceptual view.

An Express Entity Mutation Command policy can also contribute static mutation affordances to the
Explorer snapshot. An `update` allowlist makes only those non-reference scalar cells editable, and
an authorized `delete` adds an exact-row destructive action. Explorer sends the canonical portable
Command through `/graph/commands` and re-reads authoritative data after success. Reflection does
not authorize the write: the dispatcher rebuilds and validates the Command against the
server-owned Entity and policy again.

Reference Fields are presented as semantic Ref links, not as raw storage ids. Explorer prefers
display identity resolved through an authorized Entity read and otherwise labels the link from its
portable locator. Following it navigates to the related Entity instance without claiming that the
Ref already contains current attributes. Repeated References share the graph-read cache, while the
portable locator remains the link identity and fallback.

The Entity detail reflects each Relation's declared endpoint, target Entity, direct kind,
forward/inverse direction, cardinality, nullability, and cardinality-specific structural verbs.
Those verbs are static read-only metadata, not an authority decision or an Execute control. When
only one endpoint was declared, schema reflection may add a `derived-inverse` descriptor with no
verbs so the graph is visible without inventing an application member.

Derived Fields remain visible as ordinary Entity Fields and are labeled `derived · read-only` with
their exact stored-Field and Relation-aggregate dependencies. Entity data readers return their
authorized runtime value rather than looking for a physical column. Explorer does not evaluate the
expression itself and never treats the rows currently displayed in a panel as complete aggregate
evidence.

Selecting an identified row opens a non-blocking instance window. Several windows, including
instances of different Entity types, can coexist for comparison. They can be dragged, overlapped,
collapsed in place, restored, or closed; the active window is brought to the front. The workspace
survives Entity, filter, pagination, Schema, and Actions navigation, but remains ephemeral across an
Explorer unmount or page reload. Restoring a collapsed node re-reads its authoritative row.

Executable Operations live with their context instead of requiring a separate catalog section on
the data canvas. The collection node exposes Operations owned by its Entity. An instance window can
also expose an Operation owned anywhere in the application when exactly one reflected Ref input or
one-cardinality Entity Selection matches the instance identity. Explorer binds that target and asks
only for the remaining inputs. It does not guess between multiple compatible targets or convert a
many-cardinality Selection into an instance action. This is a UI projection over the ordinary
Operation contract: the reflected invoker, input validation, runtime policy, and server authority
remain unchanged.

For declared `hasMany` and `manyToMany` Relations, an instance window can load related instances.
The host-provided related-data reader must execute a Relation-root Query through the configured
runtime and graph-read policy. Reads are scoped to open instances rather than every row in a table.
Explorer neither reads a provider table directly nor reimplements authorization. A Ref already
present can be displayed as identity; loading target attributes is always an authorized graph read.

A many-to-many Relation becomes editable only when the server snapshot projects authorized `add`
or `remove` affordances and the graph client supports Relationship Commands. Explorer can then
search currently unlinked participants, add one, or remove an existing participant. It sends the
canonical source/target Command and re-reads the authoritative Relation after an applied outcome.
Structural verbs remain descriptive metadata and never grant permission by themselves.

Association-shaped records remain ordinary Entities. Explorer reflects explicit graph-relation
ownership when present and otherwise reports classification `unknown`; it never guesses from the
presence of required Ref fields.

> [!MARGIN] **Explorer is not authorization.** Removing an Execute tab or hiding the route is not a
> security boundary. The host must protect the HTTP surface, operation invoker, Entity data reader,
> task-run loaders, and any elevated credentials with its real access policy.

## Keep the host boundary visible

| Concern             | Ontahí supplies                                                   | The host supplies                                                                 |
| ------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Model catalog       | Entity, operation, task, ingress, and schema reflection           | The application composition to inspect                                            |
| HTTP surface        | Generic invocation, snapshot, and Entity-data handlers            | Mount path, middleware, error reporting, and exposure policy                      |
| Explorer UI         | Descriptor contracts, routes, shell, browsers, and forms          | App routing, static bundle, theme choice, and optional UI extensions              |
| Operation execution | Reflected invoker contract and canonical dispatcher               | Transport, identity, authentication, and authorization policy                     |
| Entity data         | Reader contracts plus semantic Ref and Relation presentation      | Credentials, RLS/service role choice, graph-read policy, and permitted data scope |
| Entity mutation     | Inline scalar editing, exact-row delete, and portable Commands    | Explicit action/Field/result policy, authority, storage execution, and row scope  |
| Relation mutation   | Authorized many-to-many add/remove controls and portable Commands | Explicit link/unlink policy, authority, command execution, and participant scope  |
| Durable runs        | Task descriptors and run/source UI contracts                      | Persistent runtime, run loaders, retention, and access control                    |

The host completes the application at its environmental edges. It should not duplicate Entity
schemas, operation contracts, or topology merely to make them inspectable.

## Treat Explorer descriptors as a tool boundary

The current public direction is stable: application reflection produces neutral descriptors, and
Explorer consumes them through host-supplied runtime capabilities. Some assembly remains
deliberately low-level—snapshot loading, task-run sources, custom Ref inputs, and app-specific event
metadata.

Relation topology and structural verbs are deliberately read-only metadata. Explorer can expose
`add` and `remove` for many-to-many Relations only through separately reflected authority-aware
affordances; direct `assign` and `clear` are not yet generic Explorer controls. Generic Entity
update/delete is distinct and appears only for static identity-scoped mutation policies. Do not
build domain behavior against `ExplorerSnapshot`. Domain code belongs in Entities, Selections,
operations, and Capabilities. Explorer descriptors are a projection for inspection and tooling,
free to evolve as the reflective model becomes richer.

The Ontahí form now closes where it began: one application declaration. Runtimes execute it,
codegen carries a safe projection to authored clients, reflection carries a descriptive projection
to tools, and the host binds both to the outside world.
