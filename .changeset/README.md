# Changesets

Add a changeset when a pull request changes the behavior or public contract of an `@ontahi/*`
package:

```sh
pnpm changeset
```

Select only the packages directly affected by the change and write the release note from the
consumer's perspective. Ontahi's public packages form one fixed group, so Changesets will version
and publish all ten at the same exact version.

Documentation, CI, examples, and repository-only tooling normally need no changeset. Use `patch`
for compatible fixes, `minor` for new public capabilities, and `major` only for an intentional
breaking release.

`main` is currently an `alpha` prerelease train. Do not edit package versions or `pre.json` by hand;
the automated version pull request consumes pending changesets, updates changelogs, and advances
the immutable alpha version.
