# 144. Executable Ontologies

Status: backlog

Canonical ID: `ontahi://plans/144-executable-ontologies`

Related plan: [143. Instance-First Explorer](../done/143-instance-first-explorer.md)

## Summary

Investigate Ontahí applications whose primary source is a human-readable ontology rather than
repetitive procedural application code. Entities, Relations, concepts, rules, and Operation
contracts could be authored through Markdown or conversation, normalized into a canonical Ontahí
intermediate representation, and executed by an available runtime.

The durable product thesis is: **Ontahí: executable ontologies.**

## Hypothesis

One semantic model can project:

1. conceptual documentation for people learning the system;
2. a navigable schema graph;
3. instance storage, reads, and generic UI;
4. Operation contracts and agent tools;
5. runtime adapters or generated TypeScript, JavaScript, Go, or remote execution bindings.

Markdown and chat are authoring surfaces. The canonical ontology is the durable program. Generated
code is an optional target rather than the only representation of meaning.

## Proposed Experiment

Define a small Classroom system from one document:

- Users create Classes and become their owner.
- Classes have participants and collaborators.
- Owners and collaborators can create expiring invitations represented by QR codes.
- A scanned invitation allows another User to join under declared authorization and uniqueness
  rules.

Compile the document into a structured intermediate representation, then project a conceptual
schema, documentation, navigable instances, and one executable invitation Operation.

## Execution Kinds To Explore

1. `derived`: behavior implied by the model;
2. `declarative`: rules, reads, mutations, and workflows represented in portable IR;
3. `agent`: semantic implementation delegated within explicit contracts and authority;
4. `code`: deterministic implementation supplied by a host language;
5. `remote`: implementation discovered through a runtime bridge.

Authorization, invariants, effects, and result contracts remain explicit and verifiable regardless
of execution kind.

## Non-Goals

1. Do not create a general-purpose programming language before the vertical experiment requires it.
2. Do not treat unconstrained LLM execution as an implementation of authorization or invariants.
3. Do not couple the instance-first Explorer intervention to this experiment.

## Acceptance Checklist

- [ ] One document produces a stable, inspectable ontology IR.
- [ ] The IR retains conceptual documentation alongside structural metadata.
- [ ] The same IR drives schema, instances, and Operation affordances.
- [ ] One Operation can change execution kind without changing its public contract.
- [ ] Semantic diffs can be reviewed when conversation changes the ontology.
- [ ] The experiment identifies which parts require code and which are genuinely declarative.
