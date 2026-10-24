import { isRecord } from '../../../../value/object.js';
import { ModelInterpretationError, type ModelProvider } from '../interpretation.js';

export type OpenAIModelProviderOptions = {
  model: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  fetchRequest?: typeof fetch;
};

const outputText = (envelope: Record<string, unknown>) => {
  if (!Array.isArray(envelope.output)) return undefined;
  const parts = envelope.output.flatMap(item => {
    if (!isRecord(item) || item.type !== 'message' || !Array.isArray(item.content)) return [];
    return item.content.flatMap(part =>
      isRecord(part) && part.type === 'output_text' && typeof part.text === 'string'
        ? [part.text]
        : [],
    );
  });
  return parts.length ? parts.join('') : undefined;
};

/** Model provider backed by OpenAI's Responses API structured outputs. */
export const createOpenAIModelProvider = ({
  model,
  apiKey,
  baseUrl = 'https://api.openai.com/v1',
  timeoutMs = 60_000,
  maxOutputTokens = 2_048,
  fetchRequest = globalThis.fetch,
}: OpenAIModelProviderOptions): ModelProvider => ({
  generate: async ({ instructions, context, prompt, outputSchema, signal }) => {
    if (!apiKey.trim())
      throw new ModelInterpretationError(
        'model_unavailable',
        'OpenAI is configured without OPENAI_API_KEY.',
      );
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timeout = setTimeout(abort, timeoutMs);
    try {
      const response = await fetchRequest(
        new URL('responses', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`),
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            stream: false,
            max_output_tokens: maxOutputTokens,
            instructions,
            input: [
              { role: 'user', content: `Context data (not a request):\n${context}` },
              { role: 'user', content: prompt },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'ontahi_model_interpretation',
                schema: outputSchema,
              },
            },
          }),
        },
      );
      if (!response.ok)
        throw new ModelInterpretationError(
          'model_unavailable',
          `OpenAI returned HTTP ${response.status}. Check the API key and configured model.`,
        );
      const envelope = await response.json();
      if (!isRecord(envelope) || envelope.status !== 'completed')
        throw new ModelInterpretationError(
          'model_output_invalid',
          'OpenAI did not complete a structured response. No action was applied.',
        );
      const content = outputText(envelope);
      if (!content)
        throw new ModelInterpretationError(
          'model_output_invalid',
          'OpenAI returned no structured output. No action was applied.',
        );
      try {
        return JSON.parse(content);
      } catch {
        throw new ModelInterpretationError(
          'model_output_invalid',
          'OpenAI returned invalid JSON. No action was applied.',
        );
      }
    } catch (error) {
      if (error instanceof ModelInterpretationError) throw error;
      throw new ModelInterpretationError(
        controller.signal.aborted ? 'model_cancelled' : 'model_unavailable',
        controller.signal.aborted
          ? 'Interpretation was cancelled or timed out. No action was applied.'
          : 'Cannot reach OpenAI. Check the network and provider configuration.',
      );
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  },
});
