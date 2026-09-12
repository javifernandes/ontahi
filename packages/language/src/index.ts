export { resolveConsoleContext } from './console/context.js';

export type {
  SelectionLanguageRange,
  SelectionLanguageDiagnostic,
  SelectionLanguageFieldReflection,
  SelectionLanguageEntityReflection,
  SelectionLanguageToken,
  SelectionBooleanLiteralSyntax,
  SelectionStringLiteralSyntax,
  SelectionNumberLiteralSyntax,
  SelectionScalarLiteralSyntax,
  SelectionListLiteralSyntax,
  SelectionLanguagePredicateOperator,
  SelectionPredicateOperatorSyntax,
  SelectionPredicateSyntax,
  SelectionConstantSyntax,
  SelectionNotSyntax,
  SelectionLogicalSyntax,
  SelectionParenthesizedSyntax,
  SelectionExpressionSyntax,
  SelectionDocumentSyntax,
  SelectionDocumentParseResult,
  SelectionDocumentAnalysis,
  SelectionLanguageCursorContext,
  SelectionLanguageCompletionItem,
  SelectionLanguageCompletionResult,
  SelectionLanguageCursorContextResult,
  SelectionReferenceValueContext,
  SelectionLanguageExecutionAffordances,
  SelectionLanguageSemanticClassification,
  SelectionLanguageHover,
  ConsoleLanguageApplicationReflection,
  ConsoleLanguageDiagnostic,
  ConsoleOrderBySyntax,
  ConsoleGraphReadSyntax,
  ConsoleFilterSyntax,
  ConsoleMembershipStep,
  ConsoleDocumentSyntax,
  ConsoleDocumentParseResult,
  ConsoleDocumentAnalysis,
  ConsoleDialect,
  ConsoleDocumentAnalysisOptions,
  ConsoleLanguageCompletionItem,
  ConsoleLanguageCompletionResult,
  ConsoleLanguageCompletionOptions,
} from './model/contracts.js';

export { parseSelectionDocument } from './selection/syntax.js';

export { analyzeSelectionDocument } from './selection/semantics.js';

export { reflectSelectionLanguageEntity } from './reflection/entity.js';

export {
  parseConsoleDocument,
  analyzeConsoleDocument,
  convertConsoleDocument,
  completeConsoleDocument,
} from './console/service.js';

export { isConsoleOrderableField } from './console/analysis.js';

export {
  editConsoleLimit,
  editConsoleOrderBy,
  type ConsoleDocumentChange,
} from './console/edits.js';

export {
  completeSelectionDocument,
  getSelectionDocumentCursorContext,
  getSelectionReferenceValueContext,
} from './selection/assistance.js';
export { classifySelectionDocument, hoverSelectionDocument } from './selection/annotations.js';
