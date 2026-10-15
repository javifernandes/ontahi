import type {
  TaskExecutionInteractionRequest,
  TaskExecutionState,
  TaskRunIdentity,
} from '@ontahi/core/runtime/server/tasks';

const hash = (value: string) => {
  let result = 2_166_136_261;

  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16_777_619);
  }

  return (result >>> 0).toString(36);
};

export const vercelInteractionId = (
  ref: TaskRunIdentity,
  state: TaskExecutionState,
  request: TaskExecutionInteractionRequest,
) => request.id ?? `vercel-${hash(JSON.stringify([ref.taskId, ref.runId, state, request]))}`;

export const vercelInteractionHookToken = (ref: TaskRunIdentity, interactionId: string) =>
  ['ontahi-task-interaction', ref.taskId, ref.runId, interactionId]
    .map(encodeURIComponent)
    .join(':');
