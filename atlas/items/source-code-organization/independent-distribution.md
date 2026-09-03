---
id: ontahi.source-code-organization.independent-distribution
kind: system-primitive
title: Independent Distribution
parent: ontahi.source-code-organization
status: active
horizon: now
supports:
  - ontahi.independently-usable
  - ontahi.source-code-organization
relatedPlans:
  - ontahi://plans/100-ontahi-framework-extraction
  - ontahi://plans/129-ontahi-independent-repository-and-release-readiness
  - ontahi://plans/129a-ontahi-public-package-artifact-hardening
  - bookops://plans/129b-ontahi-bookops-versioned-consumer-loop
  - ontahi://plans/129c-ontahi-public-repository-and-prerelease-proof
  - ontahi://plans/129d-ontahi-stable-release-lifecycle
  - ontahi://plans/139-relations-lifecycle-release-proof
  - ontahi://plans/139f-relations-lifecycle-release-rehearsal
migratedFrom: bookops://atlas/source-code-organization/independent-distribution
sourceCommit: 67713696
---

[[ontahi.source-code-organization.independent-distribution|Independent Distribution]] is the
realized boundary that lets Ontahi packages be built, versioned, installed, tested, and released
without BookOps workspace source.

The distribution boundary requires intentional package metadata and public exports, deterministic
internal dependency versions, release and prerelease channels, a clean external consumer, and
cross-repository compatibility evidence. BookOps remains the main production consumer after the
split; Todo Express remains the smallest portability proof.

The development loop has two paths. Ordinary BookOps work consumes exact published versions and CI
tests the same artifact boundary users install. Coordinated framework/application work explicitly
activates a sibling Ontahi checkout, then restores the lockfile-backed registry installation before
committing or validating the release boundary.

Sibling checkouts use pnpm `file:` dependencies through a temporary install, preserving BookOps
manifests and its committed lockfile. Built package files are hard-linked for a fast feedback loop
while React and other peers remain host-resolved. `pnpm ontahi:registry` restores the authoritative
registry tree.

The first independent release proof published all ten packages through the intentional
`0.1.0-alpha.3` line with Apache-2.0 legal files, explicit public metadata, npm provenance, and
Trusted Publishing. The last published prerelease is `1.0.0-alpha.7`; generated release PR #57
contains the lockstep `1.0.0-alpha.8` Relations candidate. Publication and consumer verification
remain release evidence rather than something inferred from a manifest version alone. Changesets
accumulates feature changes in a generated release PR; merging that PR is the explicit publication
action and also creates the immutable tag and GitHub prerelease. Public-repository CI owns package
tests, packed-artifact inspection, dependency closure, and clean-consumer verification.

The `alpha.8` rehearsal verifies the exact generated-release commit rather than `main`: all ten
tarballs pass the clean-room artifact and offline npm boundaries, Todo passes as an isolated
tarball-only consumer, and Classroom proves the richer headless and PostgreSQL transaction paths.
This is the representative application gate expected before a maintainer merges the bot-owned
release pull request.

BookOps contains no framework source. Its exact package pins and compatibility checks are
host-owned evidence linked from the relevant plans. Todo Express established the original
exact-registry `alpha.3` proof. Remaining distribution work is current registry verification plus
stable promotion, deprecation, and rollback maturity, tracked separately from repository
extraction.
