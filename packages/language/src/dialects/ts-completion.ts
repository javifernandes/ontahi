import {
  completionWordRange,
  consoleOrderCompletions,
  consoleContinuationItems,
} from '../console/completion.js';
import { resolveConsoleContext } from '../console/context.js';
import { completeConsoleFactory } from '../console/factories.js';
import type {
  ConsoleLanguageApplicationReflection,
  ConsoleLanguageCompletionResult,
  ConsoleLanguageCompletionOptions,
} from '../model/contracts.js';
import { completeSelectionDocument } from '../selection/assistance.js';

import type { Dialect, AnalyzePrefix } from './contract.js';

export const completeTsConsoleDocument = (
  document: string,
  position: number,
  application: ConsoleLanguageApplicationReflection,
  options: ConsoleLanguageCompletionOptions,
  analyzePrefix: AnalyzePrefix,
  dialect: Dialect,
): ConsoleLanguageCompletionResult => {
  const safePosition = Math.max(0, Math.min(position, document.length));
  const syntax = dialect.parse(document).syntax.expression;
  const rootPrefix = document.slice(0, safePosition);
  if (!rootPrefix.includes('.') && /^\s*\w*$/.test(rootPrefix)) {
    const range = completionWordRange(document, safePosition);
    return {
      ...range,
      items: application.entities.map(entity => ({
        label: entity.name,
        apply: entity.name,
        kind: 'entity',
        detail: 'Entity',
      })),
    };
  }

  const entity = resolveConsoleContext(syntax, application, safePosition);
  const factoryCompletion = completeConsoleFactory(
    document,
    safePosition,
    syntax?.factories.find(factory => safePosition >= factory.from && safePosition <= factory.to),
    entity?.selectionFactories,
    dialect.factoryNameSeparator,
  );
  if (factoryCompletion) return factoryCompletion;
  const filter = syntax?.steps.find(
    step =>
      step.kind === 'filter' &&
      safePosition >= (step.whereOpen?.to ?? step.from) &&
      safePosition <= (step.whereClose?.from ?? step.to),
  );
  const selectionFrom = filter?.kind === 'filter' ? filter.whereOpen?.to : undefined;
  const selectionTo =
    filter?.kind === 'filter' ? (filter.whereClose?.from ?? filter.to) : undefined;
  if (
    entity &&
    selectionFrom !== undefined &&
    safePosition >= selectionFrom &&
    (selectionTo === undefined || safePosition <= selectionTo)
  ) {
    const end = selectionTo ?? document.length;
    const completion = completeSelectionDocument(
      document.slice(selectionFrom, end),
      safePosition - selectionFrom,
      entity,
    );
    return {
      from: selectionFrom + completion.from,
      to: selectionFrom + completion.to,
      items: completion.items,
    };
  }

  const range = completionWordRange(document, safePosition);
  const order = syntax?.orderBy;
  if (
    entity &&
    order?.open &&
    safePosition >= order.open.to &&
    (order.close === undefined || safePosition <= order.close.from)
  ) {
    return {
      ...range,
      items: consoleOrderCompletions(entity, order, safePosition, options, dialect.directions),
    };
  }
  const memberPrefix = document.slice(range.from, safePosition);
  // Project the prefix rather than a recovered suffix (e.g. `.one` is also an Identifier).
  const beforeMember = document.slice(0, range.from).replace(/\.\s*$/, '');
  if (beforeMember.length < range.from) {
    const prefix = analyzePrefix(`${beforeMember}.many()`);
    const context = resolveConsoleContext(prefix.syntax.expression, application);
    if (prefix.request && prefix.syntax.expression && context)
      return {
        ...range,
        items: consoleContinuationItems(
          { ...prefix.syntax.expression, terminal: undefined },
          context,
          application,
          dialect,
        ).filter(item => item.label.startsWith(memberPrefix)),
      };
  }

  return { ...range, items: [] };
};
