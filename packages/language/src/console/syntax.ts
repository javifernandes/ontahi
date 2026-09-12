import type { SyntaxNode, Tree } from '@lezer/common';

import type { Dialect } from '../dialects/contract.js';
import type {
  SelectionLanguageRange,
  SelectionDocumentSyntax,
  ConsoleLanguageDiagnostic,
  ConsoleOrderBySyntax,
  ConsoleGraphReadSyntax,
  ConsoleDocumentSyntax,
  ConsoleDocumentParseResult,
} from '../model/contracts.js';
import {
  rangeOf,
  tokenOf,
  firstChildNamed,
  expressionSyntax,
  syntaxDiagnosticMessage,
  invalidStringRanges,
} from '../selection/syntax.js';

import { parseConsoleFactory } from './factories.js';

export const consoleTerminalToken = (terminal: SyntaxNode | null | undefined, document: string) => {
  for (const [nodeName, kind] of [
    ['First', 'first-member'],
    ['One', 'one-member'],
    ['Many', 'many-member'],
    ['Count', 'count-member'],
    ['Exists', 'exists-member'],
  ] as const) {
    const node = terminal?.getChild(nodeName);
    if (node) return tokenOf(kind, node, document);
  }
  return undefined;
};

export const consoleSyntaxFromTree = (document: string, tree: Tree): ConsoleDocumentSyntax => {
  const consoleExpression = tree.topNode.getChild('ConsoleExpression');
  const graphRead =
    consoleExpression?.getChild('GraphReadExpression') ??
    tree.topNode.getChild('DeclarativeGraphReadExpression');
  if (!graphRead) {
    return { kind: 'console-document', from: 0, to: document.length };
  }

  const whereClause = firstChildNamed(graphRead, ['WhereClause', 'DeclarativeWhereClause']);
  const orderClause = firstChildNamed(graphRead, ['OrderByClause', 'DeclarativeOrderByClause']);
  const limitClause = firstChildNamed(graphRead, ['LimitClause', 'DeclarativeLimitClause']);
  const readTerminal = graphRead.getChild('ReadTerminal');
  const limitValueToken = tokenOf(
    'number-literal',
    limitClause?.getChild('NumberLiteral') ?? null,
    document,
  );
  return {
    kind: 'console-document',
    from: 0,
    to: document.length,
    expression: {
      kind: 'graph-read',
      ...rangeOf(graphRead),
      factories: [
        ...graphRead.getChildren('FactoryClause'),
        ...graphRead.getChildren('DeclarativeFactoryClause'),
        ...graphRead.getChildren('DeclarativeFactoryIntersection'),
      ].map(node => parseConsoleFactory(node, document)!),
      navigations: [
        ...graphRead.getChildren('NavigationClause'),
        ...graphRead.getChildren('DeclarativeNavigationClause'),
      ].map(node => ({
        ...rangeOf(node),
        name: tokenOf('navigation-name', node.getChild('NavigationName'), document),
      })),
      entity: tokenOf('entity-name', graphRead.getChild('EntityName'), document),
      where: tokenOf('where-member', whereClause?.getChild('Where') ?? null, document),
      whereOpen: tokenOf('open-parenthesis', whereClause?.getChild('OpenParen') ?? null, document),
      selection: expressionSyntax(whereClause?.getChild('OrExpression') ?? null, document),
      whereClose: tokenOf(
        'close-parenthesis',
        whereClause?.getChild('CloseParen') ?? null,
        document,
      ),
      orderBy: orderClause
        ? {
            ...rangeOf(orderClause),
            by: tokenOf('by-keyword', orderClause.getChild('By'), document),
            open: tokenOf('open-parenthesis', orderClause.getChild('OpenParen'), document),
            field: tokenOf('field-name', orderClause.getChild('FieldName'), document),
            comma: tokenOf('comma', orderClause.getChild('Comma'), document),
            direction: tokenOf(
              'order-direction',
              firstChildNamed(orderClause, ['OrderDirection', 'DeclarativeOrderDirection']),
              document,
            ),
            close: tokenOf('close-parenthesis', orderClause.getChild('CloseParen'), document),
          }
        : undefined,
      limit: tokenOf('limit-member', limitClause?.getChild('Limit') ?? null, document),
      limitOpen: tokenOf('open-parenthesis', limitClause?.getChild('OpenParen') ?? null, document),
      limitValue: limitValueToken
        ? { ...limitValueToken, value: Number(limitValueToken.text) }
        : undefined,
      limitClose: tokenOf(
        'close-parenthesis',
        limitClause?.getChild('CloseParen') ?? null,
        document,
      ),
      terminal: consoleTerminalToken(readTerminal, document),
      terminalOpen: tokenOf('open-parenthesis', graphRead.getChild('OpenParen'), document),
      terminalClose: tokenOf('close-parenthesis', graphRead.getChild('CloseParen'), document),
    },
  };
};

