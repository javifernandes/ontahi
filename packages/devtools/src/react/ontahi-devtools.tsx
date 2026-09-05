'use client';

import { useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';

import type {
  ExchangeDiagnosticEvent,
  ObservationDiagnosticEvent,
  OntahiDiagnostics,
  RuntimeDiagnosticOutcome,
} from '../diagnostics.js';

export type OntahiDevtoolsProps = {
  readonly diagnostics: OntahiDiagnostics;
  readonly initiallyOpen?: boolean;
};

type ExchangeStarted = Extract<ExchangeDiagnosticEvent, { kind: 'exchange.started' }>;
type ExchangeSettled = Extract<ExchangeDiagnosticEvent, { kind: 'exchange.settled' }>;
type ObservationStarted = Extract<ObservationDiagnosticEvent, { kind: 'observation.started' }>;
type ObservationSnapshot = Extract<ObservationDiagnosticEvent, { kind: 'observation.snapshot' }>;
type ObservationSettled = Extract<ObservationDiagnosticEvent, { kind: 'observation.settled' }>;

type ExchangeActivity = {
  readonly id: string;
  readonly started?: ExchangeStarted;
  readonly settled?: ExchangeSettled;
  readonly at: number;
};

type DurableActivity = {
  readonly id: string;
  readonly started?: ObservationStarted;
  readonly snapshots: readonly ObservationSnapshot[];
  readonly settled?: ObservationSettled;
  readonly at: number;
};

type SelectedActivity =
  | { readonly kind: 'exchange'; readonly id: string }
  | { readonly kind: 'observation'; readonly id: string };

const styles: Record<string, CSSProperties> = {
  launcher: {
    position: 'fixed',
    zIndex: 2147483646,
    right: 18,
    bottom: 18,
    display: 'grid',
    width: 48,
    height: 48,
    placeItems: 'center',
    border: '1px solid rgba(142, 240, 187, 0.5)',
    borderRadius: 16,
    color: '#d8ffe8',
    background: '#10251c',
    boxShadow: '0 16px 44px rgba(7, 17, 13, 0.32)',
    cursor: 'pointer',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 18,
    fontWeight: 900,
  },
  panel: {
    position: 'fixed',
    zIndex: 2147483646,
    right: 18,
    bottom: 18,
    display: 'grid',
    width: 'min(520px, calc(100vw - 24px))',
    height: 'min(680px, calc(100vh - 24px))',
    gridTemplateRows: 'auto auto auto minmax(0, 1fr)',
    overflow: 'hidden',
    border: '1px solid #2d4a3d',
    borderRadius: 20,
    color: '#dce8e1',
    background: '#0c1310',
    boxShadow: '0 26px 80px rgba(3, 10, 7, 0.5)',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontSize: 12,
    textAlign: 'left',
  },
  header: {
    display: 'flex',
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '0 16px',
    borderBottom: '1px solid #213229',
    background: '#101a15',
  },
  brand: { display: 'grid', gap: 2 },
  eyebrow: {
    color: '#7aa58f',
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
  },
  title: { margin: 0, color: '#effbf4', fontSize: 15, fontWeight: 800 },
  headerActions: { display: 'flex', gap: 7 },
  subtleButton: {
    minHeight: 30,
    padding: '0 10px',
    border: '1px solid #30463a',
    borderRadius: 9,
    color: '#a9c2b5',
    background: '#14221b',
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: 700,
  },
  tabs: {
    display: 'flex',
    gap: 4,
    padding: 8,
    borderBottom: '1px solid #213229',
    background: '#0d1712',
  },
  tab: {
    minHeight: 32,
    padding: '0 12px',
    border: 0,
    borderRadius: 9,
    color: '#80978b',
    background: 'transparent',
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: 750,
  },
  activeTab: { color: '#dffbea', background: '#193226' },
  count: {
    display: 'inline-grid',
    minWidth: 18,
    height: 18,
    marginLeft: 7,
    placeItems: 'center',
    borderRadius: 999,
    color: '#98b9a8',
    background: '#0c1812',
    fontSize: 9,
  },
  filterBar: {
    padding: '0 8px 8px',
    borderBottom: '1px solid #213229',
    background: '#0d1712',
  },
  filter: {
    width: '100%',
    height: 34,
    padding: '0 11px',
    border: '1px solid #293d32',
    borderRadius: 9,
    outline: 0,
    color: '#dce8e1',
    background: '#09110d',
    font: 'inherit',
  },
  content: { display: 'grid', minHeight: 0, gridTemplateRows: 'minmax(180px, 1fr) auto' },
  list: { minHeight: 0, margin: 0, padding: 8, overflow: 'auto', listStyle: 'none' },
  row: {
    display: 'grid',
    width: '100%',
    gridTemplateColumns: '8px minmax(0, 1fr) auto',
    gap: 10,
    alignItems: 'center',
    margin: 0,
    padding: '10px 9px',
    border: 0,
    borderRadius: 10,
    color: '#d7e3dc',
    background: 'transparent',
    cursor: 'pointer',
    font: 'inherit',
    textAlign: 'left',
  },
  selectedRow: { background: '#16251d' },
  dot: { width: 7, height: 7, borderRadius: 999, background: '#d6a75d' },
  rowMain: { display: 'grid', minWidth: 0, gap: 3 },
  rowTitle: {
    overflow: 'hidden',
    color: '#ebf4ef',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
    fontWeight: 750,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: {
    display: 'flex',
    gap: 7,
    overflow: 'hidden',
    color: '#6f897c',
    fontSize: 10,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  outcome: {
    padding: '3px 7px',
    borderRadius: 999,
    color: '#b4cabe',
    background: '#1d2c24',
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
  },
  empty: {
    display: 'grid',
    minHeight: 180,
    placeItems: 'center',
    padding: 28,
    color: '#6d8679',
    textAlign: 'center',
  },
  detail: {
    maxHeight: 280,
    overflow: 'auto',
    borderTop: '1px solid #213229',
    background: '#09100d',
  },
  detailHeading: {
    position: 'sticky',
    top: 0,
    margin: 0,
    padding: '9px 12px',
    color: '#82a492',
    background: '#0d1712',
    fontSize: 9,
    fontWeight: 850,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  pre: {
    margin: 0,
    padding: '2px 12px 14px',
    color: '#bcd4c7',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 10,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
};

const outcomeColor = (outcome: RuntimeDiagnosticOutcome | 'pending') => {
  if (outcome === 'success' || outcome === 'completed') return '#62d899';
  if (outcome === 'pending') return '#ddb45f';
  if (outcome === 'aborted' || outcome === 'consumer-closed') return '#93a69c';
  return '#ec7d78';
};

const formatClock = (value: number) =>
  new Date(value).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' });

const matchesFilter = (values: Array<string | number | undefined>, filter: string) =>
  values.some(value =>
    String(value ?? '')
      .toLowerCase()
      .includes(filter),
  );

const buildExchangeActivities = (
  events: readonly ExchangeDiagnosticEvent[],
): ExchangeActivity[] => {
  const activities = new Map<string, ExchangeActivity>();
  events.forEach(event => {
    const current = activities.get(event.exchangeId) ?? {
      id: event.exchangeId,
      at: event.at,
    };
    activities.set(event.exchangeId, {
      ...current,
      at: Math.max(current.at, event.at),
      ...(event.kind === 'exchange.started' ? { started: event } : { settled: event }),
    });
  });

  return [...activities.values()].sort((left, right) => right.at - left.at);
};

const buildDurableActivities = (
  events: readonly ObservationDiagnosticEvent[],
): DurableActivity[] => {
  const activities = new Map<string, DurableActivity>();
  events.forEach(event => {
    const current = activities.get(event.observationId) ?? {
      id: event.observationId,
      snapshots: [],
      at: event.at,
    };
    activities.set(event.observationId, {
      ...current,
      at: Math.max(current.at, event.at),
      ...(event.kind === 'observation.started'
        ? { started: event }
        : event.kind === 'observation.snapshot'
          ? { snapshots: [...current.snapshots, event] }
          : { settled: event }),
    });
  });
  return [...activities.values()].sort((left, right) => right.at - left.at);
};

const activityButtonStyle = (selected: boolean): CSSProperties => ({
  ...styles.row,
  ...(selected ? styles.selectedRow : {}),
});

const ActivityList = ({
  activities,
  selected,
  select,
}: {
  readonly activities: readonly ExchangeActivity[];
  readonly selected?: SelectedActivity;
  readonly select: (selection: SelectedActivity) => void;
}) =>
  activities.length === 0 ? (
    <div style={styles.empty}>
      Run an Ontahí query or mutation to see its Runtime Protocol exchange.
    </div>
  ) : (
    <ol style={styles.list}>
      {activities.map(activity => {
        const event = activity.settled ?? activity.started;
        if (!event) return null;
        const outcome = activity.settled?.outcome ?? 'pending';
        return (
          <li key={activity.id}>
            <button
              type='button'
              style={activityButtonStyle(
                selected?.kind === 'exchange' && selected.id === activity.id,
              )}
              onClick={() => select({ kind: 'exchange', id: activity.id })}
            >
              <span style={{ ...styles.dot, background: outcomeColor(outcome) }} />
              <span style={styles.rowMain}>
                <span style={styles.rowTitle}>{event.family}</span>
                <span style={styles.rowMeta}>
                  <span>{event.transportId}</span>
                  <span>{formatClock(activity.at)}</span>
                  {activity.settled ? <span>{activity.settled.durationMs} ms</span> : null}
                </span>
              </span>
              <span style={styles.outcome}>{outcome}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

const DurableList = ({
  activities,
  selected,
  select,
}: {
  readonly activities: readonly DurableActivity[];
  readonly selected?: SelectedActivity;
  readonly select: (selection: SelectedActivity) => void;
}) =>
  activities.length === 0 ? (
    <div style={styles.empty}>
      Durable observation snapshots will appear here as one semantic run.
    </div>
  ) : (
    <ol style={styles.list}>
      {activities.map(activity => {
        const event =
          activity.settled ?? activity.snapshots[activity.snapshots.length - 1] ?? activity.started;
        if (!event) return null;
        const outcome = activity.settled?.outcome ?? 'pending';
        return (
          <li key={activity.id}>
            <button
              type='button'
              style={activityButtonStyle(
                selected?.kind === 'observation' && selected.id === activity.id,
              )}
              onClick={() => select({ kind: 'observation', id: activity.id })}
            >
              <span style={{ ...styles.dot, background: outcomeColor(outcome) }} />
              <span style={styles.rowMain}>
                <span style={styles.rowTitle}>{event.run.taskId}</span>
                <span style={styles.rowMeta}>
                  <span>{event.transportId}</span>
                  <span>{activity.snapshots.length} snapshots</span>
                  <span>{formatClock(activity.at)}</span>
                </span>
              </span>
              <span style={styles.outcome}>{outcome}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

const DevtoolsPanel = ({ diagnostics, close }: OntahiDevtoolsProps & { close: () => void }) => {
  const snapshot = useSyncExternalStore(
    diagnostics.subscribe,
    diagnostics.inspect,
    diagnostics.inspect,
  );
  const [tab, setTab] = useState<'activity' | 'durable'>('activity');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<SelectedActivity>();
  const exchanges = useMemo(
    () =>
      buildExchangeActivities(
        snapshot.events.filter((event): event is ExchangeDiagnosticEvent =>
          event.kind.startsWith('exchange.'),
        ),
      ),
    [snapshot],
  );
  const observations = useMemo(
    () =>
      buildDurableActivities(
        snapshot.events.filter((event): event is ObservationDiagnosticEvent =>
          event.kind.startsWith('observation.'),
        ),
      ),
    [snapshot],
  );
  const normalizedFilter = filter.trim().toLowerCase();
  const filteredExchanges = normalizedFilter
    ? exchanges.filter(activity => {
        const event = activity.settled ?? activity.started;
        return (
          event &&
          matchesFilter(
            [event.family, event.transportId, activity.settled?.outcome, event.requestId],
            normalizedFilter,
          )
        );
      })
    : exchanges;
  const filteredObservations = normalizedFilter
    ? observations.filter(activity => {
        const event = activity.settled ?? activity.snapshots[0] ?? activity.started;
        return (
          event &&
          matchesFilter(
            [event.run.taskId, event.run.runId, event.transportId, activity.settled?.outcome],
            normalizedFilter,
          )
        );
      })
    : observations;
  const detail =
    selected?.kind === 'exchange'
      ? exchanges.find(activity => activity.id === selected.id)
      : selected?.kind === 'observation'
        ? observations.find(activity => activity.id === selected.id)
        : undefined;

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
      <nav style={styles.tabs} aria-label='Devtools views'>
        <button
          type='button'
          style={{ ...styles.tab, ...(tab === 'activity' ? styles.activeTab : {}) }}
          onClick={() => setTab('activity')}
        >
          Activity <span style={styles.count}>{filteredExchanges.length}</span>
        </button>
        <button
          type='button'
          style={{ ...styles.tab, ...(tab === 'durable' ? styles.activeTab : {}) }}
          onClick={() => setTab('durable')}
        >
          Durable <span style={styles.count}>{filteredObservations.length}</span>
        </button>
      </nav>
      <div style={styles.filterBar}>
        <input
          type='search'
          style={styles.filter}
          value={filter}
          onChange={event => setFilter(event.currentTarget.value)}
          aria-label='Filter diagnostics'
          placeholder='Filter family, transport, outcome, or id…'
        />
      </div>
      <div style={styles.content}>
        {tab === 'activity' ? (
          <ActivityList activities={filteredExchanges} selected={selected} select={setSelected} />
        ) : (
          <DurableList activities={filteredObservations} selected={selected} select={setSelected} />
        )}
        {detail ? (
          <section style={styles.detail} aria-label='Selected diagnostic detail'>
            <h3 style={styles.detailHeading}>Semantic detail</h3>
            <pre style={styles.pre}>{JSON.stringify(detail, null, 2)}</pre>
          </section>
        ) : null}
      </div>
    </aside>
  );
};

export const OntahiDevtools = ({ diagnostics, initiallyOpen = false }: OntahiDevtoolsProps) => {
  const [open, setOpen] = useState(initiallyOpen);

  return open ? (
    <DevtoolsPanel diagnostics={diagnostics} close={() => setOpen(false)} />
  ) : (
    <button
      type='button'
      style={styles.launcher}
      onClick={() => setOpen(true)}
      aria-label='Open Ontahí Devtools'
      title='Open Ontahí Devtools'
    >
      O
    </button>
  );
};
