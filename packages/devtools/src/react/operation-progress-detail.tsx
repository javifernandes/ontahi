import type { RuntimeDiagnosticOutcome } from '../diagnostics.js';

import {
  formatClock,
  outcomeColor,
  semanticSummary,
  type ExchangeActivity,
  type ObservationSnapshot,
  type OperationProgressActivity,
} from './activity-model.js';
import { styles } from './devtools-styles.js';
import { JsonView } from './json-view.js';

const snapshotOutcome = (
  status: ObservationSnapshot['snapshot']['status'],
): RuntimeDiagnosticOutcome | 'pending' => {
  if (status === 'completed' || status === 'failed' || status === 'cancelled') return status;
  return 'pending';
};

const ActivityMessage = ({
  direction,
  outcome,
  title,
  meta,
  value,
  label,
}: {
  readonly direction: string;
  readonly outcome: RuntimeDiagnosticOutcome | 'pending';
  readonly title: string;
  readonly meta: string;
  readonly value: unknown;
  readonly label: string;
}) => (
  <li style={styles.message}>
    <details>
      <summary style={styles.messageSummary}>
        <span style={styles.messageDirection}>{direction}</span>
        <span style={{ ...styles.dot, background: outcomeColor(outcome) }} aria-hidden='true' />
        <span style={styles.messageMain}>
          <span style={styles.messageTitle}>{title}</span>
          <span style={styles.messageMeta}>{meta}</span>
        </span>
        <span style={styles.family}>JSON</span>
      </summary>
      <div style={styles.messagePayload}>
        <JsonView value={value} label={label} />
      </div>
    </details>
  </li>
);

export const OperationProgressDetail = ({
  activity,
  exchange,
}: {
  readonly activity: OperationProgressActivity;
  readonly exchange?: ExchangeActivity;
}) => {
  const event =
    activity.settled ?? activity.snapshots[activity.snapshots.length - 1] ?? activity.started;
  if (!event) return null;
  const outcome = activity.settled?.outcome ?? 'pending';
  const title = exchange ? semanticSummary(exchange) : `${event.run.taskId}()`;
  return (
    <section style={styles.detail} aria-label='Selected diagnostic detail'>
      <header style={styles.detailHeader}>
        <span style={{ ...styles.dot, background: outcomeColor(outcome) }} />
        <span style={styles.detailHeadingGroup}>
          <h3 style={styles.detailTitle}>{title}</h3>
          <span style={styles.detailMeta}>
            <span style={styles.family}>operation progress</span>
            <span>{event.transportId}</span>
            <span>{activity.snapshots.length} updates</span>
            <span>{activity.settled?.durationMs ?? '…'} ms</span>
            <span>{outcome}</span>
          </span>
        </span>
      </header>
      <div style={styles.runBody}>
        <div style={styles.runSummary}>
          <div style={styles.semanticCard}>
            <span style={styles.semanticLabel}>Operation</span>
            <span style={styles.semanticValue}>{event.run.taskId}()</span>
          </div>
          <div style={styles.semanticCard}>
            <span style={styles.semanticLabel}>Run</span>
            <span style={styles.semanticValue}>{event.run.runId}</span>
          </div>
          <div style={styles.semanticCard}>
            <span style={styles.semanticLabel}>Progress</span>
            <span style={styles.semanticValue}>
              {activity.snapshots.length} updates · {outcome}
            </span>
          </div>
        </div>
        <ol style={styles.messageList} aria-label='Operation progress messages'>
          {exchange?.started ? (
            <ActivityMessage
              direction='→'
              outcome={exchange.settled?.outcome ?? 'pending'}
              title='invoke'
              meta={`${formatClock(exchange.started.at)} · ${exchange.started.transportId}`}
              value={{ request: exchange.started.request, response: exchange.settled?.response }}
              label='Invocation JSON'
            />
          ) : null}
          {activity.started ? (
            <ActivityMessage
              direction='←'
              outcome='pending'
              title='progress stream opened'
              meta={`${formatClock(activity.started.at)} · ${activity.started.transportId}`}
              value={activity.started}
              label='Progress start JSON'
            />
          ) : null}
          {activity.snapshots.map(snapshot => {
            const progress = snapshot.snapshot.progress;
            const detail = progress?.message ?? progress?.phase;
            return (
              <ActivityMessage
                key={`${snapshot.observationId}:${snapshot.sequence}`}
                direction='←'
                outcome={snapshotOutcome(snapshot.snapshot.status)}
                title={`${snapshot.snapshot.status}${detail ? ` · ${detail}` : ''}`}
                meta={`update #${snapshot.sequence} · ${formatClock(snapshot.at)}${
                  typeof progress?.percent === 'number' ? ` · ${progress.percent}%` : ''
                }`}
                value={snapshot.snapshot}
                label={`Progress update ${snapshot.sequence} JSON`}
              />
            );
          })}
          {activity.settled ? (
            <ActivityMessage
              direction='—'
              outcome={activity.settled.outcome}
              title={activity.settled.outcome}
              meta={`${formatClock(activity.settled.at)} · ${activity.settled.durationMs} ms`}
              value={activity.settled}
              label='Progress settlement JSON'
            />
          ) : null}
        </ol>
      </div>
    </section>
  );
};
