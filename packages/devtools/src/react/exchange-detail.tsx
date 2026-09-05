import { useState } from 'react';

import type { DiagnosticProtocolEnvelope } from '../diagnostics.js';

import {
  outcomeColor,
  semanticSummary,
  type ExchangeActivity,
  type RecordValue,
} from './activity-model.js';
import { styles } from './devtools-styles.js';
import { JsonView } from './json-view.js';
import { SemanticPayload } from './semantic-payload.js';

type PayloadMode = 'visual' | 'body-json' | 'envelope';

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
