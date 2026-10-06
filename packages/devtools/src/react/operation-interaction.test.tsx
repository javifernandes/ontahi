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
