# Release readiness and BookOps upgrade inventory — September 2026

Status: main is reconciled and the expanded candidate passes local package/host checks;
release documentation, review and publication approval remain pending. Checkpoints below preserve
the chronological evidence.

## Decision

Do not publish yet. First preserve the reviewed BookOps changes, prove baseline compatibility with
the candidate's packed artifacts, then rehearse one classified Chapter Operation. Publication must
not depend on modernizing every BookOps feature, removing every locator, or finishing the next
Devtools feature. Conversely, a successful Ontahi test suite is not evidence that BookOps can
upgrade unchanged.

The initial inventory below did not modify BookOps. Subsequent rehearsal evidence is recorded in
the checkpoint at the end. The user cancelled the proposed worktree; all work uses the existing
separated checkouts. No release was published.

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

The subsequent [PostgREST feasibility proof](./supabase-contextual-membership.md) passed on
disposable PostgreSQL/PostgREST containers, including the self-FK path without custom SQL
functions and RLS at each membership boundary. Native lowering is recommended as the next
bounded provider slice. The subsequent local implementation now executes the same membership
through the Supabase client/runtime and explicit Graph Read v2 receivers; see the research
document's implementation checkpoint. Physical schema requirements remain host-owned. This
additional unmerged work does not alter the frozen baseline below or prove a BookOps upgrade.

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
- [x] Checkpoint the six reviewed host files locally; host commit `7584ac2d`.
- [x] Establish current full type/build/test failures before attributing them to the upgrade.

### B. Prove package compatibility before new domain adoption

- [x] Build and pack the candidate's complete fixed package set. Record source SHA and tarball
      integrities; package metadata may still carry alpha.11 until the release bot versions it.
- [x] Install tarballs with temporary exact overrides for **all reached Ontahi packages**, including
      transitive dependencies. No sibling-source resolution or mixture of alpha.3/registry alpha.11 and
      candidate bytes. Audit the actual installed paths and versions.
- [x] Migrate the mandatory input/contract/transport differences above in cohesive groups, preserving
      current product behavior. Run all three codegen targets, typecheck, unit tests and production build.
- [x] Run local-only PostgreSQL/Supabase integration and auth/error/cache scenarios relevant to the
      app. Verify endpoints before executing anything; do not reset or migrate a production database.

No worktree is required. Use the current host checkout with a checkpoint and reversible dependency
changes when that phase is approved. BookOps's existing `ontahi:local` mechanism installs sibling
package directories; it is a fast authoring mode, **not** this tarball compatibility proof.

### C. Rehearse one classified Chapter slice

- [x] Audit actual `ContentNode.type` values; declare a finite classifier only after that check.
- [x] Migrate `listThreadsForChapter`, its input and callers together. Carry loaded Chapter id into
      the context; preserve audience filtering, root/nested distinctions, thread state and viewer data.
- [x] Test unauthorized, missing, wrong-kind and ambiguous paths; verify cache invalidation and
      initialData. Retain the legacy picker until its replacement interaction is actually proven.
- [x] Keep separate Reader `ChapterNode`/`SectionNode` shapes and the other locator consumers intact.

Use the [Chapter rehearsal](./bookops-chapter-variants.md) for declaration/body details. Contextual
Supabase support and a wholesale Reader migration are not implicit prerequisites for this pilot.

### D. Approve, publish, then finalize the host pins

- [x] Fix the demonstrated Ontahi defects in Ontahi; repack and rerun the host proof.
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

## Installed-host and codegen checkpoint — 2026-09-13

The first rehearsal built all 15 packages at `da149a3f8363455ebd875b3446a9f69ce4adbd65` (PR #156
head), installed candidate tarballs in BookOps and audited all 12 reached packages across 13 peer
contexts. Parallel Devtools #155/#157 were excluded; reconcile actual main before release approval.
The manifest is `.artifacts/npm/bookops-rehearsal-da149a3/release-manifest.json`. Metadata remains
alpha.11; these are candidate bytes, not the registry's alpha.11 payload.

