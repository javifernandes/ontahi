# Ontahi development

Installed package artifacts are the compatibility boundary between Ontahi and a host application.
A workspace or sibling link is useful while authoring, but it is not evidence that packages can be
released or consumed from another repository.

## Repository setup

```sh
pnpm install
pnpm build:packages
pnpm test:packages
```

Run lint, typechecking, and artifact verification before proposing broad package changes:

```sh
pnpm lint
pnpm typecheck
pnpm verify:artifacts
```

## Application authoring

[`Ontahí for Developers`](./docs/developers/README.md) is the canonical long-form guide to the
application model. Its Relations chapter and the headless Classroom example cover the richer
lifecycle; the Todo application below remains the simpler end-to-end compatibility spine.

[`Application data access`](./docs/application-data-access.md) documents the recommended application
path: compose the server graph, expose an explicit read policy, generate browser Entity facades,
author caller-owned Views and Queries, configure React, and reserve Operations for domain behavior.

The package READMEs remain the reference for lower-level exports and framework-specific adapters.
The Todo application below is the executable proof of the complete path.

## Todo application development

Todo Express is the executable framework application for local Ontahi development:

```sh
pnpm todo:dev:local
```

The command builds the example's Ontahi dependencies, regenerates its browser client, builds the
React bundle, starts package compilers in watch mode, and restarts Express when framework output
changes. Open `http://localhost:3001` for the application and
`http://localhost:3001/explorer` for Ontahi Explorer.

Exercise the example as an external npm consumer with:

```sh
pnpm todo:dev:registry
pnpm todo:dev:registry -- --version 0.1.0-alpha.0
```

This creates an isolated copy, replaces workspace dependencies with the selected exact version,
and verifies that packages resolve from the registry store. It does not modify the source example
manifest or repository lockfile. See the
[`Todo Express README`](./examples/todo-express/README.md) for PostgreSQL and API details.

## Developing with a sibling host application

A host project may keep Ontahi in a sibling checkout:

```text
workspace/
├── host-application/
└── ontahi/
```

Build Ontahi from either checkout:

```sh
pnpm -C ../ontahi install
pnpm -C ../ontahi build:packages
```

The host can then install selected package directories through its package manager's local `file:`
or override mechanism. Keep those overrides local when possible. React and other peer dependencies
must continue to resolve from the host application, and committed manifests should return to exact
registry versions before release.

For continuous compilation while running the host:

```sh
pnpm -C ../ontahi dev:packages
```

Local links can expose stale build output and workspace-only resolution. Before merge or release,
pack the affected Ontahi packages and install those tarballs into a clean consumer, or test the
exact published prerelease. The host should run its representative codegen, typecheck, tests, and
production build against those artifacts.

## Two-speed compatibility loop

Use sibling packages for fast coordinated authoring. Use packed artifacts or an exact prerelease
for compatibility evidence.

1. Build and test Ontahi locally.
2. Pack and verify its public artifacts with `pnpm verify:artifacts`.
3. Install the candidate artifacts in a clean host application.
4. Run the host's representative build, codegen, typecheck, and tests.
5. After publication, pin the exact Ontahi version and commit the host manifest and lockfile
   together.

Floating tags such as `alpha`, `next`, or `latest` do not belong in committed consumer manifests or
lockfiles.

## Compatibility ownership

- Ontahi owns missing exports, incomplete artifacts, invalid peer/runtime requirements, and
  behavior that violates its public contract.
- A host application owns imports outside public exports, assumptions about framework source
  layout, and use of behavior absent from its pinned version.
- Deliberate contract changes are coordinated: Ontahi releases the candidate first, then the host
  updates its exact pins and lockfile using its compatibility suite as evidence.

Release mechanics and recovery procedures live in [`RELEASING.md`](./RELEASING.md).
