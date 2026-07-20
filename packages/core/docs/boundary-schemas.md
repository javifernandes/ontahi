# Boundary Schemas

This document describes the current house style for action and usecase boundaries.

It lives in `@ontahi/core` because the generic validation adapters and shared schema atoms live here today. Some examples still reference BookOps files because BookOps is the first host application using the framework.

For the broader extraction direction, see [Plan 100: Ontahi Framework Extraction](../../plans/current/100-ontahi-framework-extraction.md).

## Direction

Use `zod` schemas as the source of truth for boundary-shaped inputs.

That means:

1. server actions should declare `.inputType(...)` with a Zod schema
2. usecase contracts should prefer `contractFromZod(schema)` when the usecase boundary matches the action boundary
3. the TypeScript input type should usually be `z.infer<typeof SomeSchema>`

The intent is to get one declaration that supports:

1. runtime validation
2. inferred TypeScript types
3. colocated user-facing validation messages when needed
4. JSON Schema / OpenAPI generation for HTTP routes and internal API reference tooling

## Why Zod At Boundaries

`@ontahi/core` already has generic contract support in the runtime and can also adapt validator functions directly.

But for boundaries, Zod is the preferred default because it gives us:

1. a real runtime schema object
2. a natural place for messages
3. a simple type inference path
4. better reuse for documentation-oriented surfaces

This is a boundary guideline, not a repo-wide rule for every type.

## Scope

Prefer this style for:

1. `web/src/app/actions/*`
2. usecase input contracts when the boundary is action-like or transport-like
3. route handler request/response contracts that may later feed OpenAPI and internal API reference tooling

Do not force it for:

1. internal domain result shapes that do not need runtime parsing
2. low-level helper types that are only compile-time concepts
3. every model object in the codebase

## House Style

### 1. Schema first, type inferred

Prefer:

```ts
export const CreateThingInputSchema = z.object({
  bookSlug: slug,
  partSlug: nullable(slug),
  title: nonEmptyString,
});

export type CreateThingInput = z.infer<typeof CreateThingInputSchema>;
```

Avoid:

1. a plain interface plus a separate handwritten schema when one source of truth would do
2. an action-level validator that duplicates a nearby boundary schema

### 2. Use shared generic schema atoms from `@ontahi/core/model/zod`

Current shared helpers include:

1. `id`
2. `slug`
3. `nonEmptyString`
4. `index`
5. `nonNegativeInteger`
6. `boundedPositiveInteger(max)`
7. `nullable(schema)`
8. `optionalNullable(schema)`

Use them when the concept is genuinely generic.

Do not invent a shared helper for a one-off product rule too early.

### 3. Only add custom messages where they add product value

Generic structural failures can usually rely on Zod defaults.

Add custom messages when:

1. the field is user-authored and the message will be shown directly
2. the default message is too technical
3. the product wording matters

Example:

```ts
userInput: z
  .string({ error: 'userInput is required.' })
  .min(1, 'userInput is required.')
  .max(4000, 'userInput exceeds 4000 characters.')
```

Avoid repeating low-value messages like:

1. `"exerciseIndex is invalid."`
2. `"bookSlug is invalid."`

when the default schema error is already good enough.

### 4. Reuse one schema across action and usecase when the boundary is truly the same

Prefer:

```ts
.inputType(CreateThingInputSchema)
```

and:

```ts
contracts: {
  pre: contractFromZod(CreateThingInputSchema),
}
```

when the action input and usecase input are the same contract.

Do not force one schema if:

1. the action transport shape and the business boundary shape are meaningfully different
2. one layer needs defaults or normalization that the other should not see directly

### 5. Normalize once after parsing when optional inputs are intentional

If a schema intentionally allows omitted input, normalize it once near the boundary.

Example:

```ts
const normalizedInput = input ?? {};
```

Do not spread optionality checks through the whole body if one normalization step is enough.

## Route Contracts

Route contracts should use the same Zod-first boundary style.

That means:

1. path params use a Zod schema
2. query params use a Zod schema
3. request bodies use a Zod schema when present
4. response payloads use Zod schemas when we want them in the generated reference

Current route contract shape lives in:

1. [web/src/lib/openapi/document.ts](../../web/src/lib/openapi/document.ts)
2. [web/src/lib/openapi/registry.ts](../../web/src/lib/openapi/registry.ts)

Example:

```ts
const SearchBookPathParamsSchema = z.object({
  bookSlug: slug,
});

const SearchBookQuerySchema = z.object({
  q: nonEmptyString,
  language: nonEmptyString.optional(),
});

const SearchSuccessResponseSchema = z.object({
  results: z.array(
    z.object({
      objectID: z.string(),
      bookSlug: z.string(),
      excerpt: z.string(),
    })
  ),
});

export const bookSearchRouteContract: ApiRouteContract = {
  method: 'GET',
  path: '/api/books/{bookSlug}/search',
  summary: 'Search indexed book content',
  tags: ['books'],
  visibility: 'public',
  pathParams: SearchBookPathParamsSchema,
  query: SearchBookQuerySchema,
  responses: {
    200: {
      description: 'Matching indexed search results.',
      schema: SearchSuccessResponseSchema,
    },
  },
};
```

Preferred stance:

1. route contracts and action schemas should both be Zod-first
2. OpenAPI is for `app/api/**` routes, not server actions
3. if the same boundary concept exists in several places, extract shared schema atoms before extracting large shared object schemas

## Relationship To Other Validation Paths

Ontahi still supports:

1. `contractFromValidation(...)`
2. `contractFromTypia(...)`

Those are still valid generic seams.

Current preferred stance:

1. Zod for action and usecase boundaries
2. generic validator adapters when a boundary already comes from a different runtime source
3. plain types for non-runtime domain modeling where validation is not needed
