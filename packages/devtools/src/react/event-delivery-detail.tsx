import { isRecord } from './activity-model.js';
import { styles } from './devtools-styles.js';
import { SemanticPayload } from './semantic-payload.js';

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

export const EventDeliveryDetail = ({ delivery }: { readonly delivery: unknown }) => {
  const occurrence =
    isRecord(delivery) && isRecord(delivery.occurrence) ? delivery.occurrence : undefined;
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
          <SemanticPayload value={delivery} />
        </div>
      </details>
    </article>
  );
};