export const consoleOrderStructureDiagnostic = (order: ConsoleOrderBySyntax | undefined) => {
  if (!order) return undefined;
  if (!order.open) return 'Expected "(" after .orderBy.';
  if (!order.field) return 'Expected a Field name inside .orderBy(...).';
  if (order.comma && !order.direction) return 'Expected asc or desc after the ordering Field.';
  if (!order.close) return 'Expected ")" to close .orderBy(...).';
  return undefined;
};

export const consoleLimitStructureDiagnostic = (expression: ConsoleGraphReadSyntax) => {
  if (expression.limit && !expression.limitOpen) return 'Expected "(" after .limit.';
  if (expression.limit && !expression.limitValue) {
    return 'Expected a numeric row limit inside .limit(...).';
  }
  if (expression.limit && !expression.limitClose) return 'Expected ")" to close .limit(...).';
  return undefined;
};

export const consoleTerminalStructureDiagnostic = (expression: ConsoleGraphReadSyntax) => {
  if (!expression.terminal) {
    if (expression.limitClose) {
      return 'Expected .many() after .limit(...).';
    }
    if (expression.orderBy?.close)
      return 'Expected .limit(...), .first(), .one(), or .many() after .orderBy(...).';
    return expression.whereClose
      ? 'Expected .orderBy(...), .limit(...), .first(), .one(), .many(), .count(), or .exists() after the Selection expression.'
      : `Expected .where(...), .orderBy(...), .limit(...), .first(), .one(), .many(), .count(), or .exists() after ${expression.entity?.text}.`;
  }
  if (!expression.terminalOpen || !expression.terminalClose) {
    return `Expected an empty argument list after .${expression.terminal.text}.`;
  }
  return 'The Console expression is invalid.';
};

export const consoleStructureDiagnosticMessage = (syntax: ConsoleDocumentSyntax) => {
  const expression = syntax.expression;
  if (!expression?.entity) return 'Expected an Entity name to begin the Console expression.';
  if (expression.where && !expression.whereOpen) return 'Expected "(" after .where.';
  if (expression.where && !expression.whereClose)
    return 'Expected ")" to close the Selection expression.';
  return (
    consoleOrderStructureDiagnostic(expression.orderBy) ??
    consoleLimitStructureDiagnostic(expression) ??
    consoleTerminalStructureDiagnostic(expression)
  );
};

export const consoleStructureComplete = (syntax: ConsoleDocumentSyntax) => {
  const expression = syntax.expression;
  return Boolean(
    expression?.entity &&
    (!expression.where || (expression.whereOpen && expression.whereClose)) &&
    (!expression.orderBy ||
      (expression.orderBy.open &&
        expression.orderBy.field &&
        expression.orderBy.close &&
        (!expression.orderBy.comma || expression.orderBy.direction))) &&
    (!expression.limit ||
      (expression.limitOpen && expression.limitValue && expression.limitClose)) &&
    expression.terminal &&
    expression.terminalOpen &&
    expression.terminalClose,
  );
};

export const firstErrorRange = (tree: Tree): SelectionLanguageRange | undefined => {
  let error: SelectionLanguageRange | undefined;
  tree.iterate({
    enter(node) {
      if (!error && node.type.isError) error = rangeOf(node);
    },
  });
  return error;
};

export const parseConsoleSyntax = (
  document: string,
  dialect: Dialect,
): ConsoleDocumentParseResult => {
  const tree = dialect.parser.parse(document);
  const syntax = consoleSyntaxFromTree(document, tree);
  if (document.trim().length === 0) return { syntax, syntaxDiagnostics: [] };

  const error = firstErrorRange(tree);
  const invalidStrings = invalidStringRanges({
    kind: 'selection-document',
    from: 0,
    to: document.length,
    expression: syntax.expression?.selection,
  });
  const syntaxDiagnostics: ConsoleLanguageDiagnostic[] = invalidStrings.map(range => ({
    channel: 'syntax',
    code: 'selection.syntax.invalid',
    message: 'String literals must use valid JSON escaping.',
    ...range,
  }));
  for (const factory of syntax.expression?.factories ?? [])
    if (factory.error)
      syntaxDiagnostics.push({
        from: factory.from,
        to: factory.to,
        channel: 'syntax',
        code: 'console.syntax.invalid',
        message: factory.error,
      });

  if (error) {
    const expression = syntax.expression;
    const isSelectionError =
      consoleStructureComplete(syntax) &&
      expression?.whereOpen &&
      expression.whereClose &&
      error.from >= expression.whereOpen.to &&
      error.to <= expression.whereClose.from;
    const selectionSyntax: SelectionDocumentSyntax = {
      kind: 'selection-document',
      from: 0,
      to: document.length,
      expression: syntax.expression?.selection,
    };
    syntaxDiagnostics.unshift({
      channel: 'syntax',
      code: isSelectionError ? 'selection.syntax.invalid' : 'console.syntax.invalid',
      message: isSelectionError
        ? syntaxDiagnosticMessage(document, selectionSyntax)
        : dialect.syntaxError(syntax),
      ...error,
    });
  }

  return { syntax, syntaxDiagnostics };
};
