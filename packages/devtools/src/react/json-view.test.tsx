// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JsonView } from './json-view.js';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(globalThis.navigator, 'clipboard');
});

describe('JsonView', () => {
  it('highlights JSON primitives and reports a successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(
      <JsonView
        label='diagnostic'
        value={{ string: 'value', number: 42, yes: true, no: false, empty: null }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostic' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copy diagnostic' }).textContent).toBe('Copied'),
    );
    expect(writeText).toHaveBeenCalledOnce();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('true')).toBeTruthy();
    expect(screen.getByText('false')).toBeTruthy();
    expect(screen.getByText('null')).toBeTruthy();
  });

  it('does not claim success when clipboard access is unavailable or rejected', async () => {
    const ui = render(<JsonView label='diagnostic' value={{ id: 'todo-1' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostic' }));
    expect(screen.getByRole('button', { name: 'Copy diagnostic' }).textContent).toBe('Copy');

    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    ui.rerender(<JsonView label='diagnostic' value={{ id: 'todo-2' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostic' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Copy diagnostic' }).textContent).toBe('Copy');
  });
});
