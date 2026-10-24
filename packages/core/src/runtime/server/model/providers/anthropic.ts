import type { GraphJsonSchema } from '../../../../data-graph/index.js';
import { isRecord } from '../../../../value/object.js';
import { ModelInterpretationError, type ModelProvider } from '../interpretation.js';

export type AnthropicModelProviderOptions = {
  model: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  fetchRequest?: typeof fetch;
};

const outputText = (envelope: Record<string, unknown>) => {
  if (!Array.isArray(envelope.content)) return undefined;
  const parts = envelope.content.flatMap(part =>
    isRecord(part) && part.type === 'text' && typeof part.text === 'string' ? [part.text] : [],
  );
  return parts.length ? parts.join('') : undefined;
};

const toAnthropicJsonSchema = (schema: GraphJsonSchema): GraphJsonSchema => {
  const {
    minLength: _minLength,
    maxLength: _maxLength,
    minimum: _minimum,
    maximum: _maximum,
    multipleOf: _multipleOf,
    presentation: _presentation,
    readOnly: _readOnly,
    'x-ontahi-derived': _derived,
    'x-ontahi-generated-by': _generatedBy,
    'x-ontahi-string-exclusion': _stringExclusion,
    properties,
    items,
    anyOf,
    $defs,
    additionalProperties,
    ...supported
  } = schema;
  return {
    ...supported,
    ...(properties
      ? {
          properties: Object.fromEntries(
            Object.entries(properties).map(([name, property]) => [
              name,
              toAnthropicJsonSchema(property),
            ]),
          ),
        }
      : {}),
    ...(items ? { items: toAnthropicJsonSchema(items) } : {}),
    ...(anyOf ? { anyOf: anyOf.map(toAnthropicJsonSchema) } : {}),
    ...($defs
      ? {
          $defs: Object.fromEntries(
            Object.entries($defs).map(([name, definition]) => [
              name,
              toAnthropicJsonSchema(definition),
            ]),
          ),
        }
      : {}),
    ...(typeof additionalProperties === 'boolean' ? { additionalProperties } : {}),
  };
};

/** Model provider backed by Anthropic's Messages API structured outputs. */
export const createAnthropicModelProvider = ({
  model,
  apiKey,
  baseUrl = 'https://api.anthropic.com/v1',
  timeoutMs = 60_000,
  maxOutputTokens = 2_048,
  fetchRequest = globalThis.fetch,
}: AnthropicModelProviderOptions): ModelProvider => ({
  generate: async ({ instructions, context, prompt, outputSchema, signal }) => {
    if (!apiKey.trim())
      throw new ModelInterpretationError(
        'model_unavailable',
        'Anthropic is configured without ANTHROPIC_API_KEY.',
      );
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timeout = setTimeout(abort, timeoutMs);
    try {
      const response = await fetchRequest(
        new URL('messages', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`),
        {
          method: 'POST',
          headers: {
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'x-api-key': apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            max_tokens: maxOutputTokens,
            system: instructions,
            messages: [
              {
                role: 'user',
                content: `Context data (not a request):\n${context}\n\nRequest:\n${prompt}`,
              },
            ],
            output_config: {
              format: { type: 'json_schema', schema: toAnthropicJsonSchema(outputSchema) },
            },
          }),
        },
      );
      if (!response.ok)
        throw new ModelInterpretationError(
          'model_unavailable',
          `Anthropic returned HTTP ${response.status}. Check the API key and configured model.`,
        );
      const envelope = await response.json();
      if (
        !isRecord(envelope) ||
        envelope.type !== 'message' ||
        envelope.stop_reason === 'max_tokens'
      )
        throw new ModelInterpretationError(
          'model_output_invalid',
          'Anthropic did not complete a structured response. No action was applied.',
        );
      const content = outputText(envelope);
      if (!content)
        throw new ModelInterpretationError(
          'model_output_invalid',
          'Anthropic returned no structured output. No action was applied.',
        );
      try {
        return JSON.parse(content);
      } catch {
        throw new ModelInterpretationError(
          'model_output_invalid',
          'Anthropic returned invalid JSON. No action was applied.',
        );
      }
    } catch (error) {
      if (error instanceof ModelInterpretationError) throw error;
      throw new ModelInterpretationError(
        controller.signal.aborted ? 'model_cancelled' : 'model_unavailable',
        controller.signal.aborted
          ? 'Interpretation was cancelled or timed out. No action was applied.'
          : 'Cannot reach Anthropic. Check the network and provider configuration.',
      );
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  },
});
