# 168. Atlas Semantic Item Type Reconciliation

Status: done

## Summary

Reconcile Ontahí's durable framework model with the first typed Atlas Item language proven by the
Classroom example. The first slice classifies the core `Entity`, `Domain Operation`, and
`Durable Operation` concepts without turning every operation-adjacent concept into an Operation.

## Context

The Classroom package now describes concrete Entities and a standalone Operation using Atlas's
typed Entity and Operation models. Ontahí's older durable model predates that language: its core
Entity and Domain Operation Items still identify only as generic model Items, while Durable
Operation specializes Domain Operation. This makes the concrete example more structured than the
framework concepts it exercises.

## Scope

1. Distinguish Item document `kind` from semantic `typeOf` classification.
2. Classify Ontahí Entity as an Atlas Entity and Domain Operation as an Atlas Operation.
3. Preserve Durable Operation as the more specific specialization of Domain Operation.
4. Give Domain Operation the canonical Operation anatomy without discarding its accumulated
   framework semantics.
5. Record the convention in the Ontahí Model Item so later backfills can proceed deliberately.

## Non-goals

- Reclassifying every child of Domain Operation as an Operation.
- Rewriting Ontahí's full model tree in one migration.
- Changing runtime APIs, execution behavior, or generated artifacts.
- Claiming that Operation Invocation, implementation binding, or resilience policy are executable
  Operations.

## Execution slices

- [x] Inventory the existing Ontahí model and the Classroom Entity/Operation proof.
- [x] Establish the semantic typing convention in the Ontahí Model Item.
- [x] Reconcile Entity, Domain Operation, and Durable Operation frontmatter.
- [x] Add the canonical Domain Operation contract anatomy.
- [x] Run focused Atlas-source verification and formatting checks.

## Acceptance checklist

- [x] `ontahi.model.entity` is directly typed as the Atlas Entity model.
- [x] `ontahi.model.domain-operation` is directly typed as the Atlas Operation model.
- [x] `ontahi.model.durable-operation` remains a specialization of Domain Operation and therefore
      transitively an Atlas Operation.
- [x] Operation-adjacent concepts remain generic model Items unless their own semantics justify a
      more specific type.
- [x] The durable model explains how `kind`, direct `typeOf`, and inherited type membership differ.
- [x] Domain Operation exposes Receiver, Actor, Inputs/Output, Availability, Effects, Failures, and
      Invariants as navigable semantic sections.

## Checkpoint: bounded core backfill

The initial inventory found that a small hierarchy correction is enough to align the framework
model with the Classroom proof. The work intentionally stops before classifying adjacent concepts;
those need individual semantic evidence rather than ancestry-based guesses.

## Verification

- Ontahí formatting passes for the plan and four changed durable Items.
- `git diff --check` passes.
- Atlas's real snapshot builder resolves the three intended direct type edges across the Atlas and
  Ontahí source roots.

## Closure / Evolution

The bounded core backfill is complete. Later passes may classify other concepts only when their
own anatomy justifies an Atlas Item Type; containment under Domain Operation is explicitly
insufficient evidence. Querying by transitive type membership and richer type-specific projections
remain Atlas evolution rather than duplicated Ontahí metadata.
