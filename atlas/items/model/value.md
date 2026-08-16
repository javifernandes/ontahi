---
id: ontahi.model.value
kind: concept
title: Value
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.model
  - ontahi.operation-contracts
relatedPlans:
  - ontahi://plans/133-nominal-model-registry-and-codegen-reuse
---

A Value is a named object-shaped semantic contract without Entity identity, Relations, operations,
or persistence meaning. Values describe Operation inputs and outputs, durable lifecycle boundaries,
and other reflected structures whose meaning deserves a stable name.

A Value may reuse Entity or Value field definitions, but it remains a distinct concept rather than
a partial Entity snapshot. Its name is application-level nominal identity. Reusing one declaration
is valid; declaring a second Value or Entity with the same server-model name is ambiguous. Views are
caller-owned Query documents and do not participate in this application namespace.

Codegen may project a server-authored Value into a browser-safe declaration, but projection preserves
the same nominal identity and must not duplicate the semantic definition for every consumer.
