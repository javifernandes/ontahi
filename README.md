# Ontahi

[![CI](https://github.com/javifernandes/ontahi/actions/workflows/ci.yml/badge.svg)](https://github.com/javifernandes/ontahi/actions/workflows/ci.yml)
[![Codecov](https://codecov.io/gh/javifernandes/ontahi/graph/badge.svg?token=Q6uxUP5uQS)](https://codecov.io/gh/javifernandes/ontahi)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=javifernandes_ontahi&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=javifernandes_ontahi)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=javifernandes_ontahi&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=javifernandes_ontahi)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=javifernandes_ontahi&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=javifernandes_ontahi) ![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/javifernandes/ontahi?utm_source=oss&utm_medium=github&utm_campaign=javifernandes%2Fontahi&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

Ontahi is an executable ontology: a language for naming the world of a software system so that the
world can be executed.

Website: [https://ontahi.org](https://ontahi.org)

Developer documentation starts in [`DEVELOPMENT.md`](./DEVELOPMENT.md) and the package READMEs.

## Workspace

- `apps/www`: the static website for `ontahi.org`.
- `packages/*`: the public `@ontahi/*` framework packages.
- `examples/todo-express`: a standalone executable application using the public framework surface.
- `fixtures/package-consumer`: the clean package-consumer proof.

## Local Development

```bash
pnpm install
pnpm build:packages
pnpm test:packages
```

Run the website with:

```bash
pnpm dev
```

Run Todo Express against the local framework source with:

```bash
pnpm todo:dev:local
```

Run an isolated copy against the exact published version declared by this checkout with:

```bash
pnpm todo:dev:registry
```

`pnpm todo:dev` remains the short alias for local-source development. See the
[`Todo Express README`](./examples/todo-express/README.md) for explicit-version and PostgreSQL
options.

## Contributing

Start with [`DEVELOPMENT.md`](./DEVELOPMENT.md). Repository guidance for code style, testing,
change scope, bug fixing, and public package changes lives under [`docs/`](./docs/). Automated
coding agents must also follow [`AGENTS.md`](./AGENTS.md).

## Public alpha policy

The ten framework packages share one exact lockstep prerelease version. They require Node.js
`>=20.19.0`, publish publicly with npm provenance, and carry the Apache-2.0 `LICENSE` and `NOTICE`
in every artifact.

A public package change must include a changeset (`pnpm changeset`). Merging the change updates the
ready `Release Ontahi <version>` pull request but does not publish yet. Merging that generated
release pull request verifies and publishes the lockstep version, then creates its Git tag and
GitHub prerelease. No package version is edited by hand.

Internal `workspace:*` dependencies are rewritten by `pnpm pack` to the exact lockstep version. A
public alpha release therefore publishes the complete changed dependency closure.

The workflow validates all ten artifacts and publishes from `main` through npm OIDC trusted
publishing. Its manual dispatch is retained for dry-runs and recovery. See
[`RELEASING.md`](./RELEASING.md) for the short contributor and maintainer flows.

## Verify artifacts

```bash
pnpm verify:artifacts
```

This builds and packs every package, validates public metadata and legal files, installs the
tarballs into fresh consumers, typechecks every public entrypoint, and runs Core plus Express
runtime smokes.

Host applications should use installed Ontahi artifacts as their compatibility boundary. A sibling
checkout can be linked for fast coordinated authoring, but packed artifacts or exact registry
versions remain the merge and release proof. See [`DEVELOPMENT.md`](./DEVELOPMENT.md).

## License

Code is licensed under the Apache License 2.0.

Books and long-form editorial material may use a separate content license.
