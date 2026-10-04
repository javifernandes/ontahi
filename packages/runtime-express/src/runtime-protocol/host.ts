import { createServer, type IncomingMessage, type RequestListener, type Server } from 'node:http';

import type { ApplicationRuntimeProtocol } from '@ontahi/core/runtime/server';

import {
  createExpressRuntimeProtocolWebSocketServer,
  type ExpressRuntimeProtocolWebSocketContextFactory,
  type ExpressRuntimeProtocolWebSocketUpgradeAuthorization,
} from './websocket.js';

export type ExpressRuntimeProtocolHost<TContext> = {
  readonly server: Server;
  close(): Promise<void>;
};

export type CreateExpressRuntimeProtocolHostOptions<TContext> = {
  readonly application: RequestListener;
  readonly receiver: ApplicationRuntimeProtocol<TContext>;
  readonly context: ExpressRuntimeProtocolWebSocketContextFactory<TContext>;
  readonly path?: string;
  readonly publicOrigin?: string;
  readonly authorizeUpgrade?: ExpressRuntimeProtocolWebSocketUpgradeAuthorization;
  readonly reportError?: (error: unknown, request: IncomingMessage) => void;
};

const normalizePublicOrigin = (value: string) => {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('Runtime Protocol public origin must use http or https.');
  }
  return parsed.origin;
};

export const authorizeSameOriginRuntimeProtocolUpgrade = (
  request: IncomingMessage,
  configuredPublicOrigin?: string,
) => {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return false;

  try {
    const parsedOrigin = new URL(origin);
    const publicOrigin =
      configuredPublicOrigin === undefined
        ? new URL(
            `${(request.socket as { encrypted?: boolean }).encrypted ? 'https:' : 'http:'}//${host}`,
          ).origin
        : normalizePublicOrigin(configuredPublicOrigin);
    return (
      (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:') &&
      parsedOrigin.origin === publicOrigin
    );
  } catch {
    return false;
  }
};

export const createExpressRuntimeProtocolHost = <TContext>({
  application,
  receiver,
  context,
  path = '/runtime',
  publicOrigin,
  authorizeUpgrade = request => authorizeSameOriginRuntimeProtocolUpgrade(request, publicOrigin),
  reportError,
}: CreateExpressRuntimeProtocolHostOptions<TContext>): ExpressRuntimeProtocolHost<TContext> => {
  if (publicOrigin !== undefined) normalizePublicOrigin(publicOrigin);

  const server = createServer(application);
  const runtimeProtocol = createExpressRuntimeProtocolWebSocketServer({
    server,
    path,
    ownsUpgradeBoundary: true,
    receiver,
    authorizeUpgrade,
    context,
    reportError,
  });

  return {
    server,
    close: async () => {
      await runtimeProtocol.close();
      server.closeAllConnections();
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      );
    },
  };
};