The baseline passed 871 tests and typecheck; the production build could not download Google Fonts
in the sandbox. The candidate exposed 98 TypeScript diagnostics and the removed `app.graph.refInput`
prevented many suites from loading. Two backward-compatible host preparations were retained:
validation as a concern and an explicit legacy Operation endpoint. After restoring registry pins
and generated artifacts, 873 tests and typecheck passed. The host manifest/lockfile remained unchanged.
Detailed evidence lives at `bookops://docs/research/ontahi-upgrade-rehearsal-2026-09`.

The rehearsal also isolated an Ontahi defect: `value('Input', { subject: Subject })` emitted an
undefined `Subject` even with a complete analysis inventory. The correction on
`fix/codegen-nested-value-projection` closes static Value dependencies, preserves shared identity,
resolves imported aliases and binds `self` to the generated Entity schema. Eight new regressions
cover semantic import, strict typechecking, identity, cycles, nominal conflicts and opaque inputs.
All 161 codegen tests, coverage thresholds, package build/typecheck and lint pass.

A separate clean consumer installed the corrected codegen tarball and the previously packed Core
tarball. Strict TypeScript validation and runtime checks passed for the nested Value repro, shared
Value identity and receiver-bound Selection identity. Installed modules resolved inside that
consumer's own pnpm store. No BookOps dependency, generated file or source was changed in this pass.
The codegen tarball integrity was
`sha512-WkqXIkhCQi9AFKZIHHkt419y/kJ0bPrSvbX+FLVn9t+O+uf5mhr6VShVvE9E5+H9QhoGorv2mn10BSgcAna/lA==`;
its source is the local fix atop `da149a3`, not a published version or a clean release candidate.

Analyzing actual BookOps source with that installed codegen now stops at
`internalImportFromGithubMarkdown.input`: its dependency uses executable `graphSchema.transform`.
That requires an explicit portable-schema/normalization decision; copying the closure or removing
its semantics to make generation pass is not a fix. The 17 analyzed Entities / 67 Values are a
**partial** analysis because the Book declaration is rejected, not a successful whole-app generation.
Do not infer that there are no further host issues behind this first diagnostic.

Remaining gates after this first checkpoint: implement the executable-schema boundary agreed below, migrate the 29 legacy input declarations,
repeat full installed-host generation/types/tests/build, rehearse the classified Chapter slice,
run local-only database/auth/cache checks and reconcile release documentation. Database integration,
data audit, browser smoke tests and release approval remain outstanding.

## Decision: input transformations stay at the execution boundary for now

Agreed after the codegen checkpoint: do not project `graphSchema.transform` callbacks into generated
clients for this release. Keep the authoritative input transformation in the receiving runtime.
Commit `51ecaab` alone does not support that separation. The subsequent local implementation and
installed-host proof are recorded below; the preceding diagnostic is historical evidence.

The concrete BookOps use is GitHub Markdown import normalization: `/docs/` becomes `docs`, and
`Manual Docentes Copy` becomes `manual-docentes-copy`. The public operation explicitly parses the
input on the server. Its internal durable operation is `server-only`; inventorying that declaration
must not impose browser portability on its implementation. The existing wizard separately reuses
the slug normalizer for UX, without requiring codegen to copy it.

The implementation must distinguish model inventory, caller-facing input contract and executable
parsing. Projecting the portable input shape is not projecting the callback. Preserve metadata
that a transformation exists where useful; `toGraphSchemaDescriptor` already represents a transform
and its underlying input without serializing the function. Keep server normalization and validation
intact, and do not present client validation as complete when executable checks remain server-side.

Do not equate the wire input type with the parsed value type: a transform can change both shape and
type. Nor should a refinement after a transform be applied blindly to the raw input. For example,
BookOps accepts uppercase words before normalization even though the resulting slug must match a
lowercase pattern. Input-only projection does not establish how transformed Operation outputs should
be described; diagnose missing output information rather than substitute the pre-transform schema.

### Implemented boundary and second installed-host proof

The codegen slice now separates server-only inventory, raw input projection and output projection.
Input transforms/refinements preserve the underlying wire schema and record server processing;
callbacks are neither emitted nor executed during analysis. Parsed defaults remain server-side.
Opaque outputs still diagnose missing portable contracts. Generated-module tests compile strictly
and verify raw client input, transformed server results, refinement rejection, defaults and shared
Value identity across Operations.

