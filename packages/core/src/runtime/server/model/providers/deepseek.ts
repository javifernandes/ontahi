import { isRecord } from '../../../../value/object.js';
import { ModelInterpretationError, type ModelProvider } from '../interpretation.js';

export type DeepSeekModelProviderOptions = {
  model: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  reasoningEffort?: 'none' | 'low' | 'high' | 'max';
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

/** Model provider backed by DeepSeek's OpenAI-compatible Responses API. */
export const createDeepSeekModelProvider = ({
  model,
  apiKey,
  baseUrl = 'https://api.deepseek.com',
  timeoutMs = 60_000,
  reasoningEffort = 'none',
  fetchRequest = globalThis.fetch,
}: DeepSeekModelProviderOptions): ModelProvider => ({
  generate: async ({ instructions, context, prompt, outputSchema, signal }) => {
    if (!apiKey.trim())
      throw new ModelInterpretationError(
        'model_unavailable',
        'DeepSeek is configured without DEEPSEEK_API_KEY.',
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
            reasoning: { effort: reasoningEffort },
            temperature: 0,
            max_output_tokens: reasoningEffort === 'none' ? 1024 : 4096,
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
          `DeepSeek returned HTTP ${response.status}. Check the API key and configured model.`,
        );
      const envelope = await response.json();
      if (!isRecord(envelope) || envelope.status !== 'completed')
        throw new ModelInterpretationError(
          'model_output_invalid',
          'DeepSeek did not complete a structured response. No action was applied.',
        );
      const content = outputText(envelope);
      if (!content)
        throw new ModelInterpretationError(
          'model_output_invalid',
          'DeepSeek returned no structured output. No action was applied.',
        );
      try {
        return JSON.parse(content);
      } catch {
        throw new ModelInterpretationError(
          'model_output_invalid',
          'DeepSeek returned invalid JSON. No action was applied.',
        );
      }
    } catch (error) {
      if (error instanceof ModelInterpretationError) throw error;
      throw new ModelInterpretationError(
        controller.signal.aborted ? 'model_cancelled' : 'model_unavailable',
        controller.signal.aborted
          ? 'Interpretation was cancelled or timed out. No action was applied.'
          : 'Cannot reach DeepSeek. Check the network and provider configuration.',
      );
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  },
});
