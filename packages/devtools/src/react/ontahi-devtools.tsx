'use client';

import { useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';

import type {
  DiagnosticProtocolEnvelope,
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
type RecordValue = Record<string, unknown>;
type PayloadMode = 'visual' | 'body-json' | 'envelope';

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
    right: 12,
    bottom: 12,
    left: 12,
    display: 'grid',
    width: 'auto',
    maxWidth: 1480,
    height: 'min(620px, calc(100vh - 24px))',
    margin: '0 auto',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    overflow: 'hidden',
    border: '1px solid #2d4a3d',
    borderRadius: 18,
    color: '#dce8e1',
    background: '#0c1310',
    boxShadow: '0 26px 80px rgba(3, 10, 7, 0.52)',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontSize: 12,
    textAlign: 'left',
  },
  header: {
    display: 'flex',
    minHeight: 58,
    alignItems: 'center',
    gap: 22,
    padding: '0 16px',
    borderBottom: '1px solid #213229',
    background: '#101a15',
  },
  brand: { display: 'grid', flex: '0 0 auto', gap: 2 },
  eyebrow: {
    color: '#7aa58f',
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
  },
  title: { margin: 0, color: '#effbf4', fontSize: 15, fontWeight: 800 },
  headerActions: { display: 'flex', marginLeft: 'auto', gap: 7 },
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
  tabs: { display: 'flex', gap: 4 },
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
  workspace: {
    display: 'grid',
    minWidth: 0,
    minHeight: 0,
    gridTemplateColumns: 'minmax(290px, 0.34fr) minmax(0, 1fr)',
  },
  sidebar: {
    display: 'grid',
    minWidth: 0,
    minHeight: 0,
    gridTemplateRows: 'auto minmax(0, 1fr)',
    borderRight: '1px solid #213229',
    background: '#0b120f',
  },
  filterBar: { padding: 10, borderBottom: '1px solid #213229', background: '#0d1712' },
  filter: {
    boxSizing: 'border-box',
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
  list: {
    minHeight: 0,
    margin: 0,
    padding: 8,
    overflow: 'auto',
    listStyle: 'none',
    scrollbarGutter: 'stable',
  },
  row: {
    display: 'grid',
    boxSizing: 'border-box',
    width: '100%',
    gridTemplateColumns: '8px minmax(0, 1fr) auto',
    gap: 10,
    alignItems: 'center',
    margin: 0,
    padding: '11px 9px',
    border: 0,
    borderRadius: 10,
    color: '#d7e3dc',
    background: 'transparent',
    cursor: 'pointer',
    font: 'inherit',
    textAlign: 'left',
  },
  selectedRow: { background: '#16291f' },
  dot: { width: 7, height: 7, borderRadius: 999, background: '#d6a75d' },
  rowMain: { display: 'grid', minWidth: 0, gap: 4 },
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
  family: {
    color: '#8eb49f',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
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
  detail: { display: 'grid', minWidth: 0, minHeight: 0, gridTemplateRows: 'auto minmax(0, 1fr)' },
  detailHeader: {
    display: 'flex',
    minWidth: 0,
    minHeight: 54,
    alignItems: 'center',
    gap: 14,
    padding: '0 15px',
    borderBottom: '1px solid #213229',
    background: '#0e1813',
  },
  detailHeadingGroup: { display: 'grid', minWidth: 0, gap: 3 },
  detailTitle: {
    margin: 0,
    overflow: 'hidden',
    color: '#effbf4',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 13,
    fontWeight: 800,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  detailMeta: { display: 'flex', gap: 9, color: '#6f897c', fontSize: 10 },
  payloadGrid: {
    display: 'grid',
    minWidth: 0,
    minHeight: 0,
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  payloadPanel: {
    display: 'grid',
    minWidth: 0,
    minHeight: 0,
    gridTemplateRows: 'auto minmax(0, 1fr)',
    borderRight: '1px solid #213229',
  },
  payloadHeader: {
    display: 'flex',
    minHeight: 42,
    alignItems: 'center',
    gap: 10,
    padding: '0 11px',
    borderBottom: '1px solid #1b2a22',
    background: '#0b1410',
  },
  payloadTitle: {
    margin: 0,
    color: '#a7c8b6',
    fontSize: 9,
    fontWeight: 850,
    letterSpacing: '0.11em',
    textTransform: 'uppercase',
  },
  modes: {
    display: 'flex',
    marginLeft: 'auto',
    padding: 2,
    border: '1px solid #26392f',
    borderRadius: 8,
    background: '#09110d',
  },
  mode: {
    minHeight: 25,
    padding: '0 7px',
    border: 0,
    borderRadius: 6,
    color: '#6f897c',
    background: 'transparent',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 9,
    fontWeight: 750,
  },
  activeMode: { color: '#dffbea', background: '#1a3025' },
  payloadBody: {
    minWidth: 0,
    minHeight: 0,
    overflow: 'auto',
    padding: 14,
    background: '#09100d',
    scrollbarGutter: 'stable',
  },
  semanticHeadline: {
    margin: '0 0 14px',
    color: '#e9fff2',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1.45,
  },
  semanticGrid: { display: 'grid', gap: 10 },
  semanticCard: {
    padding: 11,
    border: '1px solid #1f3128',
    borderRadius: 10,
    background: '#0e1813',
  },
  semanticLabel: {
    display: 'block',
    marginBottom: 6,
    color: '#6f9581',
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  semanticValue: {
    color: '#c8ded2',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
    lineHeight: 1.55,
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  chip: {
    padding: '3px 6px',
    border: '1px solid #294236',
    borderRadius: 6,
    color: '#add0bd',
    background: '#13231b',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 10,
  },
  tableWrap: { overflow: 'auto', border: '1px solid #1f3128', borderRadius: 10 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 10 },
  tableCell: {
    maxWidth: 180,
    padding: '7px 9px',
    overflow: 'hidden',
    borderBottom: '1px solid #19271f',
    color: '#b8cec2',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pre: {
    margin: 0,
    color: '#bcd4c7',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 10,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  copyButton: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    float: 'right',
    minHeight: 26,
    margin: '0 0 8px 8px',
    padding: '0 8px',
    border: '1px solid #30463a',
    borderRadius: 7,
    color: '#9ebbad',
    background: '#14221b',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 9,
    fontWeight: 750,
  },
};

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

const formatInlineValue = (value: unknown) => {
  const formatted =
    typeof value === 'string' ? `"${value}"` : (JSON.stringify(value) ?? String(value));
  return formatted.length > 42 ? `${formatted.slice(0, 39)}…` : formatted;
};

const formatSelectionExpression = (value: unknown): string => {
  if (!isRecord(value) || typeof value.kind !== 'string') return 'selection';
  if (value.kind === 'all' || value.kind === 'none') return value.kind;
  if (value.kind === 'references' && Array.isArray(value.refs)) {
    return `byRef(${value.refs.length})`;
  }
  if (value.kind === 'predicate' && typeof value.fieldName === 'string') {
    if (value.operator === 'in' && Array.isArray(value.values)) {
      return `where(${value.fieldName} in ${formatInlineValue(value.values)})`;
    }
    if (value.operator === 'isNull') return `where(${value.fieldName} is null)`;
    return `where(${value.fieldName} ${String(value.operator)} ${formatInlineValue(value.value)})`;
  }
  if ((value.kind === 'and' || value.kind === 'or') && Array.isArray(value.operands)) {
    const operator = value.kind === 'and' ? ' && ' : ' || ';
    const operands = value.operands
      .map(formatSelectionExpression)
      .map(part => (part.startsWith('where(') && part.endsWith(')') ? part.slice(6, -1) : part));
    return `where(${operands.join(operator)})`;
  }
  if (value.kind === 'not') return `not(${formatSelectionExpression(value.operand)})`;
  return `${value.kind}(…)`;
};

const graphReadSummary = (body: RecordValue): string | undefined => {
  if (body.kind !== 'graph-read' || !isRecord(body.selection)) return undefined;
  const entity =
    typeof body.selection.entityName === 'string' ? body.selection.entityName : 'UnknownEntity';
  const expression = formatSelectionExpression(body.selection.expression);
  const clauses = [`${entity}.${expression}`];
  if (Array.isArray(body.orderBy) && body.orderBy.length > 0) {
    const ordering = body.orderBy
      .map(order =>
        isRecord(order) && typeof order.fieldName === 'string'
          ? `${order.fieldName}${typeof order.direction === 'string' ? ` ${order.direction}` : ''}`
          : undefined,
      )
      .filter((value): value is string => Boolean(value));
    if (ordering.length > 0) clauses.push(`orderBy ${ordering.join(', ')}`);
  }
  if (typeof body.limit === 'number') clauses.push(`limit ${body.limit}`);
  if (isRecord(body.view) && typeof body.view.name === 'string')
    clauses.push(`as ${body.view.name}`);
  return clauses.join(' · ');
};

const graphCommandSummary = (body: RecordValue): string | undefined => {
  if (body.kind !== 'graph-command' || !isRecord(body.command)) return undefined;
  const command = body.command;
  if (command.kind === 'entity-mutation-command') {
    const entity = typeof command.entityName === 'string' ? command.entityName : 'Entity';
    const action = typeof command.action === 'string' ? command.action : 'mutate';
    return `${entity}.${action}`;
  }
  if (
    (command.kind === 'relationship-command' ||
      command.kind === 'many-to-many-relationship-command') &&
    isRecord(command.relation)
  ) {
    const relation =
      typeof command.relation.fieldName === 'string'
        ? command.relation.fieldName
        : typeof command.relation.relationName === 'string'
          ? command.relation.relationName
          : 'relation';
    return `${relation}.${String(command.action ?? 'change')}`;
  }
  return typeof command.kind === 'string' ? command.kind : 'Graph command';
};

const semanticSummary = (activity: ExchangeActivity): string => {
  const event = activity.started ?? activity.settled;
  const body = activity.started?.request?.body;
  if (isRecord(body)) {
    const graphRead = graphReadSummary(body);
    if (graphRead) return graphRead;
    const graphCommand = graphCommandSummary(body);
    if (graphCommand) return graphCommand;
    if (event?.family === 'operation' && typeof body.operationId === 'string') {
      return `${body.operationId}.${body.kind === 'check-permission' ? 'can?' : 'invoke'}`;
    }
  }
  return event?.family ?? 'Runtime exchange';
};

const viewFields = (view: unknown, prefix = ''): string[] => {
  if (!isRecord(view) || !isRecord(view.fields)) return [];
  return Object.entries(view.fields).flatMap(([name, field]) => {
    if (!isRecord(field)) return [`${prefix}${name}`];
    if (field.kind !== 'relation-view') return [`${prefix}${name}`];
    const nested = viewFields(field.view, `${prefix}${name}.`);
    return nested.length > 0 ? nested : [`${prefix}${name}`];
  });
};

const buildExchangeActivities = (
  events: readonly ExchangeDiagnosticEvent[],
): ExchangeActivity[] => {
  const activities = new Map<string, ExchangeActivity>();
  events.forEach(event => {
    const current = activities.get(event.exchangeId) ?? { id: event.exchangeId, at: event.at };
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
  selectedId,
  select,
}: {
  readonly activities: readonly ExchangeActivity[];
  readonly selectedId?: string;
  readonly select: (selection: SelectedActivity) => void;
}) =>
  activities.length === 0 ? (
    <div style={styles.empty}>
      Run an Ontahí query or mutation to see its semantic runtime activity.
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
              style={activityButtonStyle(selectedId === activity.id)}
              onClick={() => select({ kind: 'exchange', id: activity.id })}
              aria-label={`${semanticSummary(activity)} ${event.transportId} ${outcome}`}
            >
              <span style={{ ...styles.dot, background: outcomeColor(outcome) }} />
              <span style={styles.rowMain}>
                <span style={styles.rowTitle}>{semanticSummary(activity)}</span>
                <span style={styles.rowMeta}>
                  <span style={styles.family}>{event.family}</span>
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
  selectedId,
  select,
}: {
  readonly activities: readonly DurableActivity[];
  readonly selectedId?: string;
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
              style={activityButtonStyle(selectedId === activity.id)}
              onClick={() => select({ kind: 'observation', id: activity.id })}
            >
              <span style={{ ...styles.dot, background: outcomeColor(outcome) }} />
              <span style={styles.rowMain}>
                <span style={styles.rowTitle}>{event.run.taskId}</span>
                <span style={styles.rowMeta}>
                  <span style={styles.family}>durable.observe</span>
                  <span>{event.transportId}</span>
                  <span>{activity.snapshots.length} snapshots</span>
                </span>
              </span>
              <span style={styles.outcome}>{outcome}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

const formatLeaf = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  if (isRecord(value)) return `${Object.keys(value).length} fields`;
  return String(value ?? '—');
};

const ResultTable = ({ value }: { readonly value: readonly unknown[] }) => {
  const records = value.filter(isRecord);
  if (records.length !== value.length || records.length === 0) {
    return (
      <div style={styles.semanticCard}>
        <span style={styles.semanticLabel}>Result</span>
        <span style={styles.semanticValue}>{value.map(formatLeaf).join(', ') || 'Empty list'}</span>
      </div>
    );
  }
  const columns = [...new Set(records.flatMap(record => Object.keys(record)))].slice(0, 8);
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column} style={{ ...styles.tableCell, color: '#7fa28f', textAlign: 'left' }}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.slice(0, 50).map((record, index) => (
            <tr key={index}>
              {columns.map(column => (
                <td key={column} style={styles.tableCell} title={formatLeaf(record[column])}>
                  {formatLeaf(record[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const GenericVisual = ({ value }: { readonly value: unknown }) => {
  if (Array.isArray(value)) return <ResultTable value={value} />;
  if (!isRecord(value)) return <span style={styles.semanticValue}>{formatLeaf(value)}</span>;
  if (value.kind === 'graph-read-result') return <GenericVisual value={value.value} />;
  return (
    <div style={styles.semanticGrid}>
      {Object.entries(value).map(([key, item]) => (
        <div key={key} style={styles.semanticCard}>
          <span style={styles.semanticLabel}>{key}</span>
          {Array.isArray(item) || isRecord(item) ? (
            <GenericVisual value={item} />
          ) : (
            <span style={styles.semanticValue}>{formatLeaf(item)}</span>
          )}
        </div>
      ))}
    </div>
  );
};

const GraphReadVisual = ({ body }: { readonly body: RecordValue }) => {
  const selection = isRecord(body.selection) ? body.selection : undefined;
  const view = isRecord(body.view) ? body.view : undefined;
  const fields = viewFields(view);
  return (
    <>
      <p style={styles.semanticHeadline}>{graphReadSummary(body)}</p>
      <div style={styles.semanticGrid}>
        <div style={styles.semanticCard}>
          <span style={styles.semanticLabel}>Selection</span>
          <span style={styles.semanticValue}>
            {String(selection?.entityName ?? 'Unknown')}
            {' · '}
            {formatSelectionExpression(selection?.expression)}
          </span>
        </div>
        {Array.isArray(body.orderBy) ? (
          <div style={styles.semanticCard}>
            <span style={styles.semanticLabel}>Order</span>
            <span style={styles.semanticValue}>
              {body.orderBy
                .map(order =>
                  isRecord(order) ? `${String(order.fieldName)} ${String(order.direction)}` : '',
                )
                .filter(Boolean)
                .join(', ')}
            </span>
          </div>
        ) : null}
        {view ? (
          <div style={styles.semanticCard}>
            <span style={styles.semanticLabel}>
              View {typeof view.name === 'string' ? `· ${view.name}` : ''}
            </span>
            <span style={styles.chips}>
              {fields.map(field => (
                <span key={field} style={styles.chip}>
                  {field}
                </span>
              ))}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
};

const SemanticPayload = ({ value }: { readonly value: unknown }) =>
  isRecord(value) && value.kind === 'graph-read' ? (
    <GraphReadVisual body={value} />
  ) : (
    <GenericVisual value={value} />
  );

const jsonTokens = (value: unknown): ReactNode[] => {
  const json = JSON.stringify(value, null, 2) ?? 'undefined';
  const pattern =
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:|"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of json.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(json.slice(cursor, index));
    const token = match[0];
    const isKey = token.startsWith('"') && token.trimEnd().endsWith(':');
    const color = isKey
      ? '#79b99a'
      : token.startsWith('"')
        ? '#d6bd82'
        : token === 'true' || token === 'false'
          ? '#88afe0'
          : token === 'null'
            ? '#87938d'
            : '#d58ba3';
    nodes.push(
      <span key={`${index}-${token.length}`} style={{ color }}>
        {token}
      </span>,
    );
    cursor = index + token.length;
  }
  if (cursor < json.length) nodes.push(json.slice(cursor));
  return nodes;
};

const JsonView = ({ value, label }: { readonly value: unknown; readonly label: string }) => {
  const [copied, setCopied] = useState(false);
  const serialized = JSON.stringify(value, null, 2) ?? 'undefined';
  const copy = async () => {
    await globalThis.navigator?.clipboard?.writeText(serialized);
    setCopied(true);
  };
  return (
    <>
      <button type='button' style={styles.copyButton} onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre style={styles.pre}>{jsonTokens(value)}</pre>
    </>
  );
};

const PayloadPanel = ({
  title,
  body,
  envelope,
}: {
  readonly title: string;
  readonly body: unknown;
  readonly envelope?: DiagnosticProtocolEnvelope | RecordValue;
}) => {
  const [mode, setMode] = useState<PayloadMode>('visual');
  const displayed = mode === 'envelope' ? envelope : body;
  return (
    <section style={styles.payloadPanel} aria-label={`${title} detail`}>
      <header style={styles.payloadHeader}>
        <h4 style={styles.payloadTitle}>{title}</h4>
        <span style={styles.modes} aria-label={`${title} view mode`}>
          {(
            [
              ['visual', 'Visual'],
              ['body-json', 'Body JSON'],
              ['envelope', 'Envelope'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type='button'
              style={{ ...styles.mode, ...(mode === value ? styles.activeMode : {}) }}
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
            >
              {label}
            </button>
          ))}
        </span>
      </header>
      <div style={styles.payloadBody}>
        {displayed === undefined ? (
          <div style={styles.empty}>No captured payload for this side of the exchange.</div>
        ) : mode === 'visual' ? (
          <SemanticPayload value={body} />
        ) : (
          <JsonView value={displayed} label={`${title} JSON`} />
        )}
      </div>
    </section>
  );
};

const ExchangeDetail = ({ activity }: { readonly activity: ExchangeActivity }) => {
  const event = activity.settled ?? activity.started;
  if (!event) return null;
  const outcome = activity.settled?.outcome ?? 'pending';
  const requestEnvelope = activity.started?.request;
  const responseEnvelope = activity.settled?.response;
  const responseBody = responseEnvelope?.body ?? responseEnvelope?.error ?? activity.settled?.error;
  return (
    <section style={styles.detail} aria-label='Selected diagnostic detail'>
      <header style={styles.detailHeader}>
        <span style={{ ...styles.dot, background: outcomeColor(outcome) }} />
        <span style={styles.detailHeadingGroup}>
          <h3 style={styles.detailTitle}>{semanticSummary(activity)}</h3>
          <span style={styles.detailMeta}>
            <span style={styles.family}>{event.family}</span>
            <span>{event.transportId}</span>
            <span>{activity.settled?.durationMs ?? '…'} ms</span>
            <span>{outcome}</span>
          </span>
        </span>
      </header>
      <div style={styles.payloadGrid}>
        <PayloadPanel title='Request' body={requestEnvelope?.body} envelope={requestEnvelope} />
        <PayloadPanel
          title='Response'
          body={responseBody}
          envelope={responseEnvelope ?? activity.settled?.error}
        />
      </div>
    </section>
  );
};

const DurableDetail = ({ activity }: { readonly activity: DurableActivity }) => {
  const event =
    activity.settled ?? activity.snapshots[activity.snapshots.length - 1] ?? activity.started;
  if (!event) return null;
  const outcome = activity.settled?.outcome ?? 'pending';
  return (
    <section style={styles.detail} aria-label='Selected diagnostic detail'>
      <header style={styles.detailHeader}>
        <span style={{ ...styles.dot, background: outcomeColor(outcome) }} />
        <span style={styles.detailHeadingGroup}>
          <h3 style={styles.detailTitle}>{event.run.taskId}</h3>
          <span style={styles.detailMeta}>
            <span style={styles.family}>durable.operation.observe</span>
            <span>{event.transportId}</span>
            <span>{activity.snapshots.length} snapshots</span>
            <span>{outcome}</span>
          </span>
        </span>
      </header>
      <div style={{ ...styles.payloadBody, padding: 16 }}>
        <GenericVisual
          value={{
            run: event.run,
            snapshots: activity.snapshots.map(snapshot => snapshot.snapshot),
            settlement: activity.settled,
          }}
        />
      </div>
    </section>
  );
};

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
            [
              semanticSummary(activity),
              event.family,
              event.transportId,
              activity.settled?.outcome,
              event.requestId,
            ],
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
  const selectedExchange =
    selected?.kind === 'exchange'
      ? exchanges.find(activity => activity.id === selected.id)
      : undefined;
  const selectedObservation =
    selected?.kind === 'observation'
      ? observations.find(activity => activity.id === selected.id)
      : undefined;
  const activeExchange =
    tab === 'activity' ? (selectedExchange ?? filteredExchanges[0]) : undefined;
  const activeObservation =
    tab === 'durable' ? (selectedObservation ?? filteredObservations[0]) : undefined;

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
          {tab === 'activity' ? (
            <ActivityList
              activities={filteredExchanges}
              selectedId={activeExchange?.id}
              select={setSelected}
            />
          ) : (
            <DurableList
              activities={filteredObservations}
              selectedId={activeObservation?.id}
              select={setSelected}
            />
          )}
        </section>
        {activeExchange ? (
          <ExchangeDetail activity={activeExchange} />
        ) : activeObservation ? (
          <DurableDetail activity={activeObservation} />
        ) : (
          <div style={styles.empty}>Select runtime traffic to inspect its semantic detail.</div>
        )}
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
