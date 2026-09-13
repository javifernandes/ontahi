import { useContext, type CSSProperties } from 'react';

import {
  activityEntryEvent,
  activityEntryOutcome,
  activityEntryTitle,
  formatClock,
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
                        ? event.family
                        : 'operation progress'}
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
                  {observation?.settled ? (
                    <span>{observation.settled.durationMs} ms</span>
                  ) : exchange?.settled ? (
                    <span>{exchange.settled.durationMs} ms</span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
};
