import { useContext, useState } from 'react';

import { graphReadSummary, isRecord } from './activity-model.js';
import { AuthoringDialectContext } from './authoring-dialect.js';
import { styles } from './devtools-styles.js';
import { graphObservationEvent, type GraphObservationActivity } from './graph-observation-model.js';
import { JsonView } from './json-view.js';
import { SemanticPayload } from './semantic-payload.js';

export const GraphObservationDetail = ({
  activity,
}: {
  readonly activity: GraphObservationActivity;
}) => {
  const dialect = useContext(AuthoringDialectContext);
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [sequence, setSequence] = useState<number>();
  const event = graphObservationEvent(activity);
  const selected =
    activity.snapshots.find(snapshot => snapshot.sequence === sequence) ??
    activity.snapshots.slice(-1)[0];
  return (
    <section style={styles.detail} aria-label='Query observation detail'>
      <header style={styles.detailHeader}>
        <div style={styles.detailHeadingGroup}>
          <h3 style={styles.detailTitle}>
            {isRecord(event?.request) ? graphReadSummary(event.request, dialect) : 'Observed query'}
          </h3>
          <span style={styles.detailMeta}>
            {activity.settled?.outcome ?? 'Observing'} · {event?.transportId} ·{' '}
            {activity.settled?.sequence ?? activity.snapshots.slice(-1)[0]?.sequence ?? 0} updates
          </span>
        </div>
        <span style={{ ...styles.modes, marginLeft: 'auto' }} aria-label='Observation view mode'>
          {(['visual', 'json'] as const).map(value => (
            <button
              type='button'
              key={value}
              aria-pressed={mode === value}
              style={{ ...styles.mode, ...(mode === value ? styles.activeMode : {}) }}
              onClick={() => setMode(value)}
            >
              {value === 'visual' ? 'Visual' : 'JSON'}
            </button>
          ))}
        </span>
      </header>
      <div style={{ padding: 16, overflow: 'auto' }}>
        <label style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          Snapshot{' '}
          <select
            aria-label='Observed snapshot'
            style={{ ...styles.subtleButton, maxWidth: '100%' }}
            value={sequence !== undefined && selected?.sequence === sequence ? sequence : 'live'}
            onChange={e =>
              setSequence(e.target.value === 'live' ? undefined : Number(e.target.value))
            }
          >
            <option value='live'>Follow latest</option>
            {activity.snapshots.map(snapshot => (
              <option key={snapshot.sequence} value={snapshot.sequence}>
                #{snapshot.sequence} · {new Date(snapshot.at).toISOString()} ·{' '}
                {snapshot.rowCount ?? 'error'} rows
              </option>
            ))}
          </select>
        </label>
        {sequence !== undefined && selected?.sequence !== sequence ? (
          <p>The selected snapshot is no longer retained. Showing the latest retained snapshot.</p>
        ) : null}
        {selected ? (
          <>
            <p>
              Snapshot #{selected.sequence} · {selected.rowCount ?? 'unknown'} rows
            </p>
            {selected.snapshot === undefined ? (
              <p>Snapshot payload was not captured.</p>
            ) : mode === 'visual' ? (
              <SemanticPayload value={selected.snapshot} />
            ) : (
              <JsonView value={selected.snapshot} label='Observation snapshot' />
            )}
          </>
        ) : (
          <p>
            {activity.settled
              ? 'No snapshots retained for this observation.'
              : 'Waiting for the next snapshot.'}
          </p>
        )}
        {activity.settled?.error === undefined ? null : (
          <JsonView value={activity.settled.error} label='Observation error' />
        )}
        <details>
          <summary>Observed query / JSON</summary>
          {event?.request === undefined ? (
            <p>Request payload was not captured.</p>
          ) : (
            <JsonView value={event.request} label='Observed query' />
          )}
        </details>
        {!activity.started ? <p>The start event is no longer retained in Activity.</p> : null}
        <p>
          Snapshots reflect this observation. Inspecting an earlier snapshot does not pause the
          application.
        </p>
      </div>
    </section>
  );
};
