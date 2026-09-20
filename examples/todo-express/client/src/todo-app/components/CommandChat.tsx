import {
  ArrowUp,
  ChevronDown,
  History,
  LoaderCircle,
  Mic,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { submitModelCommand } from '../../model-commands.js';

import { useSpeechInput } from './useSpeechInput.js';
import { useSpeechOutput } from './useSpeechOutput.js';

type Entry = {
  id: number;
  request: string;
  reply?: string;
  status: 'pending' | 'executed' | 'answered' | 'unresolved' | 'failed';
};

export const CommandChat = ({ onExecuted }: { onExecuted: () => Promise<unknown> }) => {
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const prompt = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeechInput(setText, () => prompt.current?.focus());
  const voice = useSpeechOutput(speech.language);
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [entries, expanded]);
  useEffect(() => {
    if (
      !pending &&
      entries.length &&
      globalThis.document.activeElement === globalThis.document.body
    )
      prompt.current?.focus();
  }, [pending, entries.length]);
  const busy = useRef(false);
  const sequence = useRef(0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || busy.current || speech.listening) return;
    voice.cancel();
    busy.current = true;
    setPending(true);
    const id = ++sequence.current;
    const entry: Entry = { id, request: text.trim(), status: 'pending' };
    setEntries(previous => [...previous, entry]);
    setText('');
    const answer = (status: Entry['status'], reply: string) => {
      voice.speak(reply);
      setEntries(previous =>
        previous.map(candidate =>
          candidate.id === id ? { ...candidate, status, reply } : candidate,
        ),
      );
    };
    try {
      const result = await submitModelCommand({
        text: entry.request,
      });
      if (!result.ok) {
        answer(
          'failed',
          result.message ?? 'The request failed. Check the list before trying again.',
        );
        return;
      }
      const outcome = result.value;
      answer(outcome.status, outcome.message);
      if (outcome.status === 'executed') {
        try {
          await onExecuted();
        } catch {
          answer('executed', `${outcome.message} Refresh the board to see the change.`);
        }
      }
    } catch {
      // A lost response may follow a successful write. Never automatically resubmit.
      answer('failed', 'The server response was lost. Check the list before submitting again.');
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const visibleEntries = expanded ? entries : entries.slice(-1);
  return (
    <section className='command-chat' aria-label='List assistant'>
      {entries.length > 0 && (
        <div className='command-chat-conversation'>
          {entries.length > 1 && (
            <button
              className='command-chat-history'
              type='button'
              aria-label={expanded ? 'Show latest exchange' : 'Show conversation history'}
              title={expanded ? 'Show latest exchange' : 'Show conversation history'}
              aria-expanded={expanded}
              aria-controls='command-chat-log'
              onClick={() => setExpanded(value => !value)}
            >
              {expanded ? <ChevronDown size={15} /> : <History size={15} />}
            </button>
          )}
          <div
            id='command-chat-log'
            className='command-chat-log'
            ref={log}
            role='log'
            aria-live='polite'
            aria-relevant='additions text'
          >
            {visibleEntries.map(entry => (
              <div key={entry.id} className={`command-chat-exchange is-${entry.status}`}>
                <p className='command-chat-message from-user'>
                  <span className='sr-only'>You: </span>
                  {entry.request}
                </p>
                <p className='command-chat-message from-assistant'>
                  <span className='sr-only'>Assistant: </span>
                  {entry.status === 'pending' ? (
                    <span className='command-chat-thinking' aria-label='Interpreting…'>
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    entry.reply
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {voice.error && (
        <p className='command-chat-speech-status' role='status'>
          {voice.error}
        </p>
      )}
      {speech.error && (
        <p className='command-chat-speech-status' role='status'>
          {speech.error}
        </p>
      )}
      {speech.listening && (
        <p className='command-chat-speech-status' role='status'>
          Listening… Stop to review and send.
        </p>
      )}
      <form className='command-chat-composer' onSubmit={event => void submit(event)}>
        <div className='command-chat-prompt'>
          <textarea
            ref={prompt}
            aria-label='Request'
            id='command-text'
            rows={1}
            value={text}
            onChange={event => {
              speech.cancel();
              setText(event.target.value);
            }}
            maxLength={2000}
            placeholder='Message…'
            disabled={pending}
            onKeyDown={event => {
              if (
                event.key === 'Enter' &&
                (event.metaKey || event.ctrlKey) &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            type='button'
            className='command-chat-voice'
            aria-label={voice.enabled ? 'Turn off read aloud' : 'Read responses aloud'}
            title={
              voice.supported
                ? 'Read responses aloud in the selected language'
                : 'Read aloud is not supported in this browser'
            }
            aria-pressed={voice.enabled}
            disabled={!voice.supported || speech.listening}
            onClick={() => voice.toggle(entries.at(-1)?.reply)}
          >
            {voice.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <select
            className='command-chat-speech-language'
            aria-label='Dictation language'
            title='Dictation language'
            value={speech.language}
            disabled={pending || speech.listening}
            onChange={event =>
              speech.setLanguage(event.target.value === 'es-ES' ? 'es-ES' : 'en-US')
            }
          >
            <option value='en-US'>EN</option>
            <option value='es-ES'>ES</option>
          </select>
          <button
            type='button'
            className='command-chat-microphone'
            aria-label={speech.listening ? 'Stop dictation' : 'Dictate message'}
            aria-pressed={speech.listening}
            title={
              !speech.supported
                ? 'Speech recognition is not supported in this browser.'
                : speech.listening
                  ? 'Stop dictation'
                  : `Dictate (${speech.language}). Your browser may use an online speech service.`
            }
            disabled={pending || !speech.supported}
            onClick={() => {
              voice.cancel();
              speech.toggle(text);
            }}
          >
            {speech.listening ? <Square size={14} /> : <Mic size={17} />}
          </button>
          <button
            type='submit'
            aria-label='Send message'
            title='Send (⌘Enter)'
            aria-keyshortcuts='Meta+Enter Control+Enter'
            disabled={!text.trim() || pending || speech.listening}
          >
            {pending ? (
              <LoaderCircle size={17} className='command-chat-spinner' />
            ) : (
              <ArrowUp size={18} />
            )}
          </button>
        </div>
      </form>
    </section>
  );
};
