import { describe, expect, it, vi } from 'vitest';

import type { GraphJsonSchema } from '../../../../data-graph/index.js';

import { createOpenAIModelProvider } from './openai.js';

const request = () => ({
  instructions: 'Resolve as JSON',
  context: '{}',
  prompt: 'Suggest one item',
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['title'],
    properties: { title: { type: 'string' }, reason: { type: 'string' } },
  },
  signal: new AbortController().signal,
});

const completed = (text = '{"title":"Prepare dinner","reason":null}') =>
  Response.json({
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
  });

describe('OpenAI model provider', () => {
  it('sends a schema-constrained Responses request and parses its output', async () => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(completed());
    const provider = createOpenAIModelProvider({
      model: 'gpt-test',
      apiKey: 'secret',
      fetchRequest,
    });

    await expect(provider.generate(request())).resolves.toEqual({ title: 'Prepare dinner' });
    const [url, init] = fetchRequest.mock.calls[0]!;
    expect(String(url)).toBe('https://api.openai.com/v1/responses');
    expect(init?.headers).toEqual({
      authorization: 'Bearer secret',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'gpt-test',
      stream: false,
      max_output_tokens: 2048,
      instructions: 'Resolve as JSON',
      input: [
        { role: 'user', content: 'Context data (not a request):\n{}' },
        { role: 'user', content: 'Suggest one item' },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'ontahi_model_interpretation',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'reason'],
            properties: {
              title: { type: 'string' },
              reason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            },
          },
        },
      },
    });
  });

  it('preserves a custom base path and output budget', async () => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(completed());
    await createOpenAIModelProvider({
      model: 'gpt-test',
      apiKey: 'secret',
      baseUrl: 'https://gateway.test/openai/',
      maxOutputTokens: 512,
      fetchRequest,
    }).generate(request());

    expect(String(fetchRequest.mock.calls[0]![0])).toBe('https://gateway.test/openai/responses');
    expect(JSON.parse(String(fetchRequest.mock.calls[0]![1]?.body))).toMatchObject({
      max_output_tokens: 512,
    });
  });

  it('uses JSON Object guidance when the canonical schema is a root union', async () => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(completed());
    const outputSchema: GraphJsonSchema = {
      anyOf: [
        {
          type: 'object' as const,
          additionalProperties: false,
          required: ['status'],
          properties: { status: { const: 'help' } },
        },
        {
          type: 'object' as const,
          additionalProperties: false,
          required: ['status', 'reason'],
          properties: { status: { const: 'unresolved' }, reason: { type: 'string' as const } },
        },
      ],
    };
    await createOpenAIModelProvider({
      model: 'gpt-test',
      apiKey: 'secret',
      fetchRequest,
    }).generate({ ...request(), outputSchema });

    const body = JSON.parse(String(fetchRequest.mock.calls[0]![1]?.body));
    expect(body.text.format).toEqual({ type: 'json_object' });
    expect(body.instructions).toContain('Return a json object matching this schema:');
    expect(body.instructions).toContain('unresolved');
    expect(body.input[1].content).toContain('Return a json object.');
  });

  it('projects definitions and normalizes nested arrays and union objects', async () => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(
      completed(
        JSON.stringify({
          entries: [{ kind: 'count', value: 2, note: null }],
          result: { code: 'ok' },
        }),
      ),
    );
    const outputSchema: GraphJsonSchema = {
      type: 'object',
      required: ['entries', 'result'],
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            required: ['kind', 'value'],
            properties: {
              kind: { const: 'count' },
              value: { type: 'integer' },
              note: { type: 'string' },
            },
          },
        },
        result: {
          anyOf: [
            {
              type: 'object',
              required: ['code'],
              properties: { code: { type: 'string' } },
            },
            { type: 'null' },
          ],
        },
      },
      $defs: { label: { type: 'string' } },
    };
    const provider = createOpenAIModelProvider({
      model: 'gpt-test',
      apiKey: 'secret',
      fetchRequest,
    });

    await expect(provider.generate({ ...request(), outputSchema })).resolves.toEqual({
      entries: [{ kind: 'count', value: 2 }],
      result: { code: 'ok' },
    });
    const body = JSON.parse(String(fetchRequest.mock.calls[0]![1]?.body));
    expect(body.text.format.schema.$defs).toEqual({ label: { type: 'string' } });
  });

  it('rejects missing credentials before making a request', async () => {
    const fetchRequest = vi.fn<typeof fetch>();
    await expect(
      createOpenAIModelProvider({ model: 'gpt-test', apiKey: '', fetchRequest }).generate(
        request(),
      ),
    ).rejects.toMatchObject({ code: 'model_unavailable' });
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it.each([
    [Response.json({}, { status: 401 }), 'model_unavailable'],
    [Response.json({ status: 'failed', output: [] }), 'model_output_invalid'],
    [completed('not json'), 'model_output_invalid'],
    [Response.json({ status: 'completed', output: [] }), 'model_output_invalid'],
  ])('rejects failed or invalid responses', async (response, code) => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      createOpenAIModelProvider({ model: 'gpt-test', apiKey: 'secret', fetchRequest }).generate(
        request(),
      ),
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
      createOpenAIModelProvider({
        model: 'gpt-test',
        apiKey: 'secret',
        timeoutMs: 5,
        fetchRequest,
      }).generate(request()),
    ).rejects.toMatchObject({ code: 'model_cancelled' });
  });

  it('maps network failures and already-aborted requests to stable provider errors', async () => {
    await expect(
      createOpenAIModelProvider({
        model: 'gpt-test',
        apiKey: 'secret',
        fetchRequest: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
      }).generate(request()),
    ).rejects.toMatchObject({ code: 'model_unavailable' });

    const controller = new AbortController();
    controller.abort();
    const fetchRequest = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.signal?.aborted).toBe(true);
      throw new Error('aborted');
    });
    await expect(
      createOpenAIModelProvider({ model: 'gpt-test', apiKey: 'secret', fetchRequest }).generate({
        ...request(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'model_cancelled' });
  });
});
