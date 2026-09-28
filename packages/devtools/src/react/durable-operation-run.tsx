'use client';

import type {
  TaskInteractionResponse,
  TaskRunIdentity,
  TaskSnapshot,
} from '@ontahi/core/runtime/contracts';
import {
  createRuntimeProtocolExchange,
  isDurableOperationProtocolError,
  parseDurableOperationProtocolResponse,
  toDurableOperationInteractionResponseRequest,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { useEffect, useMemo, useRef, useState } from 'react';

import { styles } from './devtools-styles.js';
import { JsonView } from './json-view.js';
import { OperationInteraction } from './operation-interaction.js';
import { SemanticPayload } from './semantic-payload.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const operationTaskRunIdentity = (value: unknown): TaskRunIdentity | undefined => {
  if (
    !isRecord(value) ||
    value.kind !== 'invocation-result' ||
    !isRecord(value.result) ||
    value.result.ok !== true ||
    !isRecord(value.result.value)
  )
    return undefined;
  const run = value.result.value;
  return typeof run.taskId === 'string' && typeof run.runId === 'string'
    ? { taskId: run.taskId, runId: run.runId }
    : undefined;
};

const terminal = (status: TaskSnapshot['status']) =>
  status === 'completed' || status === 'failed' || status === 'cancelled';

const responseSnapshot = (value: unknown): TaskSnapshot => {
  const parsed = parseDurableOperationProtocolResponse(value);
  if (!parsed.success) throw new Error(parsed.error.error.message);
  if (isDurableOperationProtocolError(parsed.response)) {
    throw new Error(parsed.response.error.message);
  }
  return parsed.response.snapshot;
};

export const DurableOperationRun = ({
  run,
  transport,
  onCompleted,
  view = 'visual',
}: {
  readonly run: TaskRunIdentity;
  readonly transport: RuntimeTransport<any>;
  readonly onCompleted?: (snapshot: TaskSnapshot) => void | Promise<void>;
  readonly view?: 'visual' | 'json';
}) => {
  const [snapshot, setSnapshot] = useState<TaskSnapshot>();
  const [error, setError] = useState<string>();
  const [responding, setResponding] = useState(false);
  const completedRun = useRef<string>();
  const exchange = useMemo(() => createRuntimeProtocolExchange({ transport }), [transport]);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(undefined);
    setError(undefined);

    const observe = async () => {
      if (!transport.durableOperation) {
        setError('The configured Runtime Transport cannot observe durable Operations.');
        return;
      }
      try {
        for await (const next of transport.durableOperation.observe(run, {
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) break;
          setSnapshot(next);
          if (terminal(next.status)) break;
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Could not observe the Task run.');
      }
    };

    void observe();
    return () => controller.abort();
  }, [run.taskId, run.runId, transport]);

  useEffect(() => {
    if (snapshot?.status !== 'completed') return;
    const key = `${snapshot.taskId}:${snapshot.runId}`;
    if (completedRun.current === key) return;
    completedRun.current = key;
    void Promise.resolve(onCompleted?.(snapshot)).catch(cause => {
      setError(cause instanceof Error ? cause.message : 'Could not reconcile the completed run.');
    });
  }, [onCompleted, snapshot]);

  const respond = async (response: TaskInteractionResponse) => {
    setResponding(true);
    setError(undefined);
    try {
      const next = await exchange({
        family: 'durable.operation',
        body: toDurableOperationInteractionResponseRequest(run, response),
      });
      setSnapshot(responseSnapshot(next));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not answer the Interaction.');
    } finally {
      setResponding(false);
    }
  };

  const interaction = snapshot?.interaction;
  if (view === 'json')
    return (
      <JsonView
        value={snapshot ?? { ...run, status: 'queued' }}
        label='Durable Operation run JSON'
      />
    );
  return (
    <section aria-label='Durable Operation run' style={styles.semanticGrid}>
      <div style={styles.semanticCard}>
        <span style={styles.semanticLabel}>Task run</span>
        <span style={styles.semanticValue}>{run.taskId}</span>
        <span style={{ ...styles.consoleResultStatus, overflowWrap: 'anywhere' }}>{run.runId}</span>
      </div>
      <div style={styles.semanticCard}>
        <span style={styles.semanticLabel}>Status</span>
        <span style={styles.semanticValue}>{snapshot?.status ?? 'queued'}</span>
        {snapshot?.progress ? <SemanticPayload value={snapshot.progress} /> : null}
      </div>

      {interaction ? (
        <OperationInteraction
          interaction={interaction}
          responding={responding}
          respond={response => void respond(response)}
        />
      ) : null}

      {snapshot?.status === 'completed' ? (
        <div style={styles.semanticCard}>
          <span style={styles.semanticLabel}>Result</span>
          <SemanticPayload value={snapshot.result} />
        </div>
      ) : null}
      {snapshot?.error ? (
        <span role='alert' style={styles.consoleError}>
          {snapshot.error.message}
        </span>
      ) : null}
      {error ? (
        <span role='alert' style={styles.consoleError}>
          {error}
        </span>
      ) : null}
    </section>
  );
};
