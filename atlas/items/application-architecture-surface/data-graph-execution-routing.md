---
id: ontahi.data-graph-execution-routing
kind: system-primitive
title: Data Graph Execution Routing
parent: ontahi.application-architecture-surface
status: shaping
horizon: now
supports:
  - ontahi.model.selection
  - ontahi.authority-policies
  - ontahi.react-graph-surface
relatedPlans:
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
  - ontahi://plans/128a-ontahi-recursive-views-and-projectable-operation-results
  - ontahi://plans/128b-ontahi-projectable-operation-client-bridge
  - ontahi://plans/142c-reflected-atomic-operation-execution
  - bookops://plans/55-runtime-agnostic-data-graph-and-pluggable-adapters
  - bookops://plans/57-client-runtime-bridge-and-server-dispatch
  - bookops://plans/68j-graph-execution-authority-api
migratedFrom: bookops://atlas/application-architecture-surface/data-graph-execution-routing
sourceCommit: 67713696
---

Data Graph Execution Routing lets one portable [[ontahi.model.selection|Selection]], Query, or
Command execute through the capability bound to its runtime. A runtime may lower the graph program
directly to safe browser storage, transport it to an authoritative server graph, or reject it when
no compatible authorized executor exists.

This makes direct Supabase access and bridged PostgreSQL access execution topologies of the same
language. The caller should not wrap an ordinary read or write in a
[[ontahi.model.domain-operation|Domain Operation]] merely because storage lives in another process.
Operations remain the primitive for named behavior, invariants, effects, contracts, and durable
intent.

The remote path is not an arbitrary data endpoint. A server graph boundary validates the canonical
program and enforces [[ontahi.authority-policies|Authority And Policies]] over Entities, fields,
operators, relation traversal, cardinality, row scope, and write limits. Direct browser storage must
provide equivalent enforcement at its authoritative data boundary, such as PostgreSQL RLS.

Runtime binding must preserve one call-site language, result model, cache identity, observability
surface, and provider-capability diagnostics across direct and remote execution.

Reflected Domain Operations also preserve static execution requirements. The current planner
combines `execution.atomicity: 'required'` with explicit live bindings and returns a local, bridge,
or unavailable affordance. React and Explorer consume that value to explain executability, but
invocation still travels through the same reflected Operation facade. A bridge affordance means a
route is configured; the authoritative server remains responsible for validating transaction
support and policy before evaluating the Operation.

The first proof exists in-process: a Selection authored from a runtime-bound Entity retains
that binding while its JSON form remains portable; read shaping and Command shortcuts execute
through the same bound runtime, and Operation inputs restore the binding on the authoritative
side.

The first remote path is implemented for reads. A versioned canonical Query program is rebuilt
against the server graph, checked by a default-deny semantic read policy, and executed through a
transport-neutral dispatcher. Express and Next.js adapt that same boundary, while React provides a
Fetch executor and semantic cache identity. Todo authors browser Queries through generated Entity
facades and sends them through the Express bridge without wrapper read Operations.

The React provider supplies a conventional lazy same-origin client but does not create authority.
Server routes and policy remain explicit, and the host derives the authoritative Principal from its
native request. Client `ExecutionIdentity` only partitions distributed cache state.

Remote Commands follow after read topology evidence and the write-policy boundary are credible.
Generated client Entities are not yet directly runtime-bound for fluent `.run()` outside the React
executor, and telemetry plus reflected policy diagnostics remain future routing work.

Recursive caller-authored Views and projectable Selection-shaped Operation results now work in Core
and through generated React clients. The caller supplies the materialization View, the Operation
supplies the semantic population, and both local and bridged invocation compose one final Query
plan. The generic remote Query bridge can therefore transport this settled result-shaping model
rather than inventing another projection language at the HTTP boundary.
