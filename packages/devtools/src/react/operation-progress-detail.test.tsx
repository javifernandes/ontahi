// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { OperationProgressActivity } from './activity-model.js';
import { OperationProgressDetail } from './operation-progress-detail.js';

afterEach(cleanup);

describe('OperationProgressDetail', () => {
  it('renders one causal timeline from Event wait through resume and completion', () => {
    const base = {
      observationId: 'operation-1',
      family: 'durable.operation.observe' as const,
      run: { taskId: 'TodoList.export', runId: 'run-1' },
      transportId: 'websocket',
      transportKind: 'websocket',
      startedAt: 1,
    };
    const activity: OperationProgressActivity = {
      id: 'operation-1',
      at: 1,
      started: { ...base, kind: 'observation.started', at: 1 },
      snapshots: [
        {
          ...base,
          kind: 'observation.snapshot',
          at: 2,
          sequence: 1,
          snapshot: {
            ...base.run,
            status: 'waiting',
            updatedAt: '2026-10-14T00:00:00.000Z',
            waitingOn: {
              id: 'export:request-1',
              kind: 'event',
              eventId: 'TodoListExportReady',
              eventVersion: 1,
              createdAt: '2026-10-14T00:00:00.000Z',
            },
          },
        },
        {
          ...base,
          kind: 'observation.snapshot',
          at: 3,
          sequence: 2,
          snapshot: {
            ...base.run,
            status: 'running',
            updatedAt: '2026-10-14T00:00:01.000Z',
            resumedBy: {
              kind: 'event',
              waitId: 'export:request-1',
              eventId: 'TodoListExportReady',
              eventVersion: 1,
              occurrenceId: 'occurrence-1',
              occurredAt: '2026-10-14T00:00:01.000Z',
              deliveryId: 'delivery-1',
              subscriptionId: 'subscription-1',
              attempt: 1,
              claimId: 'claim-1',
              consumerId: 'worker-1',
              leaseExpiresAt: '2026-10-14T00:01:01.000Z',
              ingress: {
                provider: 'fixture-worker',
                receivedAt: '2026-10-14T00:00:01.000Z',
              },
            },
          },
        },
        {
          ...base,
          kind: 'observation.snapshot',
          at: 4,
          sequence: 3,
          snapshot: {
            ...base.run,
            status: 'completed',
            updatedAt: '2026-10-14T00:00:02.000Z',
          },
        },
      ],
    };

    render(<OperationProgressDetail activity={activity} eventDeliveries={[]} />);

    expect(screen.getByText('Waiting for TodoListExportReady')).toBeTruthy();
    expect(screen.getByText('TodoListExportReady received · fixture-worker')).toBeTruthy();
    expect(screen.getByText('completed')).toBeTruthy();
    fireEvent.click(screen.getByText('TodoListExportReady received · fixture-worker'));
    expect(screen.getByRole('tree', { name: 'Progress update 2 JSON' })).toBeTruthy();
  });

  it('renders causally correlated Event deliveries as Operation effects', () => {
    const activity: OperationProgressActivity = {
      id: 'operation-1',
      at: 1,
      snapshots: [],
      started: {
        kind: 'observation.started',
        observationId: 'operation-1',
        run: { taskId: 'TodoList.completeAll', runId: 'run-1' },
        family: 'durable.operation.observe',
        transportId: 'websocket',
        transportKind: 'websocket',
        startedAt: 1,
        at: 1,
      },
    };

    render(
      <OperationProgressDetail
        activity={activity}
        eventDeliveries={[
          {
            kind: 'event-delivery',
            deliveryId: 'delivery-1',
            subscriptionId: 'subscription-1',
            attempt: 1,
            occurrence: {
              kind: 'event-occurrence',
              occurrenceId: 'occurrence-1',
              eventId: 'TodoListCompleted',
              eventVersion: 1,
              occurredAt: '2026-10-12T00:00:00.000Z',
              causation: {
                kind: 'operation',
                scope: 'TodoList.completeAll',
                taskRun: { taskId: 'TodoList.completeAll', runId: 'run-1' },
              },
              payload: {
                list: {
                  kind: 'entity-ref',
                  entityName: 'TodoList',
                  locator: { id: 'list-inbox' },
                },
                completedCount: 3,
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getByRole('tab', { name: /Effects 1/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
    const summary = screen.getByLabelText('Event summary');
    expect(screen.getByLabelText('Events')).toBeTruthy();
    expect(summary.textContent).toContain('TodoListCompleted');
    expect(summary.textContent).toContain('list = list-inbox');
    expect(summary.textContent).toContain('completedCount = 3');
    expect(screen.getByText('Technical details').parentElement?.hasAttribute('open')).toBe(false);

    fireEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText('Technical details').parentElement?.hasAttribute('open')).toBe(true);
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByLabelText('Event delivery').textContent).toContain(
      'TodoList.completeAll · Run run-1',
    );
    expect(screen.getByLabelText('Event delivery').textContent).toContain('delivery-1');

    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(
      screen.getByRole('button', { name: 'Copy TodoListCompleted delivery JSON' }),
    ).toBeTruthy();
    expect(screen.getByRole('tree', { name: 'TodoListCompleted delivery JSON' })).toBeTruthy();
  });
});
