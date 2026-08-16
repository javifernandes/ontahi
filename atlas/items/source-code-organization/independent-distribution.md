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
  - bookops://plans/100-ontahi-framework-extraction
  - bookops://plans/129-ontahi-independent-repository-and-release-readiness
  - bookops://plans/129a-ontahi-public-package-artifact-hardening
  - bookops://plans/129b-ontahi-bookops-versioned-consumer-loop
  - bookops://plans/129c-ontahi-public-repository-and-prerelease-proof
  - bookops://plans/129d-ontahi-stable-release-lifecycle
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

All ten packages are published through the intentional `0.1.0-alpha.3` line with Apache-2.0 legal
files, explicit public metadata, npm provenance, and Trusted Publishing. Changesets accumulates
feature changes in a generated release PR; merging that PR is the explicit publication action and
also creates the immutable tag and GitHub prerelease. Public-repository CI owns package tests,
packed-artifact inspection, dependency closure, and clean-consumer verification.

BookOps contains no framework source. It pins exact npm versions and has a CI guard that rejects
ranges, local links, installed-version drift, or resolution outside pnpm's registry store. Its
normal build, codegen, typecheck, tests, and production build are therefore the compatibility proof
for the public packages. Todo Express also installs and runs from the exact alpha.3 registry set.
Remaining distribution work is stable promotion/deprecation/rollback maturity, tracked separately
from repository extraction.
