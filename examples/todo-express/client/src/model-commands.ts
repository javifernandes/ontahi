import type { ModelCommandRequest, ModelCommandResult } from '@ontahi/core/runtime/contracts';

export const submitModelCommand = async (
  request: ModelCommandRequest,
): Promise<{ ok: true; value: ModelCommandResult } | { ok: false; message?: string }> => {
  const response = await fetch('/model/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const result = await response.json();
  if (
    !result ||
    typeof result.ok !== 'boolean' ||
    (result.ok &&
      (!result.value ||
        !['executed', 'answered', 'unresolved'].includes(result.value.status) ||
        typeof result.value.message !== 'string'))
  )
    throw new Error('Invalid model command response.');
  return result;
};
