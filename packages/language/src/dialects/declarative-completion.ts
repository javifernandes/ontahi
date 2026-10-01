import type { GraphSchemaDescriptor, GraphSchemaScalarType } from '@ontahi/core/data-graph';

import {
  completionWordRange,
  consoleEntityCompletionItems,
  consoleOrderCompletions,
  consoleContinuationItems,
  contextualCompletionItems,
} from '../console/completion.js';
import { resolveConsoleContext } from '../console/context.js';
import { completeConsoleFactory } from '../console/factories.js';
import { completeStructuredInput } from '../console/structured-value.js';
import type {
  SelectionLanguageEntityReflection,
  SelectionLanguageFieldReflection,
  ConsoleLanguageApplicationReflection,
  ConsoleGraphReadSyntax,
  ConsoleLanguageCompletionItem,
  ConsoleLanguageCompletionResult,
  ConsoleLanguageCompletionOptions,
} from '../model/contracts.js';
import { completeSelectionDocument } from '../selection/assistance.js';
import { clampDocumentPosition } from '../selection/cursor.js';

import type { Dialect, AnalyzePrefix } from './contract.js';

const locatorValue = (type: string, enumValues: readonly string[] | undefined) =>
  type === 'number'
    ? '0'
    : type === 'boolean'
      ? 'false'
      : type === 'enum'
        ? JSON.stringify(enumValues?.[0] ?? '')
        : '""';

const reflectedFieldDescriptor = (
  field: SelectionLanguageFieldReflection,
): GraphSchemaDescriptor => {
  const descriptor: GraphSchemaDescriptor = field.reference
    ? { kind: 'entity-ref', entityName: field.reference.entityName }
    : {
        kind: 'scalar',
        type: (['id', 'string', 'number', 'boolean', 'date', 'json', 'enum'].includes(field.type)
          ? field.type
          : 'string') as GraphSchemaScalarType,
        ...(field.enumValues ? { enumValues: [...field.enumValues] } : {}),
        ...(field.valueType ? { valueType: field.valueType } : {}),
      };
  return field.nullable ? { kind: 'nullable', item: descriptor } : descriptor;
};

