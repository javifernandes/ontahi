import type {
  SelectionLanguageRange,
  SelectionLanguageFieldReflection,
  SelectionLanguageEntityReflection,
  SelectionLanguagePredicateOperator,
  SelectionLanguageSemanticClassification,
  SelectionLanguageHover,
} from '../model/contracts.js';

import { operatorCompletionItems } from './assistance.js';
import { clampDocumentPosition } from './cursor.js';
import { supportedFieldType } from './semantics.js';
import { visitExpression, parseSelectionDocument } from './syntax.js';

export const operatorDocumentation: Record<
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

export const semanticFieldClassification = (
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

export const positionTouches = (range: SelectionLanguageRange, position: number) =>
  position >= range.from && position <= range.to;

export const fieldOperatorLabels = (field: SelectionLanguageFieldReflection) =>
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
