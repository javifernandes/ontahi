---
'@ontahi/core': minor
'@ontahi/explorer-react': minor
'@ontahi/react': minor
---

Make top-level Domain Operation Ref inputs schema-native: declare `field.ref(Entity)` once, use the
Ref directly with `resolve()`, `invalidate()`, and `refresh()` in server implementations, preserve
portable Refs across the client bridge, and derive Explorer Ref controls from reflected schema.

Remove the transitional authored `inputRefs` Domain Operation contract and legacy scalar lowering.

Migration: replace declarations such as `inputRefs: { book: app.graph.refInput(Book) }` plus
`run: ({ refs }) => refs.book.resolve()` with a single schema field
`input: graphSchema.object({ book: field.ref(Book) })` and access it directly as
`run: ({ book }) => book.resolve()`. Bridge and client-cache `queryRef('book')`/`cacheRef('book')`
now require `input.book` to be a portable Entity Ref; scalar substitutes such as `bookId` or
`bookSlug` are no longer lowered or accepted as Ref identity.
