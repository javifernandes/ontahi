import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

import type { OntahiDiagnostics } from '../diagnostics.js';

import { ActivityList } from './activity-list.js';
import {
  activityEntryEvent,
  activityEntryOutcome,
  activityEntryTitle,
  buildActivityEntries,
  matchesFilter,
} from './activity-model.js';
import { styles } from './devtools-styles.js';
import { ExchangeDetail } from './exchange-detail.js';
import { OperationProgressDetail } from './operation-progress-detail.js';

export type DevtoolsPanelProps = {
  readonly diagnostics: OntahiDiagnostics;
  readonly settings?: ReactNode;
  readonly close: () => void;
};

export const DevtoolsPanel = ({ diagnostics, settings, close }: DevtoolsPanelProps) => {
  const snapshot = useSyncExternalStore(
    diagnostics.subscribe,
    diagnostics.inspect,
    diagnostics.inspect,
  );
  const [view, setView] = useState<'activity' | 'settings'>('activity');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string>();
  const activities = useMemo(() => buildActivityEntries(snapshot.events), [snapshot]);
  const normalizedFilter = filter.trim().toLowerCase();
  const filteredActivities = normalizedFilter
    ? activities.filter(activity => {
        const event = activityEntryEvent(activity);
        const exchange = activity.kind === 'exchange' ? activity.exchange : undefined;
        return (
          event &&
          matchesFilter(
            [
              activityEntryTitle(activity),
              event.family,
              event.transportId,
              activityEntryOutcome(activity),
              exchange?.started?.requestId,
              activity.observation?.started?.run.taskId,
              activity.observation?.started?.run.runId,
            ],
            normalizedFilter,
          )
        );
      })
    : activities;
  const selectedActivity = activities.find(activity => activity.id === selected);
  const activeActivity = selectedActivity ?? filteredActivities[0];

  const clear = () => {
    diagnostics.clear();
    setSelected(undefined);
  };

  return (
    <aside style={styles.panel} aria-label='Ontahí Devtools'>
      <header style={styles.header}>
        <span style={styles.brand}>
          <span style={styles.eyebrow}>Runtime inspector</span>
          <h2 style={styles.title}>Ontahí Devtools</h2>
        </span>
        <nav style={styles.views} aria-label='Devtools views'>
          <button
            type='button'
            style={{ ...styles.view, ...(view === 'activity' ? styles.activeView : {}) }}
            onClick={() => setView('activity')}
            aria-pressed={view === 'activity'}
          >
            Activity <span style={styles.count}>{filteredActivities.length}</span>
          </button>
          {settings ? (
            <button
              type='button'
              style={{ ...styles.view, ...(view === 'settings' ? styles.activeView : {}) }}
              onClick={() => setView('settings')}
              aria-pressed={view === 'settings'}
            >
              Settings
            </button>
          ) : null}
        </nav>
        <span style={styles.headerActions}>
          <button type='button' style={styles.subtleButton} onClick={clear}>
            Clear
          </button>
          <button
            type='button'
            style={styles.subtleButton}
            onClick={close}
            aria-label='Close Devtools'
          >
            ×
          </button>
        </span>
      </header>
      {view === 'settings' && settings ? (
        <section style={styles.settingsPage} aria-label='Devtools settings'>
          {settings}
        </section>
      ) : (
        <div style={styles.workspace}>
          <section style={styles.sidebar} aria-label='Runtime traffic'>
            <div style={styles.filterBar}>
              <input
                type='search'
                style={styles.filter}
                value={filter}
                onChange={event => setFilter(event.currentTarget.value)}
                aria-label='Filter diagnostics'
                placeholder='Filter intent, family, transport, outcome…'
              />
            </div>
            <ActivityList
              activities={filteredActivities}
              selectedId={activeActivity?.id}
              select={setSelected}
            />
          </section>
          {activeActivity?.observation ? (
            <OperationProgressDetail
              activity={activeActivity.observation}
              exchange={activeActivity.kind === 'exchange' ? activeActivity.exchange : undefined}
            />
          ) : activeActivity?.kind === 'exchange' ? (
            <ExchangeDetail activity={activeActivity.exchange} />
          ) : (
            <div style={styles.empty}>Select runtime traffic to inspect its semantic detail.</div>
          )}
        </div>
      )}
    </aside>
  );
};
