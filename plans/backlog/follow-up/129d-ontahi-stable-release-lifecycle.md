# 129d. Ontahi Stable Release Lifecycle

Status: backlog

Canonical ID: `ontahi://plans/129d-ontahi-stable-release-lifecycle`

Migrated from: `bookops://plans/129d-ontahi-stable-release-lifecycle`
Original path: `plans/backlog/follow-up/129d-ontahi-stable-release-lifecycle.md`
Source commit: `f9e32aed`

Source plan: [`129. Ontahi Independent Repository And Release Readiness`](../../done/129-ontahi-independent-repository-and-release-readiness.md)

## Summary

Rehearse the lifecycle needed before Ontahi makes a stable compatibility promise: promotion from
alpha, deprecation, rollback after a partial publication, and recovery from a failed release.

## Scope

1. Define the evidence required to leave alpha.
2. Rehearse a stable release candidate without publishing `1.0.0` prematurely.
3. Verify tags, GitHub release notes, npm dist-tags, deprecation, and consumer rollback.
4. Document recovery when only part of the package dependency closure publishes.

## Non-Goals

1. Do not choose a stable date before independent-consumer evidence exists.
2. Do not overwrite or unpublish immutable releases.

## Proposed Form

```text
feature PR + changeset -> generated release PR -> explicit merge
  -> immutable npm packages + provenance -> git tag + GitHub release
  -> BookOps exact-version compatibility -> stable dist-tag decision
```

## Acceptance Checklist

- [ ] Stable-promotion evidence and compatibility policy are explicit.
- [ ] A dry rehearsal proves versioning, tags, release notes, and dist-tags.
- [ ] Deprecation and consumer rollback are tested without deleting releases.
- [ ] Partial-publication recovery has a documented operator path.
