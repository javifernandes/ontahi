# `@ontahi/language`

Editor-neutral parsing and semantic analysis for Ontahí textual languages.

The supported document is a contextual Selection expression. The host supplies the Entity, so the
text contains only membership meaning:

```ts
import { analyzeSelectionDocument } from '@ontahi/language';

const analysis = analyzeSelectionDocument('completed = false', {
  name: 'TodoItem',
  fields: [{ name: 'completed', type: 'boolean', nullable: false }],
});
```

The language projects Core's established Selection algebra:

```text
all
none
completed = false and priority >= 2
status in ["open", "blocked"]
not archived = true
note is null
list = "list-inbox"
```

Parentheses, then `not`, `and`, and `or` define precedence. Equality and membership support
Boolean, number, string, id, and enum Fields with matching literals; ordering comparisons are
currently restricted to number Fields. A Reference Field with one reflected target identity accepts
a quoted identity for equality and membership and lowers it to a canonical Entity Ref. Date,
datetime, JSON, composite Reference identity, and relation semantics remain explicit future work.

Valid meaning lowers to the canonical `SelectionAst` from `@ontahi/core`. Incomplete source and
source ranges remain language-document state. Hosts own execution and keep runtime failures
separate from syntax and semantic diagnostics.

The same reflection also powers editor-neutral assistance:

```ts
import {
  classifySelectionDocument,
  completeSelectionDocument,
  hoverSelectionDocument,
} from '@ontahi/language';

const completion = completeSelectionDocument('completed = ', 12, entityReflection);
// completion.items: true, false

const classifications = classifySelectionDocument('completed = false', entityReflection);
const hover = hoverSelectionDocument('completed = false', 2, entityReflection);
```

Completions come from the recovered syntax tree and static Entity reflection. They cover valid
Fields, operators, Boolean and enum values, structural scalar placeholders, and grouping/list
continuations. Optional execution-affordance metadata may hide operators that a host already knows
it cannot execute; it never changes whether the Selection is intrinsically valid.

No completion or hover performs a runtime query. The headless service exposes Reference value
context so an editor host may optionally search or resolve identities through an authorized runtime
capability. Dynamic values, statistics, and authority discovery remain outside this package.

`@ontahi/language/lezer` exposes the generated parser for editor adapters. Lezer syntax nodes are
not the package's semantic Selection model.

## Semantic Console Walking Skeleton

The first Console document embeds that exact Selection grammar inside a self-contained,
keyword-free Query expression:

```ts
import { analyzeConsoleDocument, reflectSelectionLanguageEntity } from '@ontahi/language';

const analysis = analyzeConsoleDocument('TodoItem.where(completed = false).many()', {
  entities: [reflectSelectionLanguageEntity(TodoItem)],
});

analysis.request;
// canonical graph.read body, or undefined while syntax/semantics are invalid
```

The shared Lezer grammar exposes independent `SelectionDocument` and `ConsoleDocument` top rules.
The Console layer resolves the Entity and terminal, while the nested expression keeps the existing
Selection syntax, diagnostics, completion, reflection, and lowering. This walking skeleton supports
`.where(...).many()`, nullable `.where(...).first()`, and exact-cardinality `.where(...).one()` Graph
Reads; additional Query members, Commands, and Operations extend the same expression language rather
than adding leading family keywords.

Omitting both `.by(...)` and `.where(...)` selects `all`. `.count()` returns the canonical count without a row limit;
`.limit(nonNegativeInteger)` is supported only with `.many()`.

`Tag.exists()` and `TodoItem.where(completed = false).exists()` lower to nullable `get` with
`limit: 1`, independent of the Console display limit. The parsed terminal is `exists-member`;
execution hosts project a successful record to `true` and `null` to `false`, matching the
application Graph Read intent. Transport/policy failures remain errors, not absence. No new
protocol mode or permission is introduced: this terminal requires the ordinary `get` policy.

Ordering is a Query modifier, not part of Selection membership:

```text
Tag.orderBy(name).limit(10).many()
TodoItem.where(completed = false).orderBy(title, desc).first()
```

The chain is `Entity` → zero or more `by` → optional `where` → optional `orderBy` → optional `limit` → terminal.
This slice supports one reflected scalar Field (`id`, string, number, Boolean, enum), with `asc`
as the default or explicit `asc`/`desc`. References and structured values are not sortable, and
ordering with `count()` or `exists()` is rejected. Runtime read policies may reject otherwise valid ordering.

