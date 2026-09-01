---
'@ontahi/explorer-react': patch
---

Present Entity, instance, and Relation action choices as compact menus without repeating the
surrounding node's heading or context label. Action execution panels retain their own navigation
and close controls after a choice is made, while fully bound destructive actions confirm inline
and operations without editable inputs omit the reset control. Executable action forms no longer
surface their bridge or local-runtime transport details to domain users.
Durable operations represented by a reflected task now appear only once, Relation action portals
retain their Explorer theme, and a sole related-instance action is exposed directly instead of
hiding behind a one-item menu.
