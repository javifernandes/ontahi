# Ontahi

[![CI](https://github.com/javifernandes/ontahi/actions/workflows/ci.yml/badge.svg)](https://github.com/javifernandes/ontahi/actions/workflows/ci.yml)
[![Codecov](https://codecov.io/gh/javifernandes/ontahi/graph/badge.svg?token=Q6uxUP5uQS)](https://codecov.io/gh/javifernandes/ontahi)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=javifernandes_ontahi&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=javifernandes_ontahi)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=javifernandes_ontahi&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=javifernandes_ontahi)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=javifernandes_ontahi&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=javifernandes_ontahi) ![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/javifernandes/ontahi?utm_source=oss&utm_medium=github&utm_campaign=javifernandes%2Fontahi&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

Ontahi is an executable ontology: a language for naming the world of a software system so that the
world can be executed.

Website: [https://ontahi.org](https://ontahi.org)
Developer Documentation: [https://bookops.net/ontahi-library-ontahi-for-dev/](https://bookops.net/ontahi-library-ontahi-for-dev/)

## Workspace

- `apps/www`: the static website for `ontahi.org`.
- `packages/*`: the public `@ontahi/*` framework packages.
- `examples/todo-express`: an executable application using the framework without BookOps.
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

Run Todo Express with:

```bash
pnpm todo:dev
```

## Public alpha policy

The ten framework packages currently share the lockstep version `0.1.0-alpha.0`. They require
Node.js `>=20.19.0`, publish publicly with npm provenance, and carry the Apache-2.0 `LICENSE` and
`NOTICE` in every artifact.

Internal `workspace:*` dependencies are rewritten by `pnpm pack` to the exact lockstep version. A
public alpha release therefore publishes the complete changed dependency closure.

## Verify artifacts

```bash
pnpm verify:artifacts
```

This builds and packs every package, validates public metadata and legal files, installs the
tarballs into fresh consumers, typechecks every public entrypoint, and runs Core plus Express
runtime smokes.

BookOps uses installed Ontahi artifacts as its compatibility boundary. A sibling checkout can be
linked for fast coordinated authoring, but packed artifacts or exact registry versions remain the
merge and release proof. See [`DEVELOPMENT.md`](./DEVELOPMENT.md).

## License

Code is licensed under the Apache License 2.0.

Books and long-form editorial material may use a separate content license.
