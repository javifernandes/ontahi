import {
  selectionAll,
  selectionAnd,
  type GraphReadRequest,
  type SelectionExpression,
} from '@ontahi/core/data-graph';

import type { Dialect } from '../dialects/contract.js';
import type {
  ConsoleDocumentParseResult,
  SelectionLanguageFieldReflection,
  SelectionLanguageEntityReflection,
  ConsoleLanguageApplicationReflection,
  ConsoleLanguageDiagnostic,
  ConsoleGraphReadSyntax,
  ConsoleDocumentAnalysis,
  ConsoleDocumentAnalysisOptions,
} from '../model/contracts.js';
import { resolveExpression } from '../selection/semantics.js';

import { consoleNavigationTarget } from './context.js';
import { resolveConsoleFactory } from './factories.js';

export const analyzeConsoleSyntax = (
  parsed: ConsoleDocumentParseResult,
  application: ConsoleLanguageApplicationReflection,
  options: ConsoleDocumentAnalysisOptions,
  dialect: Dialect,
): ConsoleDocumentAnalysis => {
  const expression = parsed.syntax.expression;
  if (
    parsed.syntaxDiagnostics.length > 0 ||
    !expression?.entity ||
    (!expression.terminal && !dialect.implicitMany)
  ) {
    return { ...parsed, semanticDiagnostics: [] };
  }

  const root = application.entities.find(candidate => candidate.name === expression.entity?.text);
  if (!root) {
    return {
      ...parsed,
      semanticDiagnostics: [
        {
          channel: 'semantic',
          code: 'console.semantic.unknown-entity',
          message: `Unknown Entity ${expression.entity.text}.`,
          from: expression.entity.from,
          to: expression.entity.to,
        },
      ],
    };
  }

  let entity: SelectionLanguageEntityReflection = root;
  let membership: SelectionExpression = selectionAll();
  const semanticDiagnostics: ConsoleLanguageDiagnostic[] = [];
  for (const step of expression.steps) {
    if (step.kind === 'filter') {
      if (!step.selection) return { ...parsed, semanticDiagnostics };
      const resolved = resolveExpression(step.selection, entity);
      semanticDiagnostics.push(...resolved.diagnostics);
      if (!resolved.expression) return { ...parsed, semanticDiagnostics };
      membership = selectionAnd(membership, resolved.expression);
    } else if (step.kind === 'factory') {
      try {
        membership = selectionAnd(
          membership,
          resolveConsoleFactory(
            step,
            entity.variant?.baseEntityName ?? entity.name,
            entity.selectionFactories,
          ),
        );
      } catch (cause) {
        return {
          ...parsed,
          semanticDiagnostics: [
            ...semanticDiagnostics,
            {
              from: step.from,
              to: step.to,
              channel: 'semantic',
              code: 'console.semantic.invalid-factory',
              message: cause instanceof Error ? cause.message : 'Invalid Selection factory input.',
            },
          ],
        };
      }
    } else {
      const target = step.name && consoleNavigationTarget(entity, step.name.text, application);
      if (!target)
        return {
          ...parsed,
          semanticDiagnostics: [
            ...semanticDiagnostics,
            {
              from: step.from,
              to: step.to,
              channel: 'semantic',
              code: 'console.semantic.invalid-navigation',
              message: `Unknown or unavailable contextual Selection ${entity.name}.${step.name?.text ?? ''}.`,
            },
          ],
        };
      membership = selectionAnd(
        {
          kind: 'relation-image',
          source: { kind: 'selection', entityName: entity.name, expression: membership },
          relationName: target.descriptor.template.relationName,
        },
        structuredClone(target.descriptor.template.target.expression),
      );
      entity = target.entity;
    }
  }
  semanticDiagnostics.push(
    ...consoleOrderDiagnostics(expression, entity, dialect),
    ...consoleLimitDiagnostics(expression, dialect),
  );
  if (semanticDiagnostics.length) return { ...parsed, semanticDiagnostics };
  const order = expression.orderBy;
  return {
    ...parsed,
    semanticDiagnostics,
    request: {
      version: expression.navigations.length ? 2 : 1,
      kind: 'graph-read',
      ...consoleTerminalRequest(
        expression.terminal?.kind ?? 'many-member',
        expression.limitValue?.value ?? options.limit ?? 25,
      ),
      selection: {
        kind: 'selection',
        entityName: entity.name,
        expression: membership,
      },
      orderBy: order?.field
        ? [
            {
              fieldName: order.field.text,
              direction: order.direction?.text === dialect.directions[1] ? 'desc' : 'asc',
            },
          ]
        : [],
    },
  };
};

