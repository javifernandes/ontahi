import { useState, useSyncExternalStore } from 'react';

import { historyFieldChanges, type EntityHistory } from '../entity-history.js';

import { styles } from './devtools-styles.js';
import { JsonView } from './json-view.js';
import { transportSettingsStyles as settingsStyles } from './transport-settings-styles.js';

export const EntityHistorySettings = ({ history }: { readonly history: EntityHistory }) => {
  const snapshot = useSyncExternalStore(history.subscribe, history.inspect, history.inspect);
  return (
    <section
      aria-label='Entity history settings'
      style={{ ...settingsStyles.root, marginBottom: 24 }}
    >
      <h3 style={settingsStyles.title}>Entity history</h3>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: '#dce8e1',
          width: 'fit-content',
          cursor: 'pointer',
        }}
      >
        <input
          type='checkbox'
          style={{ margin: 0, width: 16, height: 16, accentColor: '#80bb98', colorScheme: 'dark' }}
          checked={snapshot.recording}
          onChange={event => history.setRecording(event.target.checked)}
        />
        Record entity history
      </label>
      <p style={{ ...settingsStyles.description, color: '#b6c8be' }}>
        Capture local entity snapshots in memory, including their field values. Recording continues
        while Devtools is closed. Disable to stop recording and retain captured history.
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: 14,
          border: '1px solid #1f3128',
          borderRadius: 11,
          background: '#0e1813',
        }}
      >
        <div style={{ display: 'grid', gap: 6 }}>
          <p style={{ ...settingsStyles.description, color: '#b6c8be' }}>
            {snapshot.entries.length} entries · {snapshot.bytes.toLocaleString()} approximate bytes
            · limits: {history.limits.capacity} entries / {history.limits.maxBytes.toLocaleString()}{' '}
            bytes
          </p>
          <p style={settingsStyles.description}>
            {snapshot.dropped} entries dropped · {snapshot.captureErrors} capture errors
          </p>
        </div>
        <button type='button' style={styles.subtleButton} onClick={history.clear}>
          Clear entity history
        </button>
      </div>
    </section>
  );
};

export const EntityHistoryPanel = ({ history }: { readonly history: EntityHistory }) => {
  const snapshot = useSyncExternalStore(history.subscribe, history.inspect, history.inspect);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<number>();
  const entries = snapshot.entries.filter(
    entry =>
      !filter.trim() ||
      `${entry.key ?? 'All entities'} ${entry.kind}`
        .toLowerCase()
        .includes(filter.trim().toLowerCase()),
  );
  const active = entries.find(entry => entry.id === selected) ?? entries.slice(-1)[0];
  const previous =
    active?.kind === 'baseline'
      ? undefined
      : snapshot.entries
          .filter(
            entry =>
              active &&
              entry.id < active.id &&
              entry.segment === active.segment &&
              (entry.key === active.key || entry.kind === 'clear'),
          )
          .slice(-1)[0];
  const hasPrevious =
    previous !== undefined && previous.kind !== 'clear' && previous.kind !== 'invalidate';
  const changes = active
    ? historyFieldChanges(hasPrevious ? previous?.value : undefined, active.value)
    : [];
  return (
    <div style={styles.workspace}>
      <section style={styles.sidebar} aria-label='Entity history timeline'>
        <div style={styles.filterBar}>
          <p>
            {snapshot.recording ? 'Recording' : 'Recording stopped'} · {snapshot.entries.length}{' '}
            entries · {snapshot.dropped} dropped
          </p>
          <input
            type='search'
            style={styles.filter}
            aria-label='Filter entity history'
            placeholder='Filter entity, identity, event…'
            value={filter}
            onChange={event => setFilter(event.target.value)}
          />
        </div>
        <ol style={styles.list}>
          {[...entries].reverse().map(entry => (
            <li key={entry.id}>
              <button
                type='button'
                style={{
                  ...styles.row,
                  gridTemplateColumns: 'minmax(0, 1fr)',
                  ...(active?.id === entry.id ? styles.selectedRow : {}),
                }}
                aria-pressed={active?.id === entry.id}
                onClick={() => setSelected(entry.id)}
              >
                <span style={styles.rowTitle}>{entry.key ?? 'All entities'}</span>
                <span style={styles.rowMeta}>
                  #{entry.id} · {entry.kind} · {new Date(entry.at).toISOString()}
                </span>
              </button>
            </li>
          ))}
          {!entries.length ? (
            <li style={styles.empty}>
              {filter.trim()
                ? 'No history matches this filter.'
                : 'No captured history. Enable Record entity history in Settings to begin.'}
            </li>
          ) : null}
        </ol>
      </section>
      {active ? (
        <section style={styles.detail} aria-label='Historical entity snapshot'>
          <header style={styles.detailHeader}>
            <div style={styles.detailHeadingGroup}>
              <h3 style={styles.detailTitle}>{active.key ?? 'Cache cleared'}</h3>
              <span style={styles.detailMeta}>
                #{active.id} · {active.kind} · {new Date(active.at).toISOString()}
              </span>
            </div>
            <button
              type='button'
              style={{ ...styles.subtleButton, marginLeft: 'auto' }}
              onClick={() => setSelected(undefined)}
            >
              Follow latest
            </button>
          </header>
          <div style={{ overflow: 'auto', padding: 16 }}>
            {selected !== undefined && active.id !== selected ? (
              <p>
                The selected event is no longer in this view. Showing the latest matching event.
              </p>
            ) : null}
            <p>
              Historical inspection only. The application cache continues updating independently.
            </p>
            {active.kind === 'clear' ? (
              <p>
                All entities were removed from the local cache. This does not imply server deletion.
              </p>
            ) : (
              <>
                <h4>
                  {hasPrevious
                    ? 'Changes since previous retained snapshot'
                    : 'Captured fields (no preceding snapshot in this recording segment)'}
                </h4>
                {changes.length ? (
                  changes.map(change => (
                    <details key={change.field}>
                      <summary>
                        {change.field} · {change.kind}
                      </summary>
                      <JsonView
                        value={{ before: change.before, after: change.after }}
                        label={`${change.field} change`}
                      />
                    </details>
                  ))
                ) : (
                  <p>No field changes.</p>
                )}
                <h4>Snapshot</h4>
                {active.kind === 'invalidate' ? (
                  <p>Entity invalidated from the local cache.</p>
                ) : (
                  <JsonView value={active.value} label='Historical value' />
                )}
              </>
            )}
          </div>
        </section>
      ) : (
        <div style={styles.empty}>
          Select a captured event to inspect its snapshot and field changes.
        </div>
      )}
    </div>
  );
};
