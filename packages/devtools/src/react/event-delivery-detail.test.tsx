// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EventDeliveryDetail } from './event-delivery-detail.js';

afterEach(cleanup);

const delivery = (overrides: Record<string, unknown> = {}) => ({
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
    payload: {},
    ...overrides,
  },
});

describe('EventDeliveryDetail', () => {
  it('formats domain values into a compact event summary', () => {
    render(
      <EventDeliveryDetail
        delivery={delivery({
          payload: {
            list: {
              kind: 'entity-ref',
              locator: { tenant: 'acme', id: 'inbox' },
            },
            completed: true,
            note: null,
            tags: ['urgent', 'today'],
            metadata: { source: 'bulk' },
            omitted: undefined,
          },
        })}
      />,
    );

    const summary = screen.getByLabelText('Event summary').textContent;
    expect(summary).toContain('list = tenant: acme · id: inbox');
    expect(summary).toContain('completed = true');
    expect(summary).toContain('note = null');
    expect(summary).toContain('tags = 2 items');
    expect(summary).toContain('metadata = 1 fields');
    expect(summary).toContain('omitted = —');
  });

  it.each([
    [{ kind: 'operation', scope: 'TodoList.completeAll' }, 'TodoList.completeAll'],
    [{ kind: 'operation', taskRun: { runId: 'run-1' } }, 'Operation · Run run-1'],
    [{ kind: 'mutation-outcome', outcomeId: 'outcome-1' }, 'Mutation outcome outcome-1'],
    [{ kind: 'mutation-outcome' }, 'Mutation outcome unknown'],
    [{ kind: 'import' }, 'import'],
  ])('summarizes causation %j', (causation, expected) => {
    render(<EventDeliveryDetail delivery={delivery({ causation })} />);
    fireEvent.click(screen.getByText('Technical details'));
    expect(screen.getByLabelText('Event delivery').textContent).toContain(expected);
  });

  it('gracefully presents incomplete diagnostic data and exposes its raw JSON', () => {
    render(<EventDeliveryDetail delivery='unavailable' />);

    expect(screen.getByLabelText('Event summary').textContent).toContain('Event');
    fireEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText('Overview')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(screen.getByRole('button', { name: 'Copy Event delivery JSON' })).toBeTruthy();
    expect(screen.getByText('"unavailable"')).toBeTruthy();
  });
});
