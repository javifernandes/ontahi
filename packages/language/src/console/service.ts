import { getDialect } from '../dialects/registry.js';
import type {
  ConsoleDialect,
  ConsoleDocumentParseResult,
  ConsoleDocumentAnalysis,
  ConsoleLanguageCompletionResult,
  ConsoleDocumentAnalysisOptions,
  ConsoleLanguageApplicationReflection,
  ConsoleLanguageCompletionOptions,
} from '../model/contracts.js';

import { analyzeConsoleSyntax } from './analysis.js';

export const parseConsoleDocument = (
  document: string,
  dialect: ConsoleDialect = 'ts',
): ConsoleDocumentParseResult => getDialect(dialect).parse(document);

export const analyzeConsoleDocument = (
  document: string,
  application: ConsoleLanguageApplicationReflection,
  options: ConsoleDocumentAnalysisOptions = {},
): ConsoleDocumentAnalysis => {
  const dialect = getDialect(options.dialect);
  return analyzeConsoleSyntax(dialect.parse(document), application, options, dialect);
};

/** Conversion validates the current source and preserves terminal intent, never executing a read. */
export const convertConsoleDocument = (
  document: string,
  application: ConsoleLanguageApplicationReflection,
  targetDialect: ConsoleDialect,
  options: ConsoleDocumentAnalysisOptions = {},
): string | undefined => {
  const analysis = analyzeConsoleDocument(document, application, options);
  if (!analysis.request || !analysis.syntax.expression) return undefined;
  return targetDialect === (options.dialect ?? 'ts')
    ? document
    : getDialect(targetDialect).print(document, analysis.syntax.expression);
};

export const completeConsoleDocument = (
  document: string,
  position: number,
  application: ConsoleLanguageApplicationReflection,
  options: ConsoleLanguageCompletionOptions = {},
): ConsoleLanguageCompletionResult => {
  const dialect = getDialect(options.dialect);
  return dialect.complete(document, position, application, options, source =>
    analyzeConsoleDocument(source, application, { dialect: dialect.id }),
  );
};
