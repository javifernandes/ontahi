import type { GraphReadOrder } from '@ontahi/core/data-graph';

import type { Dialect } from '../dialects/contract.js';
import { getDialect } from '../dialects/registry.js';
import type {
  SelectionLanguageRange,
  SelectionLanguageToken,
  ConsoleLanguageApplicationReflection,
  ConsoleDocumentAnalysisOptions,
} from '../model/contracts.js';

import { analyzeConsoleDocument } from './service.js';

export type ConsoleDocumentChange = SelectionLanguageRange & { readonly insert: string };

/** Insert or replace a many Query's limit without rewriting unrelated source. */
export const editConsoleLimit = (
  document: string,
  application: ConsoleLanguageApplicationReflection,
  limit: number,
  options: ConsoleDocumentAnalysisOptions = {},
): readonly ConsoleDocumentChange[] | undefined => {
  if (!Number.isSafeInteger(limit) || limit < 0) return undefined;
  const analysis = analyzeConsoleDocument(document, application, options);
  const syntax = analysis.syntax.expression;
  if (!analysis.request || analysis.request.mode !== 'run' || !syntax?.entity) return undefined;
  if (syntax.limitValue) {
    return syntax.limitValue.value === limit
      ? []
      : [{ from: syntax.limitValue.from, to: syntax.limitValue.to, insert: String(limit) }];
  }
  const position =
    syntax.orderBy?.to ??
    syntax.whereClose?.to ??
    syntax.selection?.to ??
    syntax.navigations.at(-1)?.to ??
    syntax.factories.at(-1)?.to ??
    syntax.entity.to;
  return [
    {
      from: position,
      to: position,
      insert: getDialect(options.dialect).limitClause(limit),
    },
  ];
};

const consoleOrderReplacementChanges = (
  field: SelectionLanguageToken<'field-name'>,
  direction: SelectionLanguageToken<'order-direction'> | undefined,
  order: GraphReadOrder,
  dialect: Dialect,
): ConsoleDocumentChange[] => {
  const changes: ConsoleDocumentChange[] = [];
  const spelling = dialect.directions[order.direction === 'asc' ? 0 : 1];
  if (field.text !== order.fieldName) {
    changes.push({ from: field.from, to: field.to, insert: order.fieldName });
  }
  if (direction) {
    if (direction.text !== spelling) {
      changes.push({ from: direction.from, to: direction.to, insert: spelling });
    }
  } else if (order.direction !== 'asc') {
    changes.push({
      from: field.to,
      to: field.to,
      insert: dialect.directionSeparator + spelling,
    });
  }
  return changes;
};

/** Source-preserving edits for a valid Query; safe to apply as one editor transaction. */
export const editConsoleOrderBy = (
  document: string,
  application: ConsoleLanguageApplicationReflection,
  order: GraphReadOrder | undefined,
  options: ConsoleDocumentAnalysisOptions = {},
): readonly ConsoleDocumentChange[] | undefined => {
  const analysis = analyzeConsoleDocument(document, application, options);
  const syntax = analysis.syntax.expression;
  if (
    !analysis.request ||
    !syntax?.entity ||
    analysis.request.mode === 'count' ||
    syntax.terminal?.kind === 'exists-member'
  )
    return undefined;
  const existing = syntax.orderBy;
  const changes: ConsoleDocumentChange[] = [];
  if (!order) {
    if (existing) changes.push({ from: existing.from, to: existing.to, insert: '' });
  } else if (existing?.field) {
    changes.push(
      ...consoleOrderReplacementChanges(
        existing.field,
        existing.direction,
        order,
        getDialect(options.dialect),
      ),
    );
  } else {
    const position =
      syntax.whereClose?.to ??
      syntax.selection?.to ??
      syntax.navigations.at(-1)?.to ??
      syntax.factories.at(-1)?.to ??
      syntax.entity.to;
    changes.push({
      from: position,
      to: position,
      insert: getDialect(options.dialect).orderClause(order),
    });
  }
  const nextDocument = changes.reduceRight(
    (source, change) => source.slice(0, change.from) + change.insert + source.slice(change.to),
    document,
  );
  const nextRequest = analyzeConsoleDocument(nextDocument, application, options).request;
  const nextOrder = nextRequest?.orderBy[0];
  if (!nextRequest || !consoleOrderMatches(nextOrder, order)) return undefined;
  return changes;
};

const consoleOrderMatches = (left: GraphReadOrder | undefined, right: GraphReadOrder | undefined) =>
  left?.fieldName === right?.fieldName && left?.direction === right?.direction;
