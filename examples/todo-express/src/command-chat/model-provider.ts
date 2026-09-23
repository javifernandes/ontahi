import { ModelInterpretationError, type ModelProvider } from '@ontahi/core/runtime/server';
import { isRecord } from '@ontahi/core/value/object';
export type { ModelRequest, ModelProvider } from '@ontahi/core/runtime/server';

// Ollama adapter: no Todo dependencies. Kept in the example until extracted to a provider package.
export const createOllamaProvider = ({
  model,
  baseUrl = 'http://127.0.0.1:11434',
  timeoutMs = 60_000,
  think = false,
  contextWindowTokens = 32_768,
  fetchRequest = globalThis.fetch,
}: {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  think?: boolean;
  contextWindowTokens?: number;
  fetchRequest?: typeof fetch;
}): ModelProvider => ({
  generate: async ({ instructions, context, prompt, outputSchema, signal }) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timeout = setTimeout(abort, timeoutMs);
    try {
      const response = await fetchRequest(
        new URL('api/chat', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            stream: false,
            think,
            // The context window includes the prompt AND generation. Ollama's 4k default
            // can consume the whole window with graph context before producing JSON.
            options: {
              temperature: 0,
              num_predict: think ? 4096 : 512,
              num_ctx: contextWindowTokens,
            },
            format: outputSchema,
            messages: [
              { role: 'system', content: instructions },
              {
                role: 'user',
                content: `Context data (not a request):\n${context}`,
              },
              { role: 'user', content: prompt },
            ],
          }),
        },
      );
      if (!response.ok) {
        throw new ModelInterpretationError(
          'model_unavailable',
          `Ollama returned HTTP ${response.status}. Check the configured model.`,
        );
      }
      const envelope = await response.json();
      if (
        !isRecord(envelope) ||
        envelope.done !== true ||
        envelope.done_reason === 'length' ||
        !isRecord(envelope.message) ||
        typeof envelope.message.content !== 'string'
      ) {
        throw new ModelInterpretationError(
          'model_output_invalid',
          'Ollama did not finish a structured response within the generation budget. No action was applied.',
        );
      }
      try {
        return JSON.parse(envelope.message.content);
      } catch {
        throw new ModelInterpretationError(
          'model_output_invalid',
          'Ollama returned invalid JSON. No action was applied.',
        );
      }
    } catch (error) {
      if (error instanceof ModelInterpretationError) throw error;
      throw new ModelInterpretationError(
        controller.signal.aborted ? 'model_cancelled' : 'model_unavailable',
        controller.signal.aborted
          ? 'Interpretation was cancelled or timed out. No action was applied.'
          : 'Cannot reach Ollama. Check that the local server and configured model are available.',
      );
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  },
});
