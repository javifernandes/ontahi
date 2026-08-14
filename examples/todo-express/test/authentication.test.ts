import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import express, { type Express, type Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDisabledTodoAuthentication,
  createTodoPassportAuthentication,
  type TodoAuthenticatedUser,
} from '../src/authentication.js';

type ListeningApplication = {
  baseUrl: string;
  close(): Promise<void>;
};

const listen = async (application: Express): Promise<ListeningApplication> => {
  const server = await new Promise<Server>(resolve => {
    const started = application.listen(0, '127.0.0.1', () => resolve(started));
  });

  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise(resolve => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
};

const responseCookie = (response: Response): string | undefined =>
  response.headers.get('set-cookie')?.split(';')[0];

const sessionCookie = (response: Response): string => {
  const cookie = responseCookie(response);
  if (!cookie) throw new Error('Expected the authentication response to set a session cookie.');
  return cookie;
};

const beginLogin = async (baseUrl: string) => {
  const response = await fetch(`${baseUrl}/auth/github`, { redirect: 'manual' });
  const location = response.headers.get('location');
  if (!location) throw new Error('Expected GitHub authentication to redirect.');

  const state = new URL(location).searchParams.get('state');
  if (!state) throw new Error('Expected GitHub authentication to generate OAuth state.');

  return { cookie: sessionCookie(response), state };
};

describe('Todo Passport host adapter', () => {
  const servers: ListeningApplication[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => server.close()));
  });

  it('maps the provider user to a narrow Ontahi Principal', () => {
    const authentication = createTodoPassportAuthentication({
      github: {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        callbackUrl: 'http://localhost:3001/auth/github/callback',
      },
      sessionSecret: 'tests',
    });
    const user: TodoAuthenticatedUser = {
      subject: 'github-user-123',
      username: 'ontahi-dev',
      displayName: 'Ontahi Dev',
    };

    expect(authentication.principal({ user } as unknown as Request)).toEqual({
      subject: 'github-user-123',
      kind: 'user',
      issuer: 'https://github.com',
    });
    expect(authentication.principal({} as Request)).toBeNull();
  });

  it('exposes an explicit public mode without inventing a Principal', () => {
    const authentication = createDisabledTodoAuthentication();

    expect(authentication.mode).toBe('disabled');
    expect(authentication.principal({} as Request)).toBeNull();
  });

  it('binds OAuth state to the session before accepting a valid callback', async () => {
    const tokenExchange = vi.fn();
    const provider = express();
    provider.use(express.urlencoded({ extended: false }));
    provider.post('/token', (request, response) => {
      tokenExchange(request.body);
      response.json({ access_token: 'test-access-token', token_type: 'bearer' });
    });
    provider.get('/user', (_request, response) =>
      response.json({
        id: 123,
        login: 'ontahi-dev',
        name: 'Ontahi Dev',
        html_url: 'https://github.com/ontahi-dev',
      }),
    );
    const listeningProvider = await listen(provider);
    servers.push(listeningProvider);

    const application = express();
    createTodoPassportAuthentication({
      github: {
        authorizationUrl: `${listeningProvider.baseUrl}/authorize`,
        clientId: 'test-client',
        clientSecret: 'test-secret',
        callbackUrl: 'http://localhost:3001/auth/github/callback',
        tokenUrl: `${listeningProvider.baseUrl}/token`,
        userProfileUrl: `${listeningProvider.baseUrl}/user`,
      },
      sessionSecret: 'tests',
    }).mount(application);
    const listeningApplication = await listen(application);
    servers.push(listeningApplication);

    const { cookie, state } = await beginLogin(listeningApplication.baseUrl);
    const callback = new URL('/auth/github/callback', listeningApplication.baseUrl);
    callback.searchParams.set('code', 'valid-code');
    callback.searchParams.set('state', state);
    const callbackResponse = await fetch(callback, {
      headers: { cookie },
      redirect: 'manual',
    });

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get('location')).toBe('/');
    expect(tokenExchange).toHaveBeenCalledOnce();
    const authenticatedCookie = responseCookie(callbackResponse) ?? cookie;
    await expect(
      fetch(`${listeningApplication.baseUrl}/auth/session`, {
        headers: { cookie: authenticatedCookie },
      }).then(response => response.json()),
    ).resolves.toMatchObject({
      mode: 'github',
      authenticated: true,
      principal: {
        subject: '123',
        kind: 'user',
        issuer: 'https://github.com',
      },
    });

    const logoutResponse = await fetch(`${listeningApplication.baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { cookie: authenticatedCookie },
    });
    expect(logoutResponse.status).toBe(204);
    await expect(
      fetch(`${listeningApplication.baseUrl}/auth/session`, {
        headers: { cookie: authenticatedCookie },
      }).then(response => response.json()),
    ).resolves.toEqual({ mode: 'github', authenticated: false });
  });

  it('rejects OAuth callbacks with missing or mismatched session state', async () => {
    const tokenExchange = vi.fn();
    const provider = express();
    provider.post('/token', (_request, response) => {
      tokenExchange();
      response.json({ access_token: 'unexpected' });
    });
    const listeningProvider = await listen(provider);
    servers.push(listeningProvider);

    const application = express();
    createTodoPassportAuthentication({
      github: {
        authorizationUrl: `${listeningProvider.baseUrl}/authorize`,
        clientId: 'test-client',
        clientSecret: 'test-secret',
        callbackUrl: 'http://localhost:3001/auth/github/callback',
        tokenUrl: `${listeningProvider.baseUrl}/token`,
        userProfileUrl: `${listeningProvider.baseUrl}/user`,
      },
      sessionSecret: 'tests',
    }).mount(application);
    const listeningApplication = await listen(application);
    servers.push(listeningApplication);

    for (const providedState of [undefined, 'mismatched-state']) {
      const { cookie } = await beginLogin(listeningApplication.baseUrl);
      const callback = new URL('/auth/github/callback', listeningApplication.baseUrl);
      callback.searchParams.set('code', 'invalid-code');
      if (providedState) callback.searchParams.set('state', providedState);

      const response = await fetch(callback, {
        headers: { cookie },
        redirect: 'manual',
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/?auth=failed');
    }
    expect(tokenExchange).not.toHaveBeenCalled();
  });
});
