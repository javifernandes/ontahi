# 165. Contextual Resource Bindings And Reusable Configuration Modules

Status: current

Canonical ID: `ontahi://plans/165-contextual-resource-bindings-and-reusable-configuration-modules`

Shapes: [Semantic Module](../../atlas/items/model/semantic-module.md) and
[Semantic Subjects And Runtime Concerns](../../atlas/items/model/semantic-subjects-and-runtime-concerns.md).

Related plans:

1. [120. Environment Resources And Semantic Bindings](../next/120-ontahi-environment-resources-and-semantic-bindings.md)
2. [125a. Model Execution Resource Governance](125a-model-execution-resource-governance.md)
3. [160. Semantic Modules, Composition, And System Boundaries](../research/160-semantic-modules-composition-and-system-boundaries.md)
4. [163. Operation Implementation Bindings And Variants](163-operation-implementation-bindings-and-variants.md)
5. [166. Semantic Operation Receivers And Bound Invocation](../research/166-semantic-operation-receivers-and-bound-invocation.md)

## Summary

Prove that one stable semantic Resource can resolve to different opaque configured instances from
trusted application context without credentials becoming Operation input, reflected metadata, or
Resource evidence. Use workspace-scoped model configuration as the motivating consumer while
keeping the primitive provider-neutral.

Relate that runtime primitive to a reusable Semantic Module. A capability such as model
configuration, conversations, or annotations may contribute Entities, Relations, Operations, and
Resource requirements to several applications. The consuming application still owns scope,
storage, secrets, and authority. Module reuse must not turn a credential into ordinary graph data
or make one product's tenancy vocabulary universal.

## Problem

The governed HTTP Resource slice proved static host configuration closed over by one Operation
implementation. A multi-workspace application needs a later-bound configured instance:

```text
semantic Resource: model.analysis
trusted scope: workspace/acme
effective binding: provider + model + opaque credential handle
```

The same Operation invoked under another workspace keeps its contract and Resource identity while
resolving another configured instance. Passing `provider`, endpoint, or API key as ordinary input
would let an untrusted caller influence infrastructure selection, leak secrets into protocol and
audit surfaces, and mix domain input with environment binding.

This also exposes reusable-functionality pressure. “Model configuration” is not merely a helper
function. Like conversations or annotations, it can become an independently understandable
semantic contribution with its own lifecycle and Operations. Reuse requires both halves:

1. a Module describes the portable semantic capability;
2. the host binds application-specific storage, scope, secrets, and later authorization.

## Distinctions

| Concept                      | Meaning                                                            | Must not become                                     |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| Semantic Resource identity   | Stable capability or consumable requested by execution             | provider URL, credential, or tenant-specific key    |
| Configured Resource instance | Effective provider configuration resolved for one trusted scope    | ordinary Operation input or portable reflected data |
| Binding scope                | Trusted application/workspace/Principal/invocation lookup identity | authorization grant                                 |
| Resource Governance          | Admission, limits, accounting, attribution, and safe evidence      | configuration store or feature-flag router          |
| Semantic Module              | Reusable contribution of model and behavior                        | tenant, package folder, microservice, or deployment |
| Subgraph                     | Projection of the composed graph for inspection or placement       | synonym for Module ownership                        |

Scope selects where configuration is looked up. Authorization will later decide who may inspect,
create, update, select, or consume a configured binding. This plan preserves that seam but does not
invent the policy.

## First Executable Proof

Introduce the smallest server-side binding seam needed by one Operation:

```ts
const analysisModel = resourceBinding<ModelProvider>('model.analysis');

const analyze = operation({
  resources: { model: analysisModel },
  run: async ({ resources, input }) => resources.model.analyze(input),
});

const application = ontahi({
  resourceBindings: {
    'model.analysis': async context => resolveWorkspaceModel(context),
  },
});
```

This is directional syntax, not a commitment to the final authoring form. The proof must establish:

