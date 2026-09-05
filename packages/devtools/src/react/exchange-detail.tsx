import { useState } from 'react';

import type { DiagnosticProtocolEnvelope } from '../diagnostics.js';

import {
  formatSelectionExpression,
  graphReadSummary,
  isRecord,
  outcomeColor,
  semanticSummary,
  viewFields,
  type ExchangeActivity,
  type RecordValue,
} from './activity-model.js';
import { styles } from './devtools-styles.js';
import { JsonView } from './json-view.js';

type PayloadMode = 'visual' | 'body-json' | 'envelope';

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

export const ExchangeDetail = ({ activity }: { readonly activity: ExchangeActivity }) => {
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
