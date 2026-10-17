---
'@ontahi/core': minor
---

Add typed Event declarations, canonical JSON-safe emissions and occurrences, application
reflection, and a default ephemeral in-memory Event Runtime with headless fan-out and cancellation.
Typed Operation effects and post-commit Mutation Reactions now use the built-in Event interpreter,
while raw `emit-event` intents retain their existing effector compatibility path.
