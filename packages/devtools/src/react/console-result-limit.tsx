import type { GraphReadRequest } from '@ontahi/core/data-graph';
import { useEffect, useState } from 'react';

import { styles } from './devtools-styles.js';

export const ConsoleResultLimit = ({
  request,
  defaultLimit,
  disabledReason,
  onApply,
}: {
  readonly request: GraphReadRequest;
  readonly defaultLimit: number;
  readonly disabledReason?: string;
  readonly onApply: (limit: number) => void;
}) => {
  const limit = request.limit ?? defaultLimit;
  const [draft, setDraft] = useState(String(limit));
  useEffect(() => setDraft(String(limit)), [request, limit]);
  const nextLimit = Number(draft);
  const valid = draft.trim() !== '' && Number.isSafeInteger(nextLimit) && nextLimit >= 0;
  const disabled = Boolean(disabledReason) || !valid;
  return (
    <form
      aria-label='Query limit'
      style={styles.consoleLimitControls}
      title={disabledReason}
      onSubmit={event => {
        event.preventDefault();
        if (disabled) return;
        onApply(nextLimit);
        setDraft(String(limit));
      }}
    >
      <label>
        Limit{' '}
        <input
          aria-label='Result limit'
          title={`Executed limit: ${limit}. Press Enter to apply.`}
          type='number'
          min={0}
          max={Number.MAX_SAFE_INTEGER}
          step={1}
          required
          value={draft}
          disabled={Boolean(disabledReason)}
          onChange={event => setDraft(event.target.value)}
          style={styles.consoleLimitInput}
        />
      </label>
      {draft !== String(limit) ? (
        <button
          type='submit'
          aria-label='Apply limit'
          disabled={disabled}
          style={{ ...styles.mode, ...(disabled ? styles.disabledButton : {}) }}
        >
          Apply
        </button>
      ) : null}
    </form>
  );
};
