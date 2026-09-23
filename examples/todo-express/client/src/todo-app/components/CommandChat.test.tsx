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
  await act(async () => root.render(<CommandChat onExecuted={refresh} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const write = async () => {
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
  expect(container.querySelector('[aria-label="Current list"]')).toBeNull();
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
  expect(execute.mock.calls[0]![0]).toEqual({
    text: 'add buy bread',
    language: 'en-US',
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
    language: 'en-US',
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
    const language = container.querySelector('[aria-label="Chat language"]') as HTMLSelectElement;
    language.value = 'es-ES';
    language.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(globalThis.localStorage.getItem('ontahi.todo.speechLanguage')).toBe('es-ES');
  await act(async () =>
    (container.querySelector('[aria-label="Dictate message"]') as HTMLButtonElement).click(),
  );
  expect(recognition.lang).toBe('es-ES');
  expect(
    (container.querySelector('[aria-label="Chat language"]') as HTMLSelectElement).disabled,
  ).toBe(true);
  await act(async () => root.render(<div />));
  await act(async () => root.render(<CommandChat onExecuted={refresh} />));
  expect((container.querySelector('[aria-label="Chat language"]') as HTMLSelectElement).value).toBe(
    'es-ES',
  );
  vi.unstubAllGlobals();
});

it('reports a recognition session ending without text and allows retry', async () => {
  let recognition!: import('./useSpeechInput.js').BrowserSpeechRecognition;
  vi.stubGlobal(
    'SpeechRecognition',
    class {
      lang = '';
      continuous = false;
      interimResults = true;
      maxAlternatives = 1;
      onresult: import('./useSpeechInput.js').BrowserSpeechRecognition['onresult'] = null;
      onerror: import('./useSpeechInput.js').BrowserSpeechRecognition['onerror'] = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
      constructor() {
        recognition = this;
      }
    },
  );
  await write();
  await act(async () =>
    (container.querySelector('[aria-label="Dictate message"]') as HTMLButtonElement).click(),
  );
  await act(async () => recognition.onend?.());
  expect(container.textContent).toContain('Dictation ended without recognizing speech');
  expect(container.querySelector('textarea')!.value).toBe('add buy bread');
  await act(async () =>
    (container.querySelector('[aria-label="Dictate message"]') as HTMLButtonElement).click(),
  );
  await act(async () => recognition.onresult?.({ results: [[{ transcript: 'to Shopping' }]] }));
  await act(async () => recognition.onend?.());
  expect(container.querySelector('textarea')!.value).toBe('add buy bread to Shopping');
  expect(container.textContent).not.toContain('Dictation ended without recognizing speech');
  expect(execute).not.toHaveBeenCalled();
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

it('reads answers only when enabled, using the selected language, and cancels on disable', async () => {
  const speak = vi.fn();
  const cancel = vi.fn();
  vi.stubGlobal('speechSynthesis', { speak, cancel, getVoices: () => [] });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      lang = '';
      constructor(readonly text: string) {}
    },
  );
  execute.mockResolvedValue({
    ok: true,
    value: { status: 'answered', message: 'You can create lists.' },
  });
  await write();
  await submit();
  expect(speak).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => {
    const language = container.querySelector('select')!;
    language.value = 'es-ES';
    language.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () =>
    (container.querySelector('[aria-label="Read responses aloud"]') as HTMLButtonElement).click(),
  );
  expect(speak).toHaveBeenLastCalledWith(
    expect.objectContaining({ text: 'You can create lists.', lang: 'es-ES' }),
  );
  await write();
  await submit();
  expect(speak).toHaveBeenCalledTimes(2);
  const spoken = speak.mock.calls[1]![0];
  await act(async () =>
    (container.querySelector('[aria-label="Turn off read aloud"]') as HTMLButtonElement).click(),
  );
  expect(cancel).toHaveBeenCalledTimes(2);
  await act(async () => spoken.onerror());
  expect(container.textContent).not.toContain('could not be read aloud');
  await write();
  await submit();
  expect(speak).toHaveBeenCalledTimes(2);
});

it('handles unavailable audio and cancels reading when unmounted', async () => {
  const speak = vi.fn();
  const cancel = vi.fn();
  vi.stubGlobal('speechSynthesis', { speak, cancel, getVoices: () => [] });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      lang = '';
      constructor(readonly text: string) {}
    },
  );
  execute.mockResolvedValue({
    ok: true,
    value: { status: 'answered', message: 'You can create lists.' },
  });
  await write();
  await submit();
  await act(async () =>
    (container.querySelector('[aria-label="Read responses aloud"]') as HTMLButtonElement).click(),
  );
  await act(async () => speak.mock.calls[0]![0].onerror());
  expect(container.textContent).toContain('could not be read aloud');
  await write();
  await submit();
  await act(async () => root.render(<div />));
  expect(cancel).toHaveBeenCalledOnce();
});

it('recalls the latest submitted message with ArrowUp in an empty draft', async () => {
  execute.mockResolvedValue({ ok: true, value: { status: 'executed', message: 'Item added.' } });
  await write();
  await submit();
  const input = container.querySelector('textarea')!;
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    ),
  );
  expect(input.value).toBe('add buy bread');
  expect(execute).toHaveBeenCalledOnce();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      'unfinished draft',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    ),
  );
  expect(input.value).toBe('unfinished draft');
});

