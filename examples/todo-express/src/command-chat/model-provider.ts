import type { GraphJsonSchema } from '@ontahi/core/data-graph';
import { isRecord } from '@ontahi/core/value/object';

import { TodoCommandError } from './contracts.js';

export type ModelRequest = {
  instructions: string;
  context: string;
  outputSchema: GraphJsonSchema;
  signal: AbortSignal;
};
export type ModelProvider = {
  generate(request: ModelRequest): Promise<unknown>;
};

// Example-local seam: provider envelopes never become operation or graph contracts.
export const createOllamaProvider = ({
  model,
  baseUrl = 'http://127.0.0.1:11434',
  timeoutMs = 60_000,
  fetchRequest = globalThis.fetch,
}: {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchRequest?: typeof fetch;
}): ModelProvider => ({
  generate: async ({ instructions, context, outputSchema, signal }) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timeout = setTimeout(abort, timeoutMs);
    try {
      const response = await fetchRequest(new URL('/api/chat', baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          options: { temperature: 0, num_predict: 512 },
          format: outputSchema,
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: context },
          ],
        }),
      });
      if (!response.ok) {
        throw new TodoCommandError(
          'model_unavailable',
          `Ollama returned HTTP ${response.status}. Check the configured model.`,
        );
      }
      const envelope = await response.json();
      if (
        !isRecord(envelope) ||
        envelope.done !== true ||
        !isRecord(envelope.message) ||
        typeof envelope.message.content !== 'string'
      ) {
        throw new TodoCommandError(
          'model_output_invalid',
          'Ollama did not return a complete structured response.',
        );
      }
      try {
        return JSON.parse(envelope.message.content);
      } catch {
        throw new TodoCommandError(
          'model_output_invalid',
          'Ollama returned invalid JSON. No action was applied.',
        );
      }
    } catch (error) {
      if (error instanceof TodoCommandError) throw error;
      throw new TodoCommandError(
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
