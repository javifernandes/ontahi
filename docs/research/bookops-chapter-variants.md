# BookOps Chapter adoption rehearsal

This is an executable proposal for [Plan 152](../../plans/current/152-discriminated-entity-variants.md),
not a BookOps migration. The host checkout and its dependency pins are unchanged.

## Evidence snapshot

Inspected BookOps at `851f1b6d4cf21b3d69b171db2dd3ed0bb23afb8a`, branch
`refactor/chapter-operation-contract`, including its uncommitted chapter-path and thread/output
cleanup. Those local changes are evidence, not merged/published behavior. Its web package pins
Ontahi to `0.1.0-alpha.3`; this Ontahi checkout reports `1.0.0-alpha.11` but contains unreleased
work. The checkout version is not proof that the proposed API is available from npm.

| Host evidence                                                                                 | Meaning for adoption                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bookops://web/src/features/domain/exercises/entity.ts` — ContentNode                         | One physical identity; `type` is currently a free-form string.                                                                                                                                           |
| `bookops://model/src/db/content.ts` — DBContentNodeType                                       | The domain already names part/chapter/section/subsection. Audit stored values before making this a required enum.                                                                                        |
| `bookops://web/src/features/domain/sharing/book-sharing/entity.ts` — Book                     | The actual relation is `contentNodes` via `bookId`, not the legacy path hint `contents`.                                                                                                                 |
| `bookops://web/src/features/domain/books/chapter-path.ts` — local helper                      | Handwritten `relation-path` describes an interaction, not a reflected executable relation contract.                                                                                                      |
| `bookops://web/src/features/domain/books/content-read-model.ts` — resolveChapterLocation      | Path resolution checks Book and optional Part, but **never loads the Chapter**. It returns a location DTO.                                                                                               |
| `bookops://web/src/features/domain/books/content-node-ref.ts` — resolveChapterRef             | Supports id and path locators; the returned value is still a location, not a complete ContentNode record.                                                                                                |
| `bookops://web/src/features/domain/conversations/thread/entity.ts` — listThreadsForChapter    | Combines slug input, a parallel chapter inputRef, audience checks, cache scope and viewer-enriched output. The local output cleanup already uses schema-native Views.                                    |
| `bookops://web/src/data/repositories/conversations/threads.ts` — fetchCommentThreadsByChapter | Storage remains keyed by Book/Part/Chapter slugs; state filtering and createdAt ordering are separate read behavior.                                                                                     |
| `bookops://web/src/data/graph/reader.entities.ts`                                             | ChapterNode/SectionNode/SubsectionNode are separate Entity declarations over `content_nodes`, with different fields and typed child relations. They are not automatically interchangeable with variants. |

## Declaration, not just invocation

The executable fixture is
[`bookops-chapter-rehearsal.test.ts`](../../packages/core/src/runtime/server/bookops-chapter-rehearsal.test.ts).
It uses public Core primitives and an in-memory provider, with representative BookOps fields/data.
The following excerpt deliberately omits Book's unrelated fields and Operation output/body:

```ts
const Base = entity('ContentNode', {
  id: field.id(),
  bookId: field.id(),
  parentId: field.nullable(field.id()),
  type: field.enum(['part', 'chapter', 'section', 'subsection']),
  title: field.string(),
  slug: field.string(),
  order: field.number(),
});
const Chapter = Base.variant('Chapter', { discriminator: { type: 'chapter' } });
const ContentNode = withContextualSelections(
  Base.hasMany('children', Base, { via: 'parentId' }),
  ({ self }) => ({ chapters: self.children.as(Chapter) }),
);
const Part = ContentNode.variant('Part', { discriminator: { type: 'part' } });
const Book = withContextualSelections(
  entity('Book', { id: field.id(), slug: field.string() }).hasMany('contentNodes', ContentNode, {
    via: 'bookId',
  }),
  ({ self }) => ({
    parts: self.contentNodes.as(Part),
    rootChapters: self.contentNodes.where(node => node.parentId.isNull()).as(Chapter),
  }),
);

const input = graphSchema.object({
  chapter: graphSchema.existingRef(Chapter),
  stateFilter: graphSchema.optional(field.enum(['open', 'resolved', 'all'])),
});
```

