# 150a. Selection Factories, Locators, And Refs

Status: done

Canonical ID: `ontahi://plans/150a-selection-factories-locators-and-refs`

Parent: [150. Ontahí Devtools Semantic Console](../current/150-ontahi-devtools-semantic-console.md)

Related work:

1. [116. Ontahí Selection Model](../done/116-ontahi-selection-model.md)
2. [120. Named And Saved Selections](../backlog/120-named-and-saved-selections.md)
3. [128f. Remote Identity-Scoped Entity Mutation Commands](../done/128f-remote-identity-scoped-entity-mutation-commands.md)
4. [Identity And Locator](../../atlas/items/model/identity-and-locator.md)
5. [Ref](../../atlas/items/model/ref.md)
6. [Selection](../../atlas/items/model/selection.md)

## Question And Scope

Do Locators and Refs still need independent responsibilities now that Ontahí has first-class
Selections? Investigate before adding Command syntax to the Console. Simplification is an option,
not a conclusion: neither preserving the current TypeScript methods nor removing the portable Ref
model is predetermined.

The originating requirement is an Operation that accepts one Entity or a set of Entities without
requiring the caller to use IDs. The caller chooses a supported criterion; the Operation owns the
behavior, cardinality requirement, and authority constraints. Locators predated the Selection model
and were conceived as reusable named selections or factories of selections.

This investigation inventories current contracts, compares alternatives, and adds test-only
experiments. It changes no runtime,
public API, protocol, generated facade, or parser. External resolvers are a design stress case, not
an implementation commitment. Broad external-standard research and a Go/Rust CLI are not part of
this repository-contract investigation.

## Outcome — Research Accepted With Bounded Deferrals, 2026-09-09

The investigation and executable experiments are complete. After reviewing the recommendation,
the user asked to update the plan and start. The accepted next implementation is the read-only
TS/declarative dialect proof in Plan 150. Factory declaration API details, external resolvers, and
Ref migration remain bounded follow-ups, not prerequisites or newly shipped public contracts.

Accepted premise from the user: an Entity has **one canonical identity**, possibly composite. It is
fundamental and distinct from the ways a client can find that Entity. Alternate criteria must not
become competing identities.

Recommendation:

1. Make Selection the common membership input and named, pure Selection factories the reusable
   authoring mechanism. Do not add Locator as a separate new semantic algebra.
2. Preserve canonical identity and its portable explicit-member representation. Narrow the
   conceptual meaning of a Ref to an identity reference; retain existing alias-shaped Refs as
   compatibility values until their consumers migrate. Do not silently change current wire types.
3. Keep `by({ factoryName: inputs })` as data-oriented proposed authoring. Factory names select
   meanings, not necessarily Entity Fields. Same-shaped inputs may belong to different factories.
4. Start pure factories with reflected input contracts and declarative expansion to the existing
   Selection AST. No named invocation node or arbitrary resolver callback enters the execution
   protocol in the first slice.
5. Keep external resolution outside that pure factory contract for now. Model it through the
   existing authorized Operation boundary until its effect, evaluation, and snapshot semantics
   merit a separate proposal.

This simplifies **selection authoring**, not Entity identity. The two-dialect experiment can use
existing Read ASTs without waiting for a Ref migration or factory implementation. Commands must
not use factory expansion to bypass the current exact-mutation policy boundary.

### Declaration And Stability — Review Addendum

The declaration matters as much as invocation. Illustrative TypeScript authoring, **not an
implemented or frozen API**, could read:

```ts
Customer.selections({
  loginEmail: {
    input: graphSchema.object({ email: field.string() }),
    scalarInput: 'email',
    select: ({ email }) => Customer.selection(customer => customer.loginEmail.eq(email)),
  },
  archivedSince: {
    input: graphSchema.object({ date: field.datetime() }),
    select: ({ date }) => Customer.selection(customer => customer.archivedAt.gte(date)),
  },
});
```

For such a callback API to be portable, its inputs must be symbolic and its result must compile
to reflected, serializable template data at declaration time. This is a constrained builder, not
arbitrary JavaScript evaluated remotely or a callback run during completion. Plan 120a must prove
the binding model before promising this API. A data-first declaration can expose the same contract.

For example, a proposed template value `{ "parameter": "date" }` could bind the declared `date`
input in a `gte` predicate on `archivedAt`; this is template notation, **not current Selection AST**.
After binding, the existing execution AST contains the concrete datetime value.