`editConsoleOrderBy(document, application, order | undefined)` returns source-range changes to
insert, update, or remove ordering. It preserves unrelated source, including Selection spelling,
whitespace, and limits; invalid documents or unsupported orders return `undefined`. Apply the
changes together as one editor transaction. `isConsoleOrderableField` supplies the same intrinsic
Field capability used by diagnostics and completion; it does not grant execution authority.

`editConsoleLimit(document, application, limit)` similarly returns source-range changes for a valid
many Query. It replaces only the numeric literal or inserts `.limit(...)` after Selection/ordering,
preserving other source and whitespace. Zero is supported; invalid drafts, other terminals, and
negative, fractional, or unsafe integer limits return `undefined`. Apply the changes as one editor
transaction; ordinary receiver policy still owns the maximum authorized limit.

`completeConsoleDocument(document, position, application, { orderableFields })` optionally narrows
ordering suggestions with a synchronous `(entityName) => readonly string[]` resolver supplied by
the host. Return `[]` when unavailable or denied. Omitting the resolver retains schema-only
completion. Advertised names are intersected with reflected sortable Fields; filtering, direction,
and member suggestions are unchanged. The resolver affects assistance only, never parsing,
diagnostics, lowering, or receiver authorization.

## Headless Read Dialects

Parsing and analysis accept an opt-in `declarative` dialect; the default remains `ts`:

```ts
const source = 'TodoItem where completed = false order by title descending limit 10';
const analysis = analyzeConsoleDocument(source, applicationReflection, { dialect: 'declarative' });
```

The declarative order is `Entity [by factory argument (and by factory argument)*] [through name]* [where predicate] [order by Field [ascending|descending]]
[limit number] [terminal]`. Omitted terminal means `many`; explicit terminals are `many`, `first`,
`one`, `count`, and `exists`. Ordering defaults to ascending. All type, precedence, cardinality,
default-limit, and modifier restrictions remain the same as TS-like Console reads. This is Ontahí
syntax, not SQL execution or SQL coercion. New clause words are contextual, so `order` and `many`
can still name Entities and Fields. Existing reserved Selection words remain reserved.

```ts
import { convertConsoleDocument, parseConsoleDocument } from '@ontahi/language';

parseConsoleDocument(source, 'declarative');
convertConsoleDocument(source, applicationReflection, 'ts', { dialect: 'declarative' });
// TodoItem.where(completed = false).orderBy(title, desc).limit(10).many()
```

Conversion returns `undefined` for empty or invalid drafts. It never executes or uses an older
valid document. It preserves predicate spelling and grouping, formats outer syntax/whitespace,
and prints an explicit terminal. Same-dialect conversion preserves the entire valid source.
Comments are unsupported and block conversion rather than being silently removed. Terminal intent
is preserved even when `first` and `exists` produce identical wire requests.

`completeConsoleDocument` accepts `{ dialect: 'declarative', orderableFields }`; suggestions reuse
Selection completion and the same receiver capability hints as TS. `editConsoleOrderBy` and
`editConsoleLimit` accept a fourth options argument with `dialect` and preserve unrelated source in
either form. The CodeMirror adapter and Devtools Console support switching with source and dialect
restored together on undo; conversion alone does not own that editor history or execute reads.

## Named Selection factories in Console reads

`reflectSelectionLanguageEntity` includes portable factory contracts declared with Core's
`withSelectionFactories`. Both Console dialects can invoke reflected factories, intersect their
membership with each other and optionally with `where`, and use the existing read modifiers and terminals:

```text
Tag.by({ named: "Work" }).where(name = "Work").many()
Tag by named "Work" where name = "Work" many

Tag.by({ identity: { id: "tag-work" } }).one()
Tag by identity { id: "tag-work" } one

Tag.by({ named: "Work" }).by({ identity: "tag-work" }).many()
Tag by named "Work" and by identity "tag-work" many
```

Each additional factory intersects membership (AND); it never replaces the previous factory or
unions results. Repeating a factory name with different inputs is permitted and may select nothing.
All factory clauses precede `where` and read modifiers. A `where` predicate retains its ordinary
Boolean grouping and is intersected as a whole with the factories. Repeated `.by(...)` is Console
syntax, not a new Core Selection method: SDK callers compose `Tag.by(...).and(Tag.by(...))`.

