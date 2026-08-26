# 139e. Relations Developer Documentation

Status: done

Canonical ID: `ontahi://plans/139e-relations-developer-documentation`

Parent: [139. Relations Lifecycle Release Proof](./139-relations-lifecycle-release-proof.md)

Source repository: `https://github.com/javifernandes/ontahi-library`

Source path: `library/02-ontahi-for-developers`

Source commit: `57867d771de35c21281dcb11a70571d281925960`

## Summary

Make this repository the single canonical source for _Ontahí for Developers_, reconcile the book
against the Relations lifecycle accumulated after `v0.1.0-alpha.7`, and leave a durable relocation
notice in `ontahi-library`. Keep Todo Express as the simple executable spine and add Classroom as
the focused guide to richer Relation lifecycle, Association Entities, Reactions, UnitOfWork, and
transactional coordination.

## Evidence

The last published prerelease is `v0.1.0-alpha.7`. Pending Changesets add read-only Relation
Explorer semantics, portable participant constraints, PostgreSQL and Supabase Relationship
Commands, conditional to-one transitions, compositional PostgreSQL transactions, contextual
UnitOfWork execution, declarative Reactions, schema-native Operation Ref inputs, explicit
Relationship Command outcomes, and the Classroom lifecycle proof.

The developer book currently lives at `ontahi-library/library/02-ontahi-for-developers` and stops
at the first fluent Relationship Command surface. This repository already owns the implementations,
Plans, Atlas, package references, Todo example, Classroom example, release process, and concise
application-data-access guide. Maintaining the book elsewhere now makes release reconciliation and
code review unnecessarily cross-repository.

## Scope

1. Move the complete developer-book unit—chapters, assets, README, and BookOps manifest—to
   `docs/developers`, preserving its source repository, path, and commit as provenance.
2. Update the BookOps mount metadata and repository entrypoints for the new canonical path.
3. Replace the old book source with a small relocation notice; do not retain a second canonical
   chapter or asset tree. Leave the separate _Living Systems_ book in `ontahi-library`.
4. Reconcile the developer narrative with the pending public surface:
   - Reference Fields and reflected/inferred Relation endpoints;
   - cardinality-specific Relationship Commands and explicit applied/not-applied outcomes;
   - portable participant constraints and provider enforcement;
   - schema-native Operation Ref inputs and transaction-scoped UnitOfWork resolution;
   - compositional Data Graph transactions and runtime-bound `.run()` execution;
   - application-registered post-application Reactions;
   - read-only Relation Explorer behavior and authority boundaries;
   - current remote Query and Relationship Command support while generic remote Entity Commands
     remain unsupported.
5. Add Classroom as the richer lifecycle proof without making it the getting-started application.
6. Reconcile the concise `docs/application-data-access.md`, package entrypoints, and release guidance
   with the same current boundaries.
7. Update the smallest durable Learning Materials Atlas items and Plan 139 progress.

## Non-Goals

1. Do not move or rewrite _Living Systems_.
2. Do not redesign the BookOps reader, visual style, or book structure.
3. Do not document Plan 142 target syntax as shipped API.
4. Do not implement new Core, provider, React, Explorer, or release behavior.
5. Do not run or merge the generated release pull request; Plan 139f owns release rehearsal.
6. Do not keep synchronized copies in both repositories.

## Acceptance Checklist

- [x] `docs/developers` contains the complete canonical book plus provenance and valid local assets.
- [x] `ontahi-library` contains only a relocation notice for the moved developer book and retains
      _Living Systems_ unchanged.
- [x] Todo remains the simple executable spine and Classroom teaches the richer lifecycle.
- [x] Relations distinguish forward/inverse topology, direct versus Association Entity modeling,
      cardinality-specific verbs, constraints, and outcomes.
- [x] Operations teach schema-native Ref hydration, UnitOfWork reuse, and honest transactional
      coordination without an application-visible `tx` parameter.
- [x] Reactions are registered application behavior over Applied Mutation Outcomes, not callbacks
      attached to Relation metadata and not part of rollback.
- [x] Explorer documentation presents current read-only semantic navigation without claiming
      mutation or authorization affordances.
- [x] Remote documentation distinguishes supported Queries and Relationship Commands from
      unsupported generic remote Entity Commands.
- [x] Repository and package documentation link to the new canonical source without stale copies.
- [x] Markdown links, code references, formatting, Todo example checks, and proportional
      documentation verification pass.

## Split Point

Stop after documentation and executable-consumer reconciliation. Package candidate creation,
artifact manifest validation, npm dry-run, release PR review, and Plan 139 closure belong to the
separate Plan 139f release rehearsal.

## Delivery

The complete book unit now lives at `docs/developers` with source provenance, local assets, and a
BookOps manifest rooted in this repository. The reconciliation covers the accumulated Relations
Changesets, Classroom, read-only Explorer, remote Relationship Commands, schema-native input Refs,
UnitOfWork, PostgreSQL transactions, post-commit Reactions, and the explicit boundary before generic
remote Entity Commands.

After the destination reached Ontahí `main`, commit `47742e3` replaced the former
`ontahi-library/library/02-ontahi-for-developers` chapter and asset tree with a relocation notice.
_Living Systems_ remains unchanged there, and BookOps now publishes the canonical source imported
from `javifernandes/ontahi`, branch `main`, path `docs/developers`.

## Verification

1. Classroom and Todo tests, typechecks, and lint passed in the delivery pull request.
2. The complete CI package and test matrix passed on Node 20.19 and Node 24.
3. Local Markdown links, code references, formatting, and Changeset status passed.
4. The source-repository cleanup and the new BookOps publication were verified after merge.
5. Candidate tarball and packed-consumer verification remains intentionally owned by
   [139f. Relations Lifecycle Release Rehearsal](./139f-relations-lifecycle-release-rehearsal.md).
