ALTER TABLE "ontahi_task_runs"
  ADD COLUMN IF NOT EXISTS enqueue_trace jsonb,
  ADD COLUMN IF NOT EXISTS execution_ordinal integer NOT NULL DEFAULT 0;