Separate three notions: explicit fixed inputs, deterministic expansion for a given declaration
version, and membership that can change as data changes. Fixed `date` does not freeze the selected
Entities. Hidden `now()`, ambient state, and external I/O are not pure substitution; capture the
value explicitly or design a separate evaluated-expression contract. Neither promises a snapshot.

`by` remains the working spelling because it communicates a lookup criterion; `with` was considered
but may suggest Entity Field values or included relations. This is a dialect choice, not a domain
keyword or an irrevocable API decision.

## Current Evidence — 2026-09-09

Baseline: `cfca984`, after the Read Console PR #148 merged.

| Responsibility           | Existing evidence                                                                                                                                                                                                   | Consequence for this research                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declaring locators       | [`definitions.ts`](../../packages/core/src/data-graph/definitions.ts): `EntityLocatorDeclaration`, `normalizeEntityLocatorDeclaration`, `entity`                                                                    | A required non-null conventional `id` supplies `refById`; other names are declared. Strings/field lists become factories with `.fields`; callback factories are also accepted.                                                               |
| Producing client methods | [`operations.ts`](../../packages/core/src/data-graph/operations.ts): `defineClientEntity`; [`entity-mutation-authoring.ts`](../../packages/core/src/data-graph/entity-mutation-authoring.ts)                        | Methods derive from declared locator names. Names are not inferred by parsing `refByX`; they are not language keywords.                                                                                                                      |
| Portable references      | [`ref/model.ts`](../../packages/core/src/data-graph/ref/model.ts): `EntityRef`, `entityRefsEqual`                                                                                                                   | The value contains Entity name and locator values, not the invoked factory name. Equality of reference values is not a proof that two alternate criteria resolve to the same row.                                                            |
| Membership lowering      | [`selection-ast.ts`](../../packages/core/src/data-graph/selection-ast.ts): `lowerSelectionReferences`; [`selection-ast.test.ts`](../../packages/core/src/data-graph/selection-ast.test.ts)                          | Current refs lower to field equality predicates: `and` within a composite locator, `or` across refs. Their retained syntax also records explicit-member intent.                                                                              |
| Operation cardinality    | [`schema.test.ts`](../../packages/core/src/data-graph/schema.test.ts); [`selection.test.ts`](../../packages/core/src/data-graph/selection.test.ts)                                                                  | Selection inputs already transport membership independently of `one`/`many`; the consuming schema reattaches cardinality. Predicates require execution-time checks. The original Operation requirement is already substantially implemented. |
| Named selections         | [`selection-value.ts`](../../packages/core/src/data-graph/selection-value.ts): `named`, `toAst`, `toJSON`                                                                                                           | `.named()` labels an authored Selection. Its name is not in the transported AST; it is not a registered, parameterized factory invocation. Plan 120 owns the broader unresolved direction.                                                   |
| Reflection               | [`schema-descriptor.ts`](../../packages/core/src/data-graph/schema-descriptor.ts): `describeReferenceField`; [`language/index.ts`](../../packages/language/src/index.ts): `reflectSelectionLanguageEntity`          | Reference descriptors expose the chosen identity name/fields, not a complete named-factory input schema. Current Console root reflection lacks its own identity/locator catalog.                                                             |
| Custom resolution        | [`ref/schema-reference.ts`](../../packages/core/src/data-graph/ref/schema-reference.ts); [`ref/schema-reference.test.ts`](../../packages/core/src/data-graph/ref/schema-reference.test.ts)                          | `resolveWith` is runtime metadata on a reference schema node, excluded from reflection and portable data. It is not a portable per-locator resolver registry.                                                                                |
| Snapshot/cache identity  | [`ref/identity.ts`](../../packages/core/src/data-graph/ref/identity.ts); [`client/cache/index.ts`](../../packages/core/src/data-graph/client/cache/index.ts): `createEntityLocatorRefs`                             | Snapshots supply declared locator fields to construct cache aliases; the selected identity also supports canonical reference construction. Arbitrary input schemas need not be derivable from snapshots.                                     |
| Remote write boundary    | [`command-protocol.ts`](../../packages/core/src/data-graph/command-protocol.ts): `hasDeclaredLocator`, `validateRef`; [`entity-mutation-command.ts`](../../packages/core/src/data-graph/entity-mutation-command.ts) | Exact Commands validate declared locator field sets and values. Results reconcile the exact target; replacing this with arbitrary predicates would change the write-policy boundary, not merely spelling.                                    |

