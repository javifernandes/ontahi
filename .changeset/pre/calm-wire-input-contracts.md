---
'@ontahi/codegen': patch
---

Project Operation wire input schemas without copying or executing server-side transform and refinement
callbacks. Preserve raw caller types, nested Values and server-processing metadata in analysis, while
leaving parsing and authoritative validation in the receiving runtime. Server-only Value inventory no
longer requires browser portability. Transformed outputs still require an explicit portable result
schema instead of pretending the pre-transform input describes the result.
