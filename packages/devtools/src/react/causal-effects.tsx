import { useContext } from 'react';

import { graphReadSummary, isRecord, type DerivedGraphRefresh } from './activity-model.js';
import { AuthoringDialectContext } from './authoring-dialect.js';
import { styles } from './devtools-styles.js';

export const CausalEffects = ({
  mutationCommitId,
  refreshes,
  showHeading = true,
}: {
  readonly mutationCommitId?: string;
  readonly refreshes: readonly DerivedGraphRefresh[];
  readonly showHeading?: boolean;
}) => {
  const dialect = useContext(AuthoringDialectContext);
  if (!mutationCommitId && refreshes.length === 0) return null;
  return (
    <section style={styles.effectsCard} aria-label='Operation effects'>
      {showHeading ? <span style={styles.semanticLabel}>Effects</span> : null}
      <p style={styles.effectsSummary}>
        {refreshes.length > 0
          ? `Ontahí refreshed ${refreshes.length} active ${refreshes.length === 1 ? 'read' : 'reads'} affected by this mutation.`
          : 'This mutation committed application changes. No active client read reported a refresh.'}
      </p>
      {refreshes.length > 0 ? (
        <ol style={styles.effectList}>
          {refreshes.map(refresh => (
            <li
              key={`${refresh.source}:${refresh.id}:${refresh.sequence ?? 0}`}
              style={styles.effectRow}
            >
              <span style={styles.effectGlyph} aria-hidden='true'>
                ↻
              </span>
              <span style={styles.effectMain}>
                <span style={styles.effectTitle}>
                  {isRecord(refresh.request)
                    ? (graphReadSummary(refresh.request, dialect) ?? 'Graph Read')
                    : 'Graph Read'}
                </span>
                <span style={styles.effectMeta}>
                  {refresh.transportId}
                  {refresh.rowCount === undefined ? '' : ` · ${refresh.rowCount} rows`}
                  {refresh.durationMs === undefined ? '' : ` · ${refresh.durationMs} ms`}
                  {refresh.overflow ? ' · coalesced causes' : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {mutationCommitId ? (
        <details style={styles.technicalEvidence}>
          <summary>Technical evidence</summary>
          <div style={styles.technicalEvidenceValue}>mutation commit {mutationCommitId}</div>
        </details>
      ) : null}
    </section>
  );
};
