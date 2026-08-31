---
'@ontahi/explorer-react': minor
'@ontahi/runtime-express': minor
---

Let identified Entity rows open non-blocking instance windows with reflected scalar values,
portable Reference links, and direct or inverse related instances. Multiple windows can remain
expanded for comparison or collapse in place into compact canvas nodes. Related Queries now run only
for open instances instead of once per visible row and Relation. The Explorer-level workspace
preserves mixed-Entity expanded and collapsed nodes across Entity and query navigation without
using browser storage, including when following Reference or related-instance links; navigating to
an already open instance restores it, while related rows open as another window. The workspace
rehydrates a collapsed row when it is expanded. Windows use their content height and become
internally scrollable only when they reach the available viewport height. Expanded headers and
compact nodes share one drag surface and positioning model; positions remain in the ephemeral
workspace across activation, Entity navigation, collapse, and expansion, while the active node
comes to the front. Authorized Fields share type-aware table and window editors for booleans,
enums, numbers, dates, JSON, nullable values, colors, and References, and authoritative data is
re-read after a mutation succeeds.

Reference values in tables and instance windows now resolve the authorized target instance and
render its reflected primary and secondary display fields. Portable locators remain the navigation
identity, tooltip, and safe fallback when the target cannot be resolved.

Authorized many-to-many policies now project `add` and `remove` Relation affordances into the
Explorer snapshot. Instance windows consume those affordances through a searchable participant
picker and compact unlink controls, execute canonical Relationship Commands, and refresh related
data from the server after each applied outcome.
