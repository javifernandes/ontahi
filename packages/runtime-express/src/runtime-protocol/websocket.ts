import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';

import {
  createRuntimeProtocolServerSession,
  type RuntimeProtocolDispatcher,
  type RuntimeProtocolDurableObserver,
} from '@ontahi/core/runtime/protocol';
import { WebSocket, WebSocketServer } from 'ws';

export type ExpressRuntimeProtocolWebSocketContextFactory<TContext> = (
  request: IncomingMessage,
) => TContext | Promise<TContext>;

export type ExpressRuntimeProtocolWebSocketUpgradeAuthorization = (
  request: IncomingMessage,
) => boolean | Promise<boolean>;

export type CreateExpressRuntimeProtocolWebSocketServerOptions<TContext> = {
  readonly server: Server;
  readonly dispatcher: RuntimeProtocolDispatcher<TContext>;
  readonly context: ExpressRuntimeProtocolWebSocketContextFactory<TContext>;
  readonly authorizeUpgrade?: ExpressRuntimeProtocolWebSocketUpgradeAuthorization;
  readonly observeDurableOperation?: RuntimeProtocolDurableObserver<TContext>;
  readonly path?: string;
  readonly reportError?: (error: unknown, request: IncomingMessage) => void;
};

export type ExpressRuntimeProtocolWebSocketServer = {
  close(): Promise<void>;
};

const normalizePath = (value: string) => {
  const path = value.startsWith('/') ? value : `/${value}`;
  if (path === '/') return path;

  let end = path.length;
  while (end > 0 && path[end - 1] === '/') end -= 1;
  return path.slice(0, end);
};

const rejectUpgrade = (socket: Duplex, status: number, message: string) => {
  if (!socket.destroyed) {
    socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }
  socket.destroy();
};

export const createExpressRuntimeProtocolWebSocketServer = <TContext>({
  server,
  dispatcher,
  context,
  authorizeUpgrade,
  observeDurableOperation,
  path = '/runtime',
  reportError,
}: CreateExpressRuntimeProtocolWebSocketServerOptions<TContext>): ExpressRuntimeProtocolWebSocketServer => {
  const routePath = normalizePath(path);
  const webSocketServer = new WebSocketServer({ noServer: true });
  let closed = false;

  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    let requestPath: string;
    try {
      requestPath = new URL(request.url ?? '/', 'http://localhost').pathname;
    } catch {
      return;
    }
    if (normalizePath(requestPath) !== routePath) return;

    const establishSession = async () => {
      if (authorizeUpgrade) {
        let authorized = false;
        try {
          authorized = await authorizeUpgrade(request);
        } catch (error) {
          reportError?.(error, request);
        }
        if (!authorized) {
          rejectUpgrade(socket, 403, 'Forbidden');
          return;
        }
      }

      let receiverContext: TContext;
      try {
        receiverContext = await context(request);
      } catch (error) {
        reportError?.(error, request);
        rejectUpgrade(socket, 401, 'Unauthorized');
        return;
      }
      if (closed || socket.destroyed) return;

      webSocketServer.handleUpgrade(request, socket, head, webSocket => {
        const session = createRuntimeProtocolServerSession({
          dispatcher,
          context: receiverContext,
          observeDurableOperation,
          reportError: error => reportError?.(error, request),
          send: frame => {
            if (webSocket.readyState === WebSocket.OPEN) {
              webSocket.send(JSON.stringify(frame));
            }
          },
        });

        webSocket.on('message', (data, isBinary) => {
          let frame: unknown;
          try {
            frame = isBinary ? undefined : JSON.parse(data.toString());
          } catch {
            frame = undefined;
          }
          void session.receive(frame);
        });
        webSocket.on('error', error => reportError?.(error, request));
        webSocket.on('close', () => session.close());
        webSocketServer.emit('connection', webSocket, request);
      });
    };

    void establishSession();
  };

  server.on('upgrade', upgrade);

  return {
    close: async () => {
      if (closed) return;
      closed = true;
      server.off('upgrade', upgrade);
      for (const client of webSocketServer.clients) client.terminate();
      await new Promise<void>(resolve => webSocketServer.close(() => resolve()));
    },
  };
};
