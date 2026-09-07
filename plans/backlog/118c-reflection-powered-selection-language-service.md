# 118c. Reflection-Powered Selection Language Service

Status: backlog

Canonical ID: `ontahi://plans/118c-reflection-powered-selection-language-service`

Shapes: [Ontahí Semantic Interaction Language](../../atlas/items/semantic-interaction-language.md)

Depends on: [118b Selection Expression Algebra](../done/118b-selection-expression-algebra.md)

Related plan: [126 Ontahí Runtime Data Reflection](../research/126-ontahi-runtime-data-reflection.md)

Followed by: [118d Projectional Selection Editor Experiment](./118d-projectional-selection-editor-experiment.md)

## Architectural Question

Can one editor-neutral semantic analysis power context-sensitive completion, highlighting, hover,
and diagnostics from Ontahí reflection while keeping static meaning, runtime capability, and
authority distinct?

## Summary

Turn the lowering service into a useful language service. Explorer supplies the selected Entity's
static reflected facts; CodeMirror projects the resulting assistance. The headless API remains
usable by a CLI, tests, Devtools, or another editor adapter.

The initial completion journey is:

```text
|                 → reflected Fields, all, none, not
completed |       → =, in
priority |        → =, in, <, <=, >, >=
status = |        → reflected enum values
completed = |     → true, false
```

## Scope

1. Stabilize a narrow language-reflection input covering Entity identity plus Field name, scalar
   type, value type, nullability, enum values, and source-independent documentation where present.
2. Add a cursor-context API derived from the recovered syntax tree; do not infer context with a
   second regular-expression parser.
3. Add editor-neutral completion items for valid Fields, keywords, operators, Boolean values, enum
   values, and punctuation/list continuations.
4. Add semantic classifications for resolved Entity context, Fields, operators, values, and
   invalid identifiers.
5. Add hover/help results that explain the reflected Field type and canonical operator meaning.
6. Re-run analysis when either the document or supplied Entity reflection changes. Handle stale
   asynchronous completion results explicitly.
7. Project completion, semantic highlighting, hover, and diagnostics through
   `@ontahi/language-codemirror`; keep CodeMirror types out of the headless package.
8. Let Explorer adapt its existing `ExplorerEntityDetail` into the service without moving
   Explorer contracts into the language package.
9. Define an optional execution-affordance input that may narrow suggestions when a host already
   has authority-safe operator capability metadata. Its absence must not turn a semantically valid
   expression into an intrinsic semantic error.
10. Keep Graph Read `access_denied` and unsupported runtime capabilities in the execution channel;
    hidden or omitted completion remains an affordance, never authorization.

## Non-Goals

1. No dynamic Entity data lookup, Ref search, cardinality estimate, field distribution, or common
   value query. Those require the authority and cost semantics of Runtime Data Reflection.
2. No LSP process or wire protocol. The in-process API may later be wrapped by one.
3. No formatter, rename, go-to-definition, saved documents, or multi-file workspace.
4. No new reflection taxonomy in Core unless implementation proves the current structural input
   cannot remain narrow and framework-owned.
5. No projectional widgets; Plan 118d consumes the service output for that experiment.

## Acceptance Checklist

- [ ] Empty/root context suggests only reflected Fields and valid root keywords for the selected
      Entity.
- [ ] Operator completion is filtered by the compatibility matrix established in Plan 118b.
- [ ] Boolean and enum value completion inserts syntactically valid text and immediately lowers to
      the expected Selection.
- [ ] Suggestions never include Fields from a previously selected Entity after context changes.
- [ ] Syntax and semantic highlighting remain distinguishable, including an identifier that parses
      but does not resolve.
- [ ] Hover reports Field type/nullability and operator meaning without importing Explorer UI.
- [ ] The same headless completion/diagnostic fixtures run without DOM or CodeMirror.
- [ ] CodeMirror adapters contain only projection logic and map headless source offsets exactly.
- [ ] Runtime access rejection remains visible as execution failure and is not cached as a language
      diagnostic.
- [ ] No dynamic data query occurs for the supported Boolean/enum completion journey.

## Verification

1. Cursor-position matrix tests at root, Field, operator, value, list, group, and recovered-error
   positions.
2. Headless tests for reflection replacement and stale asynchronous results.
3. CodeMirror interaction tests for completion insertion, lint refresh, semantic marks, and hover.
4. Explorer tests that switch Entity context and preserve the correct language-service instance.
5. A Todo browser demonstration plus affected-package typecheck, lint, test, build, format,
   Changeset, and artifact checks.

## Exit Gate

Plan 118d may start when all assistance is demonstrably derived from one recovered syntax tree and
one semantic resolver, and when no editor or Explorer type has entered the canonical or headless
semantic boundary.
