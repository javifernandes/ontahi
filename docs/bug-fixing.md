# Bug-fixing workflow

Use this flow for bugs and regressions:

1. Reproduce the failure with the smallest realistic unit, integration, type, or generated-module
   test.
2. Confirm that the regression fails for the intended reason.
3. Make the smallest production change that fixes the demonstrated behavior.
4. Re-run the regression and nearby tests.
5. Run typecheck/build when types or generated artifacts changed, plus relevant lint and format
   checks.
6. Add a Changeset when public package behavior changes; use an empty Changeset for package-local
   test or tooling changes that require no release.

Do not weaken a contract, omit output metadata, or remove an assertion merely to hide the symptom.
If reproduction is impossible, document why and state what evidence supports the fix.
