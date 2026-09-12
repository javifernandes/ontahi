import type { LRParser } from '@lezer/lr';
import type { GraphReadOrder } from '@ontahi/core/data-graph';

import type {
  ConsoleDialect,
  ConsoleDocumentAnalysis,
  ConsoleDocumentParseResult,
  ConsoleDocumentSyntax,
  ConsoleGraphReadSyntax,
  ConsoleLanguageApplicationReflection,
  ConsoleLanguageCompletionItem,
  ConsoleLanguageCompletionOptions,
  ConsoleLanguageCompletionResult,
} from '../model/contracts.js';

/** A semantic offer has no punctuation or dialect-specific insertion text. */
export type ConsoleCandidate =
  | { readonly kind: 'factory'; readonly repeated: boolean }
  | { readonly kind: 'filter' | 'order' | 'limit' }
  | { readonly kind: 'terminal'; readonly name: string; readonly detail: string }
  | { readonly kind: 'navigation'; readonly name: string; readonly target: string };

export type AnalyzePrefix = (source: string) => ConsoleDocumentAnalysis;

/** Internal strategy. IDs remain serializable at the public API/settings boundary. */
export interface Dialect {
  readonly id: ConsoleDialect;
  readonly parser: LRParser;
  readonly implicitMany: boolean;
  readonly directions: readonly [string, string];
  readonly directionSeparator: string;
  readonly factoryNameSeparator: string;
  parse(document: string): ConsoleDocumentParseResult;
  print(document: string, expression: ConsoleGraphReadSyntax): string;
  complete(
    document: string,
    position: number,
    application: ConsoleLanguageApplicationReflection,
    options: ConsoleLanguageCompletionOptions,
    analyzePrefix: AnalyzePrefix,
  ): ConsoleLanguageCompletionResult;
  renderCompletion(candidate: ConsoleCandidate): ConsoleLanguageCompletionItem;
  orderClause(order: GraphReadOrder): string;
  limitClause(limit: number): string;
  syntaxError(syntax: ConsoleDocumentSyntax): string;
  unsupportedOrder(terminal: string): string;
  readonly unsupportedLimit: string;
}
