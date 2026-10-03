import { describe, expect, it, vi } from 'vitest';

import { createDeepSeekModelProvider } from './deepseek-model-provider.js';

const request = () => ({
  instructions: 'Resolve as JSON',
  context: '{}',
  prompt: 'Complete all items in Later',
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['status'],
    properties: { status: { const: 'help' } },
  },
  signal: new AbortController().signal,
});

const completed = (text = '{"status":"help"}') =>
  Response.json({
    status: 'completed',
    output: [
      { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'ignored' }] },
      { type: 'message', content: [{ type: 'output_text', text }] },
    ],
  });

describe('DeepSeek model provider', () => {
  it('sends a schema-constrained Responses request and parses its output', async () => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(completed());
    const provider = createDeepSeekModelProvider({
      model: 'deepseek-flash',
      apiKey: 'secret',
      fetchRequest,
    });

    await expect(provider.generate(request())).resolves.toEqual({ status: 'help' });
    const [url, init] = fetchRequest.mock.calls[0]!;
    expect(String(url)).toBe('https://api.deepseek.com/responses');
    expect(init?.headers).toEqual({
      authorization: 'Bearer secret',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'deepseek-flash',
      stream: false,
      reasoning: { effort: 'none' },
      temperature: 0,
      max_output_tokens: 1024,
      instructions: 'Resolve as JSON',
      input: [
        { role: 'user', content: 'Context data (not a request):\n{}' },
        { role: 'user', content: 'Complete all items in Later' },
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

  it('preserves a custom base path and reasoning budget', async () => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(completed());
    await createDeepSeekModelProvider({
      model: 'deepseek-v4-pro',
      apiKey: 'secret',
      baseUrl: 'https://gateway.test/deepseek/',
      reasoningEffort: 'high',
      fetchRequest,
    }).generate(request());

    expect(String(fetchRequest.mock.calls[0]![0])).toBe('https://gateway.test/deepseek/responses');
    expect(JSON.parse(String(fetchRequest.mock.calls[0]![1]?.body))).toMatchObject({
      reasoning: { effort: 'high' },
      max_output_tokens: 4096,
    });
  });

  it('rejects missing credentials before making a request', async () => {
    const fetchRequest = vi.fn<typeof fetch>();
    await expect(
      createDeepSeekModelProvider({ model: 'deepseek-flash', apiKey: '', fetchRequest }).generate(
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
      createDeepSeekModelProvider({
        model: 'deepseek-flash',
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
      createDeepSeekModelProvider({
        model: 'deepseek-flash',
        apiKey: 'secret',
        timeoutMs: 5,
        fetchRequest,
      }).generate(request()),
    ).rejects.toMatchObject({ code: 'model_cancelled' });
  });
});