1. the Operation requests a stable Resource identity rather than provider configuration;
2. the host resolver receives only trusted invocation context;
3. two trusted scopes resolve distinct configured instances for the same Operation;
4. a missing binding fails before external work with an actionable typed diagnostic;
5. the resolved instance is memoized only at an explicitly safe lifecycle scope;
6. reflection and Resource evidence retain stable identity and safe scope attribution, never the
   secret, endpoint, request, or response;
7. Governance admits and accounts for attempts after binding resolution without owning resolution.

## Reusable Configuration Module Pressure Test

Record, but do not fully implement, a portable `ModelConfiguration` Module that could contribute:

1. non-secret provider/model metadata and enabled state;
2. Operations to inspect and choose configurations;
3. a relation from an application-defined scope identity to configured Resource metadata;
4. an opaque secret reference whose value belongs to a host vault or secret adapter;
5. a Resource binding resolver consumed by model-backed Operations.

The Module must not prescribe `Workspace` as a universal Entity. A consuming application may bind
its own workspace, organization, project, user, or application identity to a small scope contract.
This is analogous to an annotations Module accepting application-owned anchor identities rather
than owning every object it can annotate.

## Execution Slices

1. **Contextual binding primitive**
   - define stable identity, resolver input, missing-binding failure, and lifecycle;
   - prove two scopes and one static application binding as the degenerate case.
2. **Operation and Governance integration**
   - make one Operation consume the resolved instance;
   - preserve attempt attribution and disclosure rules from Plan 125a.
3. **Reflection and diagnostics**
   - explain the requested identity and resolver origin without exposing configuration;
   - distinguish missing binding, resolution failure, exhaustion, and provider failure.
4. **Reusable Module sketch**
   - express model configuration against an application-supplied scope identity;
   - identify storage, secret, UI, and authorization adapter holes without filling them.
5. **Consumer rehearsal**
   - validate the public package boundary against one external multi-scope application;
   - feed consumer friction back into this plan without moving product-specific concepts into Core.

## Contextual Binding Checkpoint

The first slice exposes `resourceBinding<T>(id)` and `resolveResourceBinding(reference)`. Trusted
`InvocationContext` input supplies a resolver registry and an optional JSON-safe binding scope. The
same stable reference resolves different opaque values under different scopes, while nested
contexts inherit one invocation-local promise cache unless they explicitly replace the registry or
scope. An explicit Principal override also starts a fresh cache so one identity can never reuse or
overwrite another identity's resolved instance. Failed resolutions leave no cached rejection and
may be retried by caller-owned policy.

Missing configuration and failed resolution use distinct typed, credential-safe errors. Resolver
failures are deliberately not copied into the public error message or enumerable fields. Ordinary
Operation input has no path to the registry or binding scope, and inherited-object properties are
not accepted as configured bindings.

This checkpoint intentionally uses an explicit resolver call inside Operation code. Declarative
`resources: { ... }` injection, safe binding identity in evidence, Governance integration, storage,
UI, vault adapters, and Authorization remain later slices. The primitive must earn that broader
authoring form through consumer use first.

The low-level registry, resolver, invocation-local cache, and isolation rules remain valid. A
receiver may eventually become the semantic root of a declared scope projection, but the first
consumer should use the explicit dynamic resolver seam and test whether that extra metadata pays
rent. Resource binding remains responsible only for resolving the configured instance. Do not
promote the current generic binding-scope value into the final domain API before that separation is
tested.

## Dynamic Model Provider Checkpoint

The model-backed Operation seam now accepts either one static `ModelProvider` or an input-aware
resolver returning a typed Effect. Context assembly succeeds first, including any application
authorization performed there, and the provider is resolved again for every resilience attempt.
The resolved provider still uses the ordinary governed executor, structured-output validation,
usage evidence, and cancellation path.

This gives a multi-workspace application a deliberately manual first implementation without
inventing generic Resource scope syntax:

