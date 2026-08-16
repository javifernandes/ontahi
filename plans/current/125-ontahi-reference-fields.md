# 125. Ontahi Reference Fields

Status: current

Canonical ID: `ontahi://plans/125-ontahi-reference-fields`

Migrated from: `bookops://plans/125-ontahi-reference-fields`
Original path: `plans/current/125-ontahi-reference-fields.md`
Source commit: `67713696`

Advances goal: [`Ontahi Independently Usable`](../../atlas/items/independently-usable.md)

Source plan: [`71. Ontahi / BookOps Semantic Model Convergence`](bookops://plans/71-ontahi-bookops-semantic-model-convergence)

Source plans:

1. [`71a. Experimental Entity Relations Bridge`](bookops://plans/71a-ontahi-relations-model-research)
2. [`116. Ontahi Selection Model`](../done/116-ontahi-selection-model.md)
3. [`122. Ontahi Developer Book`](bookops://plans/122-ontahi-developer-book)

## Summary

Make an Entity reference a first-class field value. Replace the duplicated declaration of a
foreign-id-shaped field plus a `belongsTo(..., { via })` relation with one semantic declaration:

```ts
const TodoItem = entity({
  name: 'TodoItem',
  fields: {
    id: field.id(),
    list: field.ref(TodoList),
    title: field.nonEmptyString({ trim: true }),
  },
});
```

The model owns the fact that `TodoItem.list` refers to one TodoList. Storage providers may lower that
Ref to `list_id`, a document field, or another physical representation without making the Entity
or its operations speak in foreign-key scalars.

## Context

The current relation surface repeats one link through two declarations:

```ts
fields: {
  listId: field.id(),
},
relations: {
  list: relation.belongsTo(TodoList, { via: 'listId' }),
},
```

These lines are not identical: the field declares a value and the relation declares topology.
The problem is that `field.id()` loses which Entity the value identifies, while `via` restores
that meaning later through a string field name. Reflection, generated clients, input controls,
Selections, and storage validation must reconstruct a semantic link that the author already knew.

Name-based inference such as `list -> listId` can reduce typing, but it preserves the degraded
model. This plan instead promotes the reference itself into the Entity shape.

## Canonical Semantics

1. `field.ref(Target)` declares a required reference to one Target Entity.
2. `field.nullable(field.ref(Target))` declares an optional relationship value whose explicit
   empty state is `null`.
3. A materialized Entity contains an Entity Ref at that field until a Query includes the target.
4. Including a reference field replaces the Ref at that result path with the materialized target
   shape; the inferred Query result reflects that replacement.
5. The declaration synthesizes a `belongsTo` relation with the same name for navigation and
   reflection.
6. Storage adapters lower and lift the Ref at their boundary. The serialized Selection AST keeps
   the Ref rather than a provider-specific scalar.
7. A target must expose a usable identity. The first slice supports one-field identities; a
   composite identity requires an explicit mapping until multi-column reference lowering exists.

## Authoring Direction

```ts
const TodoTag = entity({
  name: 'TodoTag',
  fields: {
    todo: field.ref(TodoItem),
    tag: field.ref(Tag),
  },
});

const TodoItem = entity({
  name: 'TodoItem',
  fields: {
    id: field.id(),
    list: field.ref(TodoList),
    title: field.nonEmptyString({ trim: true }),
  },
  relations: {
    tagAssignments: relation.inverse(TodoTag.fields.todo),
  },
});
```

Reference values remain usable without loading their targets:

```ts
const research = TodoList.refById('list-research');

TodoItem.insert({ list: research, title: 'Model reference fields' });
TodoItem.where(todo => todo.list.eq(research));
```

The physical binding may conventionally map `TodoItem.list` to `todo_items.list_id`. That name belongs to
the storage mapping, not the semantic field.

The same topology supports inverse traversal without reconstructing the source Query:

```ts
run: ({ list }) => commands.relatedTo(list).orderBy(item => item.title);
```

The semantic Selection carries its Entity and membership expression. When exactly one declared
relation connects the command Entity to that source Entity, Ontahí infers the edge. Multiple
connecting relations require the explicit advanced form `relatedTo(source, { through })`.

## Inverse Relations

`hasMany` is not a value stored on the source row, so it does not become an ordinary field.
An inverse relation points to a target reference field:

```ts
tagAssignments: relation.inverse(TodoTag.fields.todo);
```

The referenced field already supplies the target Entity, source Entity, join identity, and
physical reference evidence. The inverse declaration contributes only its domain name and plural
navigation cardinality.

Cycles continue to use deferred Entity references or relation callbacks. The final API must not
require declaration order to become domain meaning.

## Compatibility

Existing scalar foreign-id fields and explicit `relation.belongsTo/hasMany` declarations remain
supported. They are necessary for incremental migration, legacy payloads, composite physical
keys, and providers that have not implemented Ref lowering.

No automatic migration renames `listId` to `list`. Applications opt into reference fields one
Entity at a time.

## Execution Slices

- [x] Add a typed Reference Field definition and single-field target identity validation.
- [x] Synthesize the same-name `belongsTo` relation during Entity preparation.
- [x] Let Selection field operators accept Refs and preserve them in the AST.
- [x] Replace reference fields with materialized values in typed Query includes.
- [x] Lift and lower reference values in the in-memory runtime.
- [x] Add PostgreSQL and Supabase mapping, predicate, payload, returning, and include support.
- [ ] Reflect the target Entity and locator contract in schema and Explorer descriptors. The schema
      descriptor is implemented; the Explorer presentation remains.
- [x] Generate browser-safe direct reference field declarations and types.
- [ ] Project deferred or cyclic Reference Fields through browser codegen without introducing
      declaration-order or temporal-dead-zone failures.
- [x] Add `relation.inverse(referenceField)` with ambiguity-free mapping.
- [x] Let relation-root navigation consume a semantic Selection directly and infer its unique
      connecting relation; require `through` only for ambiguous topology.
- [x] Migrate the Todo portability example to Reference Fields and unique relation traversal.
- [ ] Migrate one representative BookOps relation.
- [x] Update the developer book after the public surface passes adapter conformance tests.

## Verification

- [x] A TodoItem can be inserted with a TodoList Ref and read back with the same semantic Ref.
- [x] A Selection can compare a reference field with a Ref in memory, PostgreSQL, and Supabase.
- [x] Including `todo.list` returns a TodoList value at `list`, not an impossible Ref intersection.
- [x] Reflection identifies `TodoItem.list` as a reference to TodoList.
- [x] Storage mappings validate the referenced target identity and physical column.
- [x] Existing explicit relations retain behavior and types.
- [x] Composite or ambiguous mappings fail early with an actionable message.
- [x] `relatedTo(selection)` works for relations declared by either endpoint, while multiple or
      missing edges fail before execution with an actionable diagnostic.

## Non-Goals

1. Automatically migrating physical schemas or existing application payloads.
2. Supporting composite reference lowering in the first slice.
3. Treating every `hasMany` relation as stored Entity data.
4. Reifying relations with attributes, identity, behavior, or policy as fields.
5. Hiding cross-resource routing or graph segmentation behind an ordinary storage mapping.
6. Inferring a relation solely from a field-name suffix.

## Decisions

1. A reference field carries a Ref in the semantic Entity shape, not a naked identity scalar.
2. Storage owns foreign-key representation; the Entity owns reference meaning.
3. Same-name include materialization replaces the Ref in the Query result type and value.
4. `hasMany` stays explicit and may be derived from a target reference field.
5. Name inference may remain a convenience for legacy declarations, not the canonical model.
6. Existing explicit relation APIs remain the migration and advanced-mapping escape hatch.
7. A semantic Selection is sufficient relation-root input; binding it back through the source
   Entity is runtime plumbing, not application logic.
8. Unique topology is inferred. `through` represents a real domain ambiguity and stays explicit
   only when more than one edge connects the Entity pair.

## Open Questions

1. Should public command inputs accept only a Ref, or also identity scalars and materialized target
   records through the same normalization used by operation Selection inputs?
2. Should a reference field select its target's canonical identity only, or permit an explicitly
   named locator for storage lowering?
3. How should a client express “Ref plus already materialized snapshot” without conflating cache
   state with the Entity value?
4. Does a cross-graph reference use the same field kind with routing metadata, or a distinct
   distributed reference contract?