`Chapter` narrows the existing ContentNode schema. `parts`, `chapters` and `rootChapters` are
contextual factories over actual relations; they do not define new identity namespaces. The
fixture separately declares Book's pure `by({ slug })` factory rather than inventing a locator.

The rehearsal exposed a TypeScript mismatch when Chapter was declared before fluent relation/factory
enrichment and then used as a destination of the enriched base. Core's contextual `as` now retains
the variant's own static base type while checking the exact target object at runtime. Both paths
typecheck without casts; another Entity object with the same name and fields is still rejected.
Self-relation declarations retain their declared static shape rather than inferring an infinitely
recursive facade.

The follow-up codegen proof also supports the host's **named Value input** form:

```ts
const ListThreadsForChapterInput = value('ListThreadsForChapterInput', {
  chapter: graphSchema.existingRef(Chapter),
  stateFilter: graphSchema.optional(field.enum(['open', 'resolved', 'all'])),
});
```

[`named-variant-inputs.test.js`](../../packages/codegen/src/generated-module/named-variant-inputs.test.js)
analyzes representative semantic Entity declarations, including root/nested contextual factories.
It typechecks and imports generated browser modules for inline, local and imported/aliased Values,
checks shared Value identity across Operations, and compares the classified navigation/input
descriptors against the same generated base Entity. Server resolvers are omitted. This closes the
named-input projection gap, not an actual BookOps application/codegen run. Participants still need
to be direct fields (optionally nullable/optional); this does not add nested participant support,
portable variant refs, portable conditions or standalone generated variant exports.

## Callers and materialization

These selections remain deferred until a read consumes them:

```ts
Book.by({ slug: 'my-book' })
  .parts.where(part => part.slug.eq('first'))
  .chapters.where(chapter => chapter.slug.eq('intro'));

Book.by({ slug: 'my-book' }).rootChapters.where(chapter => chapter.slug.eq('intro'));
```

When the Reader already loaded the Chapter, pass its canonical ContentNode identity:

```ts
{ chapter: createEntityRef(ContentNode, { id: loadedChapter.id }), stateFilter: 'open' }
```

The receiver materializes a complete base record, checks identity and classification, and supplies
the narrowed record plus `.ref` to the Operation body. A caller label or a path-shaped locator is
not proof of Chapter membership. The old location DTO cannot serve as this resolver's result.

If the caller has only URL slugs, resolving a **unique** Chapter is an explicit read before this
materializing Operation. Normalize the UI's `root` sentinel into root navigation, not a fake Part
slug. A missing Chapter must not fall back to unresolved input. A non-unique path must fail rather
than silently choose `first`. This is specific to `existingRef`; it is not a prescription to
prefetch targets for future Commands. Deferred classified Selection inputs remain unsupported here.

The fixture checks schema rejection and serialization rejection of a deferred VariantSelection.
It invokes the low-level `runServerDomainOperationRaw` only with Ref-shaped inputs for the receiver
cases. That internal runner is **not an input-validation ingress**: passing an arbitrary local
Selection directly can bypass input parsing and reach the body unmaterialized. Applications must
use the schema-validated boundary; this rehearsal does not claim general hardening of the raw runner.

## Authority, hierarchy and repository adaptation

The host must establish the caller's visibility during participant resolution, before the body
receives the record. Graph Read policy registration does not automatically authorize `existingRef`.
The fixture's `bookId = b1` resolver scope simulates visibility, not BookOps authentication/audience
rules. Keep the real audience checks and ensure early materialization does not leak inaccessible
existence or record data. Authentication/requirements must precede protected resolution as needed.

