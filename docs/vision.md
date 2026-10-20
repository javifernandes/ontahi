# Ontahí Vision

## A modular, federable semantic virtual machine

Ontahí is a virtual machine for modular semantic programs. An application declares identities,
relationships, capabilities, interactions, and facts once. Independent implementations—local,
remote, human, or model-backed—may interpret different parts of that program in different
languages and runtimes.

Ontahí is not intended to become a monolithic application framework. It does not need to own every
database, interface, workflow engine, model provider, or deployment topology. It defines the
semantic contracts that let those implementations compose without making any one of them the
application's source of truth.

The durable idea is:

> The semantic program has an identity of its own. No implementation, surface, language, or
> runtime owns it.

## Why a virtual machine

A conventional virtual machine separates a program from the physical machine that executes it.
Ontahí aims to separate a semantic program from:

- the language used to author it;
- the language used to implement a capability;
- the runtime and location where evaluation continues;
- the storage technology used by one graph segment;
- the human or machine surface through which a participant interacts;
- the deterministic, model-backed, remote, or human implementation that fulfills a contract.

Its instructions are not low-level opcodes. They are semantic requests such as selecting a
population, resolving a Relation, invoking an Operation, applying a Command, accepting an Event,
waiting for an Interaction, observing a value, or delegating unresolved evaluation to a runtime
that owns the required capability.

The Semantic Program Kernel Protocol is the language-independent boundary between the program and
its interpreters. It should standardize portable meaning, identity, lifecycle, authority, and
failure—not homogenize implementation details.

## The architectural promise

A configured Ontahí application may bind different parts of one semantic program independently:

```text
                    Semantic program
     Entities · Relations · Selections · Operations
        Events · Interactions · Policies · Contracts
                              │
               Semantic Program Kernel Protocol
                              │
      ┌──────────────┬──────────────┬──────────────┬──────────────┐
      │ TypeScript   │ Rust         │ Model-backed │ Remote       │
      │ interpreter  │ interpreter  │ executor     │ capability   │
      └──────────────┴──────────────┴──────────────┴──────────────┘
```

Each implementation declares the semantic contracts and protocol versions it understands, the
capabilities it provides, the authority under which it acts, and the execution guarantees it can
preserve. The kernel may evaluate locally, route a closed request, delegate unresolved work,
suspend a run, or continue it elsewhere without changing the public identity of the program.

This is stronger than package modularity. A runtime may implement only Graph Reads, only durable
Operations, one Event Runtime, one Interaction surface, one graph segment, or even one Operation.
An application does not need to be wholly “built with Ontahí” before any of those boundaries are
useful.

## Four research pillars

### Interaction models

An interface is not merely a projection of stored objects. An Interaction model describes what a
participant needs to understand, decide, provide, or accept while a semantic computation proceeds.
It remains distinct from its presentation.

The same typed Interaction may be projected through a graphical interface, conversation, CLI,
voice surface, agent loop, or another human-machine medium. A surface may remain highly customized:
Ontahí standardizes the semantic request and response, not one generated form or component tree.

This direction must preserve the distinction between domain model, Interaction model, and surface:

```text
Domain model       what exists and what may happen
Interaction model  how a participant can understand, decide, and act
Surface            how that interaction appears in one medium
```

### Graph distribution

Distribution is not only several replicas of one application. A semantic graph may contain
segments whose data, authority, and operations belong to different runtimes. Refs and Operations
may cross those boundaries while location, consistency, partial failure, and unsupported
guarantees remain explicit.

This resembles federated schemas, but extends beyond API fields and resolvers. Ontahí seeks to
federate identity, Relations, Selections, Operations, Events, authority, Interactions, and durable
continuation under one semantic model.

### AI-native operations

A model is neither an unrestricted side door nor a parallel application language. It may occupy
precise roles inside the program:

1. interpret human intent into an existing Read, Command, or Operation;
2. implement an Operation while remaining inside its input, output, authority, effect, and
   lifecycle contracts;
3. request missing information through the same typed Interactions available to code-backed work;
4. propose Effects or bindings for validation and authorization before execution.

An Operation keeps the same identity whether its selected implementation is code-backed,
model-backed, remote, derived, or declarative. Model choice, prompts, and provider messages are
implementation concerns, not the application's canonical operation language.

### Language independence

Ontahí must keep three things distinct:

```text
authoring language != canonical semantic program != execution runtime
```

TypeScript is the first and currently most complete authoring and runtime environment. It must not
become the definition of the architecture. A later authoring surface may use another host
language, Markdown, conversation, or projectional tooling. A conforming interpreter may be written
in Rust, Go, JavaScript, or another language without redefining the application's meaning.

