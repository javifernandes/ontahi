import {
  completionWordRange,
  consoleOrderCompletions,
  consoleContinuationItems,
  contextualCompletionItems,
} from '../console/completion.js';
import { resolveConsoleContext } from '../console/context.js';
import { completeConsoleFactory } from '../console/factories.js';
import type {
  SelectionLanguageEntityReflection,
  ConsoleLanguageApplicationReflection,
  ConsoleGraphReadSyntax,
  ConsoleLanguageCompletionItem,
  ConsoleLanguageCompletionResult,
  ConsoleLanguageCompletionOptions,
} from '../model/contracts.js';
import { completeSelectionDocument } from '../selection/assistance.js';
import { clampDocumentPosition } from '../selection/cursor.js';

import type { Dialect, AnalyzePrefix } from './contract.js';

export const completeDeclarativeConsoleDocument = (
  document: string,
  position: number,
  application: ConsoleLanguageApplicationReflection,
  options: ConsoleLanguageCompletionOptions,
  analyzePrefix: AnalyzePrefix,
  dialect: Dialect,
): ConsoleLanguageCompletionResult => {
  const pos = clampDocumentPosition(document, position);
  const range = completionWordRange(document, pos);
  const prefix = document.slice(range.from, pos);
  const result = (
    items: readonly ConsoleLanguageCompletionItem[],
  ): ConsoleLanguageCompletionResult => ({
    ...range,
    items: items.filter(item => item.label.startsWith(prefix)),
  });
  if (/^\s*\w*$/.test(document.slice(0, pos))) {
    return result(
      application.entities.map(entity => ({
        label: entity.name,
        apply: entity.name,
        kind: 'entity',
        detail: 'Entity',
      })),
    );
  }
  const syntax = dialect.parse(document).syntax.expression;
  const entity = resolveConsoleContext(syntax, application, pos);
  if (!syntax || !entity) return result([]);
  const factoryCompletion = completeConsoleFactory(
    document,
    pos,
    syntax.factories.find(factory => pos >= factory.from && pos <= factory.to),
    entity.selectionFactories,
    dialect.factoryNameSeparator,
  );
  if (factoryCompletion) return factoryCompletion;

  const navigation = syntax.navigations.find(
    hop => pos >= hop.from && pos <= hop.to && (!hop.name || pos <= hop.name.to),
  );
  if (navigation && /\bthrough\s+$/.test(document.slice(navigation.from, range.from)))
    return result(contextualCompletionItems(entity, application));

  // A complete prefix permits the next clause, even when the current word is still incomplete.
  const beforeWord = analyzePrefix(document.slice(0, range.from));
  const continuation =
    beforeWord.request && beforeWord.syntax.expression
      ? consoleContinuationItems(beforeWord.syntax.expression, entity, application, dialect)
      : [];
  const orderItems = declarativeOrderCompletionItems(syntax, entity, pos, options);
  if (orderItems) return result([...orderItems, ...continuation]);
  let filterIndex = -1;
  syntax.steps.forEach((step, index) => {
    if (step.kind === 'filter' && pos >= (step.where?.to ?? step.from)) filterIndex = index;
  });
  const filter = syntax.steps[filterIndex];
  const from = filter?.kind === 'filter' ? filter.where?.to : undefined;
  const to =
    syntax.steps[filterIndex + 1]?.from ??
    syntax.orderBy?.from ??
    syntax.limit?.from ??
    syntax.terminal?.from ??
    document.length;
  if (from !== undefined && pos >= from && pos <= to) {
    // Recovery can interpret a following clause keyword as a missing Field.
    // Before that recovered expression, offer Fields at the actual value hole.
    const beforeExpression =
      filter?.kind === 'filter' && filter.selection && pos < filter.selection.from;
    const end = beforeExpression ? pos : beforeWord.request ? range.from : to;
    const completion = completeSelectionDocument(
      document.slice(from, end),
      Math.min(pos, end) - from,
      entity,
    );
    if (beforeWord.request) return result([...completion.items, ...continuation]);
    return { from: from + completion.from, to: from + completion.to, items: completion.items };
  }
  return result(continuation);
};

export const declarativeOrderCompletionItems = (
  syntax: ConsoleGraphReadSyntax,
  entity: SelectionLanguageEntityReflection,
  position: number,
  options: ConsoleLanguageCompletionOptions,
): readonly ConsoleLanguageCompletionItem[] | undefined => {
  const order = syntax.orderBy;
  if (
    !order ||
    position < order.from ||
    position > (syntax.limit?.from ?? syntax.terminal?.from ?? Number.POSITIVE_INFINITY)
  )
    return undefined;
  if (!order.by) return [{ label: 'by', apply: 'by ', kind: 'keyword', detail: 'Ordering Field' }];
  if (position < order.by.to) return undefined;
  if (!order.field || position <= order.field.to)
    return consoleOrderCompletions(entity, order, position, options, ['ascending', 'descending']);
  if (order.direction && position > order.direction.to) return [];
  return ['ascending', 'descending'].map(label => ({
    label,
    apply: label,
    kind: 'keyword',
    detail: 'Order direction',
  }));
};
