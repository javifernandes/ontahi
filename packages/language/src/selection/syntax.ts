import type { SyntaxNode, SyntaxNodeRef, Tree } from '@lezer/common';

import { parser } from '../generated/selection-parser.js';
import type {
  SelectionLanguageRange,
  SelectionLanguageDiagnostic,
  SelectionLanguageToken,
  SelectionScalarLiteralSyntax,
  SelectionListLiteralSyntax,
  SelectionPredicateOperatorSyntax,
  SelectionPredicateSyntax,
  SelectionParenthesizedSyntax,
  SelectionExpressionSyntax,
  SelectionDocumentSyntax,
  SelectionDocumentParseResult,
} from '../model/contracts.js';
const selectionDocumentParser = parser.configure({ top: 'SelectionDocument' });

export const rangeOf = (node: SyntaxNode | SyntaxNodeRef): SelectionLanguageRange => ({
  from: node.from,
  to: node.to,
});

export const tokenOf = <TKind extends string>(
  kind: TKind,
  node: SyntaxNode | null,
  document: string,
): SelectionLanguageToken<TKind> | undefined =>
  node
    ? {
        kind,
        ...rangeOf(node),
        text: document.slice(node.from, node.to),
      }
    : undefined;

export const firstChildNamed = (node: SyntaxNode, names: readonly string[]) => {
  for (const name of names) {
    const child = node.getChild(name);
    if (child) return child;
  }
  return null;
};

export const scalarLiteralSyntax = (
  node: SyntaxNode | null,
  document: string,
): SelectionScalarLiteralSyntax | undefined => {
  if (!node) return undefined;

  const booleanNode = node.getChild('BooleanLiteral');
  if (booleanNode) {
    const valueNode = firstChildNamed(booleanNode, ['True', 'False']);
    const token = tokenOf('boolean-literal', valueNode, document);
    return token ? { ...token, value: token.text === 'true' } : undefined;
  }

  const stringNode = node.getChild('StringLiteral');
  if (stringNode) {
    const token = tokenOf('string-literal', stringNode, document)!;
    try {
      const value: unknown = JSON.parse(token.text);
      return typeof value === 'string' ? { ...token, value } : token;
    } catch {
      return token;
    }
  }

  const numberNode = node.getChild('NumberLiteral');
  if (numberNode) {
    const token = tokenOf('number-literal', numberNode, document)!;
    return { ...token, value: Number(token.text) };
  }

  return undefined;
};

export const listLiteralSyntax = (
  node: SyntaxNode | null,
  document: string,
): SelectionListLiteralSyntax | undefined =>
  node
    ? {
        kind: 'list-literal',
        ...rangeOf(node),
        open: tokenOf('open-bracket', node.getChild('OpenBracket'), document),
        values: node
          .getChildren('ScalarLiteral')
          .flatMap(child => scalarLiteralSyntax(child, document) ?? []),
        commas: node.getChildren('Comma').flatMap(child => tokenOf('comma', child, document) ?? []),
        close: tokenOf('close-bracket', node.getChild('CloseBracket'), document),
      }
    : undefined;

export const predicateOperatorSyntax = (
  node: SyntaxNode,
  document: string,
): SelectionPredicateOperatorSyntax | undefined => {
  const equals = node.getChild('Equals');
  if (equals) return { ...tokenOf('predicate-operator', equals, document)!, operator: 'eq' };

  const membership = node.getChild('In');
  if (membership) {
    return { ...tokenOf('predicate-operator', membership, document)!, operator: 'in' };
  }

  const is = node.getChild('Is');
  const nullNode = node.getChild('Null');
  if (is && nullNode) {
    return {
      kind: 'predicate-operator',
      operator: 'isNull',
      from: is.from,
      to: nullNode.to,
      text: document.slice(is.from, nullNode.to),
    };
  }

  const comparison = node.getChild('ComparisonOperator');
  if (!comparison) return undefined;
  const comparisonOperator = {
    '<': 'lt',
    '<=': 'lte',
    '>': 'gt',
    '>=': 'gte',
  }[document.slice(comparison.from, comparison.to)] as 'lt' | 'lte' | 'gt' | 'gte' | undefined;
  return comparisonOperator
    ? {
        ...tokenOf('predicate-operator', comparison, document)!,
        operator: comparisonOperator,
      }
    : undefined;
};

