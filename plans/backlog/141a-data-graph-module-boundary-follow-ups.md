# 141a. Data Graph Module Boundary Follow-Ups

Status: backlog

Canonical ID: `ontahi://plans/141a-data-graph-module-boundary-follow-ups`

Source plan: [141. Data Graph Progressive Module Boundaries](../done/141-data-graph-progressive-module-boundaries.md)

## Summary

Continue the proven progressive module-boundary approach beyond Ref when a concrete maintenance or
feature slice needs a clearer Data Graph dependency seam.

## Candidate Slices

1. Separate portable graph-schema, Field, Entity, Relation, and mapping definitions from authoring
   factories.
2. Separate portable Operation metadata and type projection from authoring and client binding.
3. Clarify Query, Command, reflection/protocol, runtime, client, and in-memory boundaries.
4. Address `selection-assembly.ts` only after lower-level model and runtime seams are explicit.

## Non-Goals

1. Do not perform a repository-wide reorganization in one intervention.
2. Do not publish internal layout as new package entrypoints without consumer evidence.
3. Do not fragment files by line count alone.

## Acceptance Checklist

- [ ] A concrete maintenance or dependency problem selects the next bounded slice.
- [ ] The slice preserves public runtime and TypeScript behavior.
- [ ] Dependency direction becomes simpler and is covered by focused tests.
- [ ] Package builds, typechecks, lint, formatting, and artifact verification pass proportionally.
