import type { RuntimeDiagnosticOutcome } from '../diagnostics.js';

import { outcomeColor } from './activity-model.js';
import { styles } from './devtools-styles.js';
import { JsonView } from './json-view.js';

export const ActivityMessage = ({
  direction,
  outcome,
  title,
  time,
  transport,
  detail,
  value,
  label,
  response,
}: {
  readonly direction: string;
  readonly outcome: RuntimeDiagnosticOutcome | 'pending';
  readonly title: string;
  readonly time: string;
  readonly transport: string;
  readonly detail?: string;
  readonly value: unknown;
  readonly label: string;
  readonly response?: { readonly value: unknown; readonly label: string };
}) => (
  <li style={styles.message}>
    <details>
      <summary style={styles.messageSummary}>
        <span style={styles.messageDirection}>{direction}</span>
        <span style={{ ...styles.dot, background: outcomeColor(outcome) }} aria-hidden='true' />
        <span style={styles.messageTitle}>{title}</span>
        <span style={styles.messageMeta}>
          <span>{time}</span>
          <span>{transport}</span>
          <span>{detail}</span>
        </span>
      </summary>
      <div style={styles.messagePayload}>
        {response ? (
          <div style={styles.exchangePayload}>
            <section style={styles.exchangePayloadColumn} aria-label='Invocation request'>
              <span style={styles.semanticLabel}>Request</span>
              <JsonView value={value} label={label} />
            </section>
            <section style={styles.exchangePayloadColumn} aria-label='Invocation response'>
              <span style={styles.semanticLabel}>Response</span>
              <JsonView value={response.value} label={response.label} />
            </section>
          </div>
        ) : (
          <JsonView value={value} label={label} />
        )}
      </div>
    </details>
  </li>
);
