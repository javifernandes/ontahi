import { useEffect, useRef, useState } from 'react';

export const useSpeechOutput = (language: string) => {
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    // Trigger asynchronous voice discovery before the first reply.
    globalThis.speechSynthesis?.getVoices();
    return () => {
      mounted.current = false;
    };
  }, []);
  const [error, setError] = useState<string>();
  const active = useRef<SpeechSynthesisUtterance | null>(null);
  const supported = Boolean(globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance);
  const cancel = () => {
    if (!active.current) return;
    active.current = null;
    globalThis.speechSynthesis.cancel();
  };
  useEffect(() => {
    return () => {
      if (active.current) {
        active.current = null;
        globalThis.speechSynthesis.cancel();
      }
    };
  }, [language]);
  const speak = (text: string) => {
    if (!mounted.current || !enabledRef.current || !supported) return;
    cancel();
    setError(undefined);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    // Read afresh for every reply: browsers may load voices after the chat mounts.
    const googleVoices = globalThis.speechSynthesis
      .getVoices()
      .filter(voice => /\bgoogle\b/i.test(voice.name));
    const locale = language.toLowerCase();
    const preferred =
      googleVoices.find(voice => voice.lang.toLowerCase() === locale) ??
      googleVoices.find(voice => voice.lang.toLowerCase().split('-')[0] === locale.split('-')[0]);
    if (preferred) utterance.voice = preferred;
    active.current = utterance;
    utterance.onend = () => {
      if (active.current === utterance) active.current = null;
    };
    const failed = () => {
      if (active.current !== utterance) return;
      active.current = null;
      setError('The response could not be read aloud. You can still read it in the chat.');
    };
    utterance.onerror = failed;
    try {
      globalThis.speechSynthesis.speak(utterance);
    } catch {
      failed();
    }
  };
  const toggle = (latest?: string) => {
    enabledRef.current = !enabledRef.current;
    setEnabled(enabledRef.current);
    setError(undefined);
    if (!enabledRef.current) cancel();
    else if (latest) speak(latest);
  };
  return { supported, enabled, error, speak, cancel, toggle };
};
