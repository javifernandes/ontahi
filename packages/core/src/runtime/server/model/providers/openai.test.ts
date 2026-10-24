import { describe, expect, it, vi } from 'vitest';

import { createOpenAIModelProvider } from './openai.js';

const request = () => ({
  instructions: 'Resolve as JSON',
  context: '{}',
  prompt: 'Suggest one item',
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['title'],
    properties: { title: { type: 'string' } },
  },
  signal: new AbortController().signal,
});

const completed = (text = '{"title":"Prepare dinner"}') =>
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
          schema: request().outputSchema,
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
});