Two corrections to an overly simple unification story:

1. One authored reference is not proof of one existing authorized row. Missing rows, duplicate
   matches, and policy scope still matter. An alternate mutable key is not automatically stable
   identity across time.
2. Existing callback factories can construct locator data, but have no general reflected input
   schema or portable execution contract. Their presence does not establish remote external lookup
   support. The ordinary remote path expects declared Entity fields.

## Candidate Authoring Shape — Not Implemented

The data-oriented proposal names a selection factory rather than pretending its inputs are Entity
Fields:

```ts
Customer.by({ supportTicket: { ticketNumber: 'SUP-123' } });
Customer.by({ supportTicket: 'SUP-123' });
```

The scalar form would normalize to the object form only if the declaration explicitly makes that
unambiguous. Input names, types, defaults, nullability, validation, and documentation belong to the
factory contract. `supportTicket` selects a declared alternative; it need not be an Entity Field.

Names cannot be replaced by an input-field uniqueness rule:

```ts
Customer.by({ loginEmail: { email: 'a@example.com' } });
Customer.by({ billingEmail: { email: 'a@example.com' } });
```

Both can accept the same input shape and have different meanings. Preserve the explicit alternative;
do not silently choose the first matching declaration. Whether a `by` object permits multiple
alternatives, and whether that means intersection, is deliberately undecided. Initial examples use
one alternative; they do not grant ordinary object merging Boolean semantics.

## Options To Compare

| Option                                                                                  | What becomes simpler                                                                                 | What must still be justified                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep Locator and Ref; change syntax only                                                | Low migration cost; direct compatibility with exact Commands                                         | Does a named locator add meaning beyond a Selection factory? A nicer spelling alone does not resolve duplicate abstractions.                                                                                                            |
| Named Selection factories for authoring; retain a narrow identity/member representation | One membership vocabulary for clients and Operations; TypeScript methods become optional projections | Define factory reflection and expansion; account for identity, cache aliases, reference fields, exact mutations, and provenance without exposing unnecessary concepts to authors.                                                       |
| Selection is the only public and portable targeting representation                      | Smallest apparent vocabulary                                                                         | Demonstrate lossless replacement of explicit members, identity-based reconciliation, relationship endpoints, schema references, authority restrictions, and existing wire values. Predicate equivalence alone is insufficient evidence. |

Initial hypothesis: investigate the middle option first, while using the last as a counterproposal
to test whether retaining a Ref is actually necessary. This is not approval to add a second named
selector AST or a generic resolver platform.

## Pure Expansion Versus Runtime Resolution

A pure, parameterized criterion such as `archivedSince({ date })` can potentially expand to the
existing comparison predicates. A lookup such as `supportTicket({ ticketNumber })` might need
external I/O before it can produce local membership. These are different execution contracts even
if authoring looks similar.

Before choosing a representation, answer:

1. Is a factory expanded before transport, or invoked by name at the receiver? Expansion reuses the
   current AST but loses its original invocation unless the document/provenance preserves it.
   Receiver invocation needs a versioned declaration, validation, availability, and policy contract.
2. Does authority cover only the resulting membership, or the resolver itself as well? A lookup
   must not gain access merely because its final Selection is authorized.
3. When is it evaluated, with what timeout/cancellation behavior, and is it a live criterion or a
   captured membership snapshot? Do not silently turn a dynamic lookup into a durable snapshot.
4. Can it honestly participate in `and`, `or`, and `not`? External resolution is not automatically a
   pure Boolean leaf; complement requires a defined Entity universe and authority scope.
5. What happens between external lookup and a subsequent write? Exact-one cardinality does not
   create a distributed transaction, freeze membership, or guarantee repeatable resolution.

No provider callback, network credential, or trusted authority becomes part of the AST. If an
external case currently belongs in an Operation, record that boundary instead of treating it as a
failed requirement of the first named-selection implementation.

## Case Matrix And Required Guarantees

