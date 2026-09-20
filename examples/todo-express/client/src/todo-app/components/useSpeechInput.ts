import { useEffect, useRef, useState } from 'react';

// Web Speech is not included in every browser's DOM typings.
export type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechGlobal = typeof globalThis & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};
const recognitionConstructor = () =>
  typeof globalThis === 'undefined'
    ? undefined
    : ((globalThis as SpeechGlobal).SpeechRecognition ??
      (globalThis as SpeechGlobal).webkitSpeechRecognition);

const speechLanguageKey = 'ontahi.todo.speechLanguage';
type SpeechLanguage = 'en-US' | 'es-ES';
const initialSpeechLanguage = (): SpeechLanguage => {
  try {
    return globalThis.localStorage.getItem(speechLanguageKey) === 'es-ES' ? 'es-ES' : 'en-US';
  } catch {
    return 'en-US';
  }
};

export const useSpeechInput = (onText: (text: string) => void, onFinish: () => void) => {
  const [language, updateLanguage] = useState<SpeechLanguage>(initialSpeechLanguage);
  const setLanguage = (value: SpeechLanguage) => {
    updateLanguage(value);
    try {
      globalThis.localStorage.setItem(speechLanguageKey, value);
    } catch {
      /* Keep the session choice when storage is unavailable. */
    }
  };
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string>();
  const active = useRef<BrowserSpeechRecognition | null>(null);
  const cancel = () => {
    const recognition = active.current;
    active.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    }
    setListening(false);
  };
  useEffect(
    () => () => {
      const recognition = active.current;
      active.current = null;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
      }
    },
    [],
  );
  const toggle = (existing: string) => {
    if (active.current) {
      active.current.stop();
      return;
    }
    const Constructor = recognitionConstructor();
    if (!Constructor) return;
    const recognition = new Constructor();
    active.current = recognition;
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    const prefix = existing.trimEnd();
    recognition.onresult = event => {
      if (active.current !== recognition) return;
      const transcript = Array.from(event.results, result => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      onText(`${prefix}${prefix && transcript ? ' ' : ''}${transcript}`.slice(0, 2000));
    };
    recognition.onerror = event => {
      if (active.current !== recognition || event.error === 'aborted') return;
      setError(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone access was denied. Allow it in your browser settings.'
          : event.error === 'no-speech'
            ? 'No speech detected. Try again.'
            : event.error === 'audio-capture'
              ? 'No microphone is available.'
              : 'Speech recognition is unavailable. Try again or type your message.',
      );
      cancel();
      onFinish();
    };
    recognition.onend = () => {
      if (active.current !== recognition) return;
      active.current = null;
      setListening(false);
      onFinish();
    };
    setError(undefined);
    setListening(true);
    try {
      recognition.start();
    } catch {
      cancel();
      setError('Speech recognition could not start. Try again or type your message.');
    }
  };
  return {
    supported: Boolean(recognitionConstructor()),
    listening,
    error,
    toggle,
    cancel,
    language,
    setLanguage,
  };
};
