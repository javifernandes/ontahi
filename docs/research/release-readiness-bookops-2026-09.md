# Release readiness and BookOps upgrade inventory — September 2026

Status: inventory complete; installed-host rehearsal and release approval pending.

## Decision

Do not publish yet. First preserve the reviewed BookOps changes, prove baseline compatibility with
the candidate's packed artifacts, then rehearse one classified Chapter Operation. Publication must
not depend on modernizing every BookOps feature, removing every locator, or finishing the next
Devtools feature. Conversely, a successful Ontahi test suite is not evidence that BookOps can
upgrade unchanged.

This is an inventory, not an implementation or installed-host migration. No BookOps dependency,
source, database, release tag or published version was changed. The user cancelled the proposed
worktree: this work uses `docs/release-readiness-bookops` in the existing Ontahi checkout.

## Frozen baselines

| Baseline                       | Verified state on 2026-09-13                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ontahi candidate source        | `6770db764ad7ead7993187f42c2e8333f725d5ad`, merged PR [154](https://github.com/javifernandes/ontahi/pull/154), then-current `origin/main`                                                         |
| Published comparison           | Git tag and npm `@ontahi/core@1.0.0-alpha.11`; npm `alpha` resolves to it                                                                                                                         |
| Release proposal               | [PR 123: Release Ontahi 1.0.0-alpha.12](https://github.com/javifernandes/ontahi/pull/123), head `039032cacff93f2fa1c1ef9eba22469359636f7b` at inspection; proposed Core version returned npm E404 |
| BookOps                        | `851f1b6d4cf21b3d69b171db2dd3ed0bb23afb8a`, branch `refactor/chapter-operation-contract`, plus six local files reviewed below                                                                     |
| Installed BookOps dependencies | Nine direct Ontahi packages pinned to and resolved from `0.1.0-alpha.3`: core, codegen, react, explorer-react, opentelemetry, runtime-nextjs, runtime-vercel-workflows, supabase, postgres        |
| Explicit exclusion             | Unmerged parallel Devtools work. No commits from another feature branch were selected. Already-merged Devtools work remains in this candidate                                                     |

There are two different diffs:

- **Release notes:** `v1.0.0-alpha.11..6770db7` — 25 commits, 60 root Changesets: 52 public-package
  notes and eight empty/test-only notes. Archived `.changeset/pre/` files are not new pending notes.
- **BookOps migration:** `v0.1.0-alpha.3..6770db7` — includes 95 earlier commits through the already
  published alpha.11, as well as the pending release. Reading only pending Changesets misses the
  removal of authored `inputRefs`, among other changes.

The fifteen packages are a fixed release group in [Changesets config](../../.changeset/config.json).
Update the host's nine direct packages together and inspect the transitive versions as well. The
registry's `latest` tag still points to `0.1.0-alpha.0`; neither `latest` nor an unqualified install
is an appropriate migration target. Final manifests must use the approved exact version.

The release PR is mutable. Before approving it, recheck its source range, package set and notes.
If parallel feature work merges in the meantime, do not silently include it in this frozen audit.

### Post-inventory provider follow-up

The user approved investigating contextual provider support before publication, starting with
MySQL. The local follow-up enables MySQL through the existing shared SQL compiler, with live
MySQL 8.4 conformance and Graph Read v2 scope tests. See the
[120b provider checkpoint](../../plans/done/120b-contextual-selection-factories.md#mysql-provider-follow-up--2026-09-13)
and the new `mysql-contextual-selection-reads` Changeset. This is additional, unmerged work beyond
`6770db7`; the frozen counts and surface table below deliberately retain their original baseline.

Supabase still needs a bounded PostgREST proof for Book → Part → Chapter membership: native
existence filters, self-relation disambiguation, Boolean composition, final cardinality/shaping,
and source/target RLS. Reusing the direct-SQL compiler does not itself solve that transport boundary.
Do not substitute client-side source-ID prefetch. BookOps source and dependencies remain unchanged.

## What the pending release actually adds

| Area                       | Shipped candidate surface                                                                                                                                       | Boundaries and BookOps impact                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime Protocol and Fetch | One transport for Operation, Graph Read, Graph Command and durable inspection; default endpoint `/runtime`; explicit legacy compatibility                       | **Migration-sensitive default.** Existing separate routes do not become common-protocol routes merely by changing their URL                                                  |
| WebSocket and observation  | Multiplexed transport, Express projection, in-memory query observation, native TaskRun progress, deterministic cancellation                                     | Optional adoption. Does not supply a production change feed for every SQL/Supabase host                                                                                      |
| Devtools                   | Activity, Settings, diagnostics isolation, read Console, Visual/JSON results and source-backed sort/limit controls                                              | Optional host integration. Console is still read-only: no Commands or Operations language yet                                                                                |
| Language and editors       | Recoverable Boolean Selection language, shared TS/declarative semantics, highlighting, completion, enum/Boolean/reference controls, shared authoring preference | New `language` and `language-codemirror` packages; static assistance is not complete runtime-data reflection                                                                 |
| Named Selection factories  | Reflected input/output contracts, pure templates, typed `by`, codegen and Console intersections                                                                 | Additive; locators remain supported, not deprecated or deleted. No external resolver callbacks or new arbitrary operation execution                                          |
| Contextual selections      | Declared navigation, source/target filtering, codegen, both dialects, Graph Read v2 with explicit per-hop authority                                             | In-memory and PostgreSQL support. Supabase/MySQL contextual membership and contextual observation remain unsupported; no prefetch/downgrade fallback                         |
| Classified entities        | Fixed-enum variants, read universes, classified contextual targets, bound reads, discovery, Console and direct `existingRef(Variant)` inputs                    | Experimental, read-only; base identity/storage retained. No variant-root Views, standalone generated variant exports, variant writes or deferred classified Operation inputs |
| Ordered relations          | Ordered `hasMany`, move intents, neighborhood checks, exact deltas, reflection, React and transport support                                                     | Optional adoption; not an automatic migration of BookOps content ordering or Supabase schema                                                                                 |
| SQL adapters               | New MySQL adapter and shared `@ontahi/sql`, preserved PostgreSQL entrypoints, narrow physical projections                                                       | No need to move all BookOps persistence. Provider conformance follow-ups remain explicit                                                                                     |
| Exact-one reads            | Check authorized membership before limits; SQL probes a second match; Supabase requires exact count metadata; reject `one + limit(0)`                           | **Behavior-sensitive.** A limit can no longer hide duplicate membership; mocks/adapters must supply required count metadata                                                  |

Evidence: the root Changesets indexed below, [Core changelog](../../packages/core/CHANGELOG.md),
[React changelog](../../packages/react/CHANGELOG.md),
[Next.js changelog](../../packages/runtime-nextjs/CHANGELOG.md),
[codegen changelog](../../packages/codegen/CHANGELOG.md), and Plans
[120a](../../plans/done/120a-pure-named-selection-factory-contract.md),
[120b](../../plans/done/120b-contextual-selection-factories.md),
[145](../../plans/done/145-ordered-relations-and-sequence-commands.md),
[150](../../plans/current/150-ontahi-devtools-semantic-console.md),
[151](../../plans/done/151-mysql-data-graph-storage.md), and
[152](../../plans/current/152-discriminated-entity-variants.md).

### Pending Changeset index

Names below refer to `.changeset/<name>.md`. Grouping is for review; it does not rewrite or consume
bot-owned release files.

- Runtime: `unified-fetch-runtime`, `websocket-runtime`, `websocket-session-hardening`,
  `observable-query-runtime`, `durable-schema-input`.
- Devtools: `bright-tools-observe`, `safe-devtools-diagnostics`, `calm-devtools-settings`.
- Language/editor: `fresh-selection-language`, `calm-selection-algebra`,
  `reflected-selection-assistance`, `quiet-values-project`, `rich-reference-values`,
  `shared-authoring-preference`.
- Console: `semantic-devtools-console`, `source-backed-console-ordering`, `console-result-limits`,
  `precise-read-order-denials`, `policy-aware-console-headers`, `console-ordering-completions`,
  `compact-console-results`, `console-existence-reads`, `console-review-compatibility`,
  `console-read-dialects`, `console-dialect-selector`, `activity-read-dialect`,
  `console-order-completion-chain`.
- Named factories: `pure-selection-factories`, `selection-factory-discovery`,
  `console-selection-factories`, `console-factory-intersections`, `linear-factory-keyword-completion`.
- Contextual selections: `contextual-selection-membership`, `contextual-postgres-reads`,
  `contextual-read-authority`, `contextual-read-client`, `contextual-console-navigation`,
  `ordered-console-filters`.
- Variants: `discriminated-variant-read-universes`, `classified-existing-ref-inputs`,
  `variant-input-discovery-codegen`, `classified-console-read-roots`,
  `classified-contextual-destinations`, `runtime-bound-classified-reads`,
  `classified-observation-lifecycle`, `classified-context-enrichment`,
  `named-classified-input-codegen`, `variant-participant-validation`.
- Storage/cardinality: `narrow-postgres-projections`, `native-ordered-relations`,
  `mysql-and-shared-sql`, `exact-one-before-read-shaping`.
- Empty/test-only: `console-ci-test-scenarios`, `console-order-edit-refactor`,
  `contextual-read-codeql-cleanup`, `contextual-selection-experiment`,
  `entity-variant-contract-experiment`, `explorer-rich-editor-test-isolation`,
  `language-module-refactor`, `selection-factory-research`.

## Mandatory compatibility work in BookOps

### 1. Replace authored Operation `inputRefs` — not just Chapter

The published alpha.8 contract removed authored `inputRefs` and `app.graph.refInput(...)`. This is
distinct from retaining Entity locators or reflected picker metadata. A static AST scan of authored
BookOps source found **29 Operation declarations across five modules**:

| Module under `bookops://web/src/`                | Operations                                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/application/notifications/entity.ts`   | `markNotificationRead`                                                                                                                                                                                                                                                     |
| `features/domain/task-runs/entity.ts`            | `getMine`                                                                                                                                                                                                                                                                  |
| `features/domain/conversations/thread/entity.ts` | `createThread`, `replyThread`, `toggleThreadState`, `toggleMessageReaction`, `listThreadsForChapter`, `listThreadsForBook`, `listMentionCandidatesForBook`, `getThreadById`, `deleteThread`, `deleteMessage`                                                               |
| `features/domain/sharing/book-sharing/entity.ts` | `fetchTableOfContents`, `fetchChapter`, `fetchChapterNavigation`, `fetchBookInfo`, `fetchLabels`, `searchBookContent`, `reindexSearch`, `loadChapterPage`, `fetchFirstChapter`, `getSharingInfo`, `deleteBook`, `setVisibility`, `setPublicFeedback`, `removeCollaborator` |
| `features/domain/sharing/invite/entity.ts`       | `invite`, `getInviteInfo`, `acceptInvite`                                                                                                                                                                                                                                  |

`features/domain/books/chapter-path.ts` is a separate sixth file containing
`inputRefs` only as legacy `graphOps` metadata, not a thirtieth Operation.

For each Operation, choose by behavior rather than mechanically replacing an identifier:

- Use schema-native `field.ref(Entity)` / `graphSchema.ref(Entity)` for a portable Ref resolved
  explicitly by the body, with `.resolveWith(...)` when a host resolver is needed.
- Use `existingRef(Entity/Variant)` only when the body requires an authorized materialized record.
  A Chapter variant accepts the **complete canonical base identity**, not URL/path locator inputs.
- A redundant alias can be removed without changing a genuinely scalar business input. Do not
  turn every scalar into a participant or delete all locators as part of compatibility work.
- Audit input Values, call sites, custom public-input types, `refs.*`, `queryRef`/`cacheRef`, cache
  keys and invalidation together. Scalar-to-Ref lowering is no longer supplied automatically.
- Keep `optional`/`nullable` semantics and authorization timing. Legacy location DTO resolvers are
  not interchangeable with `existingRef` resolvers returning complete Entity records.

### 2. Move callback preconditions to the supported concern boundary

Candidate codegen, run read-only against the actual BookOps architecture, reports:

```text
[entity-declaration-invalid]
evaluateExerciseSubmission.contracts.pre must be an object of named conditions.
web/src/features/domain/exercises/entity.ts
```

The source uses `app.validation.contractFromGraphSchema(...)` as top-level `contracts.pre`.
The alpha.9 migration reserves that location for named portable conditions. Preserve the intended
validation at the supported concern/input boundary; do not delete a check just to silence codegen.

Installed alpha.3 analysis finds 18 Entities, eight client Entities and one task with no diagnostics.
Candidate analysis finds 17 Entities, 16 client Entities and one task **with the diagnostic above**.
The new analyzer emits schema-only client Entities too; the changed count is not a successful
upgrade proof, and dropping the invalid ContentNode must never be accepted as a workaround.

### 3. Make Operation transport selection explicit

`bookops://web/src/providers/query-provider.tsx` constructs both Fetch Operation adapters with no
options. Candidate defaults now send Runtime Protocol envelopes to `/runtime`. BookOps currently
exposes the legacy Operation handler at `/api/data-graph/domain-operations`.

Choose a compatibility slice deliberately:

- Initially retain the existing Operation route via explicit legacy configuration, proving invoke,
  permission, auth context and errors; or
- Add the common Next.js Runtime Protocol receiver and configure one shared transport, preserving
  request-derived authentication and per-family grants.

Do not point an envelope client at a legacy body handler. Do not switch browser graph reads from
direct Supabase just because the Operation transport changed. The future Devtools integration
benefits from the shared transport but is not a prerequisite for this upgrade.

Evidence: [Fetch adapter](../../packages/react/src/actions/fetch-operation-bridge-adapter.ts),
[Fetch transport](../../packages/react/src/graph/fetch-runtime-transport.ts), and the host's
`web/src/app/api/data-graph/domain-operations/route.ts`.

### 4. Regenerate and validate all artifacts

BookOps owns a custom generator at `web/scripts/generate-ontahi-artifacts.mjs` and three targets:
browser Entities, task definitions and workflow/step modules. Its current renderer call does not
pass the newer named-definition inventory explicitly; review the candidate options before adopting
the named classified input. The legacy `operationContracts: 'selection'` option must not be assumed
to restore removed input semantics.

Generate all targets together, typecheck server and browser, inspect diagnostics, and test generated
schema/cache contracts. Do not hand-edit generated inputs to make the migration compile.

A read-only named-import/export scan found no missing named imports in the candidate's built public
entrypoints. That limited scan does **not** validate changed signatures, object properties,
re-exports, runtime behavior or generated output. The codegen failure already demonstrates why
import compatibility alone is insufficient.

### 5. Keep provider and runtime behavior explicit

- Both host graph runtimes currently use Supabase/PostgREST. Contextual `relation-image` membership
  is supported by in-memory and PostgreSQL adapters, **not Supabase**. The shared planning path used
  by Supabase rejects it. Declaring `Book.parts.chapters` does not make it executable there.
- For the Chapter pilot, use the already-loaded canonical id where possible and retain an authorized
  host resolver. If executable contextual navigation is required, first choose a receiver backed
  by supported storage or scope explicit provider work. Do not invent a client prefetch fallback.
- Exercise exact-one reads, including Supabase exact count metadata, zero/multiple matches and
  policy-limited results. These correctness changes can expose assumptions in adapters and mocks.
- If adopting Relationship Commands, narrow applied/not-applied results before accessing deltas.
  That breaking result contract was published in alpha.8; it is not introduced by this release.
- Durable observation now belongs to Runtime Transport. BookOps re-exports the hook, but this scan
  found no production hook call site; inspect its existing TaskRun/workflow integration separately.

Evidence: [Supabase runtime](../../packages/supabase/src/data-graph/runtime.ts),
[Core planning](../../packages/core/src/data-graph/planning.ts),
[Selection model](../../atlas/items/model/selection.md), host `data/graph/runtime/browser.ts` and
`data/graph/runtime/server.ts`. No live database connection or stored discriminator audit ran.

## Review of the six local BookOps files

Authorship cannot be established from an uncommitted diff. Their intent is coherent with the
earlier Chapter cleanup; retain them as a named baseline, not as accidental unrelated edits.

| Files                                                                  | Assessment                                                                                                                                                    | Treatment                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversations/thread/entity.ts`, `conversations/types.ts`             | Replaces duplicated result schema + `graphOutput` with a named Value and Entity Views; retains enriched message fields and gives `self` a precise Entity type | Keep the intent in the migration baseline; verify generated server/client parity after candidate installation                                                               |
| `conversations/thread/thread.test.ts`                                  | Adds output validation, cache normalization, message reconciliation and picker metadata checks                                                                | Keep. Tests cover useful semantics rather than only emitted source                                                                                                          |
| `books/chapter-path.ts` (untracked), `sharing/book-sharing/entity.ts`  | Deduplicates the legacy picker path and checks its structural contract                                                                                        | Keep temporarily. This is still a host-written metadata helper, not an Ontahi traversal factory. `contents` is explicitly a UI hint, not the actual `contentNodes` relation |
| `components/internal/graph-ops/graph-ops-operation-ref-input.test.tsx` | Reuses the picker contract and retains the cascaded interaction assertion                                                                                     | Keep while that picker is in use. Factory/schema reflection alone is not a replacement UI                                                                                   |

Paths in the table are below `bookops://web/src/features/domain/` except the explicit component path.

The targeted **27 tests pass with the installed alpha.3 packages**. This supports preserving these
edits, not claiming they are candidate-compatible. The generator was not run in write mode. The
existing generated client was what the client-cache test exercised. The installed version's
`generate:ontahi:check` also passes for the current local source and generated artifacts.

Snapshot integrity for later handoff:

- Tracked diff SHA-256 (`git diff --binary` over the five tracked files):
  `03e749c9e68aa8657582ac1e703058afa09a0b3630dfb9168687c657f4c759a2`.
- Untracked `chapter-path.ts` SHA-256:
  `6451309a86a1b9157d96975bec059bc3f89672f526d688b1f17c5096e3510349`.

Do not stash/drop or overwrite this work to get a clean build. Before the dependency trial, make a
separate local checkpoint of the reviewed six-file baseline and confirm no concurrent edits were
added. Preserve baseline fixes separately from mandatory compatibility changes and optional variant
adoption, even if they eventually share a host PR.

## Release documentation is not reconciled yet

The [release gate](../../RELEASING.md#developer-documentation-gate) requires agreement among notes,
plans, Atlas, executable examples and the developer book. Concrete remaining work:

1. Normalize stage-oriented Changesets into an accurate final surface. For example,
   `console-read-dialects` still calls UI switching a follow-up; `selection-factory-discovery` says
   Console grammar is not introduced; `console-selection-factories` describes only one factory;
   `contextual-selection-membership` says language/UI/remote/SQL support remains future work.
   Later notes implement those slices. Preserve real exclusions rather than merging away caveats.
2. Add contextual selection declarations/navigation and classified entities/participants to the
   canonical developer chapters. Current Entities and Identity chapters have no classified variant
   section; Selections explains `by` but not the new contextual surface.
3. Verify the Selections chapter's claim that `by` always remains unbound against the current
   entity/facade binding implementation. Clearly distinguish definition-owned and bound values.
4. Update the Chapter rehearsal's old raw-runner warning after PR 154's targeted classified-input
   validation: arbitrary VariantSelections now fail that guard, while the raw runner still is not
   a general schema-validation ingress. Do not present historical findings as current behavior.
5. Keep Plans 150/152 current where broader Commands, Operations, variants, Views or lifecycle work
   is outstanding. Merging their read slices does not close those acceptance lists. The durable
   Entity/Selection Atlas items already distinguish most of these boundaries; align public docs.
6. Recheck Todo/Classroom codegen, types, tests, tarballs and affected SQL integration suites at the
   final candidate. Prior PR verification is evidence for that commit, not all later release edits.

## Recommended execution sequence and gates

### A. Preserve and establish the baseline

- [x] Freeze Ontahi candidate and exclude unmerged Devtools work.
- [x] Review pending host edits; run their narrow tests with installed packages.
- [x] Analyze real BookOps source with old and candidate codegen without modifying artifacts.
- [ ] Checkpoint the six reviewed host files locally; record the resulting host commit.
- [ ] Establish current full type/build/test failures before attributing them to the upgrade.

### B. Prove package compatibility before new domain adoption

- [ ] Build and pack the candidate's complete fixed package set. Record source SHA and tarball
      integrities; package metadata may still carry alpha.11 until the release bot versions it.
- [ ] Install tarballs with temporary exact overrides for **all reached Ontahi packages**, including
      transitive dependencies. No sibling-source resolution or mixture of alpha.3/registry alpha.11 and
      candidate bytes. Audit the actual installed paths and versions.
- [ ] Migrate the mandatory input/contract/transport differences above in cohesive groups, preserving
      current product behavior. Run all three codegen targets, typecheck, unit tests and production build.
- [ ] Run local-only PostgreSQL/Supabase integration and auth/error/cache scenarios relevant to the
      app. Verify endpoints before executing anything; do not reset or migrate a production database.

No worktree is required. Use the current host checkout with a checkpoint and reversible dependency
changes when that phase is approved. BookOps's existing `ontahi:local` mechanism installs sibling
package directories; it is a fast authoring mode, **not** this tarball compatibility proof.

### C. Rehearse one classified Chapter slice

- [ ] Audit actual `ContentNode.type` values; declare a finite classifier only after that check.
- [ ] Migrate `listThreadsForChapter`, its input and callers together. Carry loaded Chapter id into
      the context; preserve audience filtering, root/nested distinctions, thread state and viewer data.
- [ ] Test unauthorized, missing, wrong-kind and ambiguous paths; verify cache invalidation and
      initialData. Retain the legacy picker until its replacement interaction is actually proven.
- [ ] Keep separate Reader `ChapterNode`/`SectionNode` shapes and the other locator consumers intact.

Use the [Chapter rehearsal](./bookops-chapter-variants.md) for declaration/body details. Contextual
Supabase support and a wholesale Reader migration are not implicit prerequisites for this pilot.

### D. Approve, publish, then finalize the host pins

- [ ] Fix any demonstrated Ontahi defects in Ontahi; repack and rerun the host proof.
- [ ] Reconcile release notes/developer docs and review the exact release PR scope with the user.
- [ ] Publish only by the approved release workflow; no manual versioning/tags.
- [ ] Replace temporary tarball overrides with the exact published version; repeat compatibility
      checks and commit the host manifest/lockfile together.

**Stop rule:** release readiness requires baseline compatibility and one honest representative
adoption proof, not a completed rewrite of BookOps. Unsupported optional features get explicit
follow-ups instead of silently expanding this release.

## Checks executed during this inventory

- Git/PR/tag/npm metadata inspection; no release mutation. npm alpha.12 lookup returned E404 as
  expected for the unpublished proposal.
- Read all 60 root Changesets; inspected relevant published changelogs, code, Plans and Atlas.
- TypeScript AST scan of authored `inputRefs` and named import compatibility, read-only.
- Old/candidate `analyzeOntahiApplication` on `web/src/architecture.ts`, using the host's `@` alias.
  Old: no diagnostics. Candidate: the precondition diagnostic above. No generation into BookOps.
- `pnpm run generate:ontahi:check` with installed alpha.3: passed, without rewriting artifacts.
- `pnpm exec vitest run --project unit src/features/domain/conversations/thread/thread.test.ts
src/components/internal/graph-ops/graph-ops-operation-ref-input.test.tsx` from BookOps `web`:
  27 passed. Non-failing canvas warning; no live repository migration was exercised.
- Verified the 60-name Changeset index and local Markdown links; repository formatting and
  `git diff --check` passed. The reviewed host diff/file hashes remain unchanged.

Full candidate installation, complete BookOps typecheck/build, database integration, data audit,
browser smoke tests and final release-documentation reconciliation are **not yet performed**.