Factory names select declared meanings, not Entity Fields. Scalar shorthand is accepted only when
the declaration opts in; structured arguments use the exact required input names and scalar types.
Names and values come from the reflected schema, including Boolean/enum suggestions. Unknown
factories, duplicate or extra inputs, invalid values, and incomplete drafts do not produce a request.
No completion fetches data or executes a factory callback.

Core's shared `expandSelectionFactory` validates inputs and expands pure template data. Console
analysis intersects the result with an authored `where` predicate and lowers to the ordinary
`graph.read` request. There is no factory wire node or new authorization grant: receiver policy and
consumer cardinality still apply. The original factory name and argument remain in the source model,
so dialect conversion and table-driven order/limit edits preserve them instead of displaying the
expanded predicate. Any invalid invocation blocks the entire read, not just its suffix.
`or by`, factory-expression grouping, nested inputs, and external resolvers remain outside this slice.

## Contextual Selection navigation

Entity `selections` declarations are reflected as portable `contextualSelections` descriptors. Both
dialects retain their named navigation in the authoring tree and expand the same deferred membership:

```text
Book.by({ slug: "my-book" }).parts.chapters.where(title = "Intro").many()
Book by slug "my-book" through parts through chapters where title = "Intro" many
```

After root `by` factories, filters and contextual hops may be interleaved. Every `where` intersects
the current Entity's Selection; every hop changes to the related target population. Ordering, limit
and the read terminal remain final shaping:

```text
TodoList.where(name = "Later").openItems.where(completed = false).many()
TodoList where name = "Later" through openItems where completed = false many
```

Repeated filters intersect, including on the same Entity. No intermediate read is executed;
`.one()` remains a terminal, not something needed before navigation. `by` after a filter/hop, raw
relation navigation and parameterized contextual factories are not supported yet. A hop only accepts a named
contextual Selection, not an arbitrary Field or relation name. Every source/target Entity must be
present in the application reflection. Unknown paths block execution; they never fall back to an
unfiltered target read.

`resolveConsoleContext(syntax, application, position?)` resolves the semantic Entity through completed
hops, including in incomplete drafts. Both dialect adapters share contextual candidates, continuation
rules, Field/value completion and target-based ordering permissions; only cursor recognition and
inserted spelling vary. Rich Boolean/enum values and order dropdowns use this same destination context.
Completion does not execute a data read. Source ranges and factory names remain available even though
the expanded execution AST intentionally contains their canonical meaning rather than their names.

`ConsoleGraphReadSyntax.steps` retains the ordered factory/filter/navigation authoring stages.
The existing `factories` and `navigations` arrays are projections; the singular `where`/`selection`
fields project a final filter only, when present. Consumers displaying or editing multiple filters
must use `steps` and resolve context at each predicate's position. Rich controls retain the source
Entity labels even when the final read targets another Entity.

Navigation analyzes to a `GraphReadRequest` with version 2 and `relation-image` membership. Ordinary
reads remain v1. The Devtools Console negotiates contextual capability before each v2 execution;
the receiver independently authorizes every hop. Dialect switches and result sort/limit edits retain
the full source membership. Activity displays expanded source/relation/target meaning in the chosen
dialect rather than trying to infer a factory name from its predicate.

## Implementation boundaries

The public entrypoint only re-exports the supported API. Internal modules separate source contracts
(`model/`), Selection parsing/resolution/assistance (`selection/`), reflection projection
(`reflection/`), and Console analysis, navigation, factories and source-preserving edits
(`console/`). Tests live beside these responsibilities and continue exercising public exports.

`dialects/` contains the TS and declarative strategies behind an internal `Dialect` contract:
parser configuration, cursor adaptation, printing, completion spelling and clause edits. Public
`ConsoleDialect` values remain serializable `'ts' | 'declarative'` IDs; the service resolves the
object at its boundary. There is no public plugin registry or new semantic AST.

Both strategies consume one semantic continuation catalog and the same target-context resolver,
Field/operator suggestions, capability hints and canonical lowering. Cursor assistance uses recovered
source structure, not only a complete executable AST. Neither parsing nor completion performs I/O.
