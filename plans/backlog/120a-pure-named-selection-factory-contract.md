# 120a. Pure Named Selection Factory Contract

Status: backlog

Canonical ID: `ontahi://plans/120a-pure-named-selection-factory-contract`

Parent: [120. Named And Saved Selections](./120-named-and-saved-selections.md)

Research: [150a. Selection Factories, Locators, And Refs](../done/150a-selection-factories-locators-and-refs.md)

## Proposal

Following the accepted direction in 150a, define the smallest code-owned Selection factory contract: an Entity-scoped
name, reflected input schema, and pure data-driven expansion to existing Selection meaning.
`Customer.by({ loginEmail: { email: "a@example.com" } })` is representative authoring, not a frozen
API. Factories may share input shapes; names select the meaning. A canonical identity remains one
independent Entity contract, not one identity per factory.

## Bounded Slice

1. Compare existing Model Expression facilities with the parameter substitution needed for one
   scalar predicate; do not publish the 150a test fixture as a general registry.
2. Reflect input types and validation, with explicit optional single-input shorthand. Validate
   output membership against the target Entity; do not trust an arbitrary client template.
3. Lower to existing Selection ASTs and retain ordinary receiver field/scope enforcement. Do not
   invent a named authorization grant through client-side expansion.
4. Specify declaration identity/version, built-in identity factory name collisions, and how the
   original invocation survives authoring without claiming reverse inference from arbitrary ASTs.
5. Prove a conventional identity case and a domain criterion whose input is not an Entity Field.
6. Include both declaration and invocation in the proof. If a TypeScript callback builder is offered,
   compile symbolic inputs to reflected template data; do not serialize opaque JavaScript. Prove
   explicit input binding and distinguish deterministic expansion from changing membership. Hidden
   time/state and external I/O remain outside pure factories. See the declaration sketch in 150a;
   `by` is working authoring vocabulary, not a frozen domain keyword.

## Non-Goals

No Ref wire-format removal, immediate `refByX` deprecation, external resolver, saved-selection
persistence, bulk remote mutation, or new Runtime Protocol family. The two-dialect Read proof in
Plan 150 does not depend on implementing this proposal.

## Acceptance

- [ ] Public API and reflection are accepted after a small executable proof.
- [ ] Equivalent inputs and explicit shorthand lower identically; same-shaped named alternatives
      remain distinguishable and invalid inputs fail before execution.
- [ ] Canonical identity, explicit-member intent, consumer cardinality, and receiver policies remain
      intact; legacy facade and Ref contracts are not silently changed.
- [ ] Scope is split again if server-side resolution or a protocol extension becomes necessary.
