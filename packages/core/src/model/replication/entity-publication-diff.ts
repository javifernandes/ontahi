type PublicationRow = { readonly id: string };

export type EntityPublicationDiffInput<
  TCurrent extends PublicationRow,
  TCandidate extends PublicationRow,
> = {
  readonly current: readonly TCurrent[];
  readonly candidate: readonly TCandidate[];
  readonly equals: (current: TCurrent, candidate: TCandidate) => boolean;
  readonly scopeOf: (current: TCurrent) => string;
  /** Each predicate proves that a complete observation covers the row's last accepted positive. */
  readonly completeScopes: ReadonlyMap<string, (current: TCurrent) => boolean>;
};

export type EntityPublicationDiff<TCandidate> = {
  readonly puts: readonly TCandidate[];
  readonly removes: readonly string[];
  /** Identities present on both sides and passed to the equality predicate. */
  readonly compared: number;
  /** Current rows kept as-is, including omissions without proven coverage. */
  readonly reused: number;
};

const indexPublicationRows = <TRow extends PublicationRow>(
  rows: readonly TRow[],
  side: 'current' | 'candidate',
): Map<string, TRow> => {
  const index = new Map<string, TRow>();
  for (const row of rows) {
    if (index.has(row.id)) {
      throw new Error(`Duplicate ${side} entity publication identity: ${row.id}.`);
    }
    index.set(row.id, row);
  }
  return index;
};

/** Computes mutations in identity order. The caller supplies coverage and guards application. */
export const diffEntityPublication = <
  TCurrent extends PublicationRow,
  TCandidate extends PublicationRow,
>(
  input: EntityPublicationDiffInput<TCurrent, TCandidate>,
): EntityPublicationDiff<TCandidate> => {
  const current = indexPublicationRows(input.current, 'current');
  const candidate = indexPublicationRows(input.candidate, 'candidate');
  const puts: TCandidate[] = [];
  const removes: string[] = [];
  let compared = 0;
  let reused = 0;

  for (const id of [...candidate.keys()].sort()) {
    const next = candidate.get(id)!;
    const previous = current.get(id);
    if (previous !== undefined) {
      compared += 1;
      if (input.equals(previous, next)) {
        reused += 1;
        continue;
      }
    }
    puts.push(next);
  }

  for (const id of [...current.keys()].sort()) {
    if (candidate.has(id)) continue;

    const previous = current.get(id)!;
    if (input.completeScopes.get(input.scopeOf(previous))?.(previous) === true) {
      removes.push(id);
    } else {
      reused += 1;
    }
  }

  return { puts, removes, compared, reused };
};
