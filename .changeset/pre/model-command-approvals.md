---
'@ontahi/core': minor
---

Separate model-command preparation from canonical execution and add a runtime-neutral durable Task
that checkpoints typed choices and optional effect approvals. Extend the model command protocol
with a pending run result while reusing `durable.operation` for observation and responses.
