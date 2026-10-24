import { describe, expect, it, vi } from 'vitest';

import { createAnthropicModelProvider } from './anthropic.js';

const request = () => ({
  instructions: 'Resolve as JSON',
  context: '{}',
  prompt: 'Suggest one item',
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1 },
      target: { enum: [{ kind: 'entity-ref', id: 'todo-1' }] },
    },
  },
  signal: new AbortController().signal,
});

const completed = (text = '{"title":"Prepare dinner"}') =>
  Response.json({
    type: 'message',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
  });

describe('Anthropic model provider', () => {
  it('sends a schema-constrained Messages request and parses its output', async () => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(completed());
    const provider = createAnthropicModelProvider({
      model: 'claude-test',
      apiKey: 'secret',
      fetchRequest,
    });

    await expect(provider.generate(request())).resolves.toEqual({ title: 'Prepare dinner' });
    const [url, init] = fetchRequest.mock.calls[0]!;
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    expect(init?.headers).toEqual({
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'x-api-key': 'secret',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'claude-test',
      max_tokens: 2048,
      system: 'Resolve as JSON',
      messages: [
        {
          role: 'user',
          content: 'Context data (not a request):\n{}\n\nRequest:\nSuggest one item',
        },
      ],
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['title'],
            properties: {
              title: { type: 'string' },
              target: {
                anyOf: [
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['kind', 'id'],
                    properties: {
                      kind: { const: 'entity-ref' },
                      id: { const: 'todo-1' },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    });
  });

  it('preserves a custom base path and output budget', async () => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(completed());
    await createAnthropicModelProvider({
      model: 'claude-test',
      apiKey: 'secret',
      baseUrl: 'https://gateway.test/anthropic/',
      maxOutputTokens: 512,
      fetchRequest,
    }).generate(request());

    expect(String(fetchRequest.mock.calls[0]![0])).toBe('https://gateway.test/anthropic/messages');
    expect(JSON.parse(String(fetchRequest.mock.calls[0]![1]?.body))).toMatchObject({
      max_tokens: 512,
    });
  });

  it('uses prompt-level JSON guidance when the schema exceeds Anthropic union limits', async () => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(completed());
    const outputSchema = {
      type: 'object' as const,
      additionalProperties: false,
      required: Array.from({ length: 17 }, (_, index) => `value${index}`),
      properties: Object.fromEntries(
        Array.from({ length: 17 }, (_, index) => [
          `value${index}`,
          { anyOf: [{ const: `variant-${index}` }, { const: null }] },
        ]),
      ),
    };
    await createAnthropicModelProvider({
      model: 'claude-test',
      apiKey: 'secret',
      fetchRequest,
    }).generate({ ...request(), outputSchema });

    const body = JSON.parse(String(fetchRequest.mock.calls[0]![1]?.body));
    expect(body).not.toHaveProperty('output_config');
    expect(body.system).toContain('The JSON response must match this schema:');
    expect(body.system).toContain('variant-16');
  });

  it('rejects missing credentials before making a request', async () => {
    const fetchRequest = vi.fn<typeof fetch>();
    await expect(
      createAnthropicModelProvider({ model: 'claude-test', apiKey: '', fetchRequest }).generate(
        request(),
      ),
    ).rejects.toMatchObject({ code: 'model_unavailable' });
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it.each([
    [Response.json({}, { status: 401 }), 'model_unavailable'],
    [
      Response.json({ type: 'message', stop_reason: 'max_tokens', content: [] }),
      'model_output_invalid',
    ],
    [completed('not json'), 'model_output_invalid'],
    [
      Response.json({ type: 'message', stop_reason: 'end_turn', content: [] }),
      'model_output_invalid',
    ],
  ])('rejects failed or invalid responses', async (response, code) => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      createAnthropicModelProvider({
        model: 'claude-test',
        apiKey: 'secret',
        fetchRequest,
      }).generate(request()),
    ).rejects.toMatchObject({ code });
  });

  it('aborts an in-flight request on timeout', async () => {
    const fetchRequest = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    await expect(
      createAnthropicModelProvider({
        model: 'claude-test',
        apiKey: 'secret',
        timeoutMs: 5,
        fetchRequest,
      }).generate(request()),
    ).rejects.toMatchObject({ code: 'model_cancelled' });
  });
});
