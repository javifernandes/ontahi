// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CommandChat } from './CommandChat.js';

const execute = vi.hoisted(() => vi.fn());
vi.mock('../../model-commands.js', () => ({ submitModelCommand: execute }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let container: HTMLDivElement;
let root: Root;
const refresh = vi.fn().mockResolvedValue(undefined);

beforeEach(async () => {
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  execute.mockReset();
  refresh.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(<CommandChat lists={[{ id: 'list-1', name: 'Shopping' }]} onExecuted={refresh} />),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
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
      'add buy bread',
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
    text: 'add buy bread',
    context: { focus: { kind: 'entity-ref', entityName: 'TodoList', locator: { id: 'list-1' } } },
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
      'create list Groceries',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    container
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
  });
  expect(execute).toHaveBeenCalledWith({
    text: 'create list Groceries',
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
  expect(container.querySelector('.command-chat-log')!.textContent).not.toContain('Shopping');
  await act(async () =>
    (container.querySelector('[aria-label="Show latest exchange"]') as HTMLButtonElement).click(),
  );
  expect(container.textContent).not.toContain('First reply');
});

it('dictates into the draft without sending and replaces interim results', async () => {
  let recognition!: import('./useSpeechInput.js').BrowserSpeechRecognition;
  const abort = vi.fn();
  vi.stubGlobal(
    'SpeechRecognition',
    class {
      lang = '';
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: import('./useSpeechInput.js').BrowserSpeechRecognition['onresult'] = null;
      onerror: import('./useSpeechInput.js').BrowserSpeechRecognition['onerror'] = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = () => this.onend?.();
      abort = abort;
      constructor() {
        recognition = this;
      }
    },
  );
  await write();
  await act(async () =>
    (container.querySelector('[aria-label="Dictate message"]') as HTMLButtonElement).click(),
  );
  expect(recognition.lang).toBe('en-US');
  expect(
    container.querySelector('[aria-label="Send message"]')?.getAttribute('disabled'),
  ).not.toBeNull();
  await act(async () => recognition.onresult?.({ results: [[{ transcript: 'to Shop' }]] }));
  await act(async () => recognition.onresult?.({ results: [[{ transcript: 'to Shopping' }]] }));
  expect(container.querySelector('textarea')!.value).toBe('add buy bread to Shopping');
  expect(execute).not.toHaveBeenCalled();
  await act(async () =>
    (container.querySelector('[aria-label="Stop dictation"]') as HTMLButtonElement).click(),
  );
  expect(document.activeElement).toBe(container.querySelector('textarea'));
  expect(execute).not.toHaveBeenCalled();
  await act(async () => {
    const language = container.querySelector(
      '[aria-label="Dictation language"]',
    ) as HTMLSelectElement;
    language.value = 'es-ES';
    language.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(globalThis.localStorage.getItem('ontahi.todo.speechLanguage')).toBe('es-ES');
  await act(async () =>
    (container.querySelector('[aria-label="Dictate message"]') as HTMLButtonElement).click(),
  );
  expect(recognition.lang).toBe('es-ES');
  expect(
    (container.querySelector('[aria-label="Dictation language"]') as HTMLSelectElement).disabled,
  ).toBe(true);
  await act(async () => root.render(<div />));
  await act(async () => root.render(<CommandChat lists={[]} onExecuted={refresh} />));
  expect(
    (container.querySelector('[aria-label="Dictation language"]') as HTMLSelectElement).value,
  ).toBe('es-ES');
  vi.unstubAllGlobals();
});

it('keeps typing available when speech recognition is unsupported', async () => {
  expect(
    (container.querySelector('[aria-label="Dictate message"]') as HTMLButtonElement).disabled,
  ).toBe(true);
  await write();
  expect(container.querySelector('textarea')!.value).toBe('add buy bread');
});

it('handles denied microphone permission and cancels recognition on unmount', async () => {
  let recognition!: import('./useSpeechInput.js').BrowserSpeechRecognition;
  const abort = vi.fn();
  vi.stubGlobal(
    'webkitSpeechRecognition',
    class {
      lang = '';
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: import('./useSpeechInput.js').BrowserSpeechRecognition['onresult'] = null;
      onerror: import('./useSpeechInput.js').BrowserSpeechRecognition['onerror'] = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      abort = abort;
      constructor() {
        recognition = this;
      }
    },
  );
  await write();
  await act(async () =>
    (container.querySelector('[aria-label="Dictate message"]') as HTMLButtonElement).click(),
  );
  await act(async () => recognition.onerror?.({ error: 'not-allowed' }));
  expect(container.textContent).toContain('Microphone access was denied');
  expect(container.querySelector('textarea')!.value).toBe('add buy bread');
  expect(abort).toHaveBeenCalledOnce();
  await act(async () =>
    (container.querySelector('[aria-label="Dictate message"]') as HTMLButtonElement).click(),
  );
  await act(async () => root.render(<div />));
  expect(abort).toHaveBeenCalledTimes(2);
  expect(recognition.onresult).toBeNull();
  expect(execute).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
