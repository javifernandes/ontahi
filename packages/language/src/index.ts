import type { SyntaxNode, SyntaxNodeRef, Tree } from '@lezer/common';
import {
  isReferenceFieldDefinition,
  selectionAll,
  selectionAnd,
  selectionNone,
  selectionNot,
  selectionOr,
  type AnyEntityDefinition,
  type GraphReadRequestV1,
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
    | 'selection.semantic.unsupported-reference-identity'
    | 'selection.semantic.unsupported-relation';
  readonly message: string;
};

export type SelectionLanguageFieldReflection = {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly valueType?: string;
  readonly enumValues?: readonly string[];
  readonly reference?: {
    readonly entityName: string;
    readonly identity?: { readonly name: string; readonly fields: readonly string[] };
  };
  readonly documentation?: string;
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

export type SelectionLanguageCursorContext =
  | 'expression'
  | 'operator'
  | 'value'
  | 'list-value'
  | 'list-continuation'
  | 'continuation';

export type SelectionLanguageCompletionItem = {
  readonly label: string;
  readonly apply: string;
  readonly kind: 'field' | 'keyword' | 'operator' | 'value' | 'punctuation';
  readonly detail: string;
};

export type SelectionLanguageCompletionResult = SelectionLanguageRange & {
  readonly context: SelectionLanguageCursorContext;
  readonly items: readonly SelectionLanguageCompletionItem[];
};

export type SelectionLanguageCursorContextResult = SelectionLanguageRange & {
  readonly kind: SelectionLanguageCursorContext;
};

export type SelectionReferenceValueContext = SelectionLanguageRange & {
  readonly fieldName: string;
  readonly targetEntityName: string;
  readonly identityField: string;
  readonly value?: string;
};

export type SelectionLanguageExecutionAffordances = {
  readonly fields?: readonly {
    readonly name: string;
    readonly operators: readonly SelectionLanguagePredicateOperator[];
  }[];
};

export type SelectionLanguageSemanticClassification = SelectionLanguageRange & {
  readonly kind:
    | 'field'
    | 'unsupported-field'
    | 'unsupported-relation'
    | 'invalid-identifier'
    | 'operator'
    | 'value'
    | 'keyword';
};

export type SelectionLanguageHover = SelectionLanguageRange & {
  readonly title: string;
  readonly detail: string;
  readonly documentation: string;
};

export type ConsoleLanguageApplicationReflection = {
  readonly entities: readonly SelectionLanguageEntityReflection[];
};

export type ConsoleLanguageDiagnostic =
  | SelectionLanguageDiagnostic
  | (SelectionLanguageRange & {
      readonly channel: 'syntax' | 'semantic';
      readonly code: 'console.syntax.invalid' | 'console.semantic.unknown-entity';
      readonly message: string;
    });

export type ConsoleGraphReadSyntax = SelectionLanguageRange & {
  readonly kind: 'graph-read';
  readonly entity?: SelectionLanguageToken<'entity-name'>;
  readonly where?: SelectionLanguageToken<'where-member'>;
  readonly whereOpen?: SelectionLanguageToken<'open-parenthesis'>;
  readonly selection?: SelectionExpressionSyntax;
  readonly whereClose?: SelectionLanguageToken<'close-parenthesis'>;
  readonly terminal?: SelectionLanguageToken<
    'first-member' | 'one-member' | 'many-member' | 'count-member'
  >;
  readonly terminalOpen?: SelectionLanguageToken<'open-parenthesis'>;
  readonly terminalClose?: SelectionLanguageToken<'close-parenthesis'>;
};

export type ConsoleDocumentSyntax = SelectionLanguageRange & {
  readonly kind: 'console-document';
  readonly expression?: ConsoleGraphReadSyntax;
};

export type ConsoleDocumentParseResult = {
  readonly syntax: ConsoleDocumentSyntax;
  readonly syntaxDiagnostics: readonly ConsoleLanguageDiagnostic[];
};

export type ConsoleDocumentAnalysis = ConsoleDocumentParseResult & {
  readonly semanticDiagnostics: readonly ConsoleLanguageDiagnostic[];
  readonly request?: GraphReadRequestV1;
};

export type ConsoleDocumentAnalysisOptions = {
  readonly limit?: number;
};

export type ConsoleLanguageCompletionItem = {
  readonly label: string;
  readonly apply: string;
  readonly kind: SelectionLanguageCompletionItem['kind'] | 'entity' | 'member';
  readonly detail: string;
};

export type ConsoleLanguageCompletionResult = SelectionLanguageRange & {
  readonly items: readonly ConsoleLanguageCompletionItem[];
};

const selectionDocumentParser = parser.configure({ top: 'SelectionDocument' });
const consoleDocumentParser = parser.configure({ top: 'ConsoleDocument' });

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
  const tree = selectionDocumentParser.parse(document);
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
  if (field.reference?.identity?.fields.length === 1) return 'reference' as const;
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
  fieldType === 'boolean'
    ? 'Boolean'
    : fieldType === 'number'
      ? 'number'
      : fieldType === 'reference'
        ? 'quoted Reference identity'
        : 'string';

const resolvedLiteralValue = (
  literal: SelectionScalarLiteralSyntax,
  field: SelectionLanguageFieldReflection,
  fieldType: NonNullable<ReturnType<typeof supportedFieldType>>,
): unknown => {
  if (fieldType !== 'reference') return literalValue(literal);
  const identityField = field.reference?.identity?.fields[0];
  return identityField && literal.kind === 'string-literal' && literal.value !== undefined
    ? {
        kind: 'entity-ref',
        entityName: field.reference!.entityName,
        locator: { [identityField]: literal.value },
      }
    : undefined;
};

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

  if (reflectedField.reference && reflectedField.reference.identity?.fields.length !== 1) {
    const identityFields = reflectedField.reference.identity?.fields ?? [];
    return {
      diagnostics: [
        semanticDiagnostic(
          'selection.semantic.unsupported-reference-identity',
          `Reference Field ${entity.name}.${field.text} requires exactly one reflected target identity Field; received ${identityFields.length}.`,
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

  const values = literals.map(literal => resolvedLiteralValue(literal, reflectedField, fieldType));
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

export const reflectSelectionLanguageEntity = <TEntity extends AnyEntityDefinition>(
  entity: TEntity,
): SelectionLanguageEntityReflection<TEntity['name']> => ({
  name: entity.name,
  fields: Object.entries(entity.fields).map(([name, definition]) => {
    const reference = isReferenceFieldDefinition(definition)
      ? (() => {
          const target = definition.target;
          const identityName = target.identityLocatorName;
          const identity = identityName ? target.refLocators[identityName] : undefined;
          const identityFields = identity?.fields;
          return {
            entityName: target.name,
            ...(identityName && identityFields
              ? { identity: { name: identityName, fields: identityFields } }
              : {}),
          };
        })()
      : undefined;
    return {
      name,
      type: definition.fieldType,
      nullable: definition.nullable === true,
      ...(definition.valueType ? { valueType: definition.valueType } : {}),
      ...(definition.enumValues ? { enumValues: definition.enumValues } : {}),
      ...(reference ? { reference } : {}),
      ...(definition.description ? { documentation: definition.description } : {}),
    };
  }),
  relations: Object.keys(entity.relations).map(name => ({ name })),
});

const consoleSyntaxFromTree = (document: string, tree: Tree): ConsoleDocumentSyntax => {
  const consoleExpression = tree.topNode.getChild('ConsoleExpression');
  const graphRead = consoleExpression?.getChild('GraphReadExpression');
  if (!graphRead) {
    return { kind: 'console-document', from: 0, to: document.length };
  }

  const opens = graphRead.getChildren('OpenParen');
  const closes = graphRead.getChildren('CloseParen');
  const readTerminal = graphRead.getChild('ReadTerminal');
  const firstTerminal = readTerminal?.getChild('First');
  const oneTerminal = readTerminal?.getChild('One');
  const manyTerminal = readTerminal?.getChild('Many');
  const countTerminal = readTerminal?.getChild('Count');
  const where = graphRead.getChild('Where');
  const terminalParenthesisIndex = where ? 1 : 0;
  return {
    kind: 'console-document',
    from: 0,
    to: document.length,
    expression: {
      kind: 'graph-read',
      ...rangeOf(graphRead),
      entity: tokenOf('entity-name', graphRead.getChild('EntityName'), document),
      where: tokenOf('where-member', where, document),
      whereOpen: tokenOf('open-parenthesis', where ? (opens[0] ?? null) : null, document),
      selection: expressionSyntax(graphRead.getChild('OrExpression'), document),
      whereClose: tokenOf('close-parenthesis', where ? (closes[0] ?? null) : null, document),
      terminal: firstTerminal
        ? tokenOf('first-member', firstTerminal, document)
        : oneTerminal
          ? tokenOf('one-member', oneTerminal, document)
          : manyTerminal
            ? tokenOf('many-member', manyTerminal, document)
            : tokenOf('count-member', countTerminal ?? null, document),
      terminalOpen: tokenOf('open-parenthesis', opens[terminalParenthesisIndex] ?? null, document),
      terminalClose: tokenOf(
        'close-parenthesis',
        closes[terminalParenthesisIndex] ?? null,
        document,
      ),
    },
  };
};

const consoleStructureDiagnosticMessage = (syntax: ConsoleDocumentSyntax) => {
  const expression = syntax.expression;
  if (!expression?.entity) return 'Expected an Entity name to begin the Console expression.';
  if (expression.where && !expression.whereOpen) return 'Expected "(" after .where.';
  if (expression.where && !expression.whereClose) {
    return 'Expected ")" to close the Selection expression.';
  }
  if (!expression.terminal) {
    return expression.whereClose
      ? 'Expected .first(), .one(), .many(), or .count() after the Selection expression.'
      : `Expected .where(...), .first(), .one(), .many(), or .count() after ${expression.entity.text}.`;
  }
  if (!expression.terminalOpen || !expression.terminalClose) {
    return `Expected an empty argument list after .${expression.terminal.text}.`;
  }
  return 'The Console expression is invalid.';
};

const consoleStructureComplete = (syntax: ConsoleDocumentSyntax) => {
  const expression = syntax.expression;
  return Boolean(
    expression?.entity &&
    (!expression.where || (expression.whereOpen && expression.whereClose)) &&
    expression.terminal &&
    expression.terminalOpen &&
    expression.terminalClose,
  );
};

const firstErrorRange = (tree: Tree): SelectionLanguageRange | undefined => {
  let error: SelectionLanguageRange | undefined;
  tree.iterate({
    enter(node) {
      if (!error && node.type.isError) error = rangeOf(node);
    },
  });
  return error;
};

export const parseConsoleDocument = (document: string): ConsoleDocumentParseResult => {
  const tree = consoleDocumentParser.parse(document);
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

  if (error) {
    const selectionSyntax: SelectionDocumentSyntax = {
      kind: 'selection-document',
      from: 0,
      to: document.length,
      expression: syntax.expression?.selection,
    };
    syntaxDiagnostics.unshift({
      channel: 'syntax',
      code: consoleStructureComplete(syntax)
        ? 'selection.syntax.invalid'
        : 'console.syntax.invalid',
      message: consoleStructureComplete(syntax)
        ? syntaxDiagnosticMessage(document, selectionSyntax)
        : consoleStructureDiagnosticMessage(syntax),
      ...error,
    });
  }

  return { syntax, syntaxDiagnostics };
};

export const analyzeConsoleDocument = (
  document: string,
  application: ConsoleLanguageApplicationReflection,
  options: ConsoleDocumentAnalysisOptions = {},
): ConsoleDocumentAnalysis => {
  const parsed = parseConsoleDocument(document);
  const expression = parsed.syntax.expression;
  if (parsed.syntaxDiagnostics.length > 0 || !expression?.entity || !expression.terminal) {
    return { ...parsed, semanticDiagnostics: [] };
  }

  const entity = application.entities.find(candidate => candidate.name === expression.entity?.text);
  if (!entity) {
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

  const resolved: SemanticResolution = expression.selection
    ? resolveExpression(expression.selection, entity)
    : { diagnostics: [], expression: selectionAll() };
  return {
    ...parsed,
    semanticDiagnostics: resolved.diagnostics,
    ...(resolved.expression && resolved.diagnostics.length === 0
      ? {
          request: {
            version: 1,
            kind: 'graph-read',
            mode:
              expression.terminal.kind === 'many-member'
                ? 'run'
                : expression.terminal.kind === 'count-member'
                  ? 'count'
                  : 'get',
            selection: {
              kind: 'selection',
              entityName: entity.name,
              expression: resolved.expression,
            },
            orderBy: [],
            ...(expression.terminal.kind === 'count-member' ? {} : { limit: options.limit ?? 25 }),
            ...(expression.terminal.kind === 'one-member'
              ? { cardinality: 'one' as const }
              : expression.terminal.kind === 'many-member'
                ? { cardinality: 'many' as const }
                : {}),
          } satisfies GraphReadRequestV1,
        }
      : {}),
  };
};

const completionWordRange = (document: string, position: number): SelectionLanguageRange => {
  let from = position;
  while (from > 0 && /[A-Za-z0-9_]/.test(document[from - 1]!)) from -= 1;
  let to = position;
  while (to < document.length && /[A-Za-z0-9_]/.test(document[to]!)) to += 1;
  return { from, to };
};

const consoleReadTerminalCompletionItems: readonly ConsoleLanguageCompletionItem[] = [
  {
    label: 'first',
    apply: 'first()',
    kind: 'member',
    detail: 'Nullable first Graph Read terminal',
  },
  {
    label: 'one',
    apply: 'one()',
    kind: 'member',
    detail: 'Exact-one Graph Read terminal',
  },
  {
    label: 'many',
    apply: 'many()',
    kind: 'member',
    detail: 'Many Graph Read terminal',
  },
  {
    label: 'count',
    apply: 'count()',
    kind: 'member',
    detail: 'Graph Read count terminal',
  },
];

export const completeConsoleDocument = (
  document: string,
  position: number,
  application: ConsoleLanguageApplicationReflection,
): ConsoleLanguageCompletionResult => {
  const safePosition = Math.max(0, Math.min(position, document.length));
  const syntax = parseConsoleDocument(document).syntax.expression;
  const rootPrefix = document.slice(0, safePosition);
  if (!rootPrefix.includes('.') && /^\s*[A-Za-z0-9_]*$/.test(rootPrefix)) {
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

  const entity = application.entities.find(candidate => candidate.name === syntax?.entity?.text);
  const selectionFrom = syntax?.whereOpen?.to;
  const selectionTo = syntax?.whereClose?.from;
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
  const memberPrefix = document.slice(range.from, safePosition);
  if (
    syntax?.entity &&
    !syntax.where &&
    !syntax.terminal &&
    document.slice(syntax.entity.to, range.from).includes('.')
  ) {
    return {
      ...range,
      items: (
        [
          {
            label: 'where',
            apply: 'where(',
            kind: 'member',
            detail: 'Selection',
          },
          ...consoleReadTerminalCompletionItems,
        ] satisfies ConsoleLanguageCompletionItem[]
      ).filter(item => item.label.startsWith(memberPrefix)),
    };
  }
  if (
    syntax?.whereClose &&
    !syntax.terminal &&
    document.slice(syntax.whereClose.to, range.from).includes('.')
  ) {
    return {
      ...range,
      items: consoleReadTerminalCompletionItems.filter(item => item.label.startsWith(memberPrefix)),
    };
  }

  return { ...range, items: [] };
};

const operatorDocumentation: Record<
  SelectionLanguagePredicateOperator,
  { readonly title: string; readonly documentation: string }
> = {
  eq: {
    title: 'Equality',
    documentation: 'Matches when the Field value equals the supplied scalar value.',
  },
  in: {
    title: 'Membership',
    documentation: 'Matches when the Field value equals any value in the supplied list.',
  },
  isNull: {
    title: 'Null check',
    documentation: 'Matches when the nullable Field has no value.',
  },
  lt: {
    title: 'Less than',
    documentation: 'Matches when the number Field is less than the supplied number.',
  },
  lte: {
    title: 'Less than or equal',
    documentation: 'Matches when the number Field is less than or equal to the supplied number.',
  },
  gt: {
    title: 'Greater than',
    documentation: 'Matches when the number Field is greater than the supplied number.',
  },
  gte: {
    title: 'Greater than or equal',
    documentation: 'Matches when the number Field is greater than or equal to the supplied number.',
  },
};

const completionTokenNames = new Set([
  'Identifier',
  'StringLiteral',
  'NumberLiteral',
  'True',
  'False',
  'Null',
  'All',
  'None',
]);

const clampDocumentPosition = (document: string, position: number) =>
  Math.max(0, Math.min(document.length, position));

const unclosedStringStartAt = (document: string, position: number) => {
  let start: number | undefined;
  let escaped = false;
  for (let index = 0; index < position; index += 1) {
    const character = document[index];
    if (escaped) {
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '"') {
      start = start === undefined ? index : undefined;
    }
  }
  return start;
};

const completionRangeFromTree = (
  document: string,
  tree: Tree,
  position: number,
  includeOpeningQuote = false,
): SelectionLanguageRange => {
  let node: SyntaxNode | null = tree.resolveInner(position, -1);
  while (node && !completionTokenNames.has(node.name)) node = node.parent;
  if (!node || node.from > position || node.to < position) {
    const unclosedStringStart = includeOpeningQuote
      ? unclosedStringStartAt(document, position)
      : undefined;
    if (unclosedStringStart !== undefined) {
      return { from: unclosedStringStart, to: position };
    }
    return includeOpeningQuote && position > 0 && document[position - 1] === '"'
      ? { from: position - 1, to: position }
      : { from: position, to: position };
  }

  let from = node.from;
  if (includeOpeningQuote && node.name === 'Identifier' && from > 0 && document[from - 1] === '"') {
    from -= 1;
  }
  return { from, to: node.to };
};

const ancestorNamed = (
  node: SyntaxNode | null,
  names: readonly string[],
): SyntaxNode | undefined => {
  for (let candidate = node; candidate; candidate = candidate.parent) {
    if (names.includes(candidate.name)) return candidate;
  }
  return undefined;
};

const expressionChildren = (
  expression: SelectionExpressionSyntax,
): readonly SelectionExpressionSyntax[] => {
  switch (expression.kind) {
    case 'and':
    case 'or':
      return expression.operands;
    case 'not':
      return expression.operand ? [expression.operand] : [];
    case 'parenthesized':
      return expression.expression ? [expression.expression] : [];
    default:
      return [];
  }
};

const expressionAtPosition = (
  expression: SelectionExpressionSyntax | undefined,
  position: number,
): SelectionExpressionSyntax | undefined => {
  if (!expression || position < expression.from || position > expression.to) return undefined;

  for (const child of expressionChildren(expression)) {
    const nested = expressionAtPosition(child, position);
    if (nested) return nested;
  }
  return expression;
};

const fieldCompletionDetail = (field: SelectionLanguageFieldReflection) =>
  `${field.valueType ?? field.type}${field.nullable ? ' · nullable' : ''}`;

const expressionCompletionItems = (
  entity: SelectionLanguageEntityReflection,
  applyPrefix = '',
): readonly SelectionLanguageCompletionItem[] => [
  ...entity.fields.flatMap(field =>
    supportedFieldType(field)
      ? [
          {
            label: field.name,
            apply: `${applyPrefix}${field.name}`,
            kind: 'field' as const,
            detail: fieldCompletionDetail(field),
          },
        ]
      : [],
  ),
  ...['all', 'none', 'not'].map(label => ({
    label,
    apply: `${applyPrefix}${label}`,
    kind: 'keyword' as const,
    detail: 'Selection keyword',
  })),
  {
    label: '(',
    apply: `${applyPrefix}(`,
    kind: 'punctuation',
    detail: 'Grouped Selection expression',
  },
];

const operatorCompletionItems = (
  field: SelectionLanguageFieldReflection,
): readonly SelectionLanguageCompletionItem[] => {
  const fieldType = supportedFieldType(field);
  if (!fieldType) return [];
  const items: SelectionLanguageCompletionItem[] = [
    { label: '=', apply: '=', kind: 'operator', detail: 'Equality · eq' },
    { label: 'in', apply: 'in', kind: 'operator', detail: 'Membership · in' },
  ];
  if (field.nullable) {
    items.push({
      label: 'is null',
      apply: 'is null',
      kind: 'operator',
      detail: 'Null check · isNull',
    });
  }
  if (fieldType === 'number') {
    items.push(
      { label: '<', apply: '<', kind: 'operator', detail: 'Less than · lt' },
      { label: '<=', apply: '<=', kind: 'operator', detail: 'Less than or equal · lte' },
      { label: '>', apply: '>', kind: 'operator', detail: 'Greater than · gt' },
      { label: '>=', apply: '>=', kind: 'operator', detail: 'Greater than or equal · gte' },
    );
  }
  return items;
};

const completionOperatorByLabel: Readonly<Record<string, SelectionLanguagePredicateOperator>> = {
  '=': 'eq',
  in: 'in',
  'is null': 'isNull',
  '<': 'lt',
  '<=': 'lte',
  '>': 'gt',
  '>=': 'gte',
};

const affordedOperatorCompletionItems = (
  field: SelectionLanguageFieldReflection,
  affordances: SelectionLanguageExecutionAffordances | undefined,
) => {
  const items = operatorCompletionItems(field);
  const fieldAffordance = affordances?.fields?.find(candidate => candidate.name === field.name);
  return fieldAffordance
    ? items.filter(item =>
        fieldAffordance.operators.includes(completionOperatorByLabel[item.label]!),
      )
    : items;
};

const valueCompletionItems = (
  field: SelectionLanguageFieldReflection,
): readonly SelectionLanguageCompletionItem[] => {
  const fieldType = supportedFieldType(field);
  if (fieldType === 'boolean') {
    return ['true', 'false'].map(label => ({
      label,
      apply: label,
      kind: 'value' as const,
      detail: 'Boolean value',
    }));
  }
  if (fieldType === 'enum') {
    return (field.enumValues ?? []).map(value => {
      const literal = JSON.stringify(value);
      return {
        label: literal,
        apply: literal,
        kind: 'value' as const,
        detail: `${field.valueType ?? field.type} value`,
      };
    });
  }
  if (fieldType === 'number') {
    return [{ label: '0', apply: '0', kind: 'value', detail: 'Number literal' }];
  }
  return fieldType === 'string' || fieldType === 'id' || fieldType === 'reference'
    ? [
        {
          label: '""',
          apply: '""',
          kind: 'value',
          detail: fieldType === 'reference' ? 'Reference identity' : 'String literal',
        },
      ]
    : [];
};

const continuationCompletionItems = (
  closeParenthesis: boolean,
  applyPrefix = '',
): readonly SelectionLanguageCompletionItem[] => [
  {
    label: 'and',
    apply: `${applyPrefix}and`,
    kind: 'keyword',
    detail: 'Boolean conjunction',
  },
  {
    label: 'or',
    apply: `${applyPrefix}or`,
    kind: 'keyword',
    detail: 'Boolean disjunction',
  },
  ...(closeParenthesis
    ? [
        {
          label: ')',
          apply: ')',
          kind: 'punctuation' as const,
          detail: 'Close grouped expression',
        },
      ]
    : []),
];

const hasUnclosedParenthesisAt = (
  expression: SelectionExpressionSyntax | undefined,
  position: number,
) => {
  let found = false;
  visitExpression(expression, candidate => {
    if (
      candidate.kind === 'parenthesized' &&
      !candidate.close &&
      candidate.from <= position &&
      candidate.to >= position
    ) {
      found = true;
    }
  });
  return found;
};

const fieldForPredicate = (
  predicate: SelectionPredicateSyntax,
  entity: SelectionLanguageEntityReflection,
) => entity.fields.find(field => field.name === predicate.field?.text);

type SelectionCompletionResultBuilder = (
  context: SelectionLanguageCursorContext,
  items: readonly SelectionLanguageCompletionItem[],
  includeOpeningQuote?: boolean,
  insertAtCursor?: boolean,
) => SelectionLanguageCompletionResult;

const continuationItemsAt = (syntax: SelectionDocumentSyntax, position: number, applyPrefix = '') =>
  continuationCompletionItems(hasUnclosedParenthesisAt(syntax.expression, position), applyPrefix);

const completeNonPredicateExpression = (
  expression: SelectionExpressionSyntax,
  position: number,
  entity: SelectionLanguageEntityReflection,
  syntax: SelectionDocumentSyntax,
  result: SelectionCompletionResultBuilder,
): SelectionLanguageCompletionResult | undefined => {
  switch (expression.kind) {
    case 'all':
    case 'none':
      return position <= expression.to
        ? result('expression', expressionCompletionItems(entity))
        : result('continuation', continuationCompletionItems(false));
    case 'not': {
      if (expression.operand) return result('continuation', continuationItemsAt(syntax, position));
      const prefix = expression.operator.to === position ? ' ' : '';
      return result('expression', expressionCompletionItems(entity, prefix));
    }
    case 'and':
    case 'or': {
      if (expression.operands.length > expression.operators.length) {
        return result('continuation', continuationItemsAt(syntax, position));
      }
      const prefix = expression.operators.at(-1)?.to === position ? ' ' : '';
      return result('expression', expressionCompletionItems(entity, prefix));
    }
    case 'parenthesized':
      return expression.expression
        ? result('continuation', continuationCompletionItems(!expression.close))
        : result('expression', expressionCompletionItems(entity));
    default:
      return undefined;
  }
};

const completeMembershipPredicate = (
  predicate: SelectionPredicateSyntax,
  reflectedField: SelectionLanguageFieldReflection,
  position: number,
  syntax: SelectionDocumentSyntax,
  result: SelectionCompletionResultBuilder,
): SelectionLanguageCompletionResult => {
  if (predicate.value?.kind !== 'list-literal') {
    return result('value', [
      { label: '[', apply: '[', kind: 'punctuation', detail: 'Start membership list' },
    ]);
  }

  const list = predicate.value;
  if (list.close && position >= list.close.from) {
    return result('continuation', continuationItemsAt(syntax, position));
  }

  const cursorIsOnValue = list.values.some(value => value.from <= position && value.to >= position);
  const expectsValue =
    cursorIsOnValue || list.values.length === list.commas.length || list.values.length === 0;
  if (expectsValue) {
    return result(
      'list-value',
      [
        ...valueCompletionItems(reflectedField),
        { label: ']', apply: ']', kind: 'punctuation', detail: 'Close membership list' },
      ],
      true,
    );
  }

  return result('list-continuation', [
    { label: ',', apply: ',', kind: 'punctuation', detail: 'Add another value' },
    { label: ']', apply: ']', kind: 'punctuation', detail: 'Close membership list' },
  ]);
};

const completeScalarPredicate = (
  predicate: SelectionPredicateSyntax,
  reflectedField: SelectionLanguageFieldReflection,
  position: number,
  syntax: SelectionDocumentSyntax,
  result: SelectionCompletionResultBuilder,
): SelectionLanguageCompletionResult => {
  const value = predicate.value;
  if (!value || value.kind === 'list-literal') {
    return result('value', valueCompletionItems(reflectedField), true);
  }
  if (value.from <= position && value.to >= position) {
    return result('value', valueCompletionItems(reflectedField), true);
  }
  return result('continuation', continuationItemsAt(syntax, position));
};

const completePredicateExpression = (
  predicate: SelectionPredicateSyntax,
  position: number,
  entity: SelectionLanguageEntityReflection,
  affordances: SelectionLanguageExecutionAffordances | undefined,
  syntax: SelectionDocumentSyntax,
  cursorNode: SyntaxNode,
  result: SelectionCompletionResultBuilder,
): SelectionLanguageCompletionResult => {
  if (position <= (predicate.field?.to ?? predicate.from)) {
    return result('expression', expressionCompletionItems(entity));
  }

  const reflectedField = fieldForPredicate(predicate, entity);
  if (!reflectedField) return result('operator', []);

  if (!predicate.operator) {
    const nullPredicate = ancestorNamed(cursorNode, ['NullPredicate']);
    return nullPredicate?.getChild('Is')
      ? result('value', [
          {
            label: 'null',
            apply: 'null',
            kind: 'value',
            detail: 'Complete the null check',
          },
        ])
      : result('operator', affordedOperatorCompletionItems(reflectedField, affordances));
  }

  if (position >= predicate.operator.from && position < predicate.operator.to) {
    return {
      context: 'operator',
      from: predicate.operator.from,
      to: predicate.operator.to,
      items: affordedOperatorCompletionItems(reflectedField, affordances),
    };
  }

  if (predicate.operator.operator === 'isNull') {
    const prefix = predicate.operator.to === position ? ' ' : '';
    return result('continuation', continuationItemsAt(syntax, position, prefix), false, true);
  }
  if (predicate.operator.operator === 'in') {
    return completeMembershipPredicate(predicate, reflectedField, position, syntax, result);
  }
  return completeScalarPredicate(predicate, reflectedField, position, syntax, result);
};

export const completeSelectionDocument = (
  document: string,
  requestedPosition: number,
  entity: SelectionLanguageEntityReflection,
  affordances?: SelectionLanguageExecutionAffordances,
): SelectionLanguageCompletionResult => {
  const position = clampDocumentPosition(document, requestedPosition);
  const tree = parser.parse(document);
  const syntax = syntaxFromTree(document, tree);
  const expression = expressionAtPosition(syntax.expression, position);
  const cursorNode = tree.resolveInner(position, -1);
  const range = (includeOpeningQuote = false) =>
    completionRangeFromTree(document, tree, position, includeOpeningQuote);
  const result = (
    context: SelectionLanguageCursorContext,
    items: readonly SelectionLanguageCompletionItem[],
    includeOpeningQuote = false,
    insertAtCursor = false,
  ): SelectionLanguageCompletionResult => ({
    context,
    ...(insertAtCursor ? { from: position, to: position } : range(includeOpeningQuote)),
    items,
  });

  if (!syntax.expression) return result('expression', expressionCompletionItems(entity));
  if (!expression) {
    return result('continuation', continuationItemsAt(syntax, position));
  }

  const nonPredicate = completeNonPredicateExpression(expression, position, entity, syntax, result);
  if (nonPredicate) return nonPredicate;
  return completePredicateExpression(
    expression as SelectionPredicateSyntax,
    position,
    entity,
    affordances,
    syntax,
    cursorNode,
    result,
  );
};

export const getSelectionDocumentCursorContext = (
  document: string,
  position: number,
  entity: SelectionLanguageEntityReflection,
): SelectionLanguageCursorContextResult => {
  const completion = completeSelectionDocument(document, position, entity);
  return { kind: completion.context, from: completion.from, to: completion.to };
};

export const getSelectionReferenceValueContext = (
  document: string,
  requestedPosition: number,
  entity: SelectionLanguageEntityReflection,
): SelectionReferenceValueContext | undefined => {
  const position = clampDocumentPosition(document, requestedPosition);
  const parsed = parseSelectionDocument(document);
  const expression = expressionAtPosition(parsed.syntax.expression, position);
  if (!expression || expression.kind !== 'predicate' || !expression.field) return undefined;

  const field = entity.fields.find(candidate => candidate.name === expression.field?.text);
  const identityField = field?.reference?.identity?.fields[0];
  if (
    !field?.reference ||
    field.reference.identity?.fields.length !== 1 ||
    !identityField ||
    !expression.operator ||
    !['eq', 'in'].includes(expression.operator.operator)
  ) {
    return undefined;
  }

  const completion = completeSelectionDocument(document, position, entity);
  if (completion.context !== 'value' && completion.context !== 'list-value') return undefined;
  const literal =
    expression.value?.kind === 'list-literal'
      ? expression.value.values.find(value => position >= value.from && position <= value.to)
      : expression.value;

  return {
    from: completion.from,
    to: completion.to,
    fieldName: field.name,
    targetEntityName: field.reference.entityName,
    identityField,
    ...(literal?.kind === 'string-literal' && literal.value !== undefined
      ? { value: literal.value }
      : {}),
  };
};

const semanticFieldClassification = (
  fieldName: string,
  entity: SelectionLanguageEntityReflection,
): SelectionLanguageSemanticClassification['kind'] => {
  const field = entity.fields.find(candidate => candidate.name === fieldName);
  if (field) return supportedFieldType(field) ? 'field' : 'unsupported-field';
  return entity.relations?.some(relation => relation.name === fieldName)
    ? 'unsupported-relation'
    : 'invalid-identifier';
};

export const classifySelectionDocument = (
  document: string,
  entity: SelectionLanguageEntityReflection,
): readonly SelectionLanguageSemanticClassification[] => {
  const syntax = parseSelectionDocument(document).syntax;
  const classifications: SelectionLanguageSemanticClassification[] = [];
  visitExpression(syntax.expression, expression => {
    if (expression.kind === 'all' || expression.kind === 'none') {
      classifications.push({ kind: 'keyword', from: expression.from, to: expression.to });
      return;
    }
    if (expression.kind === 'not') {
      classifications.push({
        kind: 'keyword',
        from: expression.operator.from,
        to: expression.operator.to,
      });
      return;
    }
    if (expression.kind === 'and' || expression.kind === 'or') {
      expression.operators.forEach(operator =>
        classifications.push({ kind: 'keyword', from: operator.from, to: operator.to }),
      );
      return;
    }
    if (expression.kind !== 'predicate') return;
    if (expression.field) {
      classifications.push({
        kind: semanticFieldClassification(expression.field.text, entity),
        from: expression.field.from,
        to: expression.field.to,
      });
    }
    if (expression.operator) {
      classifications.push({
        kind: 'operator',
        from: expression.operator.from,
        to: expression.operator.to,
      });
    }
    if (expression.value?.kind === 'list-literal') {
      expression.value.values.forEach(value =>
        classifications.push({ kind: 'value', from: value.from, to: value.to }),
      );
    } else if (expression.value) {
      classifications.push({ kind: 'value', from: expression.value.from, to: expression.value.to });
    }
  });
  return classifications.sort((left, right) => left.from - right.from || left.to - right.to);
};

const positionTouches = (range: SelectionLanguageRange, position: number) =>
  position >= range.from && position <= range.to;

const fieldOperatorLabels = (field: SelectionLanguageFieldReflection) =>
  operatorCompletionItems(field)
    .map(item => item.label)
    .join(', ');

export const hoverSelectionDocument = (
  document: string,
  requestedPosition: number,
  entity: SelectionLanguageEntityReflection,
): SelectionLanguageHover | undefined => {
  const position = clampDocumentPosition(document, requestedPosition);
  const syntax = parseSelectionDocument(document).syntax;
  let hover: SelectionLanguageHover | undefined;
  visitExpression(syntax.expression, expression => {
    if (hover || expression.kind !== 'predicate') return;
    if (expression.field && positionTouches(expression.field, position)) {
      const field = entity.fields.find(candidate => candidate.name === expression.field?.text);
      if (field) {
        const operators = fieldOperatorLabels(field);
        hover = {
          from: expression.field.from,
          to: expression.field.to,
          title: `${entity.name}.${field.name}`,
          detail: `${field.valueType ?? field.type} · ${field.nullable ? 'nullable' : 'required'}`,
          documentation:
            field.documentation ??
            (operators
              ? `Supported Selection operators: ${operators}.`
              : 'This Field type is not supported by the Selection language yet.'),
        };
      } else if (entity.relations?.some(relation => relation.name === expression.field?.text)) {
        hover = {
          from: expression.field.from,
          to: expression.field.to,
          title: `${entity.name}.${expression.field.text}`,
          detail: 'relation · unsupported',
          documentation: 'Relation predicates are not supported by this language version.',
        };
      } else {
        hover = {
          from: expression.field.from,
          to: expression.field.to,
          title: `Unknown Field ${expression.field.text}`,
          detail: entity.name,
          documentation: 'This identifier does not resolve in the selected Entity reflection.',
        };
      }
      return;
    }
    if (expression.operator && positionTouches(expression.operator, position)) {
      const operator = operatorDocumentation[expression.operator.operator];
      hover = {
        from: expression.operator.from,
        to: expression.operator.to,
        title: operator.title,
        detail: `Selection operator · ${expression.operator.operator}`,
        documentation: operator.documentation,
      };
    }
  });
  return hover;
};
