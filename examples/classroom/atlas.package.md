---
id: ontahi.examples.classroom
kind: package
title: Classroom App
parent: ontahi
status: active
packageName: '@ontahi/example-classroom'
packageType: example
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

Classroom App is Ontahí's model-first example for exercising domain entities, operations,
applicability, authority, effects, and invariants alongside an executable application. The Package
is the implementation boundary; `Classroom` is one Entity inside its evolving domain model. The
current semantic model is intentionally allowed to expose differences from the existing example
code rather than claiming that every declaration is already realized.

Its first modeled domain slice is the invitation to join a classroom. Atlas discovers this manifest
alongside the implementation and keeps Ontahí as the authoritative source for both the Package and
its contained Items.