All 170 codegen tests, coverage thresholds, build/typecheck and lint pass. A final isolated consumer
also installs the final codegen tarball and validates strict TypeScript, shared inline Values in an
anonymous union reused across Operations, raw client parsing and absence of transform callbacks.
Its codegen integrity is
`sha512-MUJ/N8SlPY6lijSIQriwyUX30nxh0eNdtL8AczeI4gbnUU0O2ACowA/rUj2fuldzY0G+t7FknP5xY361NjJMvw==`.
This final package proof includes the inline-Value identity regression fix added after the host pack.

All 15 candidate packages were packed under
`.artifacts/npm/bookops-rehearsal-wire-input-51ecaab/release-manifest.json` (local working changes atop
`51ecaab`, not published bytes). BookOps resolution auditing verified all 12 reached packages across
13 peer contexts. Its three real generation targets and drift check pass. All 18 Entities analyze
without diagnostics. Full candidate typechecking still reports 97 host diagnostics, **none in the
generated modules**; legacy input contracts and callers remain to migrate. Nine focused host tests
and all 18 generator fixture tests pass on the installed candidate.

The rehearsal exposed a separate nominal collision: BookOps declared two different
`TaskSubjectOutput` Values. The private GitHub-import Value is now named
`GithubMarkdownImportTaskSubject`, preserving its distinct unknown-key behavior. The custom host
generator now passes the complete named-definition inventory. A fixture that used `.view()` on a
plain object now declares a real Entity and supported named schema wrappers.

Registry pins and generated artifacts were restored afterward. With those compatible preparations,
BookOps passes 874 unit tests, 18 generator fixture tests, full typecheck, generation/drift and the
registry-resolution guard. Manifests, lockfile and generated files have no pending changes. The next
slice is the 29 legacy Operation input declarations and their callers, not client transform previews.
Full candidate runtime/database/browser checks and release approval remain outstanding.

### Deferred: portable transformations and client previews

Pure, input-only transformations could later be introspected and reused for previews. Purity alone
does not make an arbitrary JavaScript function serializable, inspectable or executable in Go/Rust
clients. Explore explicit declarative transform expressions or known, versioned transformations if
a concrete UI need warrants it. Preserve input/output schemas, deterministic semantics and runtime
capability discovery rather than automatically copying closures.

A preview remains optional and non-authoritative. Do not introduce double application of a transform
by silently changing what the client submits; transformations need not be idempotent. This exploration
is deferred and is not a prerequisite for the BookOps upgrade or this release.

## TaskRun participant rehearsal — 2026-09-13

After local commit `a5ea602` and host preparation commit `13e1b175`, BookOps migrated its first
legacy input declaration: `TaskRun.getMine` accepts `{ taskRun: Ref }` in a schema-native Value.
Authentication still precedes deferred storage resolution and ownership checks precede reconciliation.
The wizard now submits the composite Ref rather than repeating taskId/runId as scalar inputs.

This uncovered fixes required before release: selection-mode codegen must include native Ref
input/output contracts; schema-native Ref parsing must not apply persisted foreign-key identity
restrictions; React query-key typing must accept the same portable schema inputs as query hooks.
The local fixes retain existing Selection-only projection behavior and single-field storage limits.
Native refs validate complete declared locators; classified participants retain canonical identity.

All 1,104 Core tests, 120 React tests and 172 codegen tests pass, plus their builds/typechecks/lint
and codegen coverage thresholds. The installed host candidate is
`.artifacts/npm/bookops-rehearsal-taskrun-composite/release-manifest.json` (working changes atop
`a5ea602`). Its 12 reached packages / 13 peer contexts are audited. Actual codegen/drift and 34
focused host tests plus 18 generator fixtures pass; full host typechecking falls from 97 to 93 remaining diagnostics, with
none in the touched TaskRun/wizard or generated modules. Full host migration remains incomplete.

The host keeps the candidate installed locally to continue, without committing tarball pins.
Unlike the prior compatible preparations, its new source now requires this candidate. Final
registry pins, full checks and release approval remain gates. Invitations and the other legacy
input declarations are next; full-contract projection also needs a later pass over anonymous
output schemas and old `valueOf` usage exposed by the rehearsal.

## Invitation participant rehearsal — 2026-09-13

