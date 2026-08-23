import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExplorerSelect } from './select.js';

afterEach(cleanup);

describe('ExplorerSelect', () => {
  it('opens a themed listbox and selects an option', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    const { rerender } = render(
      <ExplorerSelect
        value='open'
        onValueChange={onValueChange}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'resolved', label: 'Resolved' },
        ]}
        aria-label='Thread state'
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Thread state' }));

    expect(screen.getByRole('listbox', { name: 'Thread state' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Open' }).getAttribute('aria-selected')).toBe('true');

    await user.click(screen.getByRole('option', { name: 'Resolved' }));

    expect(onValueChange).toHaveBeenCalledWith('resolved');
    expect(screen.queryByRole('listbox')).toBeNull();

    rerender(
      <ExplorerSelect
        value='resolved'
        onValueChange={onValueChange}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'resolved', label: 'Resolved' },
        ]}
        aria-label='Thread state'
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Thread state' }).textContent).toContain(
      'Resolved',
    );
  });

  it('supports keyboard navigation and restores focus when closed', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <ExplorerSelect
        value='open'
        onValueChange={onValueChange}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'paused', label: 'Paused', disabled: true },
          { value: 'resolved', label: 'Resolved' },
        ]}
        aria-label='Thread state'
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Thread state' });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onValueChange).toHaveBeenCalledWith('resolved');
    expect(document.activeElement).toBe(trigger);
  });
});
