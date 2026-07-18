# Ontahi

Ontahi is an executable ontology: a language for naming the world of a software system so that the world can be executed.

This repository starts with the public website and leaves room for the framework packages, books, and documentation to move in as the boundaries settle.

Website: https://ontahi.org

Repository: https://github.com/javifernandes/ontahi

## Workspace

- `apps/www`: the static website for `ontahi.org`.
- `books`: future home for the Ontahi books and style language.
- `packages`: future home for the `@ontahi/*` packages.

## First Essay

The current site points to the first Ontahi Library essay:

- [Why Systems Evolve](https://bookops.net/ontahi-library-01-living-systems/living-systems/why-systems-evolve)

## Local Development

```bash
pnpm install
pnpm --filter @ontahi/www dev
```

## Static Export

```bash
pnpm --filter @ontahi/www build
```

The static site is emitted to `apps/www/out`.

## License

Code is licensed under the Apache License 2.0.

Future books and long-form editorial material may use a separate content license.