BookOps now uses schema-native input participants for its three invitation operations. The real
Ref shortcut regression revealed that binding still flattened the locator into legacy scalar
inputs. Core now derives the receiver from a unique matching top-level native Ref field, including
named Values and optional/nullable wrappers, for server and callable generated-client operations.
Ambiguous receivers fail with explicit-invocation guidance. Legacy locator inputs, storage reference
fields and custom input adapters retain their behavior.

Core's 1,113 tests, typecheck, build and lint pass. The new candidate is
`.artifacts/npm/bookops-rehearsal-invite-proxy-final/release-manifest.json` (working fix atop
`1fdf574`). BookOps installed-path auditing verifies 12 reached packages / 13 peer contexts, and
all 46 invitation/TaskRun/client tests plus 18 generator fixtures pass. Host codegen drift and lint
pass. Its full typecheck still has 79 migration diagnostics outside this slice.
The offline npm dry-run passes for all 15 tarballs with npm 11.19; npm 11.11's older flat JSON
output is incompatible with the release proof script's keyed result format. Nothing was published.

Remaining: 14 Book and 10 conversation operations with legacy input participants, Chapter-path
metadata/callers, obsolete runtime/reflection tests, complete output projection, full host checks,
one classified Chapter adoption proof and the release documentation reconciliation above. Final
publication and exact host registry pins remain explicitly gated; no release happened in this slice.

## Basic Book read outputs rehearsal — 2026-09-19

BookOps migrated four more participants (`fetchTableOfContents`, `fetchBookInfo`, `fetchLabels`,
`fetchFirstChapter`) to native Book Refs. The real generated client reproduced unresolved Value
dependencies below anonymous output wrappers. Codegen now projects these output expressions through
the existing schema projector, including imported aliases and shared nested Values. Requested unsafe
anonymous outputs fail at emission with Entity/Operation context; metadata-only compatibility
projections may still exclude those outputs. Partially discovered dependencies from a failed
projection are not emitted. This does not make opaque callbacks or recursive lazy outputs portable.

All 176 codegen tests and coverage thresholds pass, including generated-module import, strict
TypeScript inference, shared identity and unsafe-output rejection. Package build/typecheck and lint
pass. The candidate at `.artifacts/npm/bookops-rehearsal-book-read-outputs/release-manifest.json`
contains the working fix atop `0ba856a`; nothing was published. BookOps audits 12 reached packages /
13 peer contexts and passes 88 focused host tests plus 18 generator fixtures, actual generation/drift
and web lint. Its remaining full-typecheck diagnostics fall from 79 to 72, none in generated files.

Chapter path selection/participant contracts, opaque Chapter outputs, remaining legacy operations,
full host verification and release documentation reconciliation are still gates. Final host pins and
lockfile remain on the published version until release approval; the local candidate install is not
a reproducible registry upgrade yet.

## Completed frozen-host proof and main reconciliation — 2026-09-19

The remaining Book, conversation and notification inputs are migrated in BookOps. Chapter content,
navigation and thread reads use existing classified participants with canonical base IDs; the URL
page entry retains scalar route inputs for access-shell-first behavior. Recursive output projection
and configured Operation result-union inference exposed two further Core/codegen fixes, recorded
with public Changesets. Declarative lazy Values project without executing host closures.

The installed `bookops-rehearsal-book-native-final` tarballs (working fixes atop `736e9ff`) pass
BookOps production build, zero type errors, 968 unit tests, 47 integration tests (including 18
generator fixtures), 17 real pgTAP RLS/helper checks, 23 focused Chromium Storybook cases, lint,
formatting and generated drift. New real Supabase cases verify root/nested Chapter reads, wrong-kind
rejection, private-ID denial for anonymous/unrelated users and owner access. The disposable test
stack was removed; development data was not reset. A full authenticated browser-to-database journey
remains unverified. See `bookops://docs/research/ontahi-upgrade-rehearsal-2026-09` for host details.

Ontahi's changed packages previously passed all builds, 1,115 Core tests, 184 codegen tests with
coverage, typechecks and lint. The installed-path audit verifies 12 reached packages in 13 peer
contexts. This proof is for the frozen tarballs, not for a moving release branch.

