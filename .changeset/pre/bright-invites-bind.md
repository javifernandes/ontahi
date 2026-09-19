---
'@ontahi/core': patch
---

Bind Ref operation shortcuts to the matching schema-native `ref` or `existingRef` input participant,
including named Values and optional/nullable fields. Preserve legacy locator inputs and explicit
input adapters; reject ambiguous same-Entity receivers with guidance to invoke the Operation explicitly.
