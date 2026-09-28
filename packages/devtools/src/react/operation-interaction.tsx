import type {
  TaskInteractionResponse,
  TaskPendingInteraction,
} from '@ontahi/core/runtime/contracts';
import { useContext, type CSSProperties } from 'react';

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
