# Changesets

Add a changeset when a pull request changes the behavior or public contract of an `@ontahi/*`
package:

```sh
pnpm changeset
```

Select only the packages directly affected by the change and write the release note from the
consumer's perspective. Ontahi's public packages form one fixed group, so Changesets will version
and publish all seventeen at the same version.

Documentation, CI, examples, and repository-only tooling normally need no changeset. Use `patch`
for compatible fixes, `minor` for new public capabilities, and `major` only for an intentional
breaking release.

For a semantic or architectural public API change, make the release note traceable without turning
it into design documentation:

1. describe the consumer-visible behavior and compatibility impact first;
2. reference the canonical Plan that delivered it, such as
   `ontahi://plans/166-semantic-operation-receivers-and-bound-invocation`;
3. reference the smallest durable Atlas item IDs whose released meaning changed;
4. keep detailed rationale and migration examples in the Plan, Atlas items, executable examples,
   and developer guide rather than copying them into every package note.

These references supplement the PR body's `Atlas-Implements` and `Atlas-Shapes` directives. A
Changeset is release evidence and does not itself create Atlas evidence bindings.

`main` is currently an `alpha` prerelease train. Do not edit package versions or `pre.json` by hand;
the automated version pull request consumes pending changesets, updates changelogs, and advances
the immutable alpha version.
