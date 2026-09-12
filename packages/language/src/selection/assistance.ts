import type { SyntaxNode } from '@lezer/common';

import { parser } from '../generated/selection-parser.js';
import type {
  SelectionLanguageFieldReflection,
  SelectionLanguageEntityReflection,
  SelectionLanguagePredicateOperator,
  SelectionPredicateSyntax,
  SelectionExpressionSyntax,
  SelectionDocumentSyntax,
  SelectionLanguageCursorContext,
  SelectionLanguageCompletionItem,
  SelectionLanguageCompletionResult,
  SelectionLanguageCursorContextResult,
  SelectionReferenceValueContext,
  SelectionLanguageExecutionAffordances,
} from '../model/contracts.js';

import {
  clampDocumentPosition,
  completionRangeFromTree,
  ancestorNamed,
  expressionAtPosition,
} from './cursor.js';
import { supportedFieldType } from './semantics.js';
import { syntaxFromTree, visitExpression, parseSelectionDocument } from './syntax.js';

export const fieldCompletionDetail = (field: SelectionLanguageFieldReflection) =>
  `${field.valueType ?? field.type}${field.nullable ? ' · nullable' : ''}`;

export const expressionCompletionItems = (
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

export const operatorCompletionItems = (
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

export const completionOperatorByLabel: Readonly<
  Record<string, SelectionLanguagePredicateOperator>
> = {
  '=': 'eq',
  in: 'in',
  'is null': 'isNull',
  '<': 'lt',
  '<=': 'lte',
  '>': 'gt',
  '>=': 'gte',
};

export const affordedOperatorCompletionItems = (
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

export const valueCompletionItems = (
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

export const continuationCompletionItems = (
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

export const hasUnclosedParenthesisAt = (
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

export const fieldForPredicate = (
  predicate: SelectionPredicateSyntax,
  entity: SelectionLanguageEntityReflection,
) => entity.fields.find(field => field.name === predicate.field?.text);

export type SelectionCompletionResultBuilder = (
  context: SelectionLanguageCursorContext,
  items: readonly SelectionLanguageCompletionItem[],
  includeOpeningQuote?: boolean,
  insertAtCursor?: boolean,
) => SelectionLanguageCompletionResult;

export const continuationItemsAt = (
  syntax: SelectionDocumentSyntax,
  position: number,
  applyPrefix = '',
) =>
  continuationCompletionItems(hasUnclosedParenthesisAt(syntax.expression, position), applyPrefix);

export const completeNonPredicateExpression = (
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

export const completeMembershipPredicate = (
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

export const completeScalarPredicate = (
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

export const completePredicateExpression = (
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