Read-only GitHub inspection found main at `e6584dbc66fcd1f0a3e5d472c4acedaa7c767603`, including
Devtools PRs #155, #157, #159 and #160 plus the provider merge #156. Release PR #123 proposes
`1.0.0-alpha.12`, head `52b00fa4d13968e425fd1dd800e6fcd41b02f81e` at inspection; it does not yet
include these local compatibility fixes. The user approved including main and repeating validation,
instead of maintaining a separate frozen release train. Preserve local checkpoints, integrate main,
repack and rerun the host gates before claiming the expanded candidate is ready.

Publication remains gated on reviewed fixes, developer-documentation/Changeset reconciliation,
fresh final-candidate checks and release approval. Tracked BookOps registry pins still target the
old release; no tarball path belongs in the final committed lockfile.

### Expanded main candidate verified — 2026-09-19

Local checkpoints: host migration `9fa4fa58`, recursive schema/result fixes `4176196`, and the merge
of approved main `e6584db` into the compatibility branch at `28a41a5`. Only the historical inventory
document conflicted; the newer rehearsal checkpoints were retained. The React hook merge preserves
both schema-native input typing and the new semantic cache-output metadata.

The approved scope now also includes normalized-cache inspection, query-cache reconciliation,
semantic output descriptions, live-query Activity, bounded local entity history, Console Observe/Stop
for supported many-query transports, and grouped/cache-reference navigation. These are the surfaces
from Devtools PRs #155, #157, #159 and #160, not a Commands/Operations Console or a general storage
change-feed implementation. The original frozen inventory above is historical, not the final scope.

Packed candidate: `.artifacts/npm/bookops-rehearsal-main-28a41a5/release-manifest.json`, all fifteen
packages, source `28a41a5ab5bc55efc5d14229899ee1657d4c664d`. Package metadata remains alpha.11 only
for this local rehearsal; these bytes are not the published alpha.11. The bot-owned release PR still
needs these compatibility commits before versioning/publication.

Verification against the merged source and installed tarballs:

- All package builds, package/example typechecks and repository lint pass.
- All fifteen package suites pass: **2,606 tests in 272 files**, combining the first ten passing
  suites with the final five-package sequential run. Explorer's descriptor fixture needed the explicit
  `resolution: 'portable'` expectation; `170d7a3` contains that test-only fix and an empty Changeset.
  High parallel load caused later UI timeouts; sequential retries passed without increasing timeouts
  or changing runtime behavior.
- Todo: **70 tests**, including its disposable-MySQL host-restart proof. Classroom: **7 ordinary
  tests plus all 5 PostgreSQL tests**, the latter run with a new Testcontainers database, then removed.
- Clean-room artifact installation, exported types and runtime proofs pass. Offline npm dry-run with
  npm 11.19 passes for all fifteen tarballs; nothing was published.
- BookOps: **968 unit tests**, **47 integration tests**, **17 pgTAP checks**, **23 Chromium Storybook
  cases**, typecheck, lint/guards, generation/drift and formatting pass. The production build was
  repeated after preserving/removing the earlier Next cache; it compiles from the new installed
  tarball paths. Existing Next/Vercel/Browserslist warnings remain non-fatal.
- BookOps's installed-path audit confirms 12 reached packages / 13 peer contexts all from this
  candidate. The tracked registry manifest/lockfile is unchanged; the candidate lock is saved locally
  as `.cache/ontahi-rehearsal/main-28a41a5-pnpm-lock.yaml`. Its fresh isolated Supabase stack
  `bookops_main_20260919` was removed after verification, without touching the developer stack.

A comparison repack at `170d7a3` found identical integrity for 14 packages; Devtools differed only
in dependency-key order in its packed package.json (parsed metadata and all other files identical).
Keep the tested manifest and integrity set as the proof identifier; do not describe repacks as
byte-identical merely because source behavior is unchanged.

Next: review/merge the compatibility fixes and reconcile the developer book and accumulated release
notes against this expanded scope. The existing documentation checklist still applies, especially
classified/contextual selections, bound versus unbound factories and new codegen boundaries. Final
publication, registry pin/lockfile updates and a full authenticated browser-to-database journey
remain separate gates. No branch was pushed and no release/PR was mutated during this pass.
