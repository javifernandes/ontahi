# `@ontahi/codegen`

Build-time analysis and projection tooling for Ontahi application declarations.

## Conventional browser client

Apps using the conventional `src/graph.ts` composition root and
`src/generated/client-entities.ts` output need no generation script:

```sh
pnpm add --save-exact --save-dev @ontahi/codegen@alpha
```

```json
{
  "scripts": {
    "codegen": "ontahi-codegen",
    "codegen:check": "ontahi-codegen --check"
  }
}
```

```sh
pnpm codegen
```

Use `--watch` during development. Hosts that keep different paths can pass `--graph` and
`--output`. Generated source is valid without a formatter; projects using oxfmt can opt into their
local binary with `--format oxfmt`.

```sh
ontahi-codegen --graph server/application.ts --output browser/generated/entities.ts
```

The executable owns application analysis, diagnostics, browser-safe projection, deterministic
writes, drift checks, and watch dependencies. A host only configures actual deviations from the
convention.

Generated client Entity facades expose the recursive `.view(name, shape)` factory from their
browser-safe Entity schema. Applications define Views in client source and pass them to Query,
Selection, or projectable Operation `.as(view)` APIs. Views are not registered in the server graph
or emitted by codegen.

## Lower-level API

This package evaluates the supported TypeScript/JavaScript DSL shape into a serializable application model that can be consumed by generic projections and runtime-specific emitters. Application declarations, target selection, alias values, and output paths remain host-owned.

```js
import { analyzeOntahiApplication, createFileSystemSourceLoader } from '@ontahi/codegen';

const application = analyzeOntahiApplication({
  graphApiPath: './src/graph/api.ts',
  sourceLoader: createFileSystemSourceLoader({
    rootDir: process.cwd(),
    aliases: { '@': './src' },
  }),
});
```

The application model contains every graph entity reference, all analyzed operations, durable tasks, ingress declarations, structured diagnostics, and source dependencies. `clientEntities` is an explicit browser-safe projection containing only bridge-exposed operations; it is not the complete operation model.

The package also owns browser-safe client entity and lightweight task-definition renderers. Its optional runner owns shared analysis, deterministic writes, drift checks, target selection, CLI argument parsing, and dependency-aware watch lifecycle while hosts inject target rendering and formatting policy.

```js
import { createOntahiCodegenRunner } from '@ontahi/codegen/runner';

const runner = createOntahiCodegenRunner({
  targets,
  analyzeApplication: sourcePath =>
    analyzeOntahiApplication({ graphApiPath: sourcePath, sourceLoader }),
  renderTarget: ({ application, target }) => target.render(application),
  formatOutput: ({ outputPath, source }) => formatHostSource(outputPath, source),
});

await runner.runCli();
```

Runtime-specific emitters remain in their adapter packages. Hosts still own their declarations, target/output configuration, aliases, formatter choice, and generated files.
