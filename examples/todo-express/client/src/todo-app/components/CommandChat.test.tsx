// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CommandChat } from './CommandChat.js';

const execute = vi.hoisted(() => vi.fn());
vi.mock('@ontahi/react/graph', () => ({
  useOperation: () => ({ executeAsync: execute, isExecuting: false }),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let container: HTMLDivElement;
let root: Root;
const refresh = vi.fn().mockResolvedValue(undefined);

beforeEach(async () => {
  execute.mockReset();
  refresh.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(<CommandChat lists={[{ id: 'list-1', name: 'Compras' }]} onExecuted={refresh} />),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const write = async () => {
  await act(async () => {
    const select = container.querySelector('select')!;
    select.value = 'list-1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => {
    const input = container.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      'agregar comprar pan',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const submit = async () =>
  act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

it('waits for actual execution before refreshing', async () => {
  expect(container.querySelector('button')!.disabled).toBe(true);
  let finish!: (value: unknown) => void;
  execute.mockReturnValue(
    new Promise(resolve => {
      finish = resolve;
    }),
  );
  await write();
  await submit();
  expect(container.querySelector('[aria-label="Interpreting…"]')).not.toBeNull();
  expect(refresh).not.toHaveBeenCalled();
  await submit();
  expect(execute).toHaveBeenCalledOnce();
  expect(execute.mock.calls[0]![0]).toMatchObject({
    text: 'agregar comprar pan',
    list: { kind: 'entity-ref', entityName: 'TodoList', locator: { id: 'list-1' } },
  });
  await act(async () =>
    finish({ ok: true, value: { status: 'executed', message: 'Item added.' } }),
  );
  expect(container.textContent).toContain('Item added.');
  expect(refresh).toHaveBeenCalledOnce();
});

it('shows an unresolved result without claiming an effect', async () => {
  execute.mockResolvedValue({ ok: true, value: { status: 'unresolved', message: 'Which item?' } });
  await write();
  await submit();
  expect(container.textContent).toContain('Which item?');
  expect(refresh).not.toHaveBeenCalled();
});

it('does not retry an unknown transport outcome', async () => {
  execute.mockRejectedValue(new Error('Disconnected'));
  await write();
  await submit();
  expect(container.textContent).toContain('Check the list before submitting again.');
  expect(execute).toHaveBeenCalledOnce();
  expect(refresh).not.toHaveBeenCalled();
});

it('submits with Command+Enter without requiring a current list', async () => {
  execute.mockResolvedValue({ ok: true, value: { status: 'executed', message: 'List created.' } });
  await act(async () => {
    const input = container.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      'crear lista nueva llamada Supermercado',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    container
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
  });
  expect(execute).toHaveBeenCalledWith({
    text: 'crear lista nueva llamada Supermercado',
    list: null,
  });
});

it('keeps only the latest exchange visible until history is expanded', async () => {
  execute.mockResolvedValueOnce({
    ok: true,
    value: { status: 'executed', message: 'First reply' },
  });
  await write();
  await submit();
  execute.mockResolvedValueOnce({
    ok: true,
    value: { status: 'unresolved', message: 'Second reply' },
  });
  await write();
  await submit();
  expect(container.textContent).not.toContain('First reply');
  expect(container.textContent).toContain('Second reply');
  await act(async () =>
    (
      container.querySelector('[aria-label="Show conversation history"]') as HTMLButtonElement
    ).click(),
  );
  expect(container.textContent).toContain('First reply');
  expect(container.querySelector('.command-chat-log')!.textContent).not.toContain('Compras');
  await act(async () =>
    (container.querySelector('[aria-label="Show latest exchange"]') as HTMLButtonElement).click(),
  );
  expect(container.textContent).not.toContain('First reply');
});