export const predicateSyntax = (node: SyntaxNode, document: string): SelectionPredicateSyntax => {
  const predicateNode =
    firstChildNamed(node, [
      'EqualityPredicate',
      'MembershipPredicate',
      'NullPredicate',
      'ComparisonPredicate',
    ]) ?? node;
  const membership = predicateNode.type.name === 'MembershipPredicate';
  return {
    kind: 'predicate',
    ...rangeOf(predicateNode),
    field: tokenOf('field-name', predicateNode.getChild('FieldName'), document),
    operator: predicateOperatorSyntax(predicateNode, document),
    value: membership
      ? listLiteralSyntax(predicateNode.getChild('ListLiteral'), document)
      : scalarLiteralSyntax(predicateNode.getChild('ScalarLiteral'), document),
  };
};

export const parenthesizedSyntax = (
  node: SyntaxNode,
  document: string,
): SelectionParenthesizedSyntax => ({
  kind: 'parenthesized',
  ...rangeOf(node),
  open: tokenOf('open-parenthesis', node.getChild('OpenParen'), document),
  expression: expressionSyntax(node.getChild('OrExpression'), document),
  close: tokenOf('close-parenthesis', node.getChild('CloseParen'), document),
});

export const primaryExpressionSyntax = (
  node: SyntaxNode | null,
  document: string,
): SelectionExpressionSyntax | undefined => {
  if (!node) return undefined;

  const all = node.getChild('All');
  if (all) return tokenOf('all', all, document);
  const none = node.getChild('None');
  if (none) return tokenOf('none', none, document);
  const predicate = node.getChild('Predicate');
  if (predicate) return predicateSyntax(predicate, document);
  const parenthesized = node.getChild('ParenthesizedExpression');
  return parenthesized ? parenthesizedSyntax(parenthesized, document) : undefined;
};

export const notExpressionSyntax = (
  node: SyntaxNode,
  document: string,
): SelectionExpressionSyntax | undefined => {
  let expression = primaryExpressionSyntax(node.getChild('PrimaryExpression'), document);
  const operators = node.getChildren('Not');

  for (let index = operators.length - 1; index >= 0; index -= 1) {
    const operatorNode = operators[index]!;
    const operator = tokenOf('not', operatorNode, document)!;
    expression = {
      kind: 'not',
      from: operator.from,
      to: expression?.to ?? node.to,
      operator,
      ...(expression ? { operand: expression } : {}),
    };
  }

  return expression;
};

export const andExpressionSyntax = (
  node: SyntaxNode,
  document: string,
): SelectionExpressionSyntax | undefined => {
  const operands = node
    .getChildren('NotExpression')
    .flatMap(child => notExpressionSyntax(child, document) ?? []);
  const operators = node.getChildren('And').flatMap(child => tokenOf('and', child, document) ?? []);

  return operators.length > 0
    ? { kind: 'and', ...rangeOf(node), operands, operators }
    : operands[0];
};

export const expressionSyntax = (
  node: SyntaxNode | null,
  document: string,
): SelectionExpressionSyntax | undefined => {
  if (!node) return undefined;
  const operands = node
    .getChildren('AndExpression')
    .flatMap(child => andExpressionSyntax(child, document) ?? []);
  const operators = node.getChildren('Or').flatMap(child => tokenOf('or', child, document) ?? []);

  return operators.length > 0 ? { kind: 'or', ...rangeOf(node), operands, operators } : operands[0];
};

export const syntaxFromTree = (document: string, tree: Tree): SelectionDocumentSyntax => ({
  kind: 'selection-document',
  from: 0,
  to: document.length,
  expression: expressionSyntax(tree.topNode.getChild('OrExpression'), document),
});

export const visitExpression = (
  expression: SelectionExpressionSyntax | undefined,
  visit: (expression: SelectionExpressionSyntax) => void,
): void => {
  if (!expression) return;
  visit(expression);
  if (expression.kind === 'and' || expression.kind === 'or') {
    expression.operands.forEach(operand => visitExpression(operand, visit));
  } else if (expression.kind === 'not') {
    visitExpression(expression.operand, visit);
  } else if (expression.kind === 'parenthesized') {
    visitExpression(expression.expression, visit);
  }
};

