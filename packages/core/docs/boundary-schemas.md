# Boundary Schemas

This document describes the current schema rules for Ontahi operations and transport boundaries.

This document records the graph-native schema boundary as it exists in the standalone Ontahi
repository.

## Direction

The Ontahi graph model is the semantic source of truth for domain operation inputs and outputs.

That means:

1. every `DomainOperation` declares graph-native `input` and `output` schemas,
2. TypeScript values are inferred with `InferGraphSchemaValue`,
3. runtime validation is compiled privately from the Ontahi schema,
4. Explorer, generated clients, graph output metadata, and JSON Schema inspect Ontahi descriptors,
5. no operation consumer receives or traverses a Zod schema.

Zod remains an internal validation adapter and may still be used by transport-only or infrastructure code. It is not the public operation contract.

## Operation Contracts

Prefer a named graph value for structured input and output:

```ts
import { field, graphSchema, type InferGraphSchemaValue, value } from '@ontahi/core/data-graph';

export const CreateThingInputSchema = value('CreateThingInput', {
  bookSlug: field.slug(),
  title: field.nonEmptyString({ maxLength: 200 }),
  tags: graphSchema.optional(graphSchema.array(field.string())),
});

export const CreateThingOutputSchema = value('CreateThingResult', {
  id: field.id(),
  created: field.boolean(),
});

export type CreateThingInput = InferGraphSchemaValue<typeof CreateThingInputSchema>;
```

The operation references those schemas directly:

```ts
createThing: {
  input: CreateThingInputSchema,
  output: CreateThingOutputSchema,
  run: createThing,
}
```

Use an entity definition directly when the result is an entity snapshot. Use `Entity.view(...)` when the result is an identity-bearing projection. Use `value(...)` for named structures without independent identity.

## Composition

The graph schema surface includes:

1. scalar fields and constraints through `field.*`,
2. `graphSchema.object`, `array`, `nullable`, and `optional`,
3. `literal`, `union`, and `discriminatedUnion`,
4. `record`, `default`, `transform`, and `refine`,
5. `lazy` for recursive structures,
6. `named` and `void` for nominal non-object and empty results.

Use `graphSchema.refine(...)` for application validation that cannot be expressed as a scalar constraint. Give reflected refinements a stable `rule` when clients should be able to identify the rule without executing its predicate.

## Validation And Reflection

Application code can validate without naming the implementation adapter:

```ts
const result = safeParseGraphSchema(CreateThingInputSchema, unknownInput);
```

The neutral result contains either parsed data or structured issues with `code`, `path`, and `message`.

Framework adapters include:

1. `toGraphSchemaDescriptor(schema)` for stable semantic descriptors,
2. `toGraphJsonSchema(schema)` for serializable JSON Schema,
3. `toGraphOutputDescriptor(schema)` for graph identity and normalization metadata,
4. `toZodSchema(schema)` as an internal runtime adapter.

Explorer and generated clients must use the first three surfaces. They must not inspect the generated Zod adapter.

## Transport-Only Boundaries

A route or action that directly exposes a `DomainOperation` should delegate opaque input to operation invocation. The operation owns parsing, validation, and canonical `input_invalid` results.

A transport that does not expose a domain operation may keep its own local schema when the shape is transport-specific, for example:

1. framework path/query parameter parsing,
2. provider webhook envelopes before they are mapped to an operation input,
3. infrastructure configuration,
4. a legacy server action that has not become an Ontahi operation.

Those schemas are adapter details. Do not export them as graph semantics or make Explorer depend on them.

## Runtime Contracts

Usecase pre/post contracts and operation schemas solve different problems:

1. operation schemas validate and describe boundary data,
2. `requires` expresses runtime guards such as authentication or access,
3. pre/post contracts express executable guarantees around authored behavior,
4. concerns wrap execution with telemetry, rate limiting, transactions, or similar policies.

`contractFromZod(...)`, `contractFromTypia(...)`, and `contractFromValidation(...)` remain valid generic adapters for non-operation runtime contracts. Their presence does not make Zod part of the graph model.

## Rule Of Thumb

Ask what owns the meaning of the data:

1. if it is a domain operation input or output, author it in Ontahi,
2. if it is an entity or read model, author it in Ontahi,
3. if it exists only because of a specific transport or provider, keep validation local to that adapter,
4. if several adapters need the same semantic shape, it probably belongs in the graph model.
