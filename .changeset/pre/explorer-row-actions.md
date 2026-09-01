---
'@ontahi/core': minor
'@ontahi/explorer-react': patch
---

Add explicit Operation receiver metadata and project only receiver-bound operations onto Entity
table rows and instance windows. A row exposes its sole action directly and uses the compact action
menu when several operations bind to that instance, while relation creation remains contextual and
preserves bound inputs, destructive confirmation, and refresh after execution.
