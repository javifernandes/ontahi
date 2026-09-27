import {
  selectionAll,
  selectionAnd,
  toGraphCommandRequest,
  type GraphReadRequest,
  type SelectionExpression,
} from '@ontahi/core/data-graph';
import { toOperationProtocolRequest } from '@ontahi/core/runtime/protocol';

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
import { normalizeStructuredInput } from './structured-value.js';

const diagnostic = (
  parsed: ConsoleDocumentParseResult,
  expression: NonNullable<ConsoleDocumentParseResult['syntax']['expression']>,
  code:
    | 'console.semantic.unknown-operation'
    | 'console.semantic.invalid-input'
    | 'console.semantic.invalid-command',
  message: string,
): ConsoleDocumentAnalysis => ({
  ...parsed,
  semanticDiagnostics: [
    { channel: 'semantic', code, message, from: expression.from, to: expression.to },
  ],
});

export const analyzeConsoleSyntax = (
  parsed: ConsoleDocumentParseResult,
  application: ConsoleLanguageApplicationReflection,
  options: ConsoleDocumentAnalysisOptions,
  dialect: Dialect,
): ConsoleDocumentAnalysis => {
  const expression = parsed.syntax.expression;
  if (parsed.syntaxDiagnostics.length > 0 || !expression?.entity) {
    return { ...parsed, semanticDiagnostics: [] };
  }

  if (expression.kind === 'operation') {
    const operationId = `${expression.entity.text}.${expression.operation?.text ?? ''}`;
    const operation = application.operations?.find(candidate => candidate.id === operationId);
    if (!operation)
      return diagnostic(
        parsed,
        expression,
        'console.semantic.unknown-operation',
        `Unknown Operation ${operationId}.`,
      );
    const acceptsInput = operation.input !== undefined && operation.input.kind !== 'void';
    if (acceptsInput && !expression.input)
      return diagnostic(
        parsed,
        expression,
        'console.semantic.invalid-input',
        `${operationId} requires structured input.`,
      );
    if (!acceptsInput && expression.input)
      return diagnostic(
        parsed,
        expression,
        'console.semantic.invalid-input',
        `${operationId} does not accept input.`,
      );
    const input = normalizeStructuredInput(expression.inputValue, operation.input);
    try {
      return {
        ...parsed,
        semanticDiagnostics: [],
        execution: {
          family: 'operation',
          body: toOperationProtocolRequest({
            kind: 'invoke',
            operationId,
            ...(expression.input ? { input: input as never } : {}),
          }),
        },
      };
    } catch {
      return diagnostic(
        parsed,
        expression,
        'console.semantic.invalid-input',
        `${operationId} input cannot be represented by the Runtime Protocol.`,
      );
    }
  }

  if (expression.kind === 'entity-mutation') {
    const entityName = expression.entity.text;
    const entity = application.entities.find(candidate => candidate.name === entityName);
    if (!entity)
      return diagnostic(
        parsed,
        expression,
        'console.semantic.invalid-command',
        `Unknown Entity ${entityName}.`,
      );
    const selectionMutation = expression.action !== 'create' && expression.steps.length > 0;
    const commandReflection = application.commands?.find(
      candidate => candidate.entityName === entityName,
    );
    if (
      !expression.action ||
      !(selectionMutation
        ? commandReflection?.selectionActions?.includes(expression.action as 'update' | 'delete')
        : commandReflection?.actions.includes(expression.action))
    )
      return diagnostic(
        parsed,
        expression,
        'console.semantic.invalid-command',
        `Entity Command ${entityName}.${expression.action ?? ''} is not available.`,
      );
    let selection: SelectionExpression | undefined;
    if (selectionMutation) {
      const filter = expression.steps[0];
      if (filter?.kind !== 'filter' || !filter.selection)
        return diagnostic(
          parsed,
          expression,
          'console.semantic.invalid-command',
          'Entity Selection Command requires a complete where predicate.',
        );
      const resolved = resolveExpression(filter.selection, entity);
      if (!resolved.expression || resolved.diagnostics.length)
        return { ...parsed, semanticDiagnostics: resolved.diagnostics };
      selection = resolved.expression;
    }
    const target = expression.targetValue;
    if (
      expression.action !== 'create' &&
      !selectionMutation &&
      (!target || typeof target !== 'object' || Array.isArray(target))
    )
      return diagnostic(
        parsed,
        expression,
        'console.semantic.invalid-command',
        'Entity Command target must be an object locator.',
      );
    const command =
      expression.action === 'create'
        ? {
            kind: 'entity-mutation-command' as const,
            action: 'create' as const,
            entityName,
            values: expression.valuesValue as Record<string, unknown>,
          }
        : expression.action === 'update'
          ? {
              kind: 'entity-mutation-command' as const,
              action: 'update' as const,
              entityName,
              target: selection
                ? { kind: 'selection' as const, entityName, expression: selection }
                : {
                    kind: 'entity-ref' as const,
                    entityName,
                    locator: target as Record<string, unknown>,
                  },
              values: expression.valuesValue as Record<string, unknown>,
            }
          : {
              kind: 'entity-mutation-command' as const,
              action: 'delete' as const,
              entityName,
              target: selection
                ? { kind: 'selection' as const, entityName, expression: selection }
                : {
                    kind: 'entity-ref' as const,
                    entityName,
                    locator: target as Record<string, unknown>,
                  },
            };
    try {
      return {
        ...parsed,
        semanticDiagnostics: [],
        execution: { family: 'graph.command', body: toGraphCommandRequest(command as never) },
      };
    } catch {
      return diagnostic(
        parsed,
        expression,
        'console.semantic.invalid-command',
        `Entity Command ${entityName}.${expression.action} cannot be represented by the Runtime Protocol.`,
      );
    }
  }

  if (!expression.terminal && !dialect.implicitMany) return { ...parsed, semanticDiagnostics: [] };

  const entityName = expression.entity.text;
  const root = application.entities.find(candidate => candidate.name === entityName);
  if (!root) {
    const declarativeActionDrafts = [
      ...(['create', 'update', 'delete'] as const).filter(action =>
        application.commands?.some(command => command.actions.includes(action)),
      ),
      ...(application.operations?.length ? ['invoke'] : []),
    ];
    if (
      dialect.id === 'declarative' &&
      declarativeActionDrafts.some(action => action.startsWith(entityName))
    )
      return { ...parsed, semanticDiagnostics: [] };
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
  const request: GraphReadRequest = {
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
  };
  return {
    ...parsed,
    semanticDiagnostics,
    execution: { family: 'graph.read', body: request },
    request,
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
