# Testing guidelines

Tests should describe observable contracts rather than implementation ceremony.

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