export const consoleOrderDiagnostics = (
  expression: ConsoleGraphReadSyntax,
  entity: SelectionLanguageEntityReflection,
  dialect: Dialect,
): ConsoleLanguageDiagnostic[] => {
  const diagnostics: ConsoleLanguageDiagnostic[] = [];
  const order = expression.orderBy;
  if (
    order?.field &&
    !entity.fields.some(field => field.name === order.field?.text && isConsoleOrderableField(field))
  ) {
    diagnostics.push({
      channel: 'semantic',
      code: 'console.semantic.invalid-order-field',
      message: `Order by a scalar Field of ${entity.name}; ${order.field.text} is not supported.`,
      from: order.field.from,
      to: order.field.to,
    });
  }
  const directions: readonly string[] = dialect.directions;
  if (order?.direction && !directions.includes(order.direction.text)) {
    diagnostics.push({
      channel: 'semantic',
      code: 'console.semantic.invalid-order-direction',
      message: `Order direction must be ${directions.join(' or ')}.`,
      from: order.direction.from,
      to: order.direction.to,
    });
  }
  if (
    order &&
    expression.terminal &&
    ['count-member', 'exists-member'].includes(expression.terminal.kind)
  ) {
    diagnostics.push({
      channel: 'semantic',
      code: 'console.semantic.unsupported-order',
      message: dialect.unsupportedOrder(expression.terminal.text),
      from: order.from,
      to: order.to,
    });
  }
  return diagnostics;
};

export const consoleLimitDiagnostics = (
  expression: ConsoleGraphReadSyntax,
  dialect: Dialect,
): ConsoleLanguageDiagnostic[] => {
  const diagnostics: ConsoleLanguageDiagnostic[] = [];
  if (
    expression.limitValue &&
    (!Number.isInteger(expression.limitValue.value) || expression.limitValue.value < 0)
  ) {
    diagnostics.push({
      channel: 'semantic',
      code: 'console.semantic.invalid-limit',
      message: 'Console Graph Read limit must be a non-negative integer.',
      from: expression.limitValue.from,
      to: expression.limitValue.to,
    });
  }
  if (expression.limit && (expression.terminal?.kind ?? 'many-member') !== 'many-member') {
    diagnostics.push({
      channel: 'semantic',
      code: 'console.semantic.unsupported-limit',
      message: dialect.unsupportedLimit,
      from: expression.limit.from,
      to: expression.limitClose?.to ?? expression.limit.to,
    });
  }
  return diagnostics;
};

export const consoleTerminalRequest = (
  terminal: NonNullable<ConsoleGraphReadSyntax['terminal']>['kind'],
  limit: number,
): Pick<GraphReadRequest, 'mode' | 'limit' | 'cardinality'> => {
  switch (terminal) {
    case 'many-member':
      return { mode: 'run', limit, cardinality: 'many' };
    case 'count-member':
      return { mode: 'count' };
    case 'exists-member':
      return { mode: 'get', limit: 1 };
    case 'one-member':
      return { mode: 'get', limit, cardinality: 'one' };
    case 'first-member':
      return { mode: 'get', limit };
  }
};

/** Fields with scalar ordering semantics. Runtime read policies remain authoritative. */
export const isConsoleOrderableField = (field: SelectionLanguageFieldReflection): boolean =>
  ['id', 'string', 'number', 'boolean', 'enum'].includes(field.type);