it('sends the selected language with the message', async () => {
  execute.mockResolvedValue({
    ok: true,
    value: { status: 'answered', message: 'Podés crear listas.' },
  });
  await act(async () => {
    const language = container.querySelector('select')!;
    language.value = 'es-ES';
    language.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await write();
  await submit();
  expect(execute).toHaveBeenCalledWith({ text: 'add buy bread', language: 'es-ES' });
});

it.each([
  ['en-US', 'Google US English', 'en-US'],
  ['es-ES', 'Google español', 'es-ES'],
  ['es-ES', 'Google español de Estados Unidos', 'es-US'],
])('prefers an available Google voice for %s', async (language, name, voiceLanguage) => {
  const speak = vi.fn();
  const google = { name, lang: voiceLanguage };
  const voices = [
    { name: 'Generic default', lang: language, default: true },
    { name: 'Google français', lang: 'fr-FR' },
    { name: 'Google UK English', lang: 'en-GB' },
    google,
  ];
  const getVoices = vi.fn(() => [] as typeof voices);
  vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn(), getVoices });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      lang = '';
      voice = null;
      constructor(readonly text: string) {}
    },
  );
  await act(async () => {
    const select = container.querySelector('select')!;
    select.value = language;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  execute.mockResolvedValue({ ok: true, value: { status: 'answered', message: 'Hello' } });
  await write();
  await submit();
  await act(async () =>
    (container.querySelector('[aria-label="Read responses aloud"]') as HTMLButtonElement).click(),
  );
  expect(speak.mock.calls[0]![0].voice).toBeNull();
  // Voices become available after the first reply; the next read must discover them.
  getVoices.mockReturnValue(voices);
  await write();
  await submit();
  expect(speak.mock.calls[1]![0].voice).toBe(google);
  expect(speak.mock.calls[1]![0].lang).toBe(language);
});

it('keeps the browser fallback when Google voices only cover other languages', async () => {
  const speak = vi.fn();
  vi.stubGlobal('speechSynthesis', {
    speak,
    cancel: vi.fn(),
    getVoices: () => [{ name: 'Google español', lang: 'es-ES' }],
  });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      lang = '';
      voice = null;
      constructor(readonly text: string) {}
    },
  );
  execute.mockResolvedValue({ ok: true, value: { status: 'answered', message: 'Hello' } });
  await write();
  await submit();
  await act(async () =>
    (container.querySelector('[aria-label="Read responses aloud"]') as HTMLButtonElement).click(),
  );
  expect(speak.mock.calls[0]![0].voice).toBeNull();
  expect(speak.mock.calls[0]![0].lang).toBe('en-US');
});
