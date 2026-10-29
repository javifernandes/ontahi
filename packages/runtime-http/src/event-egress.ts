import { createHmac } from 'node:crypto';

import type {
  EventEgressAttempt,
  EventEgressAttemptOutcome,
  EventEgressTransport,
} from '@ontahi/core/runtime/server';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_SIGNATURE_HEADER = 'x-ontahi-signature';

export type HttpEventEgressHmacSha256 = {
  readonly kind: 'hmac-sha256';
  readonly secret: string | Uint8Array;
  readonly headerName?: string;
};

export type HttpEventEgressDestination = {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly signing?: HttpEventEgressHmacSha256;
};

export type HttpEventEgressTransportOptions = {
  readonly fetch?: typeof globalThis.fetch;
  readonly defaultTimeoutMs?: number;
};

/** @deprecated Terminal HTTP responses are returned as rejected outcomes. */
export class HttpEventEgressRejectedError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP event egress rejected with status ${status}.`);
    this.name = 'HttpEventEgressRejectedError';
    this.status = status;
  }
}

const requirePositiveTimeout = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError('HTTP event egress timeout must be a positive finite number.');
  }
  return value;
};

const requireHttpUrl = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('HTTP event egress destinations must use http or https.');
  }
  if (url.username !== '' || url.password !== '') {
    throw new TypeError('HTTP event egress destination URLs must not contain credentials.');
  }
  return url;
};

const requireHeaderName = (value: string) => {
  const headers = new Headers();
  headers.set(value, 'value');
  return value;
};

const parseRetryAfterMs = (value: string | null, now = Date.now()) => {
  if (value === null) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds * 1_000));

  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(1, date - now);
};

const stableHeaders = (attempt: EventEgressAttempt<HttpEventEgressDestination>) => ({
  'content-type': 'application/json',
  'idempotency-key': attempt.deliveryId,
  'x-ontahi-event-id': attempt.eventId,
  'x-ontahi-event-version': String(attempt.eventVersion),
  'x-ontahi-occurrence-id': attempt.occurrenceId,
  'x-ontahi-subscription-id': attempt.subscriptionId,
  'x-ontahi-delivery-id': attempt.deliveryId,
  'x-ontahi-attempt': String(attempt.attempt),
});

const classifyResponse = (response: Response): EventEgressAttemptOutcome => {
  if (response.ok) return { kind: 'accepted' };

  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    return {
      kind: 'retryable',
      reason: `http-status-${response.status}`,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }

  return { kind: 'rejected', reason: `http-status-${response.status}` };
};

const isTimeoutError = (cause: unknown) =>
  cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError');

const deliver = async (
  fetchImplementation: typeof globalThis.fetch,
  defaultTimeoutMs: number,
  attempt: EventEgressAttempt<HttpEventEgressDestination>,
): Promise<EventEgressAttemptOutcome> => {
  const destination = attempt.destination;
  const url = requireHttpUrl(destination.url);
  const body = JSON.stringify(attempt.body);
  const headers = new Headers(destination.headers);

  Object.entries(stableHeaders(attempt)).forEach(([name, value]) => headers.set(name, value));

  if (destination.signing !== undefined) {
    const headerName = requireHeaderName(
      destination.signing.headerName ?? DEFAULT_SIGNATURE_HEADER,
    );
    const signature = createHmac('sha256', destination.signing.secret).update(body).digest('hex');
    headers.set(headerName, `sha256=${signature}`);
  }

  const timeoutMs = requirePositiveTimeout(destination.timeoutMs ?? defaultTimeoutMs);
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    return {
      kind: 'retryable',
      reason: isTimeoutError(cause) ? 'http-timeout' : 'http-network-error',
    };
  }

  try {
    return classifyResponse(response);
  } finally {
    await response.body?.cancel();
  }
};

export const createHttpEventEgressTransport = (
  options: HttpEventEgressTransportOptions = {},
): EventEgressTransport<HttpEventEgressDestination> => {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (fetchImplementation === undefined) {
    throw new TypeError('HTTP event egress requires a Fetch implementation.');
  }
  const defaultTimeoutMs = requirePositiveTimeout(options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS);

  return {
    deliver: attempt => deliver(fetchImplementation, defaultTimeoutMs, attempt),
  };
};
