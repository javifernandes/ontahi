# Ontahi and BookOps development loop

BookOps treats installed Ontahi artifacts as its compatibility boundary. A workspace link is useful
while authoring, but it is not evidence that the packages can be released or consumed from another
repository.

## Sibling-checkout authoring

Keep the repositories beside each other:

```sh
workspace/
├── bookops/
└── ontahi/
```

Install Ontahi once, then activate it from BookOps:

```sh
pnpm -C ../ontahi install
pnpm ontahi:local
```

`ontahi:local` builds the framework and asks pnpm to install the sibling packages through the
`file:` protocol. pnpm hard-links the built artifacts, so subsequent compiler writes are visible
to BookOps while React and other peer dependencies continue to resolve from the host application.
BookOps manifests and its committed lockfile remain unchanged.

For continuous package compilation, run this beside the BookOps dev server:

```sh
pnpm -C ../ontahi dev:packages
```

Inspect or leave local mode with:

```sh
pnpm ontahi:status
pnpm ontahi:registry
```

The source path defaults to `../ontahi`. A different checkout or worktree can be selected with
`pnpm ontahi:local -- ../ontahi-my-branch`.

## Compatibility commands

From BookOps, the quick artifact command builds and packs all ten Ontahi packages, validates clean
consumers, copies BookOps into a temporary workspace with no framework source, and exercises the
representative build, codegen, typecheck, graph, runtime, and application-test slice:

```sh
pnpm run verify:ontahi-bookops-consumer:quick
```

Use the full compatibility gate before merging a release candidate:

```sh
pnpm run verify:ontahi-bookops-consumer
```

It adds the isolated BookOps production build. CI runs this full form after the normal package build
and passes `--skip-ontahi-build` to avoid rebuilding Ontahi twice. Both forms reject lockfiles or
installed package paths that resolve to `ontahi/packages` or the source checkout.

## Chosen two-speed loop

After registry publication, normal BookOps work pins exact released Ontahi versions and commits the
manifest and lockfile update together. A coordinated Ontahi plus BookOps change uses locally packed
tarballs first; this is the fast, registry-independent compatibility proof implemented by the
commands above.

After public publishing exists, a cross-repository candidate uses an exact prerelease such as
`0.2.0-next.3` from the npm `next` channel. BookOps pins that exact prerelease and runs the same
compatibility gate before Ontahi promotes the release. Floating tags do not belong in committed
manifests or lockfiles.

The sibling checkout is the coordinated authoring shortcut. It does not become the merge or release
proof because it can expose stale build output and local dependency behavior that a package
consumer cannot see.

## Update, release, and rollback

1. Validate the Ontahi candidate as packed artifacts in BookOps.
2. Publish the complete changed lockstep package closure in deterministic dependency order.
3. Update BookOps to exact package versions and commit the regenerated lockfile atomically.
4. If BookOps fails after promotion, revert its manifest and lockfile together to the last known
   compatible exact version. Do not repair a broken release by floating to `latest` or `next`.

The tarball override exists only inside the temporary verifier workspace. It does not mutate or
enter the BookOps lockfile.

## Compatibility ownership

- Ontahi owns failures caused by missing exports, incomplete declarations or artifacts, invalid
  peer/runtime requirements, or a candidate that violates its public contract.
- BookOps owns imports outside public exports, assumptions about framework source layout, or use of
  behavior not present in its pinned Ontahi version.
- A deliberate contract change is coordinated: Ontahi lands and releases the candidate first;
  BookOps then updates its exact pins and lockfile with the compatibility command as shared evidence.

The first clean run measured roughly two minutes for the quick path and four minutes with the
production build on a warm local package store. Most time was the isolated install, Workflow test
transformation, and Next.js build; package builds, codegen, and typecheck were each seconds. A direct
workspace test slice is faster, but it does not replace this boundary check. Registry prerelease
latency will be measured when publication automation exists.
