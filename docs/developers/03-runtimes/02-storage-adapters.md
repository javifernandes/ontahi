# Storage Adapters

A \concept{Storage Adapter} interprets Queries and Commands for a composed application.
Entities describe identity, relations, Selections, and operations. They do not know whether a Query
runs over an object in memory or a PostgreSQL table.

## Start in memory

The smallest host needs no external infrastructure:

```ts
const storage = createInMemoryDataGraphStorage();

export const TodoApplication = ontahi({
  storage,
  tasks: inProcessTasks(),
  capabilities: { runtime: { notifications: todoNotifications } },
  entities: [TodoList, TodoItem, Tag],
});
```

When `ontahi(...)` composes the application, the storage receives the registered Entities. It can
then execute their Queries and Commands and expose the same Entity catalog to reflection.

The in-memory dataset lives with this process. It is ideal for examples and tests; it does not
claim persistence across restarts or coordination between processes.

## Carry the same model with PostgreSQL

Replace the storage, not the Entities or their operations:

```ts
const storage = createPostgresDataGraphStorage({
  pool: new Pool({ connectionString: process.env.DATABASE_URL }),
});
```

By default, the adapter derives plural snake-case tables and snake-case columns from the Entity
catalog: `TodoList` maps to `todo_lists`, `TodoItem` maps to `todo_items`, and the semantic
Reference Field `TodoItem.list` maps to `list_id`. A physical exception is a focused override:

```ts
const storage = createPostgresDataGraphStorage({
  pool,
  overrides: {
    TodoList: {
      table: 'lists',
      columns: { name: 'label' },
    },
  },
});
```

All unspecified names keep the convention. There is no second complete Entity schema to maintain.

The adapter compiles the same Selections, Queries, Commands, relation paths, projections, ordering,
and cardinality rules into parameterized SQL. `TodoList.rename(...)` is still the operation; storage
changes how its graph command is carried out.

When constructed from a PostgreSQL `Pool`, the adapter also advertises compositional Data Graph
transactions. `app.graph.transaction(effect)` checks out one connection, installs its runtime in
an isolated child UnitOfWork, and commits or rolls back every bound Query and explicit Command
executed through that context. The transaction-scoped runtime intentionally omits another
transaction capability: this first contract promises neither nesting nor savepoints.

Direct many-to-many Relationship Commands compile to one guarded PostgreSQL statement. Endpoint
Selections become source and target subqueries, the join table mutation happens atomically, and
`RETURNING` supplies the exact links that changed. Repeated `add` or `remove` calls are no-ops; an
unresolved explicit Ref prevents the mutation instead of leaving a partial Cartesian product.

Direct Relations with `relationConstraint.countAtMost(...)` require a wider serialization
boundary. Ontahí's PostgreSQL transaction capability declares `READ COMMITTED` explicitly rather
than inheriting a session default. The runtime checks out a connection automatically when the caller
is not already inside an Ontahí transaction, locks the destination endpoint, then evaluates and
applies the prospective membership in a second statement. That second statement is intentional: a
statement that waits for a row lock may still hold an older snapshot. Competing additions to the
same endpoint are therefore ordered before the fresh aggregate read. A runtime constructed from a
query-only client fails explicitly because it cannot provide this guarantee.

> [!MARGIN] **The host still owns schema history.** Ontahí can map the current semantic model to
> physical names. It does not infer the deployment history required to reach that schema. SQL
> migrations, indexes, constraints, connections, and transaction boundaries remain host choices.

## One binding for execution and inspection

The storage binding supplies graph execution and reflected Entity data together. Explorer does not
need a second persistence model, and switching from in-memory to PostgreSQL does not change the
Entity catalog it inspects.

The Supabase adapter interprets the same graph plans through PostgREST and can persist task runs.
Many-to-many mutations use one installed Ontahí RPC so endpoint resolution, cardinality guards,
edge mutation, and delta capture stay inside one database transaction while grants and RLS remain
authoritative. Its current application-storage assembly remains lower-level than the PostgreSQL
path, so it belongs in production adapter reference rather than the main form.

Direct conditional Relation mutations use a companion RPC with the same invoker-rights boundary.
Each RPC is atomic for its own Relationship Command. The Supabase/PostgREST runtime does not expose
the compositional transaction capability, because several client requests cannot share rollback;
an Operation needing that coordination must run behind a server-owned database transaction or
purpose-built RPC.

The current Supabase RPC vocabulary supports participant eligibility but not
authority-serialized Relation counts. A Relation carrying `countAtMost(...)` fails closed before
RPC execution; Ontahí does not translate it into a race-prone PostgREST read followed by a write.

The invariant is the useful part: changing where state lives must not redefine the Selection,
Query, Command, or operation that acts on it.
