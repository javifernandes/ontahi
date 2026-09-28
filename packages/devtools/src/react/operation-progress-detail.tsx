import type { TaskInteractionResponse, TaskSnapshot } from '@ontahi/core/runtime/contracts';
import {
  createRuntimeProtocolExchange,
  isDurableOperationProtocolError,
  parseDurableOperationProtocolResponse,
  toDurableOperationInteractionResponseRequest,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { useMemo, useState } from 'react';

import type { RuntimeDiagnosticOutcome } from '../diagnostics.js';

import {
  formatClock,
  operationProgressState,
  outcomeColor,
  semanticSummary,
  type ExchangeActivity,
  type ObservationSnapshot,
  type OperationProgressActivity,
} from './activity-model.js';
import { styles } from './devtools-styles.js';
import { JsonView } from './json-view.js';
import { OperationInteraction } from './operation-interaction.js';

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
  runtimeTransport,
}: {
  readonly activity: OperationProgressActivity;
  readonly exchange?: ExchangeActivity;
  readonly runtimeTransport?: RuntimeTransport<any>;
}) => {
  const [responding, setResponding] = useState(false);
  const [responseError, setResponseError] = useState<string>();
  const [answeredInteraction, setAnsweredInteraction] = useState<string>();
  const runtimeExchange = useMemo(
    () =>
      runtimeTransport ? createRuntimeProtocolExchange({ transport: runtimeTransport }) : null,
    [runtimeTransport],
  );
  const event =
    activity.settled ?? activity.snapshots[activity.snapshots.length - 1] ?? activity.started;
  if (!event) return null;
  const outcome = activity.settled?.outcome ?? 'pending';
  const title = exchange ? semanticSummary(exchange) : `${event.run.taskId}()`;
  const state = operationProgressState(activity);
  const latestSnapshot = activity.snapshots[activity.snapshots.length - 1]?.snapshot;
  let taskSnapshot: TaskSnapshot | undefined;
  if (latestSnapshot) {
    const parsed = parseDurableOperationProtocolResponse({
      version: 1,
      kind: 'snapshot',
      snapshot: latestSnapshot,
    });
    if (parsed.success && !isDurableOperationProtocolError(parsed.response)) {
      taskSnapshot = parsed.response.snapshot;
    }
  }
  const interaction =
    taskSnapshot?.interaction?.id === answeredInteraction ? undefined : taskSnapshot?.interaction;
  const respond = async (response: TaskInteractionResponse) => {
    if (!runtimeExchange) return;
    setResponding(true);
    setResponseError(undefined);
    try {
      const result = await runtimeExchange({
        family: 'durable.operation',
        body: toDurableOperationInteractionResponseRequest(event.run, response),
      });
      const parsed = parseDurableOperationProtocolResponse(result);
      if (!parsed.success) throw new Error(parsed.error.error.message);
      if (isDurableOperationProtocolError(parsed.response))
        throw new Error(parsed.response.error.message);
      setAnsweredInteraction(response.interactionId);
    } catch (cause) {
      setResponseError(
        cause instanceof Error ? cause.message : 'Could not answer the Interaction.',
      );
    } finally {
      setResponding(false);
    }
  };
  return (
    <section style={styles.detail} aria-label='Selected diagnostic detail'>
      <header style={styles.detailHeader}>
        <span style={{ ...styles.dot, background: outcomeColor(outcome) }} />
        <span style={styles.detailHeadingGroup}>
          <h3 style={styles.detailTitle}>{title}</h3>
          <span style={styles.detailMeta}>
            <span style={styles.family}>{state.label}</span>
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
            <span style={styles.semanticLabel}>State</span>
            <span style={styles.semanticValue}>{state.title}</span>
          </div>
        </div>
        {interaction ? (
          runtimeExchange ? (
            <OperationInteraction
              interaction={interaction}
              responding={responding}
              respond={response => void respond(response)}
            />
          ) : (
            <span role='alert' style={styles.consoleError}>
              The configured Runtime Transport cannot answer this Interaction.
            </span>
          )
        ) : null}
        {responseError ? (
          <span role='alert' style={styles.consoleError}>
            {responseError}
          </span>
        ) : null}
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
            const snapshotState = operationProgressState({
              ...activity,
              snapshots: [snapshot],
              settled: undefined,
            });
            return (
              <ActivityMessage
                key={`${snapshot.observationId}:${snapshot.sequence}`}
                direction='←'
                outcome={snapshotOutcome(snapshot.snapshot.status)}
                title={
                  snapshot.snapshot.interaction
                    ? snapshotState.title
                    : `${snapshot.snapshot.status}${detail ? ` · ${detail}` : ''}`
                }
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
