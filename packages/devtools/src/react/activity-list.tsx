import { useContext, type CSSProperties } from 'react';

import {
  activityEntryEvent,
  activityEntryOutcome,
  activityEntryTitle,
  formatClock,
  operationProgressState,
  outcomeColor,
  type ActivityEntry,
} from './activity-model.js';
import { AuthoringDialectContext } from './authoring-dialect.js';
import { styles } from './devtools-styles.js';

const activityButtonStyle = (selected: boolean): CSSProperties => ({
  ...styles.row,
  ...(selected ? styles.selectedRow : {}),
});

export const ActivityList = ({
  activities,
  selectedId,
  select,
}: {
  readonly activities: readonly ActivityEntry[];
  readonly selectedId?: string;
  readonly select: (id: string) => void;
}) => {
  const dialect = useContext(AuthoringDialectContext);
  return activities.length === 0 ? (
    <div style={styles.empty}>
      Run an Ontahí query or mutation to see its semantic runtime activity.
    </div>
  ) : (
    <ol style={styles.list}>
      {activities.map(activity => {
        const event = activityEntryEvent(activity);
        if (!event) return null;
        const outcome = activityEntryOutcome(activity);
        const observation = activity.observation;
        const operationState = observation ? operationProgressState(observation) : undefined;
        const graphObservation =
          activity.kind === 'graph-observation' ? activity.graphObservation : undefined;
        const exchange = activity.kind === 'exchange' ? activity.exchange : undefined;
        return (
          <li key={activity.id}>
            <button
              type='button'
              style={activityButtonStyle(selectedId === activity.id)}
              onClick={() => select(activity.id)}
              aria-label={`${activityEntryTitle(activity, dialect)} ${event.transportId} ${outcome}`}
            >
              <span
                style={{ ...styles.dot, background: outcomeColor(outcome) }}
                title={outcome}
                aria-hidden='true'
              />
              <span style={styles.rowMain}>
                <span style={styles.rowTitle}>{activityEntryTitle(activity, dialect)}</span>
                <span style={styles.rowMeta}>
                  <span style={styles.family}>
                    {graphObservation
                      ? 'query observation'
                      : exchange
                        ? (operationState?.label ?? event.family)
                        : (operationState?.label ?? 'operation progress')}
                  </span>
                  <span>{event.transportId}</span>
                  <span>{formatClock(activity.at)}</span>
                  {graphObservation ? (
                    <span>
                      {graphObservation.settled ? graphObservation.settled.outcome : 'observing'} ·{' '}
                      {graphObservation.settled?.sequence ??
                        graphObservation.snapshots.slice(-1)[0]?.sequence ??
                        0}{' '}
                      updates
                    </span>
                  ) : null}
                  {observation ? <span>{observation.snapshots.length} updates</span> : null}
                  {activity.derivedRefreshes?.length ? (
                    <span>{activity.derivedRefreshes.length} semantic refreshes</span>
                  ) : null}
                  {observation?.settled ? (
                    <span>{observation.settled.durationMs} ms</span>
                  ) : exchange?.settled ? (
                    <span>{exchange.settled.durationMs} ms</span>
                  ) : null}
                </span>
              </span>
            </button>
            {activity.derivedRefreshes?.length ? (
              <ol
                aria-label='Semantic refreshes caused by this mutation'
                style={{ listStyle: 'none', margin: '0 0 4px 42px', padding: 0 }}
              >
                {activity.derivedRefreshes.map(refresh => (
                  <li
                    key={`${refresh.observationId}:${refresh.sequence}`}
                    style={{ ...styles.rowMeta, padding: '4px 8px' }}
                  >
                    <span aria-hidden='true'>↳</span>
                    <span>Graph Read refresh #{refresh.sequence}</span>
                    <span>{refresh.rowCount ?? 'unknown'} rows</span>
                    {refresh.overflow ? <span>coalesced causes</span> : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
};
