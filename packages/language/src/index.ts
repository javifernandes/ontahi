import type { SyntaxNode, SyntaxNodeRef, Tree } from '@lezer/common';
import {
  selectionAll,
  selectionAnd,
  selectionNone,
  selectionNot,
  selectionOr,
  type SelectionAst,
  type SelectionExpression,
  type SelectionPredicate,
} from '@ontahi/core/data-graph';

import { parser } from './generated/selection-parser.js';

export type SelectionLanguageRange = {
  readonly from: number;
  readonly to: number;
};

export type SelectionLanguageDiagnostic = SelectionLanguageRange & {
  readonly channel: 'syntax' | 'semantic';
  readonly code:
    | 'selection.syntax.invalid'
    | 'selection.semantic.unknown-field'
    | 'selection.semantic.incompatible-field-type'
    | 'selection.semantic.unsupported-field-type'
    | 'selection.semantic.incompatible-operator'
    | 'selection.semantic.non-nullable-field'
    | 'selection.semantic.unknown-enum-value'
    | 'selection.semantic.non-finite-number'
    | 'selection.semantic.unsupported-relation';
  readonly message: string;
};

export type SelectionLanguageFieldReflection = {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly valueType?: string;
  readonly enumValues?: readonly string[];
  readonly reference?: { readonly entityName: string };
};

export type SelectionLanguageEntityReflection<TEntityName extends string = string> = {
  readonly name: TEntityName;
  readonly fields: readonly SelectionLanguageFieldReflection[];
  readonly relations?: readonly { readonly name: string }[];
};

export type SelectionLanguageToken<TKind extends string> = SelectionLanguageRange & {
  readonly kind: TKind;
  readonly text: string;
};

export type SelectionBooleanLiteralSyntax = SelectionLanguageToken<'boolean-literal'> & {
  readonly value: boolean;
};

export type SelectionStringLiteralSyntax = SelectionLanguageToken<'string-literal'> & {
  readonly value?: string;
};

export type SelectionNumberLiteralSyntax = SelectionLanguageToken<'number-literal'> & {
  readonly value: number;
};

export type SelectionScalarLiteralSyntax =
  | SelectionBooleanLiteralSyntax
  | SelectionStringLiteralSyntax
  | SelectionNumberLiteralSyntax;

export type SelectionListLiteralSyntax = SelectionLanguageRange & {
  readonly kind: 'list-literal';
  readonly open?: SelectionLanguageToken<'open-bracket'>;
  readonly values: readonly SelectionScalarLiteralSyntax[];
  readonly commas: readonly SelectionLanguageToken<'comma'>[];
  readonly close?: SelectionLanguageToken<'close-bracket'>;
};

export type SelectionLanguagePredicateOperator = SelectionPredicate['operator'];

export type SelectionPredicateOperatorSyntax = SelectionLanguageToken<'predicate-operator'> & {
  readonly operator: SelectionLanguagePredicateOperator;
};

export type SelectionPredicateSyntax = SelectionLanguageRange & {
  readonly kind: 'predicate';
  readonly field?: SelectionLanguageToken<'field-name'>;
  readonly operator?: SelectionPredicateOperatorSyntax;
  readonly value?: SelectionScalarLiteralSyntax | SelectionListLiteralSyntax;
};

export type SelectionConstantSyntax =
  | SelectionLanguageToken<'all'>
  | SelectionLanguageToken<'none'>;

export type SelectionNotSyntax = SelectionLanguageRange & {
  readonly kind: 'not';
  readonly operator: SelectionLanguageToken<'not'>;
  readonly operand?: SelectionExpressionSyntax;
};

export type SelectionLogicalSyntax = SelectionLanguageRange & {
  readonly kind: 'and' | 'or';
  readonly operands: readonly SelectionExpressionSyntax[];
  readonly operators: readonly SelectionLanguageToken<'and' | 'or'>[];
};

