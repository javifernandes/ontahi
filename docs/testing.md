# Testing guidelines

Tests should describe observable contracts rather than implementation ceremony.

## Placement

1. Keep a focused test beside the production module it owns, using `.test.ts`, `.test.tsx`, or
   `.test.js`.
2. Keep an integration suite at the narrowest source boundary that owns the interaction, using
   `.integration.test.ts` or `.integration.test.js`. Integration is a test kind, not a separate
   package-level directory.
3. Name shared test-only modules `.test-support.ts` or `.test-support.js` and keep them beside the
   smallest group of tests that shares them.
4. Include colocated tests and support in package typechecking. Exclude them explicitly from build
   emission, coverage inputs, and published artifacts.
5. Treat a crowded production directory plus its colocated tests as evidence that the logical unit
   may need a folder or a narrower boundary. Reorganize that unit in a separate, behavior-preserving
   change rather than hiding its tests elsewhere.

## Priorities

1. Start bug fixes with the smallest realistic failing regression.
2. Prefer semantic assertions over snapshots or generated-source substrings.
3. Use `toBe` for identity, `toEqual` for complete values, and `toMatchObject` only when the
   unspecified fields genuinely do not matter.
4. Keep fixtures minimal while preserving the path under test. A dependency claimed to be
   Value-only, for example, must not also be reachable through an Entity field.
5. Add compile-time tests when a public TypeScript contract is part of the behavior.

## Generated code

When testing codegen, use the closest affordable proof:

1. analyze declarations and inspect structured metadata;
2. execute generated modules and inspect their runtime contracts;
3. typecheck generated modules when inferred public types matter;
4. reserve textual assertions for formatting, imports, exports, directives, or other source-level
   requirements.

A generated string that looks correct is not sufficient evidence that it imports, executes, or
preserves reference identity correctly.

## Verification

Run the focused regression first, then the affected package test suite. Run typecheck/build for
public types or emitted artifacts, and lint/format checks for every touched package. Report checks
that could not be run.
