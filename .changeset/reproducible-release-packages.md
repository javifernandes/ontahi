---
---

Stabilize dependency-map ordering in packed manifests and verify byte-identical repeat packaging
before publishing. This changes release tooling only; public APIs and dependency versions stay the
same. Publish the exact Linux tarballs verified by preflight instead of rebuilding in the publishing
job; preserve dry-run artifacts for initial package-name bootstrap.