export type SelectionParenthesizedSyntax = SelectionLanguageRange & {
  readonly kind: 'parenthesized';
  readonly open?: SelectionLanguageToken<'open-parenthesis'>;
  readonly expression?: SelectionExpressionSyntax;
  readonly close?: SelectionLanguageToken<'close-parenthesis'>;
};

export type SelectionExpressionSyntax =
  | SelectionConstantSyntax
  | SelectionPredicateSyntax
  | SelectionNotSyntax
  | SelectionLogicalSyntax
  | SelectionParenthesizedSyntax;

export type SelectionDocumentSyntax = SelectionLanguageRange & {
  readonly kind: 'selection-document';
  readonly expression?: SelectionExpressionSyntax;
};

export type SelectionDocumentParseResult = {
  readonly syntax: SelectionDocumentSyntax;
  readonly syntaxDiagnostics: readonly SelectionLanguageDiagnostic[];
};

export type SelectionDocumentAnalysis<TEntityName extends string = string> =
  SelectionDocumentParseResult & {
    readonly semanticDiagnostics: readonly SelectionLanguageDiagnostic[];
    readonly selection?: SelectionAst<TEntityName>;
  };

const rangeOf = (node: SyntaxNode | SyntaxNodeRef): SelectionLanguageRange => ({
  from: node.from,
  to: node.to,
});

