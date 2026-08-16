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

The application model contains every graph Entity and registered View reference, reachable named
Operation Values, all analyzed Operations, durable tasks, ingress declarations, structured
diagnostics, and source dependencies. `namedDefinitions` is the serializable nominal registry used
to reject Entity/View/Value name collisions. `clientEntities` is an explicit browser-safe projection
containing only bridge-exposed Operations; it is not the complete Operation model.

Views registered through `defineGraphApi({ views })` are emitted once as exported browser-safe View
definitions. Named Values reachable through Operation inputs or outputs are emitted once as
module-private bindings and reused by every generated Operation contract.

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
