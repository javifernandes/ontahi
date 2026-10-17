---
'@ontahi/core': minor
'@ontahi/supabase': minor
---

Add opt-in Runtime Protocol metadata for committed semantic mutations from Graph Commands,
Operations, and terminal durable Operations. Hosts must explicitly project metadata for the
caller's authority, while receivers that do not advertise the capability keep the previous
response shape.

Durable Task execution now owns an isolated mutation journal and persists accumulated execution
metadata across human-in-the-loop resumes. Supabase Task stores persist this optional metadata in
an `execution_metadata` JSON column when a Task commits graph mutations.