const tokenOf = <TKind extends string>(
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

const firstChildNamed = (node: SyntaxNode, names: readonly string[]) => {
  for (const name of names) {
    const child = node.getChild(name);
    if (child) return child;
  }
  return null;
};

const scalarLiteralSyntax = (
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

const listLiteralSyntax = (
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

const predicateOperatorSyntax = (
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

const predicateSyntax = (node: SyntaxNode, document: string): SelectionPredicateSyntax => {
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

const parenthesizedSyntax = (node: SyntaxNode, document: string): SelectionParenthesizedSyntax => ({
  kind: 'parenthesized',
  ...rangeOf(node),
  open: tokenOf('open-parenthesis', node.getChild('OpenParen'), document),
  expression: expressionSyntax(node.getChild('OrExpression'), document),
  close: tokenOf('close-parenthesis', node.getChild('CloseParen'), document),
});

const primaryExpressionSyntax = (
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

const notExpressionSyntax = (
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

const andExpressionSyntax = (
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

const expressionSyntax = (
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

const syntaxFromTree = (document: string, tree: Tree): SelectionDocumentSyntax => ({
  kind: 'selection-document',
  from: 0,
  to: document.length,
  expression: expressionSyntax(tree.topNode.getChild('OrExpression'), document),
});

const visitExpression = (
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

const expressionHas = (
  expression: SelectionExpressionSyntax | undefined,
  predicate: (expression: SelectionExpressionSyntax) => boolean,
) => {
  let found = false;
  visitExpression(expression, candidate => {
    if (predicate(candidate)) found = true;
  });
  return found;
};

const syntaxDiagnosticMessage = (document: string, syntax: SelectionDocumentSyntax) => {
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

const invalidStringRanges = (syntax: SelectionDocumentSyntax) => {
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

const syntaxDiagnosticsFromTree = (
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
  const tree = parser.parse(document);
  const syntax = syntaxFromTree(document, tree);
  return {
    syntax,
    syntaxDiagnostics: syntaxDiagnosticsFromTree(document, tree, syntax),
  };
};

type SemanticResolution = {
  readonly expression?: SelectionExpression;
  readonly diagnostics: readonly SelectionLanguageDiagnostic[];
};

const semanticDiagnostic = (
  code: Exclude<SelectionLanguageDiagnostic['code'], 'selection.syntax.invalid'>,
  message: string,
  range: SelectionLanguageRange,
): SelectionLanguageDiagnostic => ({
  channel: 'semantic',
  code,
  message,
  from: range.from,
  to: range.to,
});

const supportedFieldType = (field: SelectionLanguageFieldReflection) => {
  const valueType = field.valueType?.toLowerCase();
  if (valueType === 'date' || valueType === 'datetime') return undefined;
  if (field.type === 'enum' || (field.enumValues?.length ?? 0) > 0) return 'enum' as const;
  if (
    field.type === 'boolean' ||
    field.type === 'number' ||
    field.type === 'string' ||
    field.type === 'id'
  ) {
    return field.type;
  }
  return undefined;
};

const literalValue = (
  literal: SelectionScalarLiteralSyntax,
): string | number | boolean | undefined => literal.value;

const literalKindLabel = (literal: SelectionScalarLiteralSyntax) =>
  literal.kind === 'boolean-literal'
    ? 'Boolean'
    : literal.kind === 'number-literal'
      ? 'number'
      : 'string';

const expectedLiteralKind = (fieldType: NonNullable<ReturnType<typeof supportedFieldType>>) =>
  fieldType === 'boolean'
    ? 'boolean-literal'
    : fieldType === 'number'
      ? 'number-literal'
      : 'string-literal';

const expectedLiteralLabel = (fieldType: NonNullable<ReturnType<typeof supportedFieldType>>) =>
  fieldType === 'boolean' ? 'Boolean' : fieldType === 'number' ? 'number' : 'string';

const validateLiteral = (
  literal: SelectionScalarLiteralSyntax,
  field: SelectionLanguageFieldReflection,
  entityName: string,
  fieldType: NonNullable<ReturnType<typeof supportedFieldType>>,
): readonly SelectionLanguageDiagnostic[] => {
  if (literal.kind === 'number-literal' && !Number.isFinite(literal.value)) {
    return [
      semanticDiagnostic(
        'selection.semantic.non-finite-number',
        'Selection number literals must be finite JSON numbers.',
        literal,
      ),
    ];
  }
  if (literal.kind !== expectedLiteralKind(fieldType)) {
    return [
      semanticDiagnostic(
        'selection.semantic.incompatible-field-type',
        `Field ${entityName}.${field.name} expects a ${expectedLiteralLabel(fieldType)} value, received ${literalKindLabel(literal)}.`,
        literal,
      ),
    ];
  }
  if (
    fieldType === 'enum' &&
    literal.kind === 'string-literal' &&
    literal.value !== undefined &&
    field.enumValues &&
    !field.enumValues.includes(literal.value)
  ) {
    return [
      semanticDiagnostic(
        'selection.semantic.unknown-enum-value',
        `Unknown value ${JSON.stringify(literal.value)} for ${entityName}.${field.name}; expected one of ${field.enumValues.map(value => JSON.stringify(value)).join(', ')}.`,
        literal,
      ),
    ];
  }
  return [];
};

const resolvePredicate = (
  syntax: SelectionPredicateSyntax,
  entity: SelectionLanguageEntityReflection,
): SemanticResolution => {
  const { field, operator } = syntax;
  if (!field || !operator) return { diagnostics: [] };

  const reflectedField = entity.fields.find(candidate => candidate.name === field.text);
  if (!reflectedField) {
    if (entity.relations?.some(relation => relation.name === field.text)) {
      return {
        diagnostics: [
          semanticDiagnostic(
            'selection.semantic.unsupported-relation',
            `Relation ${entity.name}.${field.text} predicates are unsupported in this language version.`,
            field,
          ),
        ],
      };
    }
    return {
      diagnostics: [
        semanticDiagnostic(
          'selection.semantic.unknown-field',
          `Unknown Field ${entity.name}.${field.text}.`,
          field,
        ),
      ],
    };
  }

  const fieldType = supportedFieldType(reflectedField);
  if (!fieldType) {
    return {
      diagnostics: [
        semanticDiagnostic(
          'selection.semantic.unsupported-field-type',
          `Field ${entity.name}.${field.text} has unsupported ${reflectedField.valueType ?? reflectedField.type} semantics in this language version.`,
          field,
        ),
      ],
    };
  }

  if (operator.operator === 'isNull') {
    return reflectedField.nullable
      ? {
          diagnostics: [],
          expression: { kind: 'predicate', fieldName: field.text, operator: 'isNull' },
        }
      : {
          diagnostics: [
            semanticDiagnostic(
              'selection.semantic.non-nullable-field',
              `Field ${entity.name}.${field.text} is not nullable.`,
              operator,
            ),
          ],
        };
  }

  const ordering = ['lt', 'lte', 'gt', 'gte'].includes(operator.operator);
  if (ordering && fieldType !== 'number') {
    return {
      diagnostics: [
        semanticDiagnostic(
          'selection.semantic.incompatible-operator',
          `Operator ${operator.text} requires a number Field; ${entity.name}.${field.text} is ${fieldType}.`,
          operator,
        ),
      ],
    };
  }

  const literals =
    operator.operator === 'in' && syntax.value?.kind === 'list-literal'
      ? syntax.value.values
      : syntax.value && syntax.value.kind !== 'list-literal'
        ? [syntax.value]
        : [];
  const diagnostics = literals.flatMap(literal =>
    validateLiteral(literal, reflectedField, entity.name, fieldType),
  );
  if (diagnostics.length > 0 || (operator.operator !== 'in' && literals.length !== 1)) {
    return { diagnostics };
  }

  const values = literals.map(literalValue);
  if (values.some(value => value === undefined)) return { diagnostics };

  if (operator.operator === 'in') {
    return {
      diagnostics,
      expression: { kind: 'predicate', fieldName: field.text, operator: 'in', values },
    };
  }

  return {
    diagnostics,
    expression: {
      kind: 'predicate',
      fieldName: field.text,
      operator: operator.operator,
      value: values[0],
    },
  };
};

const resolveExpression = (
  syntax: SelectionExpressionSyntax,
  entity: SelectionLanguageEntityReflection,
): SemanticResolution => {
  if (syntax.kind === 'all') return { diagnostics: [], expression: selectionAll() };
  if (syntax.kind === 'none') return { diagnostics: [], expression: selectionNone() };
  if (syntax.kind === 'predicate') return resolvePredicate(syntax, entity);
  if (syntax.kind === 'parenthesized') {
    return syntax.expression ? resolveExpression(syntax.expression, entity) : { diagnostics: [] };
  }
  if (syntax.kind === 'not') {
    if (!syntax.operand) return { diagnostics: [] };
    const operand = resolveExpression(syntax.operand, entity);
    return {
      diagnostics: operand.diagnostics,
      ...(operand.expression ? { expression: selectionNot(operand.expression) } : {}),
    };
  }

  const operands = syntax.operands.map(operand => resolveExpression(operand, entity));
  const diagnostics = operands.flatMap(operand => operand.diagnostics);
  const expressions = operands.flatMap(operand => operand.expression ?? []);
  return {
    diagnostics,
    ...(diagnostics.length === 0 && expressions.length === syntax.operands.length
      ? {
          expression:
            syntax.kind === 'and' ? selectionAnd(...expressions) : selectionOr(...expressions),
        }
      : {}),
  };
};

export const analyzeSelectionDocument = <TEntityName extends string>(
  document: string,
  entity: SelectionLanguageEntityReflection<TEntityName>,
): SelectionDocumentAnalysis<TEntityName> => {
  const parsed = parseSelectionDocument(document);
  if (parsed.syntaxDiagnostics.length > 0 || !parsed.syntax.expression) {
    return { ...parsed, semanticDiagnostics: [] };
  }

  const resolved = resolveExpression(parsed.syntax.expression, entity);
  return {
    ...parsed,
    semanticDiagnostics: resolved.diagnostics,
    ...(resolved.expression && resolved.diagnostics.length === 0
      ? {
          selection: {
            kind: 'selection',
            entityName: entity.name,
            expression: resolved.expression,
          },
        }
      : {}),
  };
};
