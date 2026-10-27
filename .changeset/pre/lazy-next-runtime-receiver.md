---
'@ontahi/core': patch
'@ontahi/runtime-nextjs': patch
---

Allow Next.js hosts to mount lazily composed application Runtime Protocol receivers without
rebuilding family dispatch, and keep server-only Operations unreachable through that bridge.
