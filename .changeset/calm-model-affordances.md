---
'@ontahi/core': minor
---

Pair Model Support graph policies with their scoped read and command exposures so applications can
derive authorization dispatchers and the model catalog from one registration boundary. Keep dynamic
catalog data receiver-local, infer full Model exposures from directly registered policies, and allow
static graph-only activation without exposure factories or an empty scope callback.
