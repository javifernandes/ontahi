import { LRLanguage, LanguageSupport } from '@codemirror/language';
import { linter, type Diagnostic, type LintSource } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { styleTags, tags } from '@lezer/highlight';
import {
  analyzeSelectionDocument,
  type SelectionDocumentAnalysis,
  type SelectionLanguageEntityReflection,
} from '@ontahi/language';
import { selectionDocumentParser } from '@ontahi/language/lezer';

const parser = selectionDocumentParser.configure({
  props: [
    styleTags({
      FieldName: tags.variableName,
      'Equals ComparisonOperator In Is': tags.operator,
      'And Or Not': tags.keyword,
      'All None': tags.atom,
      'True False': tags.bool,
      Null: tags.null,
      NumberLiteral: tags.number,
      StringLiteral: tags.string,
      'OpenParen CloseParen OpenBracket CloseBracket Comma': tags.punctuation,
    }),
  ],
});

export const selectionExpressionLanguage = LRLanguage.define({ parser });

export const selectionExpressionLanguageSupport = () =>
  new LanguageSupport(selectionExpressionLanguage);

export const toCodeMirrorDiagnostics = (
  analysis: SelectionDocumentAnalysis,
): readonly Diagnostic[] =>
  [...analysis.syntaxDiagnostics, ...analysis.semanticDiagnostics].map(diagnostic => ({
    from: diagnostic.from,
    to: diagnostic.to,
    severity: 'error',
    source: diagnostic.channel === 'syntax' ? 'Ontahí syntax' : 'Ontahí semantics',
    message: diagnostic.message,
  }));

export const selectionExpressionLinter =
  (entity: SelectionLanguageEntityReflection): LintSource =>
  view =>
    toCodeMirrorDiagnostics(analyzeSelectionDocument(view.state.doc.toString(), entity));

export const selectionExpressionExtensions = (
  entity: SelectionLanguageEntityReflection,
): readonly Extension[] => [
  selectionExpressionLanguageSupport(),
  linter(selectionExpressionLinter(entity), { delay: 0 }),
];
