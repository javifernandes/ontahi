import type { IncomingMessage } from 'node:http';

import { createRuntimeProtocolDispatcher } from '@ontahi/core/runtime/protocol';
import { describe, expect, it } from 'vitest';

import {
  authorizeSameOriginRuntimeProtocolUpgrade,
  createExpressRuntimeProtocolHost,
} from './host.js';

const request = (origin: string | undefined, host = 'todo.example', encrypted = false) =>
  ({
    headers: { ...(origin === undefined ? {} : { origin }), host },
    socket: { encrypted },
  }) as unknown as IncomingMessage;

const receiver = {
  dispatcher: createRuntimeProtocolDispatcher({ handlers: {} }),
  graphReadPolicies: [],
  graphCommandPolicies: [],
} as never;

describe('Express Runtime Protocol host', () => {
  it('authorizes only the effective same-origin browser upgrade', () => {
    expect(authorizeSameOriginRuntimeProtocolUpgrade(request('http://todo.example'))).toBe(true);
    expect(authorizeSameOriginRuntimeProtocolUpgrade(request('https://todo.example'))).toBe(false);
    expect(
      authorizeSameOriginRuntimeProtocolUpgrade(request('https://todo.example', undefined, true)),
    ).toBe(true);
    expect(authorizeSameOriginRuntimeProtocolUpgrade(request('https://evil.example'))).toBe(false);
    expect(authorizeSameOriginRuntimeProtocolUpgrade(request(undefined))).toBe(false);
    expect(
      authorizeSameOriginRuntimeProtocolUpgrade(
        request('https://public.example', 'internal:3001'),
        'https://public.example/path',
      ),
    ).toBe(true);
  });

  it('rejects an invalid configured public origin during host construction', () => {
    expect(() =>
      createExpressRuntimeProtocolHost({
        application: (_request, response) => response.end(),
        receiver,
        context: () => undefined,
        publicOrigin: 'ws://todo.example',
      }),
    ).toThrow('Runtime Protocol public origin must use http or https.');
  });

  it('owns the Node server and closes its Runtime Protocol adapter', async () => {
    const host = createExpressRuntimeProtocolHost({
      application: (_request, response) => response.end('ready'),
      receiver,
      context: () => undefined,
    });

    await host.close();
    expect(host.server.listening).toBe(false);
  });
});
