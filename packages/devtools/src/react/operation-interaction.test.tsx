import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { OperationInteraction } from './operation-interaction.js';

afterEach(cleanup);

it('submits a pending string input interaction', () => {
  const respond = vi.fn();
  render(
    <OperationInteraction
      interaction={{
        id: 'enter-title',
        kind: 'input',
        prompt: 'What title?',
        input: { type: 'string' },
        createdAt: '2026-10-05T00:00:00.000Z',
      }}
      responding={false}
      respond={respond}
    />,
  );

  fireEvent.change(screen.getByLabelText('What title?'), { target: { value: 'Notes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  expect(respond).toHaveBeenCalledWith({ interactionId: 'enter-title', value: 'Notes' });
});

it('submits an empty string for domain-level validation', () => {
  const respond = vi.fn();
  render(
    <OperationInteraction
      interaction={{
        id: 'enter-title',
        kind: 'input',
        prompt: 'What title?',
        input: { type: 'string' },
        createdAt: '2026-10-05T00:00:00.000Z',
      }}
      responding={false}
      respond={respond}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  expect(respond).toHaveBeenCalledWith({ interactionId: 'enter-title', value: '' });
});

it('submits numbers as numbers', () => {
  const respond = vi.fn();
  render(
    <OperationInteraction
      interaction={{
        id: 'enter-count',
        kind: 'input',
        prompt: 'How many?',
        input: { type: 'number' },
        createdAt: '2026-10-05T00:00:00.000Z',
      }}
      responding={false}
      respond={respond}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(respond).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('How many?'), { target: { value: '2.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(respond).toHaveBeenCalledWith({ interactionId: 'enter-count', value: 2.5 });
});

it('offers finite choices for Boolean and enum inputs', () => {
  const respond = vi.fn();
  const { rerender } = render(
    <OperationInteraction
      interaction={{
        id: 'enter-completed',
        kind: 'input',
        prompt: 'Completed?',
        input: { type: 'boolean' },
        createdAt: '2026-10-05T00:00:00.000Z',
      }}
      responding={false}
      respond={respond}
    />,
  );
  fireEvent.change(screen.getByLabelText('Completed?'), { target: { value: 'false' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(respond).toHaveBeenLastCalledWith({
    interactionId: 'enter-completed',
    value: false,
  });

  rerender(
    <OperationInteraction
      interaction={{
        id: 'enter-priority',
        kind: 'input',
        prompt: 'Priority?',
        input: { type: 'enum', values: ['low', 'high'] },
        createdAt: '2026-10-05T00:00:00.000Z',
      }}
      responding={false}
      respond={respond}
    />,
  );
  fireEvent.change(screen.getByLabelText('Priority?'), { target: { value: '"high"' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(respond).toHaveBeenLastCalledWith({ interactionId: 'enter-priority', value: 'high' });
});

it('submits explicit null for a nullable input', () => {
  const respond = vi.fn();
  const { rerender } = render(
    <OperationInteraction
      interaction={{
        id: 'enter-note',
        kind: 'input',
        prompt: 'Note?',
        input: { type: 'string', nullable: true },
        createdAt: '2026-10-05T00:00:00.000Z',
      }}
      responding={false}
      respond={respond}
    />,
  );
  const checkbox = screen.getByLabelText('Use null');
  fireEvent.click(checkbox);
  fireEvent.submit(checkbox.closest('form')!);
  expect(respond).toHaveBeenCalledWith({ interactionId: 'enter-note', value: null });

  rerender(
    <OperationInteraction
      interaction={{
        id: 'enter-title-after-note',
        kind: 'input',
        prompt: 'Title?',
        input: { type: 'string' },
        createdAt: '2026-10-05T00:00:01.000Z',
      }}
      responding={false}
      respond={respond}
    />,
  );
  expect((screen.getByLabelText('Title?') as HTMLInputElement).disabled).toBe(false);
  fireEvent.change(screen.getByLabelText('Title?'), { target: { value: 'Notes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(respond).toHaveBeenLastCalledWith({
    interactionId: 'enter-title-after-note',
    value: 'Notes',
  });
});
