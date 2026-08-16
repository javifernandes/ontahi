# Agent instructions for Ontahi

These instructions apply throughout the repository. Before changing code, read and follow:

1. [`docs/code-style.md`](./docs/code-style.md)
2. [`docs/testing.md`](./docs/testing.md)
3. [`docs/change-scope.md`](./docs/change-scope.md)
4. [`docs/bug-fixing.md`](./docs/bug-fixing.md) when fixing a bug or regression
5. [`docs/package-changes.md`](./docs/package-changes.md) when adding or changing a package
6. [`DEVELOPMENT.md`](./DEVELOPMENT.md) when changing packages or consumer integration
7. [`RELEASING.md`](./RELEASING.md) when changing a public package or release automation

Repository-wide expectations:

1. Inspect the current checkout and preserve unrelated local changes.
2. Prefer the smallest useful vertical slice for the risk being reduced.
3. Reproduce bugs before changing production code and validate the touched behavior afterward.
4. Test generated artifacts semantically when possible; use textual assertions only for syntax or
   module-boundary requirements.
5. Keep public APIs smaller than their anticipated future shape and avoid duplicate concepts.
6. Public package changes require a Changeset. Package-only test or tooling changes that do not
   warrant a release require an empty Changeset so CI records that decision.
7. Pull requests must be ready for review, scoped coherently, and include the checks actually run.

More specific `AGENTS.md` files may refine these instructions for a subtree.
