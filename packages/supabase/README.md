# @ontahi/supabase

Supabase adapters for Ontahi applications.

This package depends on `@ontahi/core` and should not leak back into core. It currently contains:

1. `@ontahi/supabase/data-graph`: Supabase execution runtime and query/command helpers for the Ontahi data graph.
2. `@ontahi/supabase/tasks`: Supabase-backed task run store for Ontahi task runtimes.

BookOps is the first host application using these adapters. Product-specific graph schemas, repositories, task definitions, and workflow descriptors should stay in BookOps.
