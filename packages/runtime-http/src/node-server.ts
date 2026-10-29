import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
} from 'node:http';

import {
  createHttpIngressHandler,
  type CreateHttpIngressHandlerOptions,
  type HttpIngressHandler,
} from './ingress.js';

const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;

export type NodeHttpServerOptions = {
  readonly handle: HttpIngressHandler['handle'];
  readonly origin?: string;
  readonly bodyLimitBytes?: number;
  readonly reportError?: (error: unknown, request: IncomingMessage) => void;
};

export type NodeHttpIngressServerOptions = Omit<NodeHttpServerOptions, 'handle'> & {
  readonly ingress: CreateHttpIngressHandlerOptions;
};

class HttpBodyLimitError extends Error {}

const requireBodyLimit = (value: number) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError('Node HTTP body limit must be a positive safe integer.');
  }
  return value;
};

const toHeaders = (headers: IncomingHttpHeaders) => {
  const result = new Headers();
  Object.entries(headers).forEach(([name, value]) => {
    if (Array.isArray(value)) value.forEach(item => result.append(name, item));
    else if (value !== undefined) result.set(name, value);
  });
  return result;
};

const readBody = async (request: IncomingMessage, limit: number) => {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Uint8Array);
    size += buffer.byteLength;
    if (size > limit) throw new HttpBodyLimitError();
    chunks.push(buffer);
  }
  return chunks.length === 0 ? undefined : new Uint8Array(Buffer.concat(chunks));
};

const sendResponse = async (
  response: import('node:http').ServerResponse,
  webResponse: Response,
) => {
  webResponse.headers.forEach((value, name) => response.setHeader(name, value));
  response.statusCode = webResponse.status;
  response.end(Buffer.from(await webResponse.arrayBuffer()));
};

export const createNodeHttpServer = (options: NodeHttpServerOptions): Server => {
  const origin = new URL(options.origin ?? 'http://localhost');
  const bodyLimit = requireBodyLimit(options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES);

  return createServer((request, response) => {
    void (async () => {
      try {
        const body = await readBody(request, bodyLimit);
        const webRequest = new Request(new URL(request.url ?? '/', origin), {
          method: request.method,
          headers: toHeaders(request.headers),
          ...(body === undefined ? {} : { body }),
        });
        await sendResponse(response, await options.handle(webRequest));
      } catch (error) {
        options.reportError?.(error, request);
        if (error instanceof HttpBodyLimitError) {
          await sendResponse(
            response,
            Response.json({ ok: false, error: 'HTTP request body is too large.' }, { status: 413 }),
          );
          return;
        }
        await sendResponse(
          response,
          Response.json(
            { ok: false, error: 'HTTP ingress is temporarily unavailable.' },
            { status: 500 },
          ),
        );
      }
    })();
  });
};

export const createNodeHttpIngressServer = (options: NodeHttpIngressServerOptions): Server =>
  createNodeHttpServer({
    ...options,
    handle: createHttpIngressHandler(options.ingress).handle,
  });