Multiple SDKs are not sufficient. Language independence requires a portable representation,
versioned protocol contracts, capability discovery, and conformance tests that implementations can
pass independently.

## Technology migration as rebinding

When application meaning exists only implicitly in one codebase, rewriting a system means
reconstructing its contracts, invariants, authorization, effects, errors, and lifecycle from
scattered evidence. Code generation by a model can accelerate that work but cannot establish that
the new system preserved the old meaning.

Ontahí's desired migration path is different:

```text
TypeScript implementation
          │
          │ same Selection / Operation / Event contracts
          ▼
Rust implementation
          │
          │ conformance + differential and shadow execution
          ▼
change the capability binding
```

A replacement still has to solve storage layout, performance, concurrency, external effects, and
transactional guarantees. Ontahí does not make that engineering disappear. It should make the
meaning to preserve explicit, generate a bounded implementation target, test compatibility, and
let the application replace an implementation without changing its public semantic contract.

## Constraints that keep the vision modular

The Semantic Program Kernel Protocol should define only what independent implementations must
share:

- stable semantic identities and references;
- typed requests, results, failures, Effects, Events, and Interactions;
- capability discovery, binding, routing, and version negotiation;
- authority and policy checkpoints;
- suspension, continuation, observation, and correlation;
- declared execution and consistency guarantees;
- reflection and conformance surfaces.

It should not centrally prescribe:

- UI components or one rendering technology;
- database schemas, indexes, or provider configuration;
- framework-specific request handlers;
- model-provider prompts or message formats;
- one workflow engine's internal state representation;
- one universal AST before separate application families prove that they share it;
- capabilities merely because a complete application platform might contain them.

Ontahí should standardize interchangeable meaning without becoming the implementation of
everything.

## What exists today

This vision is not the description of one completed VM. Its current evidence is incremental:

- Entities, Refs, Relations, Selections, Graph Reads, and Graph Commands provide canonical semantic
  requests independent from current storage adapters.
- Operation contracts preserve typed input, output, failure, policy, and execution identity across
  direct and durable execution.
- Runtime Protocol carries canonical requests and observations across Fetch and WebSocket
  boundaries.
- runtime capabilities bind one application model to in-memory, PostgreSQL, MySQL, Supabase,
  Express, Next.js, native Task, LangGraph, and Vercel Workflow implementations without making
  those providers the semantic vocabulary.
- typed Event declarations distinguish emission, occurrence, and delivery, with both ephemeral and
  durable Event Runtime implementations.
- typed Interactions can suspend and resume explicit durable Operations across native, LangGraph,
  and Vercel Workflow execution adapters.
- model support resolves intent into existing Graph Read and Operation applications, retains typed
  holes and choices, and reuses canonical authorization and dispatch rather than inventing a model
  execution channel.
- experimental semantic programs can remain open, accept schema-validated substitutions, and lower
  to existing closed Runtime Protocol requests.

These proofs support the direction. They do not yet establish distributed evaluation, a stable
portable program representation, cross-language interpreters, general Interaction models, or
transparent implementation migration.

## What Ontahí does not claim yet

Ontahí does not currently claim:

- a complete universal semantic intermediate representation;
- a production-ready cross-language VM;
- transparent distributed transactions or arbitrary cross-segment queries;
- automatic equivalence between two implementations;
- a generic generated UI that replaces designed interfaces;
- safe unconstrained model execution;
- that every application concern belongs in the kernel protocol.

Those claims require executable evidence. Until then they remain research hypotheses, not product
features.

## How the vision becomes concrete

This document is not one implementation Plan. Each pillar should advance through a small vertical
proof that provides local value before requiring the whole architecture:

1. one Interaction projected through two meaningfully different surfaces;
2. one semantic application evaluated across two graph segments with explicit authority and
   failure behavior;
3. one Operation whose code-backed and model-backed implementations pass the same contract and
   policy checks;
4. one independently implemented non-TypeScript interpreter that passes a narrow conformance suite;
5. one capability migrated between implementations through differential, shadow, and binding
   cutover rather than an application contract change.

The result of each proof may narrow or reject part of this vision. The architecture earns its
generality only when two genuinely independent implementations preserve the same observable
semantic contract.

## Evaluation test

A proposed Ontahí feature advances this vision when it makes application meaning more explicit and
portable while keeping implementation choices replaceable. It works against the vision when it:

- places provider, storage, UI, or model details inside a semantic contract without necessity;
- requires every runtime to implement an unrelated capability;
- introduces a second language for a concept that already has a canonical request;
- confuses deployment modularity with semantic modularity;
- promises portability without an independent implementation and conformance evidence.

The long-term measure of success is not how much application infrastructure Ontahí owns. It is how
much meaningful application behavior can move between implementations, surfaces, runtimes, and
languages without being redefined.
