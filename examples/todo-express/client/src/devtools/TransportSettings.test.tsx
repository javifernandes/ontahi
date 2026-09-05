// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  defaultTodoTransportRouting,
  splitTodoTransportRouting,
} from '../runtime-transport-routing.js';

import { TransportSettings } from './TransportSettings.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('Todo Runtime Transport settings', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('offers an independent transport selector for every route', () => {
    const onChange = vi.fn();
    act(() =>
      root.render(<TransportSettings routing={defaultTodoTransportRouting} onChange={onChange} />),
    );

    const reads = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Transport for graph reads"]',
    )!;
    act(() => {
      reads.value = 'http';
      reads.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.querySelectorAll('select')).toHaveLength(4);
    expect(onChange).toHaveBeenCalledWith({
      ...defaultTodoTransportRouting,
      graphRead: 'http',
    });
  });

  it('offers a mixed preset with HTTP requests and pushed WebSocket progress', () => {
    const onChange = vi.fn();
    act(() =>
      root.render(<TransportSettings routing={defaultTodoTransportRouting} onChange={onChange} />),
    );

    const preset = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      button => button.textContent === 'HTTP + push',
    )!;
    act(() => preset.click());

    expect(onChange).toHaveBeenCalledWith(splitTodoTransportRouting);
  });
});
