import type { TaskRunIdentity, TaskSnapshot } from '@ontahi/core/runtime/contracts';
import {
  isRuntimeProtocolError,
  type DurableOperationObservationOptions,
  type RuntimeProtocolError,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeProtocolResponseEnvelope,
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

type AnyRuntimeTransport = RuntimeTransport<any>;

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
  if (body === undefined) return undefined;
  return {
    protocol: value.protocol,
    version: value.version,
    id: value.id,
    kind: value.kind,
    family: value.family,
    body,
  };
};

const projectTaskSnapshot = (
  snapshot: TaskSnapshot,
  projectPayload: (value: unknown) => unknown | undefined,
): DiagnosticTaskSnapshot => {
  const result = snapshot.result === undefined ? undefined : projectPayload(snapshot.result);
  return {
    taskId: snapshot.taskId,
    runId: snapshot.runId,
    status: snapshot.status,
    ...(snapshot.subject
      ? { subject: { type: snapshot.subject.type, id: snapshot.subject.id } }
      : {}),
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

    try {
      const response = await transport.request(runtimeRequest, options);
      const at = now();
      const projectedResponse = projectProtocolEnvelope(response, projectPayload);
      publish({
        kind: 'exchange.settled',
        at,
        ...identity,
        durationMs: Math.max(0, at - startedAt),
        outcome: isRuntimeProtocolError(response) ? 'protocol-error' : 'success',
        ...(projectedResponse ? { response: projectedResponse } : {}),
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

  return {
    ...transport,
    request,
    ...(durableOperation ? { durableOperation } : {}),
  } as TTransport;
};
