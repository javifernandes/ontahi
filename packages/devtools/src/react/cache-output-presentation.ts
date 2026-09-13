import type { GraphClientCacheOutputRecord } from '@ontahi/core/data-graph';
import type { ConsoleDialect } from '@ontahi/language';

import { graphReadSummary } from './activity-model.js';

const recordValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const scopeLabel = (identity: unknown): string | undefined => {
  if (!Array.isArray(identity)) return undefined;
  const [kind, ...parts] = identity;
  if (kind !== 'anonymous' && kind !== 'principal') return undefined;
  return [kind === 'anonymous' ? 'Anonymous' : 'Principal', ...parts]
    .filter(part => part !== undefined && part !== null && part !== '')
    .map(part => (typeof part === 'string' ? part : JSON.stringify(part)))
    .join(' / ');
};

export const presentCacheOutput = (
  output: GraphClientCacheOutputRecord,
  dialect: ConsoleDialect = 'ts',
) => {
  const [entity, family, identity, intent, read, viewName] = output.key;
  const knownRead =
    output.source?.kind !== 'operation' &&
    typeof entity === 'string' &&
    family === 'graph-read' &&
    ['many', 'first', 'one', 'count', 'exists'].includes(String(intent));
  if (knownRead) {
    return {
      title: `${entity} · ${intent}`,
      detail: recordValue(read)
        ? (graphReadSummary(read, dialect) ?? 'Graph read')
        : read === 'view' && typeof viewName === 'string'
          ? `View · ${viewName}`
          : 'Graph read',
      scope: scopeLabel(identity),
      family: 'Graph read',
    };
  }
  return {
    title: output.source?.name ?? 'Cached output',
    detail:
      output.source?.kind === 'operation'
        ? 'Operation result'
        : output.source?.kind === 'graph-read'
          ? 'Graph read'
          : 'Custom cache key',
    scope: undefined,
    family:
      output.source?.kind === 'operation'
        ? 'Operation'
        : output.source?.kind === 'graph-read'
          ? 'Graph read'
          : 'Output',
  };
};