| Case                                    | What a candidate must explain                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Conventional ID                         | Construct membership without a fetch; distinguish a supplied identity from an existence assertion.                  |
| Composite identity                      | Preserve all components, types, and exact-target behavior.                                                          |
| Alternate key such as slug              | Distinguish lookup alias from immutable identity; account for alias changes and cache invalidation.                 |
| Same inputs, different factories        | Preserve the chosen name; reject ambiguous shorthand rather than guessing.                                          |
| Parameterized `archivedSince`           | Inputs need not be Entity Fields; define pure expansion and zero/many matches.                                      |
| External support ticket                 | Explicit receiver capability, authority, cancellation, failure, and evaluation/snapshot policy.                     |
| Operation `one` versus `many`           | The consumer owns the requirement; a caller cannot weaken it or hide a mismatch with a limit.                       |
| Explicit members and saved criteria     | Explain loss of intent when lowering refs to predicates; do not confuse saved expressions with captured membership. |
| Reference Fields and relation endpoints | Preserve target Entity, persistence mapping, identity reconstruction, and structural Command semantics.             |
| Exact mutation under policy             | No read-IDs-then-write shortcut, implicit bulk mutation, permission broadening, or automatic retry.                 |

## Research Deliverables And Exit Gate

- [x] Inventory current definitions, reflection, portable values, consumers, and existing tests.
- [x] Record the originating requirement and the distinction between facts and proposed syntax.
- [x] Compare keeping, narrowing, and removing Locator/Ref abstractions.
- [x] Exercise candidate representations against the full case matrix, including an alias change,
      a missing/duplicate match, and an unauthorized resolution.
- [x] Propose what remains public, internal, portable, or compatibility-only; identify actual
      migration costs rather than assuming an internal rename is sufficient.
- [x] Recommend pure expansion versus named receiver invocation for the first supported factory.
- [x] Record the agreed model and any needed bounded implementation/migration follow-up. If a
      decision is deferred, explicitly constrain the next read-only dialect proof to existing ASTs.

The gate is closed with explicit deferrals: preserve current Ref compatibility, keep one canonical
identity, and proceed with existing Read/Selection ASTs only. The factory direction and declaration
requirements guide 120a; its precise public API still requires a separate executable proof.

Only then proceed to the two-dialect read experiment in Plan 150. The research need not implement
external resolvers, saved-selection persistence, or a wholesale Ref migration to close; those may be
explicitly deferred. It must not present an unresolved option as an established domain contract.

## Verification Of This Initial Pass

Read source and ran the existing Core suites for Selection AST, Selection values, schema,
Ref identity/model/schema-reference, Command protocol, Entity mutations, and client cache:
9 test files, 104 tests passed on 2026-09-09. These are baseline contract checks, not proof that the
proposed unification or dialects work. No production code or test assertions were changed.

## Executed Experiments

Executable evidence:
[`selection-factory-research.test.ts`](../../packages/core/src/data-graph/selection-factory-research.test.ts).
Its private fixture interpreter accepts only one named alternative with a single-predicate data
template and optional explicit scalar shorthand. It is not exported, generated, or used by the
Console. A closed fixture is enough to test expansion; it is not a production factory registry or
general-purpose template implementation.

