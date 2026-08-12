import type { TaskRunIdentity, TaskSnapshot } from '@ontahi/core/runtime/server/tasks';
import type { Request, RequestHandler } from 'express';

export type CreateExpressTaskSnapshotHandlerOptions = {
  getSnapshot: (ref: TaskRunIdentity) => Promise<TaskSnapshot>;
  reportError?: (error: unknown, request: Request) => void;
};

export const createExpressTaskSnapshotHandler =
  ({ getSnapshot, reportError }: CreateExpressTaskSnapshotHandlerOptions): RequestHandler =>
  async (request, response) => {
    try {
      const snapshot = await getSnapshot({
        taskId: request.params.taskId,
        runId: request.params.runId,
      });

      response.json(snapshot);
    } catch (error) {
      reportError?.(error, request);
      response.status(500).json({ error: 'Task snapshot is temporarily unavailable.' });
    }
  };
