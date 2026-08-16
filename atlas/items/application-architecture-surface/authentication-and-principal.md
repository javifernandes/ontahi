---
id: ontahi.authentication-principal
kind: system-primitive
title: Authentication And Principal
parent: ontahi.application-architecture-surface
status: active
horizon: now
supports:
  - ontahi
  - bookops
  - ontahi.authority-policies
relatedPlans:
  - bookops://plans/130-ontahi-authentication-principal-and-invocation-context
  - bookops://plans/130a-durable-principal-propagation
  - bookops://plans/68e-auth-and-identity-requirement-api
  - bookops://plans/78-first-class-authorization-and-relationship-policies
  - bookops://plans/120-ontahi-environment-resources-and-semantic-bindings
migratedFrom: bookops://atlas/application-architecture-surface/authentication-and-principal
sourceCommit: 67713696
---

Authentication And Principal defines how an authenticated caller enters an Ontahi runtime without
making domain operations depend on HTTP, cookies, OAuth, Passport, Supabase, Auth0, Okta, or another
provider.

The host authenticates its native request and supplies a narrow Principal to an invocation context.
Ontahi carries that Principal through operation requirements, execution, nested operations, and
permission checks. Provider sessions, tokens, claims, and user profiles remain private host or
application resources.

Principal names the caller of an invocation. Entity Identity continues to name a particular Entity
instance through refs and locators. Keeping those concepts distinct avoids overloading identity
across the data graph and the security boundary.

Authentication answers who is calling. [`Authority And Policies`](../authority-and-policies.md)
answers what that Principal may do. The latter may consume relationship facts, resource state,
roles, or policy adapters, but those concerns do not belong in Principal resolution.

The first portable proof is complete. Todo Express maps Passport/GitHub users at its Express
boundary. BookOps maps the Supabase user at its Next.js operation-invocation boundary and seeds the
full provider `User` as a private invocation resource, so existing host logic reuses it without a
second auth lookup. Both consume the same Principal APIs from Ontahi `0.1.0-alpha.3`.
