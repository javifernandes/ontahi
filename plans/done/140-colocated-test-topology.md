# 140. Colocated Test Topology

Status: done

Canonical ID: `ontahi://plans/140-colocated-test-topology`

Related plans:

1. [134. Semantic Codegen Pipeline, Organization, And Coverage](../current/134-codegen-analysis-organization-and-semantic-coverage.md)
2. [139. Relations Lifecycle Release Proof](../next/139-relations-lifecycle-release-proof.md)

## Summary

Move Ontahi's package and example tests beside the production modules or logical boundaries they
exercise. The change is intentionally mechanical: it improves discoverability and makes large
logical units visible without changing runtime behavior or reorganizing production modules in the
same pull request.

## Convention

1. A focused test lives beside its owning module and uses `.test.ts`, `.test.tsx`, or `.test.js`.
2. A cross-module or provider-backed suite lives at the narrowest owning source boundary and uses
   `.integration.test.ts` or `.integration.test.js`; integration is a test kind, not a separate
   repository tree.
3. Shared test-only support lives beside the narrowest group that owns it and uses
   `.test-support.ts` or `.test-support.js`.
4. Package and Todo example `test/` directories are removed after their contents are colocated in
   their server or client source trees.
5. Typecheck includes the colocated tests, while build and package manifests explicitly exclude
   test suites and test-only support from emitted and published artifacts.
6. Vitest, coverage, and lint configuration discover the new topology without weakening existing
   thresholds or semantic assertions.

## Delivery

1. Establish the pre-move package and example test baseline.
2. Move tests package by package, beginning with the smallest packages and preserving each move as
   a reviewable commit.
3. Move Core and Codegen after the convention is proven on smaller packages, including their
   shared test support and integration suites.
4. Move the Todo Express example tests under their owning server or client source trees.
5. Verify focused suites after each package and run repository-level tests, typecheck, lint, build,
   formatting, and artifact checks before closure.

## Non-Goals

1. No production behavior, public type, or package export changes.
2. No test rewrites, assertion changes, or coverage-threshold changes except where a path assertion
   itself is the tested contract.
3. No production module splitting merely because colocation exposes an oversized logical unit;
   those follow-ups should be evidence-driven and separately reviewable.
4. No new test framework or repository-wide naming scheme beyond the colocated file suffixes above.

## Acceptance Checklist

- [x] Every package test is colocated under its package `src/` tree.
- [x] Todo Express example tests are colocated under their server or client source trees.
- [x] Shared test support is clearly named and excluded from builds and published artifacts.
- [x] No package or Todo example `test/` directory remains.
- [x] Existing test counts and coverage thresholds are preserved.
- [x] Focused and repository-level tests, typecheck, lint, build, format, and artifact checks pass.
- [x] An empty Changeset records the package-local tooling and topology change.
- [x] Plan and Atlas records describe the durable convention and the Codegen exception it retires.

## Closure

All ten public packages now keep tests under their owning `src/` trees. Todo Express follows the
same rule across its server and browser source trees. The migration preserves a reviewable commit
per package or example; it changes paths, test-support names, import order, and discovery/build
configuration without changing production behavior or assertions.

The complete package run passes 142 suites and 1,003 tests; Todo Express passes 5 suites and 29
tests. Package coverage runs with the existing thresholds, including PostgreSQL and Supabase
Testcontainers integration. Repository typecheck, lint, package builds, formatting, Changeset
status, and clean-room artifact installation/type/runtime verification pass. No built or packed
artifact contains a test, integration-test, or test-support file.

The durable convention now lives in `docs/testing.md` and the Source Code Organization Atlas item.
Plan 134 records that its temporary package-level Codegen integration-test exception was retired.
Any production directories that now look too broad should be evaluated as separate organization
work, using the newly visible test density as evidence.
