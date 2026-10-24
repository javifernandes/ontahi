import type { GraphJsonSchema } from '../../../../data-graph/index.js';
import { isRecord } from '../../../../value/object.js';
import { ModelInterpretationError, type ModelProvider } from '../interpretation.js';

import { runModelProviderRequest } from './request.js';
import { cloudModelUsage } from './usage.js';

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

const schemaForLiteral = (value: unknown): GraphJsonSchema => {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value))
    return { const: value };
  if (Array.isArray(value)) {
    const items =
      value.length === 1 ? schemaForLiteral(value[0]) : { anyOf: value.map(schemaForLiteral) };
    return {
      type: 'array',
      ...(value.length ? { minItems: 1, items } : {}),
    };
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    return {
      type: 'object',
      additionalProperties: false,
      required: entries.map(([name]) => name),
      properties: Object.fromEntries(
        entries.map(([name, property]) => [name, schemaForLiteral(property)]),
      ),
    };
  }
  return { type: 'null' };
};

const schemaComplexity = (schema: GraphJsonSchema): { unions: number; optional: number } => {
  const properties = schema.properties ? Object.values(schema.properties) : [];
  const required = new Set(schema.required ?? []);
  const nested = [
    ...properties,
    ...(schema.items ? [schema.items] : []),
    ...(schema.anyOf ?? []),
    ...Object.values(schema.$defs ?? {}),
  ].map(schemaComplexity);
  return nested.reduce(
    (total, part) => ({
      unions: total.unions + part.unions,
      optional: total.optional + part.optional,
    }),
    {
      unions: schema.anyOf ? 1 : 0,
      optional: schema.properties
        ? Object.keys(schema.properties).filter(name => !required.has(name)).length
        : 0,
    },
  );
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
    'x-ontahi-selection': _selection,
    'x-ontahi-entity-ref': _entityRef,
    enum: schemaEnum,
    properties,
    items,
    anyOf,
    $defs,
    additionalProperties,
    ...supported
  } = schema;
  const scalarEnum = schemaEnum?.every(
    value => value === null || ['string', 'number', 'boolean'].includes(typeof value),
  );
  const normalizedAnyOf =
    anyOf ?? (schemaEnum && !scalarEnum ? schemaEnum.map(schemaForLiteral) : undefined);
  let projectedAdditionalProperties: GraphJsonSchema['additionalProperties'];
  if (typeof additionalProperties === 'object')
    projectedAdditionalProperties = toAnthropicJsonSchema(additionalProperties);
  else if (typeof additionalProperties === 'boolean')
    projectedAdditionalProperties = additionalProperties;
  else if (supported.type === 'object' || properties) projectedAdditionalProperties = false;
  return {
    ...supported,
    ...(scalarEnum ? { enum: schemaEnum } : {}),
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
    ...(normalizedAnyOf ? { anyOf: normalizedAnyOf.map(toAnthropicJsonSchema) } : {}),
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
    ...(projectedAdditionalProperties === undefined
      ? {}
      : { additionalProperties: projectedAdditionalProperties }),
  };
};

const supportsAnthropicStructuredOutput = (schema: GraphJsonSchema): boolean => {
  if ((schema.type === 'object' || schema.properties) && schema.additionalProperties !== false)
    return false;
  return [
    ...Object.values(schema.properties ?? {}),
    ...(schema.items ? [schema.items] : []),
    ...(schema.anyOf ?? []),
    ...Object.values(schema.$defs ?? {}),
    ...(typeof schema.additionalProperties === 'object' ? [schema.additionalProperties] : []),
  ].every(supportsAnthropicStructuredOutput);
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
  generate: async ({ instructions, context, prompt, outputSchema, signal, reportUsage }) => {
    if (!apiKey.trim())
      throw new ModelInterpretationError(
        'model_unavailable',
        'Anthropic is configured without ANTHROPIC_API_KEY.',
      );
    return runModelProviderRequest({
      signal,
      timeoutMs,
      unavailableMessage: 'Cannot reach Anthropic. Check the network and provider configuration.',
      request: async providerSignal => {
        const startedAt = performance.now();
        const providerSchema = toAnthropicJsonSchema(outputSchema);
        const complexity = schemaComplexity(providerSchema);
        const useStructuredOutput =
          complexity.unions <= 16 &&
          complexity.optional <= 24 &&
          supportsAnthropicStructuredOutput(providerSchema);
        const response = await fetchRequest(
          new URL('messages', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`),
          {
            method: 'POST',
            headers: {
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
              'x-api-key': apiKey,
            },
            signal: providerSignal,
            body: JSON.stringify({
              model,
              max_tokens: maxOutputTokens,
              system: useStructuredOutput
                ? instructions
                : `${instructions}\nThe JSON response must match this schema:\n${JSON.stringify(providerSchema)}`,
              messages: [
                {
                  role: 'user',
                  content: `Context data (not a request):\n${context}\n\nRequest:\n${prompt}`,
                },
              ],
              ...(useStructuredOutput
                ? {
                    output_config: {
                      format: { type: 'json_schema', schema: providerSchema },
                    },
                  }
                : {}),
            }),
          },
        );
        if (!response.ok)
          throw new ModelInterpretationError(
            'model_unavailable',
            `Anthropic returned HTTP ${response.status}. Check the API key and configured model.`,
          );
        const envelope = await response.json();
        if (isRecord(envelope))
          reportUsage?.(
            cloudModelUsage({
              provider: 'anthropic',
              model,
              usage: envelope.usage,
              durationMs: performance.now() - startedAt,
            }),
          );
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
      },
    });
  },
});