| Experiment                                              | Observed result                                                                                                                                                                                                    | Design consequence                                                                                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Object/scalar input, same schemas under different names | Explicit shorthand normalizes to the object form. `loginEmail` and `billingEmail` accept identical schemas but find different Customers. Ambiguous, unknown, and invalid alternatives are rejected by the fixture. | Names carry semantic choice; input-field uniqueness is unnecessary. Do not infer a factory by shape.                                                                                                           |
| `archivedSince({ date })`                               | A datetime input named `date`, absent from Entity Fields, expands to a `gte` predicate on `archivedAt`. Existing in-memory execution returns the expected members.                                                 | Pure factories can map domain inputs to membership without a new execution AST. The example uses normalized UTC ISO strings; cross-provider/timezone date ordering remains a separate conformance requirement. |
| Ref versus predicate selection                          | Both return the same rows; their authored ASTs differ. Lowering discards explicit-member intent.                                                                                                                   | Runtime equivalence is not sufficient to justify erasing every identity/member representation.                                                                                                                 |
| Alias reassignment                                      | After invalidation and refreshed snapshots, the same slug finds `c2`; the canonical identity still finds `c1`. Cache aliases learn the new association.                                                            | A lookup is not stable identity. This test does not claim automatic detection of an unseen external alias change.                                                                                              |
| Composite identity                                      | Cache normalization retains the full composite key and rejects missing identity data. Current stored Reference Field lowering rejects composite target identity.                                                   | Preserve composite identity in the model without claiming every provider/storage projection supports it today.                                                                                                 |
| Consumer `one`, missing/duplicate matches               | Valid predicate inputs rehydrate with consumer cardinality; ordinary reads reject zero/two matches. Exact-cardinality in-memory mutations reject without altering rows.                                            | Factories select; consumers constrain cardinality. Atomicity evidence here is in-memory only.                                                                                                                  |
| Field permission and row scope                          | A disallowed expanded filter is rejected before execution. An allowed criterion intersects with receiver scope and returns only the authorized row through the real dispatcher/runtime.                            | Factory names cannot grant access to otherwise forbidden predicates.                                                                                                                                           |
| External input as a legacy Ref                          | `{ supportTicket: { ticketNumber } }` is rejected by current Selection validation and Command validation before mutation execution.                                                                                | External resolution is not hidden support in existing Locators; do not add I/O to the fixture to pretend the protocol has it.                                                                                  |
| Reference Field storage                                 | Canonical ID reference lowers to its storage value; slug-only reference does not.                                                                                                                                  | Relationship persistence needs identity, not arbitrary membership criteria. Existing relationship suites provide the structural baseline.                                                                      |
| Exact Command result reconciliation                     | A result repeating the requested alias Ref passes; replacing it with an ID Ref for the same known row fails the current exact-target validator.                                                                    | Narrowing Ref semantics needs an explicit compatibility migration, not a cosmetic rename.                                                                                                                      |
| Read shaping and cardinality                            | In-memory `one` over two rows fails, but adding `limit(1)` returns one row with `one` still attached.                                                                                                              | Current runtime validates shaped rows. This is not proof of unique original membership; tracked separately in 116a.                                                                                            |

The initial harness needed a valid Read policy (`maxLimit` and cardinalities) and narrower fixture
types to match current Core contracts. Those were experiment corrections, not production defects.

Verification after the experiments: **21 new cases pass; full Core suite 908 tests / 112 files
passes; Core typecheck, lint, and build pass.** No production implementation, public exports,
dependencies, coverage thresholds, or existing assertions changed. No cross-provider live-database,
external-service, UI, or new dialect proof was run.

## Proposed Model And Portable Boundary

There are three distinct meanings, not three interchangeable ways to express a lookup:

1. **Identity:** one canonical key for an Entity, potentially composed of several fields. It is
   what cache reconciliation and persisted references address. It is not an existence proof.
2. **Selection:** membership, explicit or predicate-defined, which may resolve to zero/one/many.
   Cardinality requirements belong to its consumer, not to the number of fields or the factory name.
3. **Query:** a read over membership with result shape, ordering, limits, and terminal intent.

A named factory is a declaration that produces Selection meaning, not a fourth target-value type.
Its initial public contract should include a name scoped to an Entity, a reflected input schema,
documentation, and a pure declarative expansion. The accepted identity remains independent of
these declarations. A factory could yield identity-based explicit membership, but a one-row lookup
or a unique-looking input does not itself establish canonical identity.

Illustrative invocation normalization, **not a new wire schema**:

```json
{
  "loginEmail": { "email": "a@x.test" }
}
```

The fixture expands that authoring datum to the already-supported execution value:

```json
{
  "kind": "selection",
  "entityName": "ResearchCustomer",
  "expression": {
    "kind": "predicate",
    "fieldName": "loginEmail",
    "operator": "eq",
    "value": "a@x.test"
  }
}
```

No TypeScript callback needs to cross a boundary. A future Go/Rust authoring adapter can consume
the same reflected declaration and expansion data; native TS methods are optional conveniences.
The fixture proves only a single predicate. Choosing a general parameter binding representation
must first compare the existing Model Expression machinery; it currently has `input-ref`, not a
general scalar-parameter substitution contract. Do not copy the fixture into public Core by default.

The initial `by` proposal allows exactly one alternative. Composition is explicit Selection
composition. No implicit intersection of object keys, overload resolution by matching inputs, or
heuristic scalar conversion. Built-in identity syntax and its name-collision policy should be
settled with the authoring contract; this study does not reserve `id` or `identity` as new keywords.

### What Expansion Does Not Preserve

The execution AST intentionally does not know which factory authored an equivalent criterion.
`.named()` does not change that. Keep original invocation/name/arguments in the editable document
and recovered authoring structure where needed. Do not promise to reverse arbitrary predicates
back into a unique factory invocation.

