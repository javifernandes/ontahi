import type { TaskDefinition, TaskSnapshot, TaskStorage } from '@ontahi/core/runtime/server/tasks';

export type VercelTaskWorkflowInput = {
  taskId: string;
  runId: string;
};

export type VercelTaskWorkflow = (input: VercelTaskWorkflowInput) => Promise<unknown>;

export type VercelTaskStepWorkflowInput = VercelTaskWorkflowInput & {
  stepName: string;
  input: unknown;
};

export type VercelTaskStepWorkflow = (input: VercelTaskStepWorkflowInput) => Promise<unknown>;

export type VercelTaskStepRunner = (input: VercelTaskStepWorkflowInput) => Promise<unknown>;

export type VercelWorkflowTaskStorage = Pick<
  TaskStorage,
  'create' | 'attachRuntimeRef' | 'update' | 'loadSource' | 'listRecent'
>;

export type VercelWorkflowTaskRuntimeOptions = {
  taskRunStore: VercelWorkflowTaskStorage;
  resolveWorkflow(taskId: string): VercelTaskWorkflow | undefined;
  createRunId?: () => string;
};

export type VercelWorkflowTaskExecutorStore = Pick<TaskStorage, 'loadSource' | 'update'>;

export type VercelWorkflowTaskExecutorOptions = {
  taskRunStore: VercelWorkflowTaskExecutorStore;
  getTaskDefinition(taskId: string): TaskDefinition<any, any> | undefined;
  writeProgressEvent?(
    runId: string,
    progress: NonNullable<TaskSnapshot['progress']>,
  ): Promise<unknown>;
  writeResultEvent?(runId: string, result: unknown): Promise<unknown>;
};
