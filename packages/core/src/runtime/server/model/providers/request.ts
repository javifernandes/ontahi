import { ModelInterpretationError } from '../interpretation.js';

export const runModelProviderRequest = async <TValue>({
  signal,
  timeoutMs,
  unavailableMessage,
  request,
}: {
  signal: AbortSignal;
  timeoutMs: number;
  unavailableMessage: string;
  request: (signal: AbortSignal) => Promise<TValue>;
}): Promise<TValue> => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, timeoutMs);
  try {
    return await request(controller.signal);
  } catch (error) {
    if (error instanceof ModelInterpretationError) throw error;
    throw new ModelInterpretationError(
      controller.signal.aborted ? 'model_cancelled' : 'model_unavailable',
      controller.signal.aborted
        ? 'Interpretation was cancelled or timed out. No action was applied.'
        : unavailableMessage,
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
};
