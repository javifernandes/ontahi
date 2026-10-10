---
id: ontahi.model.semantic-program-kernel
kind: concept
title: Semantic Program Kernel
parent: ontahi.model
status: shaping
horizon: later
supports:
  - ontahi.model.query
  - ontahi.model.command
  - ontahi.model.domain-operation
  - ontahi.model.durable-operation
  - ontahi.model.operation-interaction
  - ontahi.durable-workflows
  - ontahi.runtime-protocol
relatedPlans:
  - ontahi://plans/154-semantic-program-kernel-and-distributed-evaluation
  - ontahi://plans/154d-semantic-mutation-journal-and-query-invalidation
---

The Semantic Program Kernel is the shaping hypothesis that Ontahí Reads, Commands, Operation
Invocations, durable waits, and observations are projections of a smaller typed evaluation model.
A semantic program may be partially bound, completed through typed substitution, evaluated where
the required capability lives, suspended for an event or Interaction, and observed as a live value
across runtime boundaries.

Existing canonical requests remain the executable wire forms for closed programs. The kernel does
not replace their authority, policy, validation, consistency, or lifecycle boundaries. A runtime
evaluates only the terms for which it owns declared capabilities and may delegate unresolved work
without treating transport or provider formats as semantic truth.

The hypothesis also separates addressable participants from the programs they evaluate. An
Assistant may contribute grounding, presentation, provider selection, context, and execution
strategy; a Session relates participants over time; each requested or autonomous unit of work has
its own inspectable Program Run. None of those identities grants authority by itself.

This item records a research direction rather than an accepted universal AST or public TypeScript
API. Plan 154 owns the incremental proofs for typed holes, substitution, Reads and Commands,
reactive evaluation, durable waits, distributed evaluation, Assistants, Sessions, and tooling. The
item may be narrowed, split, or removed as those proofs produce evidence.

The first internal proof represents an open Operation application as one argument tree containing
value and named Hole terms. Hole types come from their positions in the Operation's existing input
schema rather than copied metadata. A substitution is validated against that same schema, and only
a closed application can lower to the existing canonical `OperationInvokeRequest`. The experiment
is intentionally not exported while later proofs test whether the boundary generalizes.

The first resolution proof connects that representation to the application graph and authorized
Graph Reads without granting new authority. A direct Entity Ref Hole derives its target and
canonical identity from the registered Operation schema, discovers visible candidates through the
existing read policy, auto-binds exactly one, exposes several as a neutral choice, and otherwise
remains unresolved. Candidate provenance records the authorized Graph Read; invocation remains a
separate receiver-authorized step. Scalar input and presentation policy remain outside this proof.

The first projection proof keeps presentation policy outside the Program: a prepared
multi-candidate choice retains the open application and authorized candidates, while adapters
project it to a generic form field or the existing Task choice Interaction. Both surfaces share
option identity and use the same schema-validated substitution path. The accepted candidate keeps
its discovery provenance. Prompt wording and labels may vary by caller without changing Program
semantics; durable interaction lifecycle and a public form contract remain separate concerns.

Resolution is now tested behind an internal replaceable resolver contract. The coordinator derives
the named Hole's positions and original schemas from the Operation contract; ordered resolvers may
produce an outcome or abstain without modifying the Program. Authorized Entity Ref discovery is
one adapter, while direct scalar positions can yield a distinct free-input outcome. Manual values
still pass through canonical schema substitution and carry descriptive `free-input` provenance.
Resolver policy remains separate from Hole identity and grants no execution authority.

The first Read generalization proof keeps the canonical Graph Read protocol intact. An internal
application may place a named Hole in one or more scalar predicate values, preserves the surrounding
Selection and request fields, and validates substitution against every occupied Entity field
schema. Open applications cannot lower; closed applications parse and resolve to the existing
`GraphReadRequest`. Relationship endpoints, set-valued predicates, dispatch, observation, Graph
Commands, and a common public Application abstraction remain outside this bounded proof.

The first Command generalization proof places the shared named-Hole term in Entity create or update
payload values. Each occupied field independently validates and normalizes a substitution before a
closed application can lower to the existing `GraphCommandRequest`; targets, mutation semantics,
and receiver authorization remain unchanged. The evidence supports a small common Hole primitive
and lifecycle discipline, while Operations, Reads, and Commands remain distinct typed application
families with their own traversal and lowering rules. Target Holes, relationship Commands, and a
public universal Application remain unproven.

