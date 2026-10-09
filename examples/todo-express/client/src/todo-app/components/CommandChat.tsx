import type { CommittedMutationSet } from '@ontahi/core/data-graph';
import type {
  TaskInputValue,
  TaskInteractionResponse,
  TaskPendingInputInteraction,
  TaskPendingInteraction,
  TaskRunIdentity,
} from '@ontahi/core/runtime/contracts';
import {
  ArrowUp,
  ChevronDown,
  History,
  LoaderCircle,
  Mic,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import {
  submitModelCommand,
  type ModelCommandResponder,
  type ModelCommandSubmitter,
  type TodoModelCommandResult,
} from '../../model-commands.js';

import { useDictationCountdown } from './useDictationCountdown.js';
import { useSpeechInput } from './useSpeechInput.js';
import { useSpeechOutput } from './useSpeechOutput.js';

type Entry = {
  id: number;
  request: string;
  reply?: string;
  status: 'pending' | 'interaction' | 'started' | 'executed' | 'answered' | 'unresolved' | 'failed';
  run?: TaskRunIdentity;
  interaction?: TaskPendingInteraction;
  responding?: boolean;
};

const nullInput = '__ontahi_null__';
const encodeInputOption = (value: TaskInputValue) => JSON.stringify(value);
const inputValue = (
  interaction: Extract<TaskPendingInteraction, { kind: 'input' }>,
  raw: string,
): TaskInputValue | undefined => {
  if (raw === nullInput) return interaction.input.nullable ? null : undefined;
  if (interaction.input.type === 'string') return raw;
  if (interaction.input.type === 'number') {
    const value = Number(raw);
    return raw.trim() && Number.isFinite(value) ? value : undefined;
  }
  if (!raw) return undefined;
  const options = interaction.input.type === 'boolean' ? [true, false] : interaction.input.values;
  return options.find(option => encodeInputOption(option) === raw);
};

export const CommandChat = ({
  onExecuted,
  submit: execute = submitModelCommand,
  respond,
}: {
  onExecuted: (
    outcome: Extract<TodoModelCommandResult, { status: 'executed' }>,
    committedMutations?: CommittedMutationSet,
  ) => Promise<unknown>;
  submit?: ModelCommandSubmitter;
  respond?: ModelCommandResponder;
}) => {
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const prompt = useRef<HTMLTextAreaElement>(null);
  const countdown = useDictationCountdown(() => prompt.current?.form?.requestSubmit());
  const speech = useSpeechInput(setText, recognized => {
    if (recognized) countdown.start();
    prompt.current?.focus();
  });
  const voice = useSpeechOutput(speech.language);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [interactionValues, setInteractionValues] = useState<Record<string, string>>({});
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

  const answer = (id: number, status: Entry['status'], reply: string) => {
    voice.speak(reply);
    setEntries(previous =>
      previous.map(candidate =>
        candidate.id === id
          ? {
              ...candidate,
              status,
              reply,
              run: undefined,
              interaction: undefined,
              responding: false,
            }
          : candidate,
      ),
    );
  };

  const applyOutcome = async (
    id: number,
    outcome: TodoModelCommandResult,
    committedMutations?: CommittedMutationSet,
  ) => {
    if (outcome.status === 'pending') {
      voice.speak(outcome.message);
      setEntries(previous =>
        previous.map(candidate =>
          candidate.id === id
            ? {
                ...candidate,
                status: 'interaction',
                reply: outcome.message,
                run: outcome.run,
                interaction: outcome.interaction,
                responding: false,
              }
            : candidate,
        ),
      );
      return;
    }
    answer(id, outcome.status, outcome.message);
    if (outcome.status === 'executed' && outcome.request?.kind !== 'graph-read') {
      try {
        if (committedMutations) await onExecuted(outcome, committedMutations);
        else await onExecuted(outcome);
      } catch {
        answer(id, 'executed', `${outcome.message} Refresh the board to see the change.`);
      }
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    countdown.cancel();
    if (!text.trim() || busy.current || speech.listening) return;
    voice.cancel();
    busy.current = true;
    setPending(true);
    const id = ++sequence.current;
    const entry: Entry = { id, request: text.trim(), status: 'pending' };
    setEntries(previous => [...previous, entry]);
    setText('');
    try {
      const result = await execute({
        text: entry.request,
        language: speech.language,
      });
      if (!result.ok) {
        answer(
          id,
          'failed',
          result.message ?? 'The request failed. Check the list before trying again.',
        );
        return;
      }
      const outcome = result.value;
      await applyOutcome(id, outcome, result.committedMutations);
    } catch {
      // A lost response may follow a successful write. Never automatically resubmit.
      answer(id, 'failed', 'The server response was lost. Check the list before submitting again.');
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const respondToInteraction = async (entry: Entry, response: TaskInteractionResponse) => {
    if (!respond || !entry.run || !entry.interaction || busy.current) return;
    busy.current = true;
    setPending(true);
    setEntries(previous =>
      previous.map(candidate =>
        candidate.id === entry.id ? { ...candidate, responding: true } : candidate,
      ),
    );
    try {
      const result = await respond(entry.run, response);
      if (!result.ok) {
        answer(entry.id, 'failed', result.message ?? 'The response could not be applied.');
        return;
      }
      await applyOutcome(entry.id, result.value, result.committedMutations);
    } catch {
      answer(
        entry.id,
        'failed',
        'The server response was lost. Reopen Activity to inspect the run.',
      );
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
                {entry.status === 'interaction' && entry.interaction && respond ? (
                  <div
                    className='command-chat-approval'
                    aria-label={
                      entry.interaction.kind === 'approval'
                        ? 'Approval required'
                        : entry.interaction.kind === 'input'
                          ? 'Input required'
                          : 'Choice required'
                    }
                  >
                    {entry.interaction.kind === 'approval' ? (
                      <>
                        <span>{entry.interaction.proposal.summary}</span>
                        <div>
                          <button
                            type='button'
                            disabled={entry.responding}
                            onClick={() =>
                              void respondToInteraction(entry, {
                                interactionId: entry.interaction!.id,
                                decision: 'reject',
                              })
                            }
                          >
                            Reject
                          </button>
                          <button
                            type='button'
                            disabled={entry.responding}
                            onClick={() =>
                              void respondToInteraction(entry, {
                                interactionId: entry.interaction!.id,
                                decision: 'approve',
                              })
                            }
                          >
                            Approve
                          </button>
                        </div>
                      </>
                    ) : entry.interaction.kind === 'input' ? (
                      <form
                        className='command-chat-input'
                        onSubmit={event => {
                          event.preventDefault();
                          const raw = interactionValues[entry.interaction!.id] ?? '';
                          const value = inputValue(
                            entry.interaction as TaskPendingInputInteraction,
                            raw,
                          );
                          if (value === undefined) return;
                          void respondToInteraction(entry, {
                            interactionId: entry.interaction!.id,
                            value,
                          });
                        }}
                      >
                        {entry.interaction.input.type === 'boolean' ||
                        entry.interaction.input.type === 'enum' ? (
                          <select
                            aria-label={entry.interaction.prompt}
                            value={interactionValues[entry.interaction.id] ?? ''}
                            disabled={entry.responding}
                            onChange={event =>
                              setInteractionValues(previous => ({
                                ...previous,
                                [entry.interaction!.id]: event.target.value,
                              }))
                            }
                            autoFocus
                          >
                            <option value='' disabled>
                              Select…
                            </option>
                            {entry.interaction.input.nullable &&
                            !(
                              entry.interaction.input.type === 'enum' &&
                              entry.interaction.input.values.includes(null)
                            ) ? (
                              <option value={nullInput}>null</option>
                            ) : null}
                            {(entry.interaction.input.type === 'boolean'
                              ? [true, false]
                              : entry.interaction.input.values
                            ).map(value => (
                              <option
                                key={encodeInputOption(value)}
                                value={encodeInputOption(value)}
                              >
                                {String(value)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <>
                            <input
                              aria-label={entry.interaction.prompt}
                              type={entry.interaction.input.type === 'number' ? 'number' : 'text'}
                              step={entry.interaction.input.type === 'number' ? 'any' : undefined}
                              value={
                                interactionValues[entry.interaction.id] === nullInput
                                  ? ''
                                  : (interactionValues[entry.interaction.id] ?? '')
                              }
                              disabled={
                                entry.responding ||
                                interactionValues[entry.interaction.id] === nullInput
                              }
                              onChange={event =>
                                setInteractionValues(previous => ({
                                  ...previous,
                                  [entry.interaction!.id]: event.target.value,
                                }))
                              }
                              autoFocus
                            />
                            {entry.interaction.input.nullable ? (
                              <label>
                                <input
                                  type='checkbox'
                                  checked={interactionValues[entry.interaction.id] === nullInput}
                                  disabled={entry.responding}
                                  onChange={event =>
                                    setInteractionValues(previous => ({
                                      ...previous,
                                      [entry.interaction!.id]: event.target.checked
                                        ? nullInput
                                        : '',
                                    }))
                                  }
                                />
                                Use null
                              </label>
                            ) : null}
                          </>
                        )}
                        <button
                          type='submit'
                          disabled={
                            entry.responding ||
                            inputValue(
                              entry.interaction,
                              interactionValues[entry.interaction.id] ?? '',
                            ) === undefined
                          }
                        >
                          Continue
                        </button>
                      </form>
                    ) : (
                      <div>
                        {entry.interaction.options.map(option => (
                          <button
                            key={option.id}
                            type='button'
                            disabled={entry.responding}
                            onClick={() =>
                              void respondToInteraction(entry, {
                                interactionId: entry.interaction!.id,
                                optionId: option.id,
                              })
                            }
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
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
          Listening… Dictation sends automatically after a 3-second review.
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
              countdown.cancel();
              speech.cancel();
              setText(event.target.value);
            }}
            maxLength={2000}
            placeholder='Message…'
            disabled={pending}
            onCompositionStart={() => countdown.cancel()}
            onKeyDown={event => {
              if (countdown.seconds !== null) {
                countdown.cancel();
                if (event.key === 'Enter') event.preventDefault();
                return;
              }
              if (
                event.key === 'ArrowUp' &&
                !text &&
                !pending &&
                !speech.listening &&
                !event.nativeEvent.isComposing &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.altKey &&
                !event.shiftKey &&
                entries.length
              ) {
                event.preventDefault();
                setText(entries.at(-1)!.request);
                return;
              }
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
            aria-label='Chat language'
            title='Response and speech language'
            value={speech.language}
            disabled={pending || speech.listening}
            onChange={event => {
              countdown.cancel();
              speech.setLanguage(event.target.value === 'es-ES' ? 'es-ES' : 'en-US');
            }}
          >
            <option value='en-US'>EN</option>
            <option value='es-ES'>ES</option>
          </select>
          <button
            type='button'
            className={`command-chat-microphone${countdown.seconds !== null ? ' command-chat-cancel' : ''}`}
            aria-label={
              countdown.seconds !== null
                ? 'Cancel automatic send'
                : speech.listening
                  ? 'Stop dictation'
                  : 'Dictate message'
            }
            aria-pressed={speech.listening}
            title={
              countdown.seconds !== null
                ? 'Cancel automatic send'
                : !speech.supported
                  ? 'Speech recognition is not supported in this browser.'
                  : speech.listening
                    ? 'Stop dictation'
                    : `Dictate (${speech.language}). Your browser may use an online speech service.`
            }
            disabled={pending || !speech.supported}
            onClick={() => {
              if (countdown.seconds !== null) {
                countdown.cancel();
                prompt.current?.focus();
                return;
              }
              countdown.cancel();
              voice.cancel();
              speech.toggle(text);
            }}
          >
            {countdown.seconds !== null ? (
              <X size={17} />
            ) : speech.listening ? (
              <Square size={14} />
            ) : (
              <Mic size={17} />
            )}
          </button>
          <button
            type='submit'
            className={countdown.seconds !== null ? 'command-chat-countdown' : undefined}
            aria-label='Send message'
            title='Send (⌘Enter)'
            aria-keyshortcuts='Meta+Enter Control+Enter'
            disabled={!text.trim() || pending || speech.listening}
          >
            {pending ? (
              <LoaderCircle size={17} className='command-chat-spinner' />
            ) : countdown.seconds !== null ? (
              <>
                <svg className='command-chat-countdown-ring' viewBox='0 0 36 36' aria-hidden='true'>
                  <circle cx='18' cy='18' r='16' pathLength='1' />
                </svg>
                <span aria-hidden='true'>{countdown.seconds}</span>
                <span className='sr-only' role='status'>
                  Sending in {countdown.seconds} seconds
                </span>
              </>
            ) : (
              <ArrowUp size={18} />
            )}
          </button>
        </div>
      </form>
    </section>
  );
};
