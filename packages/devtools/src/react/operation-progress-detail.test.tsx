// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { OperationProgressActivity } from './activity-model.js';
import { OperationProgressDetail } from './operation-progress-detail.js';

afterEach(cleanup);

describe('OperationProgressDetail', () => {
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
            occurrence: {
              event: { name: 'TodoListCompleted', version: 1 },
              payload: { listId: 'list-1', completed: 0 },
            },
            delivery: { deliveryId: 'delivery-1' },
          },
        ]}
      />,
    );

    expect(screen.getByRole('tab', { name: /Effects 1/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByLabelText('Event delivery').textContent).toContain('TodoListCompleted');
    expect(screen.getByLabelText('Event delivery').textContent).toContain('completed');
    expect(screen.getByLabelText('Event delivery').textContent).toContain('0');
  });
});
