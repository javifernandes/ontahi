import type { GraphJsonSchema } from '../../../../data-graph/index.js';
import { isRecord } from '../../../../value/object.js';
import { ModelInterpretationError, type ModelProvider } from '../interpretation.js';

import { runModelProviderRequest } from './request.js';

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

const toOpenAIJsonSchema = (schema: GraphJsonSchema): GraphJsonSchema => {
  const { properties, items, anyOf, $defs, required, ...rest } = schema;
  const requiredNames = new Set(required ?? []);
  let objectShape: GraphJsonSchema = {};
  if (properties) {
    objectShape = {
      properties: Object.fromEntries(
        Object.entries(properties).map(([name, property]) => {
          const projected = toOpenAIJsonSchema(property);
          return [
            name,
            requiredNames.has(name) ? projected : { anyOf: [projected, { type: 'null' as const }] },
          ];
        }),
      ),
      required: Object.keys(properties),
      additionalProperties: false,
    };
  } else if (required) objectShape = { required };
  return {
    ...rest,
    ...objectShape,
    ...(items ? { items: toOpenAIJsonSchema(items) } : {}),
    ...(anyOf ? { anyOf: anyOf.map(toOpenAIJsonSchema) } : {}),
    ...($defs
      ? {
          $defs: Object.fromEntries(
            Object.entries($defs).map(([name, definition]) => [
              name,
              toOpenAIJsonSchema(definition),
            ]),
          ),
        }
      : {}),
  };
};

const matchesSchemaShape = (value: unknown, schema: GraphJsonSchema): boolean => {
  if (schema.const !== undefined) return JSON.stringify(value) === JSON.stringify(schema.const);
  if (schema.anyOf) return schema.anyOf.some(candidate => matchesSchemaShape(value, candidate));
  if (schema.type === 'object') {
    if (!isRecord(value)) return false;
    if (schema.required?.some(name => !(name in value))) return false;
    return Object.entries(schema.properties ?? {}).every(
      ([name, property]) => !(name in value) || matchesSchemaShape(value[name], property),
    );
  }
  if (schema.type === 'array') return Array.isArray(value);
  if (schema.type === 'null') return value === null;
  if (schema.type === 'number' || schema.type === 'integer') return typeof value === 'number';
  return schema.type === undefined || typeof value === schema.type;
};

const normalizeOpenAIOutput = (value: unknown, schema: GraphJsonSchema): unknown => {
  if (schema.anyOf) {
    const branch = schema.anyOf.find(candidate => matchesSchemaShape(value, candidate));
    return branch ? normalizeOpenAIOutput(value, branch) : value;
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items)
    return value.map(item => normalizeOpenAIOutput(item, schema.items!));
  if (schema.type !== 'object' || !isRecord(value) || !schema.properties) return value;
  const required = new Set(schema.required ?? []);
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, propertyValue]) => {
      const propertySchema = schema.properties?.[name];
      if (!propertySchema) return [[name, propertyValue]];
      if (!required.has(name) && propertyValue === null) return [];
      return [[name, normalizeOpenAIOutput(propertyValue, propertySchema)]];
    }),
  );
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
    return runModelProviderRequest({
      signal,
      timeoutMs,
      unavailableMessage: 'Cannot reach OpenAI. Check the network and provider configuration.',
      request: async providerSignal => {
        const providerSchema = toOpenAIJsonSchema(outputSchema);
        const useStructuredOutput = providerSchema.type === 'object' && !providerSchema.anyOf;
        const response = await fetchRequest(
          new URL('responses', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`),
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${apiKey}`,
              'content-type': 'application/json',
            },
            signal: providerSignal,
            body: JSON.stringify({
              model,
              stream: false,
              max_output_tokens: maxOutputTokens,
              instructions: useStructuredOutput
                ? instructions
                : `${instructions}\nReturn a json object matching this schema:\n${JSON.stringify(providerSchema)}`,
              input: [
                { role: 'user', content: `Context data (not a request):\n${context}` },
                {
                  role: 'user',
                  content: useStructuredOutput ? prompt : `Return a json object.\n\n${prompt}`,
                },
              ],
              text: {
                format: useStructuredOutput
                  ? {
                      type: 'json_schema',
                      name: 'ontahi_model_interpretation',
                      schema: providerSchema,
                    }
                  : { type: 'json_object' },
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
          return normalizeOpenAIOutput(JSON.parse(content), outputSchema);
        } catch {
          throw new ModelInterpretationError(
            'model_output_invalid',
            'OpenAI returned invalid JSON. No action was applied.',
          );
        }
      },
    });
  },
});
