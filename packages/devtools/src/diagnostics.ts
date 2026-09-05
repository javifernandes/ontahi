import type { TaskRunIdentity, TaskStatus } from '@ontahi/core/runtime/contracts';

export type RuntimeDiagnosticOutcome =
  | 'success'
  | 'protocol-error'
  | 'transport-error'
  | 'aborted'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'consumer-closed';

export type DiagnosticProtocolEnvelope = {
  readonly protocol: 'ontahi.runtime';
  readonly version: 1;
  readonly id?: string;
  readonly kind: 'request' | 'response' | 'protocol-error';
  readonly family?: string;
  readonly body?: unknown;
  readonly error?: unknown;
};

export type DiagnosticTaskSnapshot = {
  readonly taskId: string;
  readonly runId: string;
  readonly status: TaskStatus;
  readonly subject?: { readonly type: string; readonly id: string };
  readonly createdAt?: string;
  readonly startedAt?: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly progress?: {
    readonly phase?: string;
    readonly message?: string;
    readonly percent?: number;
  };
  readonly error?: { readonly code: string; readonly message: string };
  readonly result?: unknown;
};

export type DiagnosticError = {
  readonly name: string;
  readonly message: string;
};

type ExchangeDiagnosticIdentity = {
  readonly exchangeId: string;
  readonly requestId: string;
  readonly family: string;
  readonly transportId: string;
  readonly transportKind: string;
  readonly startedAt: number;
};

export type ExchangeDiagnosticEvent =
  | (ExchangeDiagnosticIdentity & {
      readonly kind: 'exchange.started';
      readonly at: number;
      readonly request?: DiagnosticProtocolEnvelope;
    })
  | (ExchangeDiagnosticIdentity & {
      readonly kind: 'exchange.settled';
      readonly at: number;
      readonly durationMs: number;
      readonly outcome: Extract<
        RuntimeDiagnosticOutcome,
        'success' | 'protocol-error' | 'transport-error' | 'aborted'
      >;
      readonly response?: DiagnosticProtocolEnvelope;
      readonly error?: DiagnosticError;
    });

type ObservationDiagnosticIdentity = {
  readonly observationId: string;
  readonly family: 'durable.operation.observe';
  readonly run: TaskRunIdentity;
  readonly transportId: string;
  readonly transportKind: string;
  readonly startedAt: number;
};

export type ObservationDiagnosticEvent =
  | (ObservationDiagnosticIdentity & {
      readonly kind: 'observation.started';
      readonly at: number;
    })
  | (ObservationDiagnosticIdentity & {
      readonly kind: 'observation.snapshot';
      readonly at: number;
      readonly sequence: number;
      readonly snapshot: DiagnosticTaskSnapshot;
    })
  | (ObservationDiagnosticIdentity & {
      readonly kind: 'observation.settled';
      readonly at: number;
      readonly durationMs: number;
      readonly outcome: Extract<
        RuntimeDiagnosticOutcome,
        'completed' | 'failed' | 'cancelled' | 'transport-error' | 'aborted' | 'consumer-closed'
      >;
      readonly error?: DiagnosticError;
    });

export type OntahiDiagnosticEvent = ExchangeDiagnosticEvent | ObservationDiagnosticEvent;

export type OntahiDiagnosticsSnapshot = {
  readonly version: number;
  readonly events: readonly OntahiDiagnosticEvent[];
};

export type OntahiDiagnostics = {
  inspect(): OntahiDiagnosticsSnapshot;
  subscribe(listener: () => void): () => void;
  clear(): void;
};

export type OntahiDiagnosticsOptions = {
  readonly capacity?: number;
  readonly capturePayloads?: boolean;
  readonly redact?: (value: unknown) => unknown;
  readonly now?: () => number;
  readonly createId?: (kind: 'observation') => string;
};

type OntahiDiagnosticsInternals = {
  readonly now: () => number;
  readonly createId: (kind: 'observation') => string;
  readonly projectPayload: (value: unknown) => unknown | undefined;
  readonly publish: (event: OntahiDiagnosticEvent) => void;
};

const internalsByDiagnostics = new WeakMap<OntahiDiagnostics, OntahiDiagnosticsInternals>();

let fallbackIdSequence = 0;

const defaultCreateId = (kind: 'observation') =>
  globalThis.crypto?.randomUUID?.() ??
  `ontahi-devtools-${kind}-${Date.now()}-${(fallbackIdSequence += 1)}`;

const cloneDiagnosticValue = (value: unknown, seen: WeakSet<object> = new WeakSet()): unknown => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (value === undefined) return undefined;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol' || typeof value === 'function') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => cloneDiagnosticValue(item, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, cloneDiagnosticValue(item, seen)]),
  );
};

const projectDiagnosticPayload = (
  value: unknown,
  redact: (value: unknown) => unknown,
): unknown | undefined => {
  try {
    return cloneDiagnosticValue(redact(cloneDiagnosticValue(value)));
  } catch {
    return undefined;
  }
};

export const createOntahiDiagnostics = ({
  capacity = 500,
  capturePayloads = false,
  redact,
  now = Date.now,
  createId = defaultCreateId,
}: OntahiDiagnosticsOptions = {}): OntahiDiagnostics => {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new TypeError('Ontahi diagnostics capacity must be a positive integer.');
  }
  if (capturePayloads && !redact) {
    throw new TypeError('Ontahi diagnostics payload capture requires a redactor.');
  }

  const listeners = new Set<() => void>();
  let events: OntahiDiagnosticEvent[] = [];
  let snapshot: OntahiDiagnosticsSnapshot = { version: 0, events };
  const notify = () => {
    listeners.forEach(listener => {
      try {
        listener();
      } catch {
        // Diagnostics observers must not affect the instrumented application or peer observers.
      }
    });
  };
  const update = (nextEvents: OntahiDiagnosticEvent[]) => {
    events = nextEvents;
    snapshot = { version: snapshot.version + 1, events };
    notify();
  };
  const diagnostics: OntahiDiagnostics = {
    inspect: () => snapshot,
    subscribe: listener => {
      listeners.add(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
      };
    },
    clear: () => update([]),
  };

  internalsByDiagnostics.set(diagnostics, {
    now,
    createId,
    projectPayload: capturePayloads
      ? value => projectDiagnosticPayload(value, redact!)
      : () => undefined,
    publish: event => update([...events, event].slice(-capacity)),
  });

  return diagnostics;
};

export const getOntahiDiagnosticsInternals = (
  diagnostics: OntahiDiagnostics,
): OntahiDiagnosticsInternals => {
  const internals = internalsByDiagnostics.get(diagnostics);
  if (!internals) throw new TypeError('Unknown Ontahi diagnostics store.');
  return internals;
};
