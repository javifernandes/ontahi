import { createInProcessTaskExecutor } from './in-process-adapter.js';
import { createInMemoryTaskStorage } from './memory-store.js';
import type { InProcessTasksOptions, TaskConfig } from './types.js';

export const inProcessTasks = ({
  storage = createInMemoryTaskStorage(),
  ...executorOptions
}: InProcessTasksOptions = {}): TaskConfig => ({
  executor: createInProcessTaskExecutor(executorOptions),
  storage,
});