After materialization, the body derives Book and optional Part from Chapter's stored ids. Require
the parent to be a Part of that same Book before producing repository slugs. This is additional
domain integrity beyond `type = chapter`: a valid classification alone cannot certify hierarchy.
Then call the existing slug-addressed repository, preserving the default `open` filter, explicit
`all`/`resolved`, descending creation order and viewer-specific mapping. There is no thread foreign
key migration in this slice.

| Case                                       | Proposed boundary                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Existing nested Chapter                    | Resolve by canonical id; derive Book/Part/Chapter slugs on the server.                                |
| Same Chapter slug under another Part       | A different Chapter identity and repository path; no collision.                                       |
| Root Chapter                               | Null parent/part scope, not an omitted filter over all Parts.                                         |
| Existing Chapter with no threads           | Success with an empty list.                                                                           |
| Missing, wrong-kind or scoped-out Chapter  | `entity_not_found` before the Operation body, without distinguishing hidden existence.                |
| Book and Part exist, Chapter slug does not | Reject; the old path resolver could return a location anyway. This is an intentional semantic change. |
| Broken parent hierarchy                    | Fail without issuing an unscoped thread query.                                                        |

The test output is intentionally a small `{ threads: Entity[] }` contract. It proves output identity
is independent of input navigation, **not** equivalence with BookOps's enriched conversation Views.
Retain messages, reactions and viewer state, plus existing output validation/normalization tests.
Removing handwritten `graphOutput` metadata where schema-native Views already express it is separate
from choosing or validating a Chapter.

## Release and adoption boundary

1. **Pause before adoption to review the accumulated release.** Reconcile Changesets, changed/completed
   Plans, Atlas and developer documentation using the gate in [RELEASING.md](../../RELEASING.md).
   Produce a consumer-facing inventory of additions, breaking changes, deprecations and explicitly
   unsupported behavior. Separate two baselines: the last published release → candidate release,
   and BookOps's exact pinned version → candidate release. Pending Changesets alone cannot describe
   the second gap, which may span already-published releases. Record an upgrade outline and review
   the release scope with the maintainer before any publication or BookOps dependency change.
2. Publish an approved Ontahi release containing these capabilities; update all host Ontahi packages
   together to that exact release. Do not update BookOps dependencies from this rehearsal.
3. Audit persisted discriminator values, declare real `children`/`contentNodes` relations and the
   classified contextual factories. Validate generated output against the actual semantic entities.
4. Migrate one Operation and its callers atomically. The page at
   `bookops://web/src/app/[bookSlug]/[partSlug]/[chapterSlug]/page.tsx` already has loaded chapter data.
   Feed canonical chapter identity into
   `bookops://web/src/components/content/book-context.tsx`, whose current context carries only slugs.
   Replace the manually adjusted client input type with generated input types.
5. Coordinate query cache keys/invalidation and initialData when replacing path aliases with id
   references. Preserve `stateFilter` and principal/viewer scope; verify React refetch behavior.
6. Remove this Operation's redundant slug/inputRefs contract only after server and client tests pass.
   A schema target and navigation declarations do not yet provide the Explorer's guided cascading
   picker: remove legacy path metadata only when that interaction has a verified replacement or
   its absence is explicitly accepted. Do not delete locators throughout BookOps.
7. Treat the Reader's separate ChapterNode/SectionNode/SubsectionNode read shapes as another migration.
   Standalone generated variant exports, variant-root Views and typed heterogeneous child shapes
   are not supplied by this rehearsal. Do not change cache identity by renaming those Entities blindly.

The executable evidence covers declaration/types, root/nested navigation, canonical refs, scoped
materialization, thread selection and independent output metadata. It does not run the actual host,
its PostgreSQL repository, audience services, generated BookOps client, Reader or browser UI.
The clean-room package fixture separately checks public types and runtime classified navigation;
it is not an installed BookOps migration.