```ts
const askPlans = modelOperation({
  operation: Workspace.askPlans,
  context: input => assembleAuthorizedWorkspaceContext(input.workspaceId),
  provider: input =>
    Effect.gen(function* () {
      const configuration = yield* readWorkspaceModelConfiguration(input.workspaceId);
      const apiKey = yield* secretResolver.resolve(configuration.secretRef);
      return createModelProvider({
        provider: configuration.provider,
        model: configuration.model,
        apiKey,
      });
    }),
});
```

The application persists non-secret `ModelConfiguration` data associated with its `Workspace` and
stores only an opaque `SecretRef`; the secret value remains behind a host adapter. The Operation
contract does not accept provider, model, endpoint, or credential selection. Provider resolution
failure stays typed separately from context rejection and model execution failure.

This example is directional rather than an Atlas migration commitment. Its purpose is to obtain
consumer evidence for the sequence `workspace identity -> configuration -> secret -> provider`
before Core standardizes how application identity reaches arbitrary Resources.

## Scope Generalization Hypotheses

One durable boundary survives the concrete checkpoint: scope belongs to a particular Resource use,
not globally to an Operation or receiver. One invocation might use a Workspace model, an
Organization-billed API, and an application-static search service.

The former proposed algebra—application-static, receiver-self, and receiver-relation—is therefore
retained only as a candidate. Evidence must still answer whether:

1. scope should be declared as portable receiver projection metadata or remain an application
   resolver;
2. a reusable Module should name a configuration-owner role and how an Application fills it;
3. Relation traversal belongs in scope resolution or in ordinary authorized application reads;
4. a generic cache is safe, and which Resource, Principal, resolver, projection, and target
   identities belong in its key;
5. static bindings need any semantic scope identity beyond Resource plus application binding;
6. scoped lookup failures warrant a portable taxonomy beyond the typed application failures
   already supported by the dynamic resolver.

Do not promote the current ambient `resourceBindingScope`, the candidate projection algebra, or an
illustrative Module role into public declarative API until the Atlas rehearsal and at least one
non-model Resource demonstrate the repeated shape.

## Non-Goals

1. Do not implement Authorization before its dedicated state-of-the-art research.
2. Do not store raw API keys in Entities, runtime reflection, protocol envelopes, logs, or evidence.
3. Do not build a universal secret vault, billing system, provider catalog, or settings UI.
4. Do not make `Workspace`, tenant, organization, or user a Core Entity.
5. Do not implement selector cascades, dynamic feature flags, fallback, or A/B routing here.
6. Do not make every runtime context resource a governed semantic Resource.
7. Do not require first-class Semantic Module syntax to prove the binding primitive.

## Acceptance

- [x] One stable Resource reference resolves distinct opaque instances for two trusted scopes.
- [x] Callers cannot select a provider, endpoint, credential, or binding through ordinary input.
- [x] Missing and failed resolution have typed outcomes distinct from exhaustion and provider failure.
- [x] Secret values are absent from reflection, diagnostics, evidence, protocol responses, and errors.
- [ ] Governance observes the stable Resource identity and effective attempt without owning binding.
- [x] The lifecycle and memoization scope of each resolved instance are explicit and tested.
- [x] A static application binding remains the simplest supported case.
- [x] Model-backed Operations can resolve a provider dynamically from validated application input.
- [ ] A concrete multi-workspace consumer proves configuration and opaque secret resolution.
- [ ] A reusable model-configuration Module shape earns an application-owned scope contract.
- [ ] Consumer evidence validates the API through packed or released package artifacts.

## Deferred Questions

1. Whether binding metadata should reveal a safe configured-instance ID in debug evidence.
2. How authority controls read/write/use of scoped bindings.
3. Whether secret references are Entities, Values, adapter-private handles, or a distinct semantic
   form; raw secret values are never Entities regardless of that decision.
4. How selector-based environment bindings from Plan 120 generalize the explicit first slice.
5. How reusable Modules declare required storage, secret, UI, and Resource-binding adapter holes.
