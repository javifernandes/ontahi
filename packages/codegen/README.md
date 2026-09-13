# `@ontahi/codegen`

Build-time analysis and projection tooling for Ontahi application declarations.

See [Application Data Access](../../docs/application-data-access.md) for codegen's place between the
server application graph and caller-owned browser Views and Queries.

## Conventional browser client

Entity `selections: ({ self }) => ({ parts: self.nodes.where(n => n.type.eq('part')) })`
declarations compile to portable contextual templates. Generated Selections keep named properties,
target field types and deferred membership, including the `Book → parts → chapters` self-relation
case. The current grammar accepts `self.relation` or one literal `where` predicate
(`eq/lt/lte/gt/gte` or parameterless `isNull()`); opaque callbacks are diagnosed, never imported
into browser code.
See [Core contextual factories](../core/README.md#experimental-contextual-selection-factories).

`self.nodes.as(Part)` and `self.nodes.where(predicate).as(Part)` additionally name a classified
destination. The target must resolve to a literal Entity variant declaration. Codegen uses the
same static variant-contract analysis as Operation inputs and emits a portable descriptor on the
contextual template; it does not import the server's Part value. Generated `parts.chapters` reads
retain narrowed result types and the base identity, including self relations. Invalid or opaque
targets are diagnosed. These hops produce unbound read-only VariantSelections, not mutable bound
Selections. Register the variants and relation grants separately in the receiver's read policies.

Exported `withSelectionFactories(entity({ ... }), declarations)` definitions preserve their typed
`by` method and reflected input/output/template contract in generated browser Entities. A local
Entity variable and named object-literal declarations are supported too. The declaration map must
be portable literal data with Core `field`/`graphSchema.object` constructors; arbitrary expressions,
callbacks and server-only dependencies are diagnosed rather than copied to the browser. See the
[Core factory examples](../core/README.md#experimental-named-selection-factories) and Todo's `Tag`.

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

### Named Value dependencies

Named Operation input/output Values project their static dependency closure: local or imported
Values (including aliases), scalar schema constants, object spreads and `.fields` reuse. The
application's `namedDefinitions` includes the nested Values; the client renderer emits them in
dependency order and reuses one binding per nominal name. Pass that inventory along with `entities`
and `schemaEntities` when calling `renderGeneratedClientEntityModule` directly.

Receiver-bound `self.one()`, `self.many()` and `self.view(...)` inside these Values use the generated
Entity schema, without importing the server Entity or altering field names and string literals.
Unresolved dependencies, cycles and duplicate nominal definitions are diagnosed. Projection follows
static schema data, not arbitrary JavaScript. Server-only Values are inventoried without requiring
browser-portable implementations and are not emitted unless reached by a client-visible contract.

For Operation inputs, `graphSchema.transform` and `refine` stay in the receiving runtime. Generated
clients describe the pre-processing wire shape, so a string-to-number transform still accepts a string
from the caller. Analysis records the portable `inputSchemaProjection` and its `serverProcessing`
markers; generated input comments identify partial validation. Client parsing is not authoritative:
post-transform refinements must not reject the unprocessed input. Defaults wrapping transformed
schemas remain server-side, with optional wire inputs rather than defaults of the processed type.

Codegen neither executes nor copies the callbacks. Transformed/refined outputs require an explicit
portable output contract; codegen cannot infer the result schema from a callback's input. Opaque
`lazy` or custom client-schema dependencies remain diagnosed. Client previews and portable transform
expressions are deferred.

### Experimental classified Operation inputs

`graphSchema.existingRef(Chapter)` inputs are projected when Chapter resolves to a literal
`ContentNode.variant('Chapter', { discriminator: { type: 'chapter' } })` declaration. Local and
imported declarations (including import aliases), direct optional/nullable wrappers and named
object inputs are supported. Named `value('Input', { chapter: graphSchema.existingRef(Chapter) })`
inputs also preserve their name and share one generated schema when reused across Operations.
Local, inline and imported/aliased Values support direct optional/nullable participant fields.
Operation config shorthand `{ input }` preserves that input too.

Codegen extracts a data descriptor and emits the variant on the **generated base schema**. The base
must be an `entity({ name, fields })` declaration included in the generated graph; missing bases
are diagnosed rather than imported from server source. Custom `.resolveWith(...)` resolvers remain
server-owned and are omitted from client code. Canonical Ref identity and the reflected variant
requirement survive generation, without implying that client validation proves membership.

Opaque declarations, nested existing participants, portable conditions on variant inputs and
portable `graphSchema.ref(Variant)` are
not supported by this slice. Standalone generated variant exports remain a follow-up. Registered
variant read roots and REPL autocomplete are discovered through receiver capabilities; generated
input schemas are not a new read authorization surface.

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
