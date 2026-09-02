---
'@ontahi/core': minor
'@ontahi/explorer-react': patch
'@ontahi/postgres': patch
'@ontahi/supabase': patch
---

Allow scalar Entity fields to declare a reusable semantic value type with `field.named`. Reflected
Entity data and operation schemas preserve that type so Explorer controls can be selected from the
domain model instead of field-name conventions. The Todo example now declares `Color` this way,
and Explorer renders it with a color picker while simplifying required one-Entity selections.
