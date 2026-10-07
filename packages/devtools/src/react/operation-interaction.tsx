import type {
  TaskInputValue,
  TaskInteractionResponse,
  TaskPendingInteraction,
} from '@ontahi/core/runtime/contracts';
import { useContext, useState, type CSSProperties, type FormEvent } from 'react';

import { graphCommandText } from './activity-model.js';
import { AuthoringDialectContext } from './authoring-dialect.js';
import { styles } from './devtools-styles.js';
import { JsonView } from './json-view.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const buttonStyle = (kind: 'primary' | 'secondary' | 'danger' = 'secondary'): CSSProperties => ({
  minHeight: 30,
  padding: '0 12px',
  border: `1px solid ${kind === 'danger' ? '#74443f' : kind === 'primary' ? '#3f7358' : '#30463a'}`,
  borderRadius: 8,
  color: kind === 'danger' ? '#ffd8d4' : '#e6fff0',
  background: kind === 'danger' ? '#4a2421' : kind === 'primary' ? '#1d4a32' : '#14221b',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 750,
});

const nullOption = '__ontahi_null__';
const valueOption = (value: TaskInputValue) => JSON.stringify(value);
const inputStyle: CSSProperties = {
  minHeight: 30,
  padding: '0 10px',
  border: '1px solid #30463a',
  borderRadius: 8,
  color: '#e6fff0',
  background: '#101b16',
  font: 'inherit',
};

const InputInteractionForm = ({
  interaction,
  responding,
  respond,
}: {
  interaction: Extract<TaskPendingInteraction, { kind: 'input' }>;
  responding: boolean;
  respond: (response: TaskInteractionResponse) => void;
}) => {
  const [useNull, setUseNull] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const raw = new FormData(event.currentTarget).get('value');
    if (!useNull && typeof raw !== 'string') return;
    const value: TaskInputValue =
      useNull || raw === nullOption
        ? null
        : interaction.input.type === 'number'
          ? Number(raw)
          : interaction.input.type === 'boolean' || interaction.input.type === 'enum'
            ? (JSON.parse(raw as string) as TaskInputValue)
            : (raw as string);
    respond({ interactionId: interaction.id, value });
  };
  const id = `task-input-${interaction.id}`;
  const selectValues =
    interaction.input.type === 'boolean'
      ? [true, false]
      : interaction.input.type === 'enum'
        ? interaction.input.values
        : undefined;
  const control = selectValues ? (
    <select id={id} name='value' disabled={responding} autoFocus style={inputStyle}>
      {interaction.input.nullable && !selectValues.includes(null) ? (
        <option value={nullOption}>null</option>
      ) : null}
      {selectValues.map(value => (
        <option key={valueOption(value)} value={valueOption(value)}>
          {String(value)}
        </option>
      ))}
    </select>
  ) : (
    <input
      id={id}
      name='value'
      type={interaction.input.type === 'number' ? 'number' : 'text'}
      step={interaction.input.type === 'number' ? 'any' : undefined}
      disabled={responding || useNull}
      autoFocus
      style={{ ...inputStyle, flex: '1 1 240px' }}
    />
  );
  return (
    <form style={styles.semanticCard} onSubmit={submit}>
      <span style={styles.semanticLabel}>Input required</span>
      <label style={styles.semanticValue} htmlFor={id}>
        {interaction.prompt}
      </label>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {control}
        {interaction.input.nullable && !selectValues ? (
          <label style={styles.consoleHint}>
            <input
              type='checkbox'
              checked={useNull}
              disabled={responding}
              onChange={event => setUseNull(event.target.checked)}
            />{' '}
            Use null
          </label>
        ) : null}
        <button
          type='submit'
          disabled={responding}
          style={{ ...buttonStyle('primary'), ...(responding ? styles.disabledButton : {}) }}
        >
          Continue
        </button>
      </span>
    </form>
  );
};

export const OperationInteraction = ({
  interaction,
  responding,
  respond,
}: {
  readonly interaction: TaskPendingInteraction;
  readonly responding: boolean;
  readonly respond: (response: TaskInteractionResponse) => void;
}) => {
  const dialect = useContext(AuthoringDialectContext);
  if (interaction.kind === 'choice')
    return (
      <div style={styles.semanticCard}>
        <span style={styles.semanticLabel}>Choice required</span>
        <span style={styles.semanticValue}>{interaction.prompt}</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {interaction.options.map(option => (
            <button
              key={option.id}
              type='button'
              disabled={responding}
              style={{ ...buttonStyle('primary'), ...(responding ? styles.disabledButton : {}) }}
              onClick={() => respond({ interactionId: interaction.id, optionId: option.id })}
            >
              {option.label}
            </button>
          ))}
        </span>
      </div>
    );

  if (interaction.kind === 'input') {
    return (
      <InputInteractionForm interaction={interaction} responding={responding} respond={respond} />
    );
  }

  return (
    <div style={styles.semanticCard}>
      <span style={styles.semanticLabel}>Approval required</span>
      <span style={styles.semanticValue}>{interaction.prompt}</span>
      <span style={styles.consoleHint}>{interaction.proposal.summary}</span>
      <ol
        aria-label='Proposed commands'
        style={{ display: 'grid', gap: 6, margin: 0, paddingInlineStart: 24 }}
      >
        {interaction.proposal.requests.map((request, index) => (
          <li key={index}>
            <code style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {isRecord(request)
                ? (graphCommandText(request, dialect) ?? JSON.stringify(request))
                : JSON.stringify(request)}
            </code>
          </li>
        ))}
      </ol>
      <details>
        <summary style={{ cursor: 'pointer', color: '#8eaa9a' }}>Exact requests</summary>
        <JsonView value={interaction.proposal.requests} label='Proposed requests' />
      </details>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type='button'
          disabled={responding}
          style={{ ...buttonStyle('danger'), ...(responding ? styles.disabledButton : {}) }}
          onClick={() => respond({ interactionId: interaction.id, decision: 'reject' })}
        >
          Reject
        </button>
        <button
          type='button'
          disabled={responding}
          style={{ ...buttonStyle('primary'), ...(responding ? styles.disabledButton : {}) }}
          onClick={() => respond({ interactionId: interaction.id, decision: 'approve' })}
        >
          Approve
        </button>
      </span>
    </div>
  );
};