export const expressionHas = (
  expression: SelectionExpressionSyntax | undefined,
  predicate: (expression: SelectionExpressionSyntax) => boolean,
) => {
  let found = false;
  visitExpression(expression, candidate => {
    if (predicate(candidate)) found = true;
  });
  return found;
};

export const syntaxDiagnosticMessage = (document: string, syntax: SelectionDocumentSyntax) => {
  if (
    expressionHas(
      syntax.expression,
      expression =>
        expression.kind === 'predicate' &&
        expression.value?.kind === 'list-literal' &&
        !expression.value.close,
    )
  ) {
    return 'Expected a literal or "]" to complete the list.';
  }
  if (
    expressionHas(
      syntax.expression,
      expression =>
        expression.kind === 'predicate' && Boolean(expression.field) && !expression.operator,
    )
  ) {
    return /\bis\s*$/.test(document)
      ? 'Expected "null" after is.'
      : 'Expected a Selection operator after the Field name.';
  }
  if (
    expressionHas(
      syntax.expression,
      expression =>
        expression.kind === 'predicate' &&
        expression.operator?.operator === 'in' &&
        !expression.value,
    )
  ) {
    return 'Expected a bracketed list literal after in.';
  }
  if (
    expressionHas(
      syntax.expression,
      expression =>
        expression.kind === 'predicate' &&
        expression.operator?.operator !== 'isNull' &&
        !expression.value,
    )
  ) {
    return 'Expected a string, number, or Boolean literal.';
  }
  if (
    expressionHas(
      syntax.expression,
      expression => expression.kind === 'parenthesized' && !expression.close,
    )
  ) {
    return 'Expected ")" to close the Selection expression.';
  }
  if (
    expressionHas(
      syntax.expression,
      expression =>
        (expression.kind === 'and' || expression.kind === 'or') &&
        expression.operands.length <= expression.operators.length,
    ) ||
    expressionHas(syntax.expression, expression => expression.kind === 'not' && !expression.operand)
  ) {
    return 'Expected a Selection expression.';
  }
  if (!syntax.expression) {
    return 'Expected all, none, a predicate, not, or a parenthesized Selection expression.';
  }
  return 'The Selection expression is invalid.';
};

export const invalidStringRanges = (syntax: SelectionDocumentSyntax) => {
  const ranges: SelectionLanguageRange[] = [];
  visitExpression(syntax.expression, expression => {
    if (expression.kind !== 'predicate' || !expression.value) return;
    const values =
      expression.value.kind === 'list-literal' ? expression.value.values : [expression.value];
    for (const value of values) {
      if (value.kind === 'string-literal' && value.value === undefined) ranges.push(value);
    }
  });
  return ranges;
};

export const syntaxDiagnosticsFromTree = (
  document: string,
  tree: Tree,
  syntax: SelectionDocumentSyntax,
): readonly SelectionLanguageDiagnostic[] => {
  if (document.trim().length === 0) return [];

  const diagnostics = new Map<string, SelectionLanguageDiagnostic>();
  tree.iterate({
    enter(node) {
      if (!node.type.isError) return;
      const range = rangeOf(node);
      diagnostics.set(`${range.from}:${range.to}`, {
        channel: 'syntax',
        code: 'selection.syntax.invalid',
        message: syntaxDiagnosticMessage(document, syntax),
        ...range,
      });
    },
  });
  for (const range of invalidStringRanges(syntax)) {
    diagnostics.set(`${range.from}:${range.to}`, {
      channel: 'syntax',
      code: 'selection.syntax.invalid',
      message: 'String literals must use valid JSON escaping.',
      from: range.from,
      to: range.to,
    });
  }

  return [...diagnostics.values()];
};

export const parseSelectionDocument = (document: string): SelectionDocumentParseResult => {
  const tree = selectionDocumentParser.parse(document);
  const syntax = syntaxFromTree(document, tree);
  return {
    syntax,
    syntaxDiagnostics: syntaxDiagnosticsFromTree(document, tree, syntax),
  };
};
