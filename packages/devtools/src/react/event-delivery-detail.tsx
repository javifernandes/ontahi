import { useState } from 'react';

import { isRecord } from './activity-model.js';
import { styles } from './devtools-styles.js';
import { JsonView } from './json-view.js';

const formatValue = (value: unknown): string => {
  if (isRecord(value) && value.kind === 'entity-ref' && isRecord(value.locator)) {
    const entries = Object.entries(value.locator);
    if (entries.length === 1 && entries[0]?.[0] === 'id') return String(entries[0][1]);
    return entries.map(([key, item]) => `${key}: ${String(item)}`).join(' · ');
  }
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  if (isRecord(value)) return `${Object.keys(value).length} fields`;
  return String(value ?? '—');
};

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
const causationSummary = (causation: unknown): string | undefined => {
  if (!isRecord(causation)) return undefined;
  if (causation.kind === 'operation') {
    const scope = text(causation.scope) ?? 'Operation';
    const taskRun = isRecord(causation.taskRun) ? causation.taskRun : undefined;
    return taskRun && text(taskRun.runId) ? `${scope} · Run ${text(taskRun.runId)}` : scope;
  }
  if (causation.kind === 'mutation-outcome') {
    return `Mutation outcome ${text(causation.outcomeId) ?? 'unknown'}`;
  }
  if (causation.kind === 'ingress') {
    const provider = text(causation.provider) ?? 'external provider';
    const event = text(causation.event);
    const deliveryId = text(causation.deliveryId);
    return [provider, event, deliveryId ? `Delivery ${deliveryId}` : undefined]
      .filter((value): value is string => value !== undefined)
      .join(' · ');
  }
  return text(causation.kind);
};

const EventOverview = ({
  delivery,
  occurrence,
}: {
  delivery: Record<string, unknown>;
  occurrence?: Record<string, unknown>;
}) => {
  const cause = causationSummary(occurrence?.causation);
  const facts = [
    ['Occurred', text(occurrence?.occurredAt)],
    [
      'Version',
      typeof occurrence?.eventVersion === 'number' ? String(occurrence.eventVersion) : undefined,
    ],
    ['Caused by', cause],
    ['Occurrence', text(occurrence?.occurrenceId)],
    ['Delivery', text(delivery.deliveryId)],
    ['Subscription', text(delivery.subscriptionId)],
    ['Attempt', typeof delivery.attempt === 'number' ? String(delivery.attempt) : undefined],
  ].filter((fact): fact is [string, string] => fact[1] !== undefined);

  return (
    <dl style={styles.eventFacts}>
      {facts.map(([label, value]) => (
        <div key={label} style={styles.eventFact}>
          <dt style={styles.eventFactLabel}>{label}</dt>
          <dd style={styles.eventFactValue}>{value}</dd>
        </div>
      ))}
    </dl>
  );
};

export const EventDeliveryDetail = ({ delivery }: { readonly delivery: unknown }) => {
  const [mode, setMode] = useState<'overview' | 'json'>('overview');
  const deliveryRecord = isRecord(delivery) ? delivery : {};
  const occurrence = isRecord(deliveryRecord.occurrence) ? deliveryRecord.occurrence : undefined;
  const eventId = typeof occurrence?.eventId === 'string' ? occurrence.eventId : 'Event';
  const payload = isRecord(occurrence?.payload) ? occurrence.payload : undefined;

  return (
    <article style={styles.eventCard} aria-label='Event delivery'>
      <div style={styles.eventSummary} aria-label='Event summary'>
        <span style={styles.eventGlyph} aria-hidden='true'>
          ◆
        </span>
        <strong style={styles.eventName}>{eventId}</strong>
        {payload
          ? Object.entries(payload).map(([key, value]) => (
              <span key={key} style={styles.eventField}>
                {key} = <strong style={styles.eventFieldValue}>{formatValue(value)}</strong>
              </span>
            ))
          : null}
      </div>
      <details style={styles.technicalEvidence}>
        <summary>Technical details</summary>
        <div style={styles.eventTechnicalDetails}>
          <div style={styles.eventDetailModes} role='group' aria-label='Event detail mode'>
            {(['overview', 'json'] as const).map(value => (
              <button
                key={value}
                type='button'
                style={{ ...styles.mode, ...(mode === value ? styles.activeMode : {}) }}
                onClick={() => setMode(value)}
              >
                {value === 'overview' ? 'Overview' : 'JSON'}
              </button>
            ))}
          </div>
          {mode === 'json' ? (
            <JsonView value={delivery} label={`${eventId} delivery JSON`} />
          ) : (
            <EventOverview delivery={deliveryRecord} occurrence={occurrence} />
          )}
        </div>
      </details>
    </article>
  );
};
