---
'@ontahi/language': minor
'@ontahi/language-codemirror': minor
'@ontahi/devtools': minor
---

Add TS/Declarative switching to the Devtools Console with shared read semantics, completion,
Boolean/enum controls, and receiver-backed table sort/limit edits. Switching never executes and
undo/redo restores source and dialect together. Invalid drafts remain untouched. Hosts can choose
an initial Console dialect; TS remains the default.
