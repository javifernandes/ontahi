import type { TaskActor, TaskTrigger } from './types.js';

export const createSystemTaskTrigger = (input: Omit<TaskTrigger, 'cause'> = {}): TaskTrigger => ({
  cause: 'system',
  ...input,
});

export const createUserTaskTrigger = ({
  userId,
  ingress,
  source,
}: {
  userId: string;
  ingress?: TaskTrigger['ingress'];
  source?: TaskTrigger['source'];
}): TaskTrigger => ({
  cause: 'user_request',
  actor: {
    kind: 'user',
    id: userId,
  },
  ...(ingress ? { ingress } : {}),
  ...(source ? { source } : {}),
});

export const normalizeTaskTrigger = (trigger: TaskTrigger | undefined): TaskTrigger =>
  trigger ?? createSystemTaskTrigger();

export const taskTriggerActorMatches = (trigger: TaskTrigger, actor: TaskActor) =>
  trigger.actor?.kind === actor.kind && (actor.id === undefined || trigger.actor.id === actor.id);
