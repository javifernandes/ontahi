---
id: ontahi.independently-usable
kind: concept
title: Ontahi Independently Usable
parent: ontahi
status: active
horizon: now
supports:
  - ontahi
relatedPlans:
  - bookops://plans/100-ontahi-framework-extraction
  - bookops://plans/100e-ontahi-runtime-capabilities-and-repository-topology
  - bookops://plans/100g-ontahi-codegen-and-application-tooling-boundary
  - bookops://plans/100j-ontahi-in-memory-persistence-runtime
  - bookops://plans/100h-ontahi-portability-example-and-developer-guide
  - bookops://plans/121-ontahi-direct-postgres-adapter
  - bookops://plans/129-ontahi-independent-repository-and-release-readiness
  - bookops://plans/129a-ontahi-public-package-artifact-hardening
  - bookops://plans/129b-ontahi-bookops-versioned-consumer-loop
  - bookops://plans/129c-ontahi-public-repository-and-prerelease-proof
  - bookops://plans/127-ontahi-storage-schema-contract-validation
  - bookops://plans/130-ontahi-authentication-principal-and-invocation-context
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
typeOf:
  - spec-workstream-atlas.atlas-model.goal
migratedFrom: bookops://atlas/independently-usable
sourceCommit: 67713696
---

Ontahi Independently Usable is the strategic [[spec-workstream-atlas.atlas-model.goal|Goal]] that replaced "extract Ontahi" as the description of the desired outcome.

Extraction is one path toward the Goal. The Goal is achieved when Ontahi can be understood, configured, tested, and used without treating BookOps as part of the framework.

Success should eventually be evidenced by:

1. framework packages with honest public boundaries and no BookOps dependencies,
2. an independent open-source repository and provenance-backed npm packages,
3. pluggable persistence, transport, durable execution, coordination, and host-composition surfaces,
4. BookOps consuming Ontahi as a host application,
5. at least one non-BookOps application exercising independent adapter choices,
6. developer documentation and Ontahi learning material that teach the same concepts exposed by the code.
7. package-owned application analysis and codegen that do not require copying BookOps build scripts.
8. a direct PostgreSQL adapter with provider-executed SQL and host-owned physical mappings and
   migrations; the adapter and conformance proof exist, while independent consumer evidence may
   continue to expand.
9. independently installable package artifacts, a release policy, and a fast, well-tested
   development loop between the Ontahi and BookOps repositories.

Possible runtime, source-organization, developer-experience, and open-source-readiness subgoals remain exploratory. Do not create a goal hierarchy until it improves actual planning.

## Current Sequence

1. Treat the public repository, clean package boundary, provenance-backed `0.1.0-alpha.7` release,
   and exact-registry Todo proof as the framework baseline.
2. Treat BookOps' exact npm pins, registry-resolution guard, compatibility CI, and opt-in sibling
   loop as the production-consumer baseline.
3. Treat provider-neutral Principal propagation as established: Express/Passport and
   Next.js/Supabase are host mappings onto one Ontahi invocation context.
4. Continue plan 128 from its versioned remote-read and default-deny policy baseline. Relationship
   Commands are its first bounded remote write; generic Entity Commands remain deferred until their
   authority and outcome contracts are proven.
5. Keep stable promotion and deeper storage-schema checks as explicit lifecycle follow-ups rather
   than reopening the extraction program.

This sequence does not make authorization, invariants, events, AI Operations, or additional
adapters prerequisites for a public alpha.
