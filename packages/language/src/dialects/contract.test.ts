import { describe, expect, it } from 'vitest';

import { consoleContinuationCandidates } from '../console/completion.js';
import { analyzeConsoleDocument, completeConsoleDocument } from '../index.js';
import type { ConsoleDialect } from '../model/contracts.js';

import { getDialect } from './registry.js';

const entity = {
  name: 'TodoItem',
  fields: [
    { name: 'title', type: 'string', nullable: false },
    { name: 'completed', type: 'boolean', nullable: false },
  ],
} as const;
const application = { entities: [entity] };
const sources = {
  ts: 'TodoItem.where(completed = false).many()',
  declarative: 'TodoItem where completed = false many',
} as const;

describe('dialect strategies over shared semantics', () => {
  it('offers the same semantic continuations from either recovered authoring structure', () => {
    const candidates = (id: ConsoleDialect) => {
      const syntax = getDialect(id).parse(sources[id]).syntax.expression!;
      return consoleContinuationCandidates({ ...syntax, terminal: undefined }, entity, application);
    };
    expect(candidates('ts')).toEqual(candidates('declarative'));
    expect(candidates('ts').map(candidate => candidate.kind)).toEqual([
      'order',
      'limit',
      'terminal',
      'terminal',
      'terminal',
      'terminal',
      'terminal',
    ]);
  });

  it.each(['ts', 'declarative'] as const)(
    '%s projects shared terminal candidates into executable source',
    id => {
      const dialect = getDialect(id);
      const source = sources[id];
      const expression = dialect.parse(source).syntax.expression!;
      const candidates = consoleContinuationCandidates(
        { ...expression, terminal: undefined },
        entity,
        application,
      );
      const from = expression.terminal!.from;
      for (const candidate of candidates) {
        if (candidate.kind !== 'terminal') continue;
        const projected = source.slice(0, from) + dialect.renderCompletion(candidate).apply;
        const analysis = analyzeConsoleDocument(projected, application, { dialect: id });
        expect(analysis.syntaxDiagnostics).toEqual([]);
        expect(analysis.semanticDiagnostics).toEqual([]);
        expect(analysis.request).toBeDefined();
        expect(analysis.syntax.expression?.terminal?.text).toBe(candidate.name);
      }
    },
  );

  it.each(['ts', 'declarative'] as const)(
    '%s prints foreign authoring syntax and builds clauses without changing meaning',
    id => {
      const dialect = getDialect(id);
      const foreign = id === 'ts' ? 'declarative' : 'ts';
      const source = sources[foreign];
      const expression = getDialect(foreign).parse(source).syntax.expression!;
      const printed = dialect.print(source, expression);
      expect(analyzeConsoleDocument(printed, application, { dialect: id }).request).toEqual(
        analyzeConsoleDocument(source, application, { dialect: foreign }).request,
      );
      const terminal = dialect.renderCompletion({
        kind: 'terminal',
        name: 'many',
        detail: '',
      }).apply;
      const modified =
        'TodoItem' +
        dialect.orderClause({ fieldName: 'title', direction: 'desc' }) +
        dialect.limitClause(3) +
        (id === 'ts' ? '.' : ' ') +
        terminal;
      const analysis = analyzeConsoleDocument(modified, application, { dialect: id });
      expect(analysis.syntaxDiagnostics).toEqual([]);
      expect(analysis.semanticDiagnostics).toEqual([]);
      expect(analysis.request).toMatchObject({
        orderBy: [{ fieldName: 'title', direction: 'desc' }],
        limit: 3,
      });
    },
  );

  it.each(['ts', 'declarative'] as const)(
    '%s applies the shared capability filter at the cursor, not semantic validation',
    id => {
      const source = id === 'ts' ? 'TodoItem.orderBy()' : 'TodoItem order by ';
      const position = id === 'ts' ? source.length - 1 : source.length;
      const completion = completeConsoleDocument(source, position, application, {
        dialect: id,
        orderableFields: () => ['title'],
      });
      expect(completion.items.map(item => item.label)).toEqual(['title']);
      const manual =
        id === 'ts' ? 'TodoItem.orderBy(completed).many()' : 'TodoItem order by completed many';
      expect(analyzeConsoleDocument(manual, application, { dialect: id }).request).toBeDefined();
    },
  );
});