The first frontend projection exposes only the bounded Graph Read application API from the
experimental semantic-program package subpath. Both existing Console dialects produce that same
open term for named predicate Holes; they do not invent a `read` keyword or an alternate request
model. Devtools presents explicit values, delegates normalization and validation to Core
substitution, and dispatches only after lowering yields the existing closed `GraphReadRequest`.
This proves one textual/UI projection and runtime path, not a general projectional editor, resolver
UI, observation of open terms, or stable root export.

Graph Read applications also expose each named Hole's occupied Entity and Field positions. This is
structural context rather than copied type metadata: resolvers and frontends join it with the
registered Entity schema to decide whether a Hole is scalar free input or an Entity Ref requiring
authorized candidate discovery. Presentation and candidate policy remain outside the application.
The first Console adapter uses that context for direct Refs with a single identity field: it reads
a bounded set of visible target Entities through the ordinary receiver-authorized Graph Read path,
projects display metadata as searchable choices, and substitutes the selection as a canonical Ref.
Composite identities, relationship endpoints, and server-side candidate search remain outside this
bounded frontend proof.
The same adapter projects Boolean predicate Holes as explicit choices and lays out each named Hole
as one parameter row. Registered Field descriptions may appear as contextual help without becoming
copied application metadata; remaining scalar types continue to use the generic input path.

The first Model Support projection lets a provider propose that same open Graph Read application
instead of inventing a separate tool request. The Hole remains only a typed slot; a separate
`entity-match` binding carries the user's wording. Core derives the target, identity, and searchable
Fields from the registered schema and display metadata, discovers matches through the ordinary
receiver-authorized Graph Read policy, substitutes a canonical Ref for one exact match, returns a
choice for several, and remains unresolved for none.
Known predicates stay closed, and the completed request is revalidated against the advertised Read
affordance before the existing dispatcher executes it. This proof covers direct Ref equality only;
fuzzy matching, relational display paths, scalar inference, and multi-turn Assistant state remain
later work.

The same Model Support boundary also accepts open Operation applications. Known inputs remain value
terms, unresolved direct Refs use the same external `entity-match` bindings, and authorized search
feeds ordinary schema substitution before lowering to the existing `OperationInvokeRequest`.
Ambiguous matches become canonical invocation choices; execution still rechecks the fresh scoped
Operation exposure. Todo exposes `TodoList.completeAll` as the first end-to-end model proof.

Ambiguous Operation inputs now remain an open application inside the durable Model Command run.
Each accepted choice substitutes exactly one named Hole; another unresolved Hole produces the next
Interaction, while a closed application lowers once to the canonical invocation. The model is not
called again during this continuation, and fresh authorization plus Operation exposure are checked
before every resumed substitution and before execution.

Direct scalar Operation Holes now derive a frontend-neutral input descriptor from their original
schema positions. Durable interactions transport string, number, Boolean, enum/literal, and
nullable values without reducing them to text; runtime validation keeps the visible control and the
eventual substitution consistent. Devtools and Todo chat are two projections of that same contract,
and one compatible named Hole can fill several positions. This does not yet cover nested values,
contextual producers, or a universal form representation.

Plan 154d proved the first reactive dependency boundary. Canonical Graph Commands and Selections
are intensional, bounded mutation descriptions recorded inside the effect-owning Unit of Work and
published only after commit. Runtime Protocol carries their authority-scoped
`CommittedMutationSet` as execution metadata without changing domain outputs. React caches retain
canonical Graph Reads independently from query keys and refresh unless the shared matcher can
prove a mutation disjoint. Bulk effects remain constant-size, exact deltas remain optional
evidence, and native execution declares semantic changes rather than cache keys.

This proves mutation-to-dependency reevaluation for an initiating client; it does not yet make a
Query a general live value. Delivery to active server observations, cross-client distribution, and
causal Devtools presentation remain separate work. Event occurrence, mutation effect, observation
revision, and Operation progress must stay distinct as those capabilities evolve.

The first server-observation delivery proof now registers canonical Graph Reads inside one
application Runtime Protocol and feeds them successful direct and in-process durable commit
descriptions. The shared conservative matcher suppresses only proven disjointness; possible overlap
is reevaluated through the authorized dispatcher under the subscription's original authority.
Native provider observation remains a parallel change source and equal snapshots are deduplicated.
Delivery is process-local and lossy with one pending refresh per slow observer, not a mutation log
or distributed broker. Portable causal identity and Devtools grouping remain unproven.
