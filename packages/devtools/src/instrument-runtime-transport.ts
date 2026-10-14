import type { TaskRunIdentity, TaskSnapshot } from '@ontahi/core/runtime/contracts';
import {
  isConfigurableRuntimeTransport,
  isRuntimeProtocolError,
  type DurableOperationObservationOptions,
  type RuntimeProtocolError,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeProtocolResponseEnvelope,
  type RuntimeProtocolGraphRefreshCause,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';

import {
  getOntahiDiagnosticsInternals,
  type DiagnosticError,
  type DiagnosticProtocolEnvelope,
  type DiagnosticTaskSnapshot,
  type OntahiDiagnostics,
  type RuntimeDiagnosticOutcome,
} from './diagnostics.js';
import { instrumentGraphObservation } from './graph-observation.js';

type AnyRuntimeTransport = RuntimeTransport<any>;

const diagnosticsByRuntimeTransport = new WeakMap<AnyRuntimeTransport, OntahiDiagnostics>();

export const getRuntimeTransportDiagnostics = (
  transport: AnyRuntimeTransport,
): OntahiDiagnostics | undefined => diagnosticsByRuntimeTransport.get(transport);

export const associateRuntimeTransportDiagnostics = (
  transport: AnyRuntimeTransport,
  diagnostics: OntahiDiagnostics,
) => {
  diagnosticsByRuntimeTransport.set(transport, diagnostics);
};

export type InstrumentRuntimeTransportOptions<TTransport extends AnyRuntimeTransport> = {
  readonly diagnostics: OntahiDiagnostics;
  readonly id: string;
  readonly kind: string;
  readonly transport: TTransport;
};

const diagnosticError = (value: unknown): DiagnosticError =>
  value instanceof Error
    ? { name: value.name, message: value.message }
    : { name: 'Error', message: String(value) };

const projectProtocolEnvelope = (
  value: RuntimeProtocolRequestEnvelope | RuntimeProtocolResponseEnvelope | RuntimeProtocolError,
  projectPayload: (value: unknown) => unknown | undefined,
): DiagnosticProtocolEnvelope | undefined => {
  if (value.kind === 'protocol-error') {
    const error = projectPayload({
      code: value.error.code,
      message: value.error.message,
      ...(value.error.details === undefined ? {} : { details: value.error.details }),
    });
    if (error === undefined) return undefined;
    return {
      protocol: value.protocol,
      version: value.version,
      ...(value.id ? { id: value.id } : {}),
      kind: value.kind,
      ...(value.family ? { family: value.family } : {}),
      error,
    };
  }

  const body = projectPayload(value.body);
  const mutationCommitId = value.kind === 'response' ? value.metadata?.mutationCommitId : undefined;
  if (body === undefined && mutationCommitId === undefined) return undefined;
  return {
    protocol: value.protocol,
    version: value.version,
    id: value.id,
    kind: value.kind,
    family: value.family,
    ...(body === undefined ? {} : { body }),
    ...(mutationCommitId ? { metadata: { mutationCommitId } } : {}),
  };
};

const projectTaskSnapshot = (
  snapshot: TaskSnapshot,
  projectPayload: (value: unknown) => unknown | undefined,
): DiagnosticTaskSnapshot => {
  const result = snapshot.result === undefined ? undefined : projectPayload(snapshot.result);
  const interaction =
    snapshot.interaction === undefined ? undefined : projectPayload(snapshot.interaction);
  const waitingOn = (() => {
    if (snapshot.waitingOn?.kind !== 'event') return undefined;
    const correlation =
      snapshot.waitingOn.correlation === undefined
        ? undefined
        : projectPayload(snapshot.waitingOn.correlation);
    return {
      id: snapshot.waitingOn.id,
      kind: snapshot.waitingOn.kind,
      eventId: snapshot.waitingOn.eventId,
      eventVersion: snapshot.waitingOn.eventVersion,
      createdAt: snapshot.waitingOn.createdAt,
      ...(snapshot.waitingOn.timeoutAt ? { timeoutAt: snapshot.waitingOn.timeoutAt } : {}),
      ...(correlation === undefined ? {} : { correlation }),
    };
  })();
  return {
    taskId: snapshot.taskId,
    runId: snapshot.runId,
    status: snapshot.status,
    ...(snapshot.subject
      ? { subject: { type: snapshot.subject.type, id: snapshot.subject.id } }
      : {}),
    ...(interaction === undefined ? {} : { interaction }),
    ...(waitingOn === undefined ? {} : { waitingOn }),
    ...(snapshot.resumedBy ? { resumedBy: snapshot.resumedBy } : {}),
    ...(snapshot.createdAt ? { createdAt: snapshot.createdAt } : {}),
    ...(snapshot.startedAt ? { startedAt: snapshot.startedAt } : {}),
    updatedAt: snapshot.updatedAt,
    ...(snapshot.completedAt ? { completedAt: snapshot.completedAt } : {}),
    ...(snapshot.progress
      ? {
          progress: {
            ...(snapshot.progress.phase ? { phase: snapshot.progress.phase } : {}),
            ...(snapshot.progress.message ? { message: snapshot.progress.message } : {}),
            ...(snapshot.progress.percent === undefined
              ? {}
              : { percent: snapshot.progress.percent }),
          },
        }
      : {}),
    ...(snapshot.error
      ? { error: { code: snapshot.error.code, message: snapshot.error.message } }
      : {}),
    ...(result === undefined ? {} : { result }),
    ...(snapshot.executionMetadata?.mutationCommitId
      ? { mutationCommitId: snapshot.executionMetadata.mutationCommitId }
      : {}),
  };
};

const observationOutcome = (
  status: TaskSnapshot['status'] | undefined,
  aborted: boolean,
): Extract<
  RuntimeDiagnosticOutcome,
  'completed' | 'failed' | 'cancelled' | 'aborted' | 'consumer-closed'
> => {
  if (aborted) return 'aborted';
  if (status === 'completed' || status === 'failed' || status === 'cancelled') return status;
  return 'consumer-closed';
};

export const instrumentRuntimeTransport = <TTransport extends AnyRuntimeTransport>({
  diagnostics,
  id: transportId,
  kind: transportKind,
  transport,
}: InstrumentRuntimeTransportOptions<TTransport>): TTransport => {
  const { createId, now, projectPayload, publish } = getOntahiDiagnosticsInternals(diagnostics);
  const pendingGraphReadRefreshes: Array<{
    readonly requestKey: string;
    readonly causedBy: RuntimeProtocolGraphRefreshCause;
    readonly registeredAt: number;
  }> = [];
  const canonicalJson = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalJson);
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalJson(item)]),
    );
  };
  const requestKey = (value: unknown) => JSON.stringify(canonicalJson(value));
  const consumeGraphReadRefreshCause = (runtimeRequest: RuntimeProtocolRequestEnvelope) => {
    if (runtimeRequest.family !== 'graph.read') return undefined;
    const currentTime = Date.now();
    for (let index = pendingGraphReadRefreshes.length - 1; index >= 0; index -= 1) {
      if (currentTime - pendingGraphReadRefreshes[index]!.registeredAt > 30_000)
        pendingGraphReadRefreshes.splice(index, 1);
    }
    const index = pendingGraphReadRefreshes.findIndex(
      expected => expected.requestKey === requestKey(runtimeRequest.body),
    );
    if (index < 0) return undefined;
    return pendingGraphReadRefreshes.splice(index, 1)[0]?.causedBy;
  };
  const request: AnyRuntimeTransport['request'] = async (runtimeRequest, options) => {
    const startedAt = now();
    const identity = {
      exchangeId: runtimeRequest.id,
      requestId: runtimeRequest.id,
      family: runtimeRequest.family,
      transportId,
      transportKind,
      startedAt,
    } as const;
    const projectedRequest = projectProtocolEnvelope(runtimeRequest, projectPayload);
    publish({
      kind: 'exchange.started',
      at: startedAt,
      ...identity,
      ...(projectedRequest ? { request: projectedRequest } : {}),
    });
    const expectedRefreshCause = consumeGraphReadRefreshCause(runtimeRequest);

    try {
      const response = await transport.request(runtimeRequest, options);
      const at = now();
      const projectedResponse = projectProtocolEnvelope(response, projectPayload);
      const responseWithCause =
        expectedRefreshCause && projectedResponse?.kind === 'response'
          ? {
              ...projectedResponse,
              body:
                typeof projectedResponse.body === 'object' && projectedResponse.body !== null
                  ? { ...projectedResponse.body, causedBy: expectedRefreshCause }
                  : { kind: 'graph-read-result', causedBy: expectedRefreshCause },
            }
          : projectedResponse;
      publish({
        kind: 'exchange.settled',
        at,
        ...identity,
        durationMs: Math.max(0, at - startedAt),
        outcome: isRuntimeProtocolError(response) ? 'protocol-error' : 'success',
        ...(responseWithCause ? { response: responseWithCause } : {}),
      });
      return response;
    } catch (error) {
      const at = now();
      const projectedError = projectPayload(diagnosticError(error)) as DiagnosticError | undefined;
      publish({
        kind: 'exchange.settled',
        at,
        ...identity,
        durationMs: Math.max(0, at - startedAt),
        outcome: options?.signal?.aborted ? 'aborted' : 'transport-error',
        ...(projectedError ? { error: projectedError } : {}),
      });
      throw error;
    }
  };

  const durableOperation = transport.durableOperation
    ? {
        observe: async function* <TResult>(
          run: TaskRunIdentity,
          options?: DurableOperationObservationOptions,
        ): AsyncIterable<TaskSnapshot<TResult>> {
          const startedAt = now();
          const identity = {
            observationId: createId('observation'),
            family: 'durable.operation.observe' as const,
            run: { taskId: run.taskId, runId: run.runId },
            transportId,
            transportKind,
            startedAt,
          };
          let sequence = 0;
          let lastStatus: TaskSnapshot['status'] | undefined;
          let settled = false;
          const settle = (
            outcome: Extract<
              RuntimeDiagnosticOutcome,
              | 'completed'
              | 'failed'
              | 'cancelled'
              | 'transport-error'
              | 'aborted'
              | 'consumer-closed'
            >,
            error?: unknown,
          ) => {
            if (settled) return;
            settled = true;
            const at = now();
            const projectedError =
              error === undefined
                ? undefined
                : (projectPayload(diagnosticError(error)) as DiagnosticError | undefined);
            publish({
              kind: 'observation.settled',
              at,
              ...identity,
              durationMs: Math.max(0, at - startedAt),
              outcome,
              ...(projectedError ? { error: projectedError } : {}),
            });
          };

          publish({ kind: 'observation.started', at: startedAt, ...identity });
          try {
            for await (const snapshot of transport.durableOperation!.observe<TResult>(
              run,
              options,
            )) {
              sequence += 1;
              lastStatus = snapshot.status;
              publish({
                kind: 'observation.snapshot',
                at: now(),
                ...identity,
                sequence,
                snapshot: projectTaskSnapshot(snapshot, projectPayload),
              });
              yield snapshot;
            }
            settle(observationOutcome(lastStatus, options?.signal?.aborted ?? false));
          } catch (error) {
            settle(options?.signal?.aborted ? 'aborted' : 'transport-error', error);
            throw error;
          } finally {
            settle(observationOutcome(lastStatus, options?.signal?.aborted ?? false));
          }
        },
      }
    : undefined;
  const events = transport.events
    ? {
        observe: async function* (
          ...args: Parameters<NonNullable<RuntimeTransport['events']>['observe']>
        ) {
          const [event, options] = args;
          const startedAt = now();
          const identity = {
            observationId: createId('observation'),
            family: 'event.observe' as const,
            eventId: event.id,
            eventVersion: event.version,
            transportId,
            transportKind,
            startedAt,
          };
          let sequence = 0;
          let settled = false;
          const settle = (outcome: RuntimeDiagnosticOutcome, error?: unknown) => {
            if (settled) return;
            settled = true;
            const at = now();
            const projectedError =
              error === undefined
                ? undefined
                : (projectPayload(diagnosticError(error)) as DiagnosticError | undefined);
            publish({
              ...identity,
              kind: 'event-observation.settled',
              at,
              durationMs: Math.max(0, at - startedAt),
              outcome,
              ...(projectedError ? { error: projectedError } : {}),
            });
          };
          publish({ ...identity, kind: 'event-observation.started', at: startedAt });
          try {
            for await (const delivery of transport.events!.observe(...args)) {
              sequence += 1;
              const projected = projectPayload(delivery);
              const taskRun =
                delivery.occurrence.causation?.kind === 'operation'
                  ? delivery.occurrence.causation.taskRun
                  : undefined;
              publish({
                ...identity,
                kind: 'event-observation.delivery',
                at: now(),
                sequence,
                occurrenceId: delivery.occurrence.occurrenceId,
                ...(taskRun ? { taskRun } : {}),
                ...(projected === undefined ? {} : { delivery: projected }),
              });
              yield delivery;
            }
            settle(options?.signal?.aborted ? 'aborted' : 'consumer-closed');
          } catch (error) {
            settle(options?.signal?.aborted ? 'aborted' : 'transport-error', error);
            throw error;
          } finally {
            settle(options?.signal?.aborted ? 'aborted' : 'consumer-closed');
          }
        },
      }
    : undefined;
  const routing = isConfigurableRuntimeTransport(transport)
    ? {
        inspect: () => transport.routing.inspect(),
        subscribe: (listener: () => void) => transport.routing.subscribe(listener),
        configure: (...args: Parameters<typeof transport.routing.configure>) =>
          transport.routing.configure(...args),
      }
    : undefined;

  const instrumented = {
    ...transport,
    request,
    ...(transport.graph
      ? {
          graph: instrumentGraphObservation(
            transport.graph,
            diagnostics,
            transportId,
            transportKind,
          ),
        }
      : {}),
    ...(durableOperation ? { durableOperation } : {}),
    ...(events ? { events } : {}),
    causality: {
      associateGraphReadRefreshes: (requests, causedBy) => {
        const registeredAt = Date.now();
        requests.forEach(refreshRequest => {
          pendingGraphReadRefreshes.push({
            requestKey: requestKey(refreshRequest),
            causedBy,
            registeredAt,
          });
        });
        if (pendingGraphReadRefreshes.length > 128) {
          pendingGraphReadRefreshes.splice(0, pendingGraphReadRefreshes.length - 128);
        }
      },
    },
    ...(routing ? { routing } : {}),
  } as TTransport;
  associateRuntimeTransportDiagnostics(instrumented, diagnostics);
  return instrumented;
};
