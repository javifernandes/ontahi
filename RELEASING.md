# Releasing Ontahi

Ontahi publishes all ten `@ontahi/*` packages at one exact lockstep prerelease version. Publication
is manual: merging `main` never publishes to npm.

## Local release proof

Build and validate the package boundary before dispatching GitHub Actions:

```sh
RELEASE_VERSION=0.1.0-alpha.1
pnpm build:packages
pnpm verify:artifacts -- --skip-build
pnpm release:npm:prepare -- \
  --version "$RELEASE_VERSION" \
  --tag alpha \
  --output ".artifacts/npm/$RELEASE_VERSION"
pnpm release:npm:dry-run -- \
  --manifest ".artifacts/npm/$RELEASE_VERSION/release-manifest.json"
```

The release manifest records every tarball in dependency order and its integrity. The offline npm
dry-run validates the exact public payload without credentials. The publish step rejects an
incomplete package set, changed tarballs, a source/version mismatch, a stable version, or an npm
version that already exists with different contents.

## Trusted publishing

Every package authorizes the same GitHub Actions workflow through npm trusted publishing. The
`npm-release` environment and `release.yml` workflow are the publishing identity; the repository
does not use a long-lived npm token.

The trust can be inspected or restored with npm CLI 11.15 or newer and an interactive,
2FA-authenticated npm session:

```sh
for package in codegen core explorer-react opentelemetry postgres react \
  runtime-express runtime-nextjs runtime-vercel-workflows supabase; do
  npm trust github "@ontahi/$package" \
    --file release.yml \
    --repo javifernandes/ontahi \
    --env npm-release \
    --allow-publish
done
```

## Normal prerelease

1. Run `pnpm release:version 0.1.0-alpha.1` with the intended new immutable version and review the
   package manifest changes.
2. Run the local proof and the BookOps packed-artifact compatibility gate.
3. Merge the candidate to `main` and wait for CI.
4. Dispatch **npm prerelease** in `dry-run` mode if an independent rehearsal is useful.
5. Dispatch it in `publish` mode. GitHub OIDC is the only supported npm authentication path.
6. Create a matching GitHub prerelease and record the consumer-visible changes.
7. Pin the exact version in BookOps and commit its manifests and lockfile together.

`alpha` and `next` are discovery channels only. Consumers and BookOps commit exact versions, never
floating dist-tags.

## Failure and rollback

npm releases are immutable and the ten publishes cannot be transactional. Before publishing
anything, the script checks every package version. If a network failure leaves a partial release,
rerun the same workflow: identical existing tarballs are skipped and the missing packages continue
in dependency order. A version that exists with different contents stops the release.

Do not overwrite or unpublish a faulty release. Deprecate it when appropriate, publish a new
prerelease version, and roll BookOps back by reverting its exact package versions and lockfile
together. The current workflow intentionally refuses stable versions; a stable channel is enabled
only after the prerelease has passed the real Todo Express and BookOps registry-consumer proofs.
