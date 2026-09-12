import { compileSelectionExpression, entity, field, mapEntity } from '@ontahi/core/data-graph';
import {
  applySupabaseSelection,
  compileSupabaseSelection,
  type SupabaseSelectionQuery,
} from '@ontahi/supabase/data-graph';
import { describe, expect, it } from 'vitest';

import { analyzeSelectionDocument } from '../index.js';

interface TestSupabaseQuery extends SupabaseSelectionQuery<TestSupabaseQuery> {}

describe('Selection language adapter compatibility', () => {
  it('compiles and applies a nested expression through the Supabase adapter', () => {
    const Article = entity('LanguageSelectionArticle', {
      id: field.id(),
      status: field.enum(['open', 'blocked'] as const),
      score: field.number(),
      completed: field.boolean(),
    });
    mapEntity(Article).toTable('language_selection_articles');
    const analysis = analyzeSelectionDocument(
      '(status = "open" or status = "blocked") and score >= 2 and not completed = true',
      {
        name: Article.name,
        fields: [
          { name: 'status', type: 'enum', nullable: false, enumValues: ['open', 'blocked'] },
          { name: 'score', type: 'number', nullable: false },
          { name: 'completed', type: 'boolean', nullable: false },
        ],
      },
    );
    const operations: Array<{ method: string; arguments: unknown[] }> = [];
    const query: TestSupabaseQuery = {
      eq: () => query,
      in: () => query,
      is: () => query,
      lte: () => query,
      lt: () => query,
      gte: () => query,
      gt: () => query,
      or: filter => {
        operations.push({ method: 'or', arguments: [filter] });
        return query;
      },
    };

    expect(analysis.semanticDiagnostics).toEqual([]);
    const compiled = compileSupabaseSelection(
      compileSelectionExpression(Article, analysis.selection!.expression),
    );
    applySupabaseSelection(query, compiled);

    expect(operations).toEqual([
      {
        method: 'or',
        arguments: [
          'and(or(status.eq."open",status.eq."blocked"),score.gte.2,not.completed.eq.true)',
        ],
      },
    ]);
  });
});
