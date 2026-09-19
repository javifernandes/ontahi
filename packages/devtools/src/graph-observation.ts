import type { GraphObservationCapability } from '@ontahi/core/runtime/protocol';

import {
  getOntahiDiagnosticsInternals,
  type OntahiDiagnostics,
  type RuntimeDiagnosticOutcome,
} from './diagnostics.js';

export const instrumentGraphObservation = (
  graph: GraphObservationCapability<any>,
  diagnostics: OntahiDiagnostics,
  transportId: string,
  transportKind: string,
): GraphObservationCapability<any> => ({
  ...graph,
  observe: async function* (request, options) {
    const { now, createId, publish, projectPayload } = getOntahiDiagnosticsInternals(diagnostics);
    const startedAt = now();
    const projectedRequest = projectPayload(request);
    const identity = {
      observationId: createId('observation'),
      family: 'graph.observe' as const,
      transportId,
      transportKind,
      startedAt,
      ...(projectedRequest === undefined ? {} : { request: projectedRequest }),
    };
    let sequence = 0;
    let outcome: RuntimeDiagnosticOutcome = 'consumer-closed';
    let error: unknown;
    let protocolError = false;
    publish({ ...identity, kind: 'graph-observation.started', at: startedAt });
    try {
      for await (const body of graph.observe(request, options)) {
        sequence += 1;
        protocolError ||= body.kind !== 'graph-read-result';
        const snapshot = projectPayload(body);
        publish({
          ...identity,
          kind: 'graph-observation.snapshot',
          at: now(),
          sequence,
          ...(body.kind === 'graph-read-result' ? { rowCount: body.value.length } : {}),
          ...(snapshot === undefined ? {} : { snapshot }),
        });
        yield body;
      }
      outcome = 'completed';
    } catch (cause) {
      outcome = 'transport-error';
      error = projectPayload(
        cause instanceof Error
          ? { name: cause.name, message: cause.message }
          : { message: String(cause) },
      );
      throw cause;
    } finally {
      const at = now();
      publish({
        ...identity,
        kind: 'graph-observation.settled',
        sequence,
        at,
        durationMs: Math.max(0, at - startedAt),
        outcome: options?.signal?.aborted ? 'aborted' : protocolError ? 'protocol-error' : outcome,
        ...(error === undefined ? {} : { error }),
      });
    }
  },
});
