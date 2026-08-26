# 139f. Relations Lifecycle Release Rehearsal

Status: done

Canonical ID: `ontahi://plans/139f-relations-lifecycle-release-rehearsal`

Parent: [139. Relations Lifecycle Release Proof](./139-relations-lifecycle-release-proof.md)

Release pull request: [#57. Release Ontahi 1.0.0-alpha.8](https://github.com/javifernandes/ontahi/pull/57)

## Summary

Prove the exact `1.0.0-alpha.8` candidate as the teachable close of the current Relations cycle.
Reconcile its accumulated Changesets with Plans, Atlas, and developer documentation; validate the
ten packed packages and offline npm publication boundary; and exercise Todo and Classroom through
the representative paths promised by the release.

## Risk To Prove

Workspace tests and individual feature pull requests do not prove that the generated release
branch contains a complete, internally consistent package set or that applications can consume its
tarballs without reaching repository source. The remaining risk is release-boundary drift: notes,
artifacts, examples, and documentation could each be correct in isolation while describing or
executing different surfaces.

## Scope

1. Audit every accumulated Changeset in the generated release pull request against the completed
   child Plans, durable Atlas items, changelogs, and canonical developer book.
2. Build all ten public packages at the exact release pull-request head and verify their public
   exports, dependency rewrites, clean-room installation, and runtime/type boundaries.
3. Prepare the immutable `alpha` tarball set and validate the complete manifest with the offline npm
   publication dry-run.
4. Install Todo from those candidate tarballs in an isolated copy, then run code generation,
   typechecking, semantic tests, and production builds without workspace or repository resolution.
5. Run Classroom's headless lifecycle tests and real PostgreSQL coordinated-transfer suite against
   the candidate source.
6. Review the release pull request's notes and required checks, then leave it ready for the
   maintainer to merge through the trusted-publishing workflow.
7. Close the parent Plan 139 with the exact commands, candidate commit, and observed evidence.

## Non-Goals

1. Do not publish packages, create a tag, or merge the release pull request from this slice.
2. Do not edit bot-owned versions, changelogs, or prerelease Changeset files by hand.
3. Do not add Relation behavior, generic remote Entity Commands, Explorer mutations, or Plan 142
   language features.
4. Do not treat workspace-linked examples as the packed Todo consumer proof.
5. Do not require Supabase to emulate a compositional transaction capability it does not provide.

## Acceptance Checklist

- [x] The `alpha.8` release notes account for every consumer-visible accumulated Changeset.
- [x] All ten packages build and pass artifact verification at the exact release-branch commit.
- [x] Candidate preparation emits a complete ordered manifest whose offline npm dry-run passes.
- [x] Todo installs only candidate tarballs and passes codegen, typecheck, tests, and production
      build without workspace or source resolution.
- [x] Classroom's in-memory lifecycle and PostgreSQL transaction/rollback scenarios pass.
- [x] Canonical developer documentation and durable Atlas items match the candidate surface.
- [x] Release PR #57 is mergeable and all required checks are successful.
- [x] Plan 139 records the evidence and closes without dropping remaining Relation follow-ups.

## Split Point

Stop when the exact candidate is proven and the generated release pull request is ready for the
maintainer. Publishing and post-release consumer pinning happen after that merge. Declarative model
semantics continue independently under Plan 142; authority-aware Explorer mutation and generic
remote Entity Command execution remain under Plans 137 and 128.

## Release Note Audit

The generated release notes account for thirteen public Changesets:

1. Relation reflection and read-only Explorer navigation;
2. conditional direct transitions and explicit applied/not-applied outcomes;
3. source/target participant constraints across in-memory, PostgreSQL, Supabase, direct, and
   many-to-many execution;
4. compositional PostgreSQL transactions and contextual UnitOfWork execution;
5. schema-native Operation input Refs plus resolution reuse and explicit invalidation;
6. application-registered post-commit Reactions.

Four empty Changesets correctly remain outside package changelogs: Core Ref organization,
colocated tests, the private Classroom transfer proof, and developer-document migration. The book,
package references, Relation Atlas item, and executable examples describe the same boundary:
remote Queries and Relationship Commands exist; generic remote Entity Commands, authority-aware
Explorer mutation, aggregate Relation invariants, and Plan 142 language features do not.

## Delivery

Release PR #57 targets `1.0.0-alpha.8`. Its exact candidate commit `7fd23e6` is based on Ontahí
`main` commit `fd078cd`, is reported `MERGEABLE`, and has every required check green. The rehearsal
used a detached temporary worktree at that commit; no bot-owned version, changelog, Changeset, tag,
or release-branch file was modified.

Todo was copied into a separate temporary consumer and its six Ontahí dependencies were replaced
with the candidate tarballs plus matching pnpm overrides. Its generated lockfile contains neither
`workspace:` nor `link:` resolution and does not point at the repository checkout. The temporary
Classroom PostgreSQL container, network, and test-data volume were removed after the suite passed.

## Verification

1. `pnpm build:packages` built all ten packages.
2. `pnpm verify:artifacts -- --skip-build` packed the complete set and passed clean-room install,
   public-artifact, runtime, and TypeScript checks.
3. `pnpm release:npm:prepare -- --tag alpha --output .artifacts/npm/candidate` emitted a ten-package
   ordered manifest for `1.0.0-alpha.8` at commit `7fd23e6`.
4. `pnpm release:npm:dry-run -- --manifest .artifacts/npm/candidate/release-manifest.json` passed
   offline for all ten immutable tarballs.
5. Candidate-tarball Todo passed codegen and its check, server/client typechecking, all 29 tests,
   and server/client production builds. The two localhost OAuth cases were run outside the sandbox.
6. Classroom passed three headless lifecycle tests, five real PostgreSQL commit/rollback scenarios,
   typecheck, lint, and build.
7. GitHub reports all four required checks and the additional GitGuardian, Codecov, and security
   checks successful on release PR #57.
