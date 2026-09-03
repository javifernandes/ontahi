---
id: ontahi.independently-usable
kind: concept
title: Ontahi Independently Usable
parent: ontahi
status: done
horizon: now
supports:
  - ontahi
relatedPlans:
  - ontahi://plans/100-ontahi-framework-extraction
  - ontahi://plans/100e-ontahi-runtime-capabilities-and-repository-topology
  - ontahi://plans/100g-ontahi-codegen-and-application-tooling-boundary
  - ontahi://plans/100j-ontahi-in-memory-persistence-runtime
  - ontahi://plans/100h-ontahi-portability-example-and-developer-guide
  - ontahi://plans/121-ontahi-direct-postgres-adapter
  - ontahi://plans/129-ontahi-independent-repository-and-release-readiness
  - ontahi://plans/129a-ontahi-public-package-artifact-hardening
  - bookops://plans/129b-ontahi-bookops-versioned-consumer-loop
  - ontahi://plans/129c-ontahi-public-repository-and-prerelease-proof
  - ontahi://plans/127-ontahi-storage-schema-contract-validation
  - ontahi://plans/130-ontahi-authentication-principal-and-invocation-context
typeOf:
  - spec-workstream-atlas.atlas-model.goal
migratedFrom: bookops://atlas/independently-usable
sourceCommit: 67713696
---

Ontahi Independently Usable is the achieved strategic
[[spec-workstream-atlas.atlas-model.goal|Goal]] that replaced "extract Ontahi" as the description
of the desired outcome.

Extraction is one path toward the Goal. The Goal is achieved when Ontahi can be understood, configured, tested, and used without treating BookOps as part of the framework.

That threshold is now evidenced by:

1. framework packages with honest public boundaries and no BookOps dependencies,
2. an independent open-source repository and provenance-backed npm packages,
3. pluggable persistence, transport, durable execution, coordination, and host-composition surfaces,
4. BookOps consuming Ontahi as a host application,
5. a standalone Todo application exercising independent adapter choices,
6. developer documentation and Ontahi learning material that teach the same concepts exposed by the code.
7. package-owned application analysis and codegen that do not require copying BookOps build scripts.
8. a direct PostgreSQL adapter with provider-executed SQL and host-owned physical mappings and
   migrations; the adapter and conformance proof exist, while independent consumer evidence may
   continue to expand.
9. independently installable package artifacts, a release policy, and a fast, well-tested
   development loop between the Ontahi and BookOps repositories.

The goal did not require Ontahi to be feature-complete or stable. New runtime families, graph
execution, language tooling, adapters, and developer-experience work are independent evolution of
the framework rather than unfinished extraction.

## Closure

Status: achieved on 2026-09-03.

The independent public repository, package boundary and release line, standalone Todo proof,
developer documentation, package-owned codegen, direct PostgreSQL adapter, and versioned BookOps
consumer loop establish the completion baseline. Stable promotion and deeper lifecycle hardening
remain valid follow-ups, but they do not reopen this goal. In particular,
[[ontahi.data-graph-execution-routing|Data Graph Execution Routing]] and
[[ontahi.runtime-protocol|Ontahí Runtime Protocol]] are subsequent framework developments.
