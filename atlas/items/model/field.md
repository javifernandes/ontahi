---
id: ontahi.model.field
kind: concept
title: Field
parent: ontahi.model.entity
status: active
horizon: now
supports:
  - ontahi.model.entity
  - ontahi.operation-contracts.operation-inputs
relatedPlans:
  - bookops://plans/79-graph-native-schema-dsl
  - bookops://plans/76a-operation-input-constraints-and-client-validation
  - ontahi://plans/125-ontahi-reference-fields
  - bookops://plans/122-ontahi-developer-book
migratedFrom: bookops://atlas/model/field
sourceCommit: 67713696
---

A [[ontahi.model.field|Field]] names one semantic value in an
[[ontahi.model.entity|Entity]]. Its schema carries portable value meaning—type, optionality,
constraints, and reflection—before any storage provider chooses a column or document shape.

The same Field can be reused by an Operation input:

```ts
rename: operation({
  input: O.object({
    list: self.one(),
    name: self.fields.name,
  }),
});
```

That reuse preserves the semantic fact that the `name` accepted by `rename` is the Entity's name,
not an unrelated string that happens to validate similarly. Validation, generated clients,
Explorer, and future input tooling can follow the same link.

A Reference Field such as `list: field.ref(TodoList)` carries a
[[ontahi.model.ref|Ref]] and also supplies a named [[ontahi.model.relation|Relation]]. Storage owns
how that reference is lowered physically.
