import { useOperation } from '@ontahi/react/graph';
import { useRef, useState, type FormEvent } from 'react';

import { TodoList } from '../../../../src/generated/client-entities.js';

type Entry = {
  id: number;
  request: string;
  list: string;
  reply?: string;
  status: 'pending' | 'executed' | 'unresolved' | 'failed';
};

export const CommandChat = ({
  lists,
  onExecuted,
}: {
  lists: readonly { id: string; name: string }[];
  onExecuted: () => Promise<unknown>;
}) => {
  const command = useOperation(TodoList.domain.submitCommand);
  const [listId, setListId] = useState('');
  const [text, setText] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const busy = useRef(false);
  const sequence = useRef(0);
  const current = lists.find(list => list.id === listId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || !current || busy.current) return;
    busy.current = true;
    const id = ++sequence.current;
    const entry: Entry = { id, request: text.trim(), list: current.name, status: 'pending' };
    setEntries(previous => [...previous, entry]);
    setText('');
    const answer = (status: Entry['status'], reply: string) =>
      setEntries(previous =>
        previous.map(candidate =>
          candidate.id === id ? { ...candidate, status, reply } : candidate,
        ),
      );
    try {
      const result = await command.executeAsync({
        text: entry.request,
        list: TodoList.refById(current.id),
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
    }
  };

  return (
    <section className='command-chat' aria-label='List assistant'>
      <div className='command-chat-heading'>
        <div>
          <h2>Talk to your list</h2>
          <p>Add an item or mark one as done. Each message is a new request.</p>
        </div>
        <label>
          Current list
          <select
            value={current?.id ?? ''}
            onChange={event => setListId(event.target.value)}
            disabled={command.isExecuting}
          >
            <option value=''>Choose a list</option>
            {lists.map(list => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className='command-chat-log' role='log' aria-live='polite'>
        {entries.map(entry => (
          <article key={entry.id} className={`command-chat-entry is-${entry.status}`}>
            <small>{entry.list}</small>
            <p>{entry.request}</p>
            <p className='command-chat-reply'>
              {entry.status === 'pending' ? 'Interpreting…' : entry.reply}
            </p>
          </article>
        ))}
      </div>
      <form onSubmit={event => void submit(event)}>
        <label className='sr-only' htmlFor='command-text'>
          Request
        </label>
        <input
          id='command-text'
          value={text}
          onChange={event => setText(event.target.value)}
          maxLength={2000}
          placeholder={
            current ? '“Agregar comprar pan” or “Ya compré la yerba”' : 'Choose a list to start'
          }
          disabled={!current || command.isExecuting}
          autoComplete='off'
        />
        <button type='submit' disabled={!current || !text.trim() || command.isExecuting}>
          {command.isExecuting ? 'Working…' : 'Send'}
        </button>
      </form>
    </section>
  );
};
