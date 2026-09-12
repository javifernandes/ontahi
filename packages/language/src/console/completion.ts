import type { Dialect, ConsoleCandidate } from '../dialects/contract.js';
import type {
  SelectionLanguageRange,
  SelectionLanguageEntityReflection,
  ConsoleLanguageApplicationReflection,
  ConsoleOrderBySyntax,
  ConsoleGraphReadSyntax,
  ConsoleLanguageCompletionItem,
  ConsoleLanguageCompletionOptions,
} from '../model/contracts.js';

import { isConsoleOrderableField } from './analysis.js';
import { consoleNavigationTarget } from './context.js';

export const completionWordRange = (document: string, position: number): SelectionLanguageRange => {
  let from = position;
  while (from > 0 && /\w/.test(document[from - 1]!)) from -= 1;
  let to = position;
  while (to < document.length && /\w/.test(document[to]!)) to += 1;
  return { from, to };
};

const terminals = [
  { name: 'first', detail: 'Nullable first Graph Read terminal' },
  { name: 'one', detail: 'Exact-one Graph Read terminal' },
  { name: 'many', detail: 'Many Graph Read terminal' },
  { name: 'count', detail: 'Graph Read count terminal' },
  { name: 'exists', detail: 'Whether any Entity matches the Selection' },
] as const;

export const consoleEntityCompletionItems = (
  application: ConsoleLanguageApplicationReflection,
): readonly ConsoleLanguageCompletionItem[] =>
  application.entities.map(entity => ({
    label: entity.name,
    apply: entity.name,
    kind: 'entity',
    detail: entity.variant ? `Variant of ${entity.variant.baseEntityName}` : 'Entity',
  }));

export const consoleOrderCompletions = (
  entity: SelectionLanguageEntityReflection,
  order: ConsoleOrderBySyntax,
  position: number,
  options: ConsoleLanguageCompletionOptions,
  directions: readonly string[],
): readonly ConsoleLanguageCompletionItem[] => {
  if (order.comma && position >= order.comma.to) {
    return directions.map(direction => ({
      label: direction,
      apply: direction,
      kind: 'value',
      detail: 'Order direction',
    }));
  }
  const fields = options.orderableFields?.(entity.name);
  return entity.fields
    .filter(
      field =>
        isConsoleOrderableField(field) && (fields === undefined || fields.includes(field.name)),
    )
    .map(field => ({ label: field.name, apply: field.name, kind: 'field', detail: field.type }));
};

export const contextualCompletionItems = (
  entity: SelectionLanguageEntityReflection,
  application: ConsoleLanguageApplicationReflection,
): readonly ConsoleLanguageCompletionItem[] =>
  Object.keys(entity.contextualSelections ?? {})
    .filter(
      name =>
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) &&
        !['all', 'none', 'and', 'or', 'not', 'in', 'is', 'null', 'true', 'false'].includes(name) &&
        consoleNavigationTarget(entity, name, application),
    )
    .map(name => ({
      label: name,
      apply: name,
      kind: 'member',
      detail: `Contextual Selection → ${entity.contextualSelections![name]!.output.entityName}`,
    }));

/** One semantic continuation catalog; dialects only project its spelling. */
export const consoleContinuationCandidates = (
  syntax: ConsoleGraphReadSyntax,
  entity: SelectionLanguageEntityReflection,
  application: ConsoleLanguageApplicationReflection,
): readonly ConsoleCandidate[] => {
  if (syntax.terminal) return [];
  const membership = !syntax.orderBy && !syntax.limit;
  return [
    ...(membership &&
    !syntax.steps.some(step => step.kind !== 'factory') &&
    entity.selectionFactories
      ? [{ kind: 'factory' as const, repeated: syntax.factories.length > 0 }]
      : []),
    ...(membership
      ? contextualCompletionItems(entity, application).map(item => ({
          kind: 'navigation' as const,
          name: item.label,
          target: entity.contextualSelections![item.label]!.output.entityName,
        }))
      : []),
    ...(membership ? [{ kind: 'filter' as const }] : []),
    ...(!syntax.orderBy && !syntax.limit ? [{ kind: 'order' as const }] : []),
    ...(!syntax.limit ? [{ kind: 'limit' as const }] : []),
    ...terminals
      .filter(item =>
        syntax.limit
          ? item.name === 'many'
          : !syntax.orderBy || !['count', 'exists'].includes(item.name),
      )
      .map(item => ({ kind: 'terminal' as const, ...item })),
  ];
};

export const consoleContinuationItems = (
  syntax: ConsoleGraphReadSyntax,
  entity: SelectionLanguageEntityReflection,
  application: ConsoleLanguageApplicationReflection,
  dialect: Dialect,
): readonly ConsoleLanguageCompletionItem[] =>
  consoleContinuationCandidates(syntax, entity, application).map(candidate =>
    dialect.renderCompletion(candidate),
  );
