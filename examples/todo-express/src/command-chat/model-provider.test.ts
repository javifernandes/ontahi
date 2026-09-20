import { describe, expect, it, vi } from 'vitest';

import { createOllamaProvider } from './model-provider.js';

const request = () => ({
  instructions: 'Resolve',
  context: '{}',
  prompt: 'Add bread',
  outputSchema: { type: 'object' },
  signal: new AbortController().signal,
});

describe('Ollama model provider', () => {
  it('sends a structured single-turn request and parses its result', async () => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        done: true,
        message: { content: '{"status":"unresolved","reason":"Missing item"}' },
      }),
    );
    const provider = createOllamaProvider({ model: 'local-small', fetchRequest });
    expect(await provider.generate(request())).toEqual({
      status: 'unresolved',
      reason: 'Missing item',
    });
    const [url, init] = fetchRequest.mock.calls[0]!;
    expect(String(url)).toBe('http://127.0.0.1:11434/api/chat');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'local-small',
      stream: false,
      format: { type: 'object' },
    });
    const payload = JSON.parse(String(init?.body));
    expect(payload.messages[1].content).toBe('Context data (not a request):\n{}');
    expect(payload.messages[2]).toEqual({ role: 'user', content: 'Add bread' });
    expect(fetchRequest).toHaveBeenCalledOnce();
  });

  it.each([
    [Response.json({}, { status: 503 }), 'model_unavailable'],
    [Response.json({ done: true, message: { content: 'not json' } }), 'model_output_invalid'],
    [Response.json({ done: false, message: { content: '{}' } }), 'model_output_invalid'],
  ])('rejects invalid/failed responses without retrying', async (response, code) => {
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      createOllamaProvider({ model: 'small', fetchRequest }).generate(request()),
    ).rejects.toMatchObject({ code });
    expect(fetchRequest).toHaveBeenCalledOnce();
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
      createOllamaProvider({ model: 'small', timeoutMs: 5, fetchRequest }).generate(request()),
    ).rejects.toMatchObject({ code: 'model_cancelled' });
    expect(fetchRequest.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });

  it('propagates caller cancellation', async () => {
    const controller = new AbortController();
    const fetchRequest = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const result = createOllamaProvider({ model: 'small', fetchRequest }).generate({
      ...request(),
      signal: controller.signal,
    });
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: 'model_cancelled' });
  });
});
