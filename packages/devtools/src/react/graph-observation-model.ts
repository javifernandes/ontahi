import type { GraphObservationDiagnosticEvent } from '../diagnostics.js';

export type GraphObservationActivity = {
  readonly id: string;
  readonly at: number;
  readonly started?: Extract<
    GraphObservationDiagnosticEvent,
    { kind: 'graph-observation.started' }
  >;
  readonly snapshots: readonly Extract<
    GraphObservationDiagnosticEvent,
    { kind: 'graph-observation.snapshot' }
  >[];
  readonly settled?: Extract<
    GraphObservationDiagnosticEvent,
    { kind: 'graph-observation.settled' }
  >;
};

export const graphObservationEvent = (activity: GraphObservationActivity) =>
  activity.settled ?? activity.snapshots.slice(-1)[0] ?? activity.started;

export const buildGraphObservationActivities = (
  events: readonly GraphObservationDiagnosticEvent[],
) => {
  const entries = new Map<string, GraphObservationActivity>();
  for (const event of events) {
    const current = entries.get(event.observationId) ?? {
      id: event.observationId,
      at: event.at,
      snapshots: [],
    };
    entries.set(event.observationId, {
      ...current,
      at: event.at,
      ...(event.kind === 'graph-observation.started'
        ? { started: event }
        : event.kind === 'graph-observation.settled'
          ? { settled: event }
          : { snapshots: [...current.snapshots, event] }),
    });
  }
  return [...entries.values()];
};