const reflectedObjectDescriptor = (
  entity: SelectionLanguageEntityReflection,
  fields: readonly SelectionLanguageFieldReflection[],
): GraphSchemaDescriptor => ({
  kind: 'object',
  role: 'entity',
  entityName: entity.name,
  unknownKeys: 'strict',
  fields: Object.fromEntries(fields.map(field => [field.name, reflectedFieldDescriptor(field)])),
});

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
  const actionItems: readonly ConsoleLanguageCompletionItem[] = [
    ...(['create', 'update', 'delete'] as const)
      .filter(action =>
        application.commands?.some(
          command =>
            command.actions.includes(action) ||
            (action !== 'create' && command.selectionActions?.includes(action)),
        ),
      )
      .map(action => ({
        label: action,
        apply: `${action} `,
        kind: 'keyword' as const,
        detail: 'Entity Command',
      })),
    ...(application.operations?.length
      ? [{ label: 'invoke', apply: 'invoke ', kind: 'keyword' as const, detail: 'Operation' }]
      : []),
  ];
  if (/^\s*\w*$/.test(document.slice(0, pos))) {
    return result([...actionItems, ...consoleEntityCompletionItems(application)]);
  }
  const commandPrefix = document.slice(0, range.from).match(/^\s*(create|update|delete)\s+$/);
  if (commandPrefix) {
    const action = commandPrefix[1] as 'create' | 'update' | 'delete';
    return result(
      consoleEntityCompletionItems({
        ...application,
        entities: application.entities.filter(entity =>
          application.commands?.some(
            command =>
              command.entityName === entity.name &&
              (command.actions.includes(action) ||
                (action !== 'create' && command.selectionActions?.includes(action))),
          ),
        ),
      }),
    );
  }
  const commandTargetPrefix = document
    .slice(0, range.from)
    .match(/^\s*(create|update|delete)\s+([A-Za-z_$][\w$]*)\s+$/);
  if (commandTargetPrefix) {
    const action = commandTargetPrefix[1] as 'create' | 'update' | 'delete';
    const entity = application.entities.find(
      candidate => candidate.name === commandTargetPrefix[2],
    );
    const capabilities = application.commands?.find(command => command.entityName === entity?.name);
    const affordance = capabilities?.affordances?.find(candidate => candidate.action === action);
    const refAvailable = affordance
      ? action === 'create' || affordance.target !== undefined
      : capabilities?.actions.includes(action);
    const selectionAvailable =
      action !== 'create' &&
      (affordance
        ? affordance.target?.selection !== undefined
        : capabilities?.selectionActions?.includes(action));
    if (!entity || (!refAvailable && !selectionAvailable)) return result([]);
    if (action === 'create')
      return result([
        {
          label: '{…}',
          apply: '{ }',
          cursorOffset: 2,
          kind: 'punctuation',
          detail: 'Entity values',
        },
      ]);
    const locatorName = affordance?.target
      ? Object.keys(affordance.target.exact.locator.fields)[0]
      : undefined;
    const locator = locatorName
      ? entity.fields.find(field => field.name === locatorName)
      : (entity.fields.find(field => field.type === 'id') ??
        entity.fields.find(field => field.name === 'id') ??
        entity.fields[0]);
    if (!locator) return result([]);
    const value = locatorValue(locator.type, locator.enumValues);
    const apply = `{ ${locator.name}: ${value} }`;
    return result([
      ...(refAvailable
        ? [
            {
              label: `{ ${locator.name} }`,
              apply,
              ...(value === '""' ? { cursorOffset: apply.indexOf('""') + 1 } : {}),
              kind: 'punctuation' as const,
              detail: `${entity.name} locator`,
            },
          ]
        : []),
      ...(selectionAvailable
        ? [
            {
              label: 'where',
              apply: 'where { }',
              cursorOffset: 8,
              kind: 'keyword' as const,
              detail: `${entity.name} Selection`,
            },
          ]
        : []),
    ]);
  }
  const updateTarget = document
    .slice(0, range.from)
    .match(/^\s*update\s+([A-Za-z_$][\w$]*)\s+\{[\s\S]*\}\s+$/);
  if (updateTarget && !/\swith\s/.test(document.slice(0, range.from))) {
    return result([
      {
        label: 'with',
        apply: 'with { }',
        cursorOffset: 7,
        kind: 'keyword',
        detail: 'Entity update values',
      },
    ]);
  }
  if (/^\s*invoke\s+$/.test(document.slice(0, range.from))) {
    const operationEntities = new Set(
      application.operations?.map(operation => operation.entityName) ?? [],
    );
    return result(
      consoleEntityCompletionItems({
        ...application,
        entities: application.entities.filter(entity => operationEntities.has(entity.name)),
      }),
    );
  }
  const operationPrefix = document.slice(0, range.from).match(/^\s*invoke\s+([A-Za-z_$][\w$]*)\.$/);
  if (operationPrefix) {
    return result(
      (application.operations ?? [])
        .filter(operation => operation.entityName === operationPrefix[1])
        .map(operation => ({
          label: operation.name,
          apply: `${operation.name} `,
          kind: 'member',
          detail: operation.description ? `Operation · ${operation.description}` : 'Operation',
        })),
    );
  }
  const operationInputPrefix = document
    .slice(0, range.from)
    .match(/^\s*invoke\s+([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s+$/);
  if (operationInputPrefix) {
    const operation = application.operations?.find(
      candidate =>
        candidate.entityName === operationInputPrefix[1] &&
        candidate.name === operationInputPrefix[2],
    );
    return result(
      operation?.input && operation.input.kind !== 'void'
        ? [
            {
              label: 'with',
              apply: 'with { }',
              cursorOffset: 7,
              kind: 'keyword',
              detail: 'Structured input',
            },
          ]
        : [],
    );
  }
  const syntax = dialect.parse(document).syntax.expression;
  if (syntax?.kind === 'entity-mutation' && syntax.entity) {
    const entity = application.entities.find(candidate => candidate.name === syntax.entity?.text);
    if (entity) {
      const affordance = application.commands
        ?.find(command => command.entityName === entity.name)
        ?.affordances?.find(candidate => candidate.action === syntax.action);
      const locator =
        entity.fields.find(field => field.type === 'id') ??
        entity.fields.find(field => field.name === 'id') ??
        entity.fields[0];
      if (syntax.target && locator && pos > syntax.target.from && pos < syntax.target.to) {
        const completion = completeStructuredInput(
          document,
          pos,
          syntax.target.from,
          affordance?.target?.exact.locator ?? reflectedObjectDescriptor(entity, [locator]),
        );
        if (completion) return completion;
      }
      if (syntax.values && pos > syntax.values.from && pos < syntax.values.to) {
        const fields =
          syntax.action === 'update'
            ? entity.fields.filter(field => field.type !== 'id')
            : entity.fields;
        const completion = completeStructuredInput(
          document,
          pos,
          syntax.values.from,
          affordance?.values ?? reflectedObjectDescriptor(entity, fields),
        );
        if (completion) return completion;
      }
      const filter = syntax.steps.find(step => step.kind === 'filter');
      if (filter?.kind === 'filter') {
        const from = filter.whereOpen?.to ?? filter.where?.to;
        const to = filter.whereClose?.from ?? filter.to;
        if (from !== undefined && pos >= from && pos <= to) {
          const completion = completeSelectionDocument(
            document.slice(from, to),
            pos - from,
            entity,
            affordance?.target?.selection
              ? {
                  fields: Object.entries(affordance.target.selection.fields).map(
                    ([name, field]) => ({ name, operators: field.operators }),
                  ),
                  ...(affordance.target.selection.allowAll ? { allowAll: true as const } : {}),
                }
              : undefined,
          );
          return {
            from: from + completion.from,
            to: from + completion.to,
            items: completion.items,
          };
        }
      }
      if (
        syntax.action === 'update' &&
        filter?.kind === 'filter' &&
        filter.selection &&
        !syntax.values &&
        pos >= filter.to
      ) {
        return result([
          {
            label: 'with',
            apply: 'with { }',
            cursorOffset: 7,
            kind: 'keyword',
            detail: 'Entity update values',
          },
        ]);
      }
    }
  }
  if (syntax?.kind === 'operation' && syntax.input && syntax.entity && syntax.operation) {
    const operation = application.operations?.find(
      candidate =>
        candidate.entityName === syntax.entity?.text && candidate.name === syntax.operation?.text,
    );
    if (operation?.input) {
      const completion = completeStructuredInput(document, pos, syntax.input.from, operation.input);
      if (completion) return completion;
    }
  }
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
