# `@ontahi/codegen`

Build-time analysis and projection tooling for Ontahi application declarations.

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
