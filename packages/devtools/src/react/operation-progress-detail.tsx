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
  exchangeInteractionState,
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
  const isModelCommand = (exchange?.started ?? exchange?.settled)?.family === 'model.command';
  const state = operationProgressState(activity);
  const initialInteraction = exchange ? exchangeInteractionState(exchange) : undefined;
  const latestSnapshot = activity.snapshots[activity.snapshots.length - 1]?.snapshot;
  const settlementDuplicatesLatestSnapshot =
    activity.settled !== undefined && latestSnapshot?.status === activity.settled.outcome;
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
            <span style={styles.semanticLabel}>{isModelCommand ? 'Execution' : 'Operation'}</span>
            <span style={styles.semanticValue}>
              {isModelCommand ? 'Model command' : `${event.run.taskId}()`}
            </span>
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
              outcome={initialInteraction ? 'pending' : (exchange.settled?.outcome ?? 'pending')}
              title={initialInteraction?.title ?? 'invoke'}
              time={formatClock(exchange.started.at)}
              transport={exchange.started.transportId}
              detail={
                initialInteraction?.optionCount === undefined
                  ? undefined
                  : `${initialInteraction.optionCount} options`
              }
              value={exchange.started.request}
              label='Invocation request JSON'
              response={
                exchange.started.transportKind === 'fetch' && exchange.settled?.response
                  ? { value: exchange.settled.response, label: 'Invocation response JSON' }
                  : undefined
              }
            />
          ) : null}
          {activity.started ? (
            <ActivityMessage
              direction='←'
              outcome='pending'
              title='progress stream opened'
              time={formatClock(activity.started.at)}
              transport={activity.started.transportId}
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
                time={formatClock(snapshot.at)}
                transport={snapshot.transportId}
                detail={`update #${snapshot.sequence}${
                  typeof progress?.percent === 'number' ? ` · ${progress.percent}%` : ''
                }`}
                value={snapshot.snapshot}
                label={`Progress update ${snapshot.sequence} JSON`}
              />
            );
          })}
          {activity.settled && !settlementDuplicatesLatestSnapshot ? (
            <ActivityMessage
              direction='—'
              outcome={activity.settled.outcome}
              title={activity.settled.outcome}
              time={formatClock(activity.settled.at)}
              transport={activity.settled.transportId}
              detail={`${activity.settled.durationMs} ms`}
              value={activity.settled}
              label='Progress settlement JSON'
            />
          ) : null}
        </ol>
      </div>
    </section>
  );
};
