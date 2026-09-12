import {
  selectionAll,
  selectionAnd,
  selectionNone,
  selectionNot,
  selectionOr,
  type SelectionExpression,
} from '@ontahi/core/data-graph';

import type {
  SelectionLanguageRange,
  SelectionLanguageDiagnostic,
  SelectionLanguageFieldReflection,
  SelectionLanguageEntityReflection,
  SelectionScalarLiteralSyntax,
  SelectionPredicateSyntax,
  SelectionExpressionSyntax,
  SelectionDocumentAnalysis,
} from '../model/contracts.js';

import { parseSelectionDocument } from './syntax.js';

export type SemanticResolution = {
  readonly expression?: SelectionExpression;
  readonly diagnostics: readonly SelectionLanguageDiagnostic[];
};

export const semanticDiagnostic = (
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

export const supportedFieldType = (field: SelectionLanguageFieldReflection) => {
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

export const literalValue = (
  literal: SelectionScalarLiteralSyntax,
): string | number | boolean | undefined => literal.value;

export const literalKindLabel = (literal: SelectionScalarLiteralSyntax) =>
  literal.kind === 'boolean-literal'
    ? 'Boolean'
    : literal.kind === 'number-literal'
      ? 'number'
      : 'string';

export const expectedLiteralKind = (
  fieldType: NonNullable<ReturnType<typeof supportedFieldType>>,
) =>
  fieldType === 'boolean'
    ? 'boolean-literal'
    : fieldType === 'number'
      ? 'number-literal'
      : 'string-literal';

export const expectedLiteralLabel = (
  fieldType: NonNullable<ReturnType<typeof supportedFieldType>>,
) =>
  fieldType === 'boolean'
    ? 'Boolean'
    : fieldType === 'number'
      ? 'number'
      : fieldType === 'reference'
        ? 'quoted Reference identity'
        : 'string';

export const resolvedLiteralValue = (
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

export const validateLiteral = (
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

export const resolvePredicate = (
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

export const resolveExpression = (
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
