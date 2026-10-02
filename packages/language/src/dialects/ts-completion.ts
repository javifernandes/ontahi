import {
  completionWordRange,
  consoleEntityCompletionItems,
  consoleOrderCompletions,
  consoleContinuationItems,
} from '../console/completion.js';
import { resolveConsoleContext } from '../console/context.js';
import { completeConsoleFactory } from '../console/factories.js';
import { completeRelationshipCommand } from '../console/relationship-completion.js';
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
    const relationshipActions = (['attach', 'detach', 'move'] as const)
      .filter(action =>
        application.commands?.some(command =>
          command.relationshipAffordances?.some(affordance =>
            action === 'move'
              ? affordance.relationKind === 'ordered'
              : affordance.actions.some(
                  candidate => candidate === (action === 'attach' ? 'link' : 'unlink'),
                ),
          ),
        ),
      )
      .map(action => ({
        label: action,
        apply: `${action} `,
        kind: 'keyword' as const,
        detail: 'Relationship Command',
      }));
    return {
      ...range,
      items: [...relationshipActions, ...consoleEntityCompletionItems(application)].filter(item =>
        item.label.startsWith(document.slice(range.from, safePosition)),
      ),
    };
  }

  const relationshipCompletion = completeRelationshipCommand(
    document,
    safePosition,
    syntax,
    application,
  );
  if (relationshipCompletion) return relationshipCompletion;

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
    if (prefix.request && prefix.syntax.expression && context) {
      const commandActions = application.commands?.find(
        command => command.entityName === context.name,
      )?.actions;
      const selectionActions = application.commands?.find(
        command => command.entityName === context.name,
      )?.selectionActions;
      const actions = [
        ...(commandActions?.includes('create')
          ? [
              {
                label: 'create',
                apply: 'create({})',
                kind: 'member' as const,
                detail: 'Entity create Command',
              },
            ]
          : []),
        ...(commandActions?.some(action => action === 'update' || action === 'delete')
          ? [
              {
                label: 'ref',
                apply: 'ref({ id: "" })',
                kind: 'member' as const,
                detail: 'Entity update or delete Command',
              },
            ]
          : []),
        ...(selectionActions?.includes('update')
          ? [
              {
                label: 'update',
                apply: 'update({})',
                kind: 'member' as const,
                detail: 'Update the selected Entities',
              },
            ]
          : []),
        ...(selectionActions?.includes('delete')
          ? [
              {
                label: 'delete',
                apply: 'delete()',
                kind: 'member' as const,
                detail: 'Delete the selected Entities',
              },
            ]
          : []),
        ...(application.operations ?? [])
          .filter(operation => operation.entityName === context.name)
          .map(operation => ({
            label: operation.name,
            apply: `${operation.name}(${operation.input?.kind === 'void' ? '' : '{}'})`,
            kind: 'member' as const,
            detail: operation.description ?? 'Operation',
          })),
      ];
      return {
        ...range,
        items: [
          ...consoleContinuationItems(
            { ...prefix.syntax.expression, terminal: undefined },
            context,
            application,
            dialect,
          ),
          ...actions,
        ].filter(item => item.label.startsWith(memberPrefix)),
      };
    }
  }

  return { ...range, items: [] };
};
