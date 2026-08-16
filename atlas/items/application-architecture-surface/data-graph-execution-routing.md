---
id: ontahi.data-graph-execution-routing
kind: system-primitive
title: Data Graph Execution Routing
parent: ontahi.application-architecture-surface
status: shaping
horizon: next
supports:
  - ontahi.model.selection
  - ontahi.authority-policies
  - ontahi.react-graph-surface
relatedPlans:
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
  - ontahi://plans/128a-ontahi-recursive-views-and-projectable-operation-results
  - ontahi://plans/128b-ontahi-projectable-operation-client-bridge
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

The first proof exists in-process: a Selection authored from a runtime-bound Entity retains
that binding while its JSON form remains portable; read shaping and Command shortcuts execute
through the same bound runtime, and Operation inputs restore the binding on the authoritative
side.

The next implementation slice is deliberately remote-read-only: version the canonical Query
program, rebuild it against the server graph, enforce a default-deny semantic read policy, project
it through a replaceable HTTP adapter, and run identical Todo read code through direct and remote
runtimes. Remote Commands follow only after the protocol and authority seam are credible.

Recursive caller-authored Views and projectable Selection-shaped Operation results now work in Core
and through generated React clients. The caller supplies the materialization View, the Operation
supplies the semantic population, and both local and bridged invocation compose one final Query
plan. The generic remote Query bridge can therefore transport this settled result-shaping model
rather than inventing another projection language at the HTTP boundary.
