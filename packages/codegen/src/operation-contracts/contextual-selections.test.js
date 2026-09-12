import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { projectContextualSelections } from './contextual-selections.mjs';

const project = source => {
  const file = ts.createSourceFile(
    'model.ts',
    `const selections = ${source}`,
    ts.ScriptTarget.Latest,
    true,
  );
  return projectContextualSelections(
    file.statements[0].declarationList.declarations[0].initializer,
  );
};

describe('contextual Selection declaration compiler', () => {
  it.each([
    ['"part"', 'part'],
    ['42', 42],
    ['-3', -3],
    ['true', true],
    ['false', false],
    ['null', null],
  ])('compiles literal %s as data', (literal, expected) => {
    const result = project(
      `({ self: source }) => ({ parts: source.nodes.where(n => n.value.eq(${literal})) })`,
    );
    expect(JSON.parse(result.contextualSelectionsText).parts.expression.value).toEqual(expected);
  });
  it('compiles an unfiltered relation', () => {
    expect(
      JSON.parse(project('({ self }) => ({ nodes: self.nodes })').contextualSelectionsText),
    ).toEqual({ nodes: { relationName: 'nodes', expression: { kind: 'all' } } });
  });
  it.each(['lt', 'lte', 'gt', 'gte'])('retains operator %s', operator => {
    const result = project(
      `({ self }) => ({ items: self.items.where(i => i.count.${operator}(3)) })`,
    );
    expect(JSON.parse(result.contextualSelectionsText).items.expression.operator).toBe(operator);
  });
  it.each([
    'loadSelections()',
    'self => ({ nodes: self.nodes })',
    '({ other }) => ({ nodes: other.nodes })',
    '({ self = source }) => ({ nodes: self.nodes })',
    '({ self }) => { return {}; }',
    '({ self }) => ({ ...other })',
    '({ self }) => ({ nodes: other.nodes })',
    '({ self }) => ({ nodes: self.nodes.limit(1) })',
    '({ self }) => ({ nodes: self.nodes.where(filter) })',
    '({ self }) => ({ nodes: self.nodes.where(n => n.active) })',
    '({ self }) => ({ nodes: self.nodes.where(n => n.active.eq(secret)) })',
    '({ self }) => ({ nodes: self.nodes.where(n => other.active.eq(true)) })',
    '({ self }) => ({ nodes: self.nodes.where(n => n.active.eq(true, false)) })',
  ])('diagnoses unsupported syntax without emitting a closure: %s', source => {
    const result = project(source);
    expect(result.contextualSelectionsText).toBeUndefined();
    expect(result.diagnostics[0]).toContain('portable relation templates');
  });
});
