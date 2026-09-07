import type { SyntaxNode, SyntaxNodeRef, Tree } from '@lezer/common';
import type { SelectionAst } from '@ontahi/core/data-graph';

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
    | 'selection.semantic.incompatible-field-type';
  readonly message: string;
};

export type SelectionLanguageFieldReflection = {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
};

export type SelectionLanguageEntityReflection<TEntityName extends string = string> = {
  readonly name: TEntityName;
  readonly fields: readonly SelectionLanguageFieldReflection[];
};

export type SelectionLanguageToken<TKind extends string> = SelectionLanguageRange & {
  readonly kind: TKind;
  readonly text: string;
};

export type SelectionBooleanLiteralSyntax = SelectionLanguageToken<'boolean-literal'> & {
  readonly value: boolean;
};

export type SelectionBooleanEqualitySyntax = SelectionLanguageRange & {
  readonly kind: 'boolean-equality';
  readonly field?: SelectionLanguageToken<'field-name'>;
  readonly operator?: SelectionLanguageToken<'equals'>;
  readonly value?: SelectionBooleanLiteralSyntax;
};

export type SelectionDocumentSyntax = SelectionLanguageRange & {
  readonly kind: 'selection-document';
  readonly expression?: SelectionBooleanEqualitySyntax;
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

const syntaxFromTree = (document: string, tree: Tree): SelectionDocumentSyntax => {
  const expressionNode = tree.topNode.getChild('BooleanEquality');
  if (!expressionNode) {
    return { kind: 'selection-document', from: 0, to: document.length };
  }

  const valueNode = expressionNode.getChild('BooleanLiteral');
  const valueText = valueNode ? document.slice(valueNode.from, valueNode.to) : undefined;

  return {
    kind: 'selection-document',
    from: 0,
    to: document.length,
    expression: {
      kind: 'boolean-equality',
      ...rangeOf(expressionNode),
      field: tokenOf('field-name', expressionNode.getChild('FieldName'), document),
      operator: tokenOf('equals', expressionNode.getChild('Equals'), document),
      ...(valueNode && (valueText === 'true' || valueText === 'false')
        ? {
            value: {
              ...tokenOf('boolean-literal', valueNode, document)!,
              value: valueText === 'true',
            },
          }
        : {}),
    },
  };
};

const syntaxDiagnosticMessage = (syntax: SelectionDocumentSyntax) => {
  if (!syntax.expression?.field) return 'Expected a Field name.';
  if (!syntax.expression.operator) return 'Expected "=" after the Field name.';
  if (!syntax.expression.value) return 'Expected the Boolean literal true or false.';
  return 'The Selection expression is invalid.';
};

const syntaxDiagnosticsFromTree = (
  document: string,
  tree: Tree,
  syntax: SelectionDocumentSyntax,
): readonly SelectionLanguageDiagnostic[] => {
  if (document.trim().length === 0) return [];

  const errorRanges: SelectionLanguageRange[] = [];
  tree.iterate({
    enter(node) {
      if (node.type.isError) errorRanges.push(rangeOf(node));
    },
  });

  if (errorRanges.length === 0 && syntax.expression?.field && syntax.expression.value) return [];

  const range = errorRanges[0] ?? { from: 0, to: document.length };
  return [
    {
      channel: 'syntax',
      code: 'selection.syntax.invalid',
      message: syntaxDiagnosticMessage(syntax),
      ...range,
    },
  ];
};

export const parseSelectionDocument = (document: string): SelectionDocumentParseResult => {
  const tree = parser.parse(document);
  const syntax = syntaxFromTree(document, tree);
  return {
    syntax,
    syntaxDiagnostics: syntaxDiagnosticsFromTree(document, tree, syntax),
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

  const { field, value } = parsed.syntax.expression;
  if (!field || !value) return { ...parsed, semanticDiagnostics: [] };

  const reflectedField = entity.fields.find(candidate => candidate.name === field.text);
  if (!reflectedField) {
    return {
      ...parsed,
      semanticDiagnostics: [
        {
          channel: 'semantic',
          code: 'selection.semantic.unknown-field',
          message: `Unknown Field ${entity.name}.${field.text}.`,
          from: field.from,
          to: field.to,
        },
      ],
    };
  }
  if (reflectedField.type !== 'boolean') {
    return {
      ...parsed,
      semanticDiagnostics: [
        {
          channel: 'semantic',
          code: 'selection.semantic.incompatible-field-type',
          message: `Field ${entity.name}.${field.text} is ${reflectedField.type}, not Boolean.`,
          from: field.from,
          to: field.to,
        },
      ],
    };
  }

  return {
    ...parsed,
    semanticDiagnostics: [],
    selection: {
      kind: 'selection',
      entityName: entity.name,
      expression: {
        kind: 'predicate',
        fieldName: field.text,
        operator: 'eq',
        value: value.value,
      },
    },
  };
};
