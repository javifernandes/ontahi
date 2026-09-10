---
'@ontahi/core': minor
---

Add experimental data-first named Selection factories alongside existing locators. Declare scalar
input schemas and pure predicate/canonical-identity templates with `withSelectionFactories`, then
use typed `Entity.by({ factoryName: inputs })` on the definition or its client facade. Preserve
portable membership, explicit identity, consumer cardinality, and ordinary receiver authorization.
Expose declaration and original invocation metadata separately from execution ASTs; no fetch,
external resolver, locator deprecation, or remote Command protocol change is introduced.

Apply the consumer's one/many contract when normalizing an already constructed Selection input,
without mutating the caller's Selection. Previously that path preserved the caller's cardinality
and could bypass an Operation's exact-one mutation requirement.
