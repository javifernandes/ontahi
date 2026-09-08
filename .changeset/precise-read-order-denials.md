---
'@ontahi/core': patch
---

Explain Graph Read ordering policy rejections with the requested Entity and Field, preserving the
stable access_denied code and adding optional structured ordering_not_allowed details. Other
authorization failures remain generic, and no read permissions are broadened.