For future dialect switching with factories, choose explicitly between preserving the invocation
through its authoring representation and visibly expanding it to ordinary predicates. Semantic
round-trip equality alone does not preserve labels, factory intent, or future factory-version
behavior. The first TS/declarative experiment avoids this additional problem by covering existing
Reads only. Saved expressions and saved factory invocations also have different evolution behavior;
Plan 120 retains that lifecycle work.

### External Lookup Boundary

An external support-ticket lookup can later have similar authoring syntax, but cannot inherit pure
Selection algebra by appearance. For now, use an explicit authorized Operation to resolve its
result; no implicit external request occurs during parsing, completion, formatting, or lowering.
An Operation can return canonical members, or orchestrate work under its existing guarantees.

If a future named receiver resolver is introduced, it needs an explicit identity/version, input
validation, capability and authority checks before I/O, cancellation/timeouts, and documented
snapshot/re-evaluation semantics. Complement and repeated evaluation cannot be treated as harmless
rewrites of a pure predicate. Resolving externally and then mutating locally is not one atomic
transaction; this investigation neither implements nor proves such a transaction.

## Compatibility And Migration Recommendation

| Surface                                     | Recommendation                                                                                                                                           | Migration cost / gate                                                                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entity identity declaration                 | Keep exactly one canonical identity, including composite keys. Eventually describe it directly by fields rather than only through a locator method name. | Existing definitions, codegen, reflection, cache, and adapters currently read `identityLocatorName`; compatibility must remain until these consumers migrate together.              |
| Selection and Operation `one`/`many` inputs | Keep as primary membership contract.                                                                                                                     | No new target wrapper; retain validation, authority intersection, and consumer cardinality. Audit shaping separately in 116a.                                                       |
| Pure named lookups                          | Add reflected Selection factories as optional authoring.                                                                                                 | Expand to current AST; receiver validates expanded fields/scope. This does not grant a named capability with stronger authority.                                                    |
| Canonical identity Ref                      | Retain the semantic role and current portable representation initially.                                                                                  | A later name simplification is possible, but identity/member intent, cache keys, and Reference Fields must remain expressible.                                                      |
| Alias-shaped Refs / `refByX`                | Keep as legacy adapters for now; treat their meaning as lookup criteria, not alternate canonical identities.                                             | Existing clients, input normalization, cached aliases, relationship endpoints, and exact result reconciliation depend on them. No silent reinterpretation or immediate deprecation. |
| Exact remote Commands                       | Preserve current target/policy algebra.                                                                                                                  | General Selection writes are not authorized by this research. No expand-read-IDs-write workaround.                                                                                  |
| Named external resolver                     | Defer; explicit Operation boundary first.                                                                                                                | New capability/version/lifecycle semantics require their own design, not an extra branch in the pure expander.                                                                      |

The recommendation rejects both extremes: merely renaming `refByX` leaves duplicate responsibilities
unexamined; deleting every Ref because its membership can be expressed by predicates loses actual
identity and authoring guarantees. Narrow the distinction and migrate deliberately.

## Follow-Ups And Proposed Gate Decision

1. [116a. Selection Cardinality Before Read Shaping](../next/116a-selection-cardinality-before-read-shaping.md)
   records the concrete in-memory limit finding. Confirm the expected boundary and prove adapters
   independently; do not silently change it in this test-only research.
2. [120a. Pure Named Selection Factory Contract](../backlog/120a-pure-named-selection-factory-contract.md)
   scopes an optional later implementation. It is not required to begin the two-dialect Read proof,
   and does not include wholesale Ref removal or external resolution.
3. Accepted decision for Plan 150: proceed next with TS-like/declarative projections over **existing
   Read/Selection bodies only**. No new factories, Ref wire
   migration, Commands, or Operation syntax in that experiment. Preserve all current terminal
   restrictions and do not introduce a `one + limit` combination.

## Next Sequence

1. Complete this model investigation and its explicit decision gate (done).
2. Explore TS-like and declarative projections over the existing small Read language. Require equal
   canonical requests, semantic round-trips, safe draft switching, and the existing rich controls.
3. Add Commands using the resulting model and the existing authorized execution boundary.
4. Add Operation invocation, keeping client-selected membership and consumer cardinality intact.
