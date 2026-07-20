import type { TaskDefinition, TaskRunStore, TaskSnapshot } from '@ontahi/core/runtime/server/tasks';

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

export type VercelWorkflowTaskRunStore = Pick<
  TaskRunStore,
  'create' | 'attachRuntimeRef' | 'update' | 'loadSource' | 'listRecent'
>;

export type VercelWorkflowTaskRuntimeAdapterOptions = {
  taskRunStore: VercelWorkflowTaskRunStore;
  resolveWorkflow(taskId: string): VercelTaskWorkflow | undefined;
  createRunId?: () => string;
};

export type VercelWorkflowTaskExecutorStore = Pick<TaskRunStore, 'loadSource' | 'update'>;

export type VercelWorkflowTaskExecutorOptions = {
  taskRunStore: VercelWorkflowTaskExecutorStore;
  getTaskDefinition(taskId: string): TaskDefinition<any, any> | undefined;
  writeProgressEvent?(
    runId: string,
    progress: NonNullable<TaskSnapshot['progress']>,
  ): Promise<unknown>;
  writeResultEvent?(runId: string, result: unknown): Promise<unknown>;
};
