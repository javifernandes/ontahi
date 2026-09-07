import { describe, expect, it } from 'vitest';

import {
  analyzeSelectionDocument,
  classifySelectionDocument,
  completeSelectionDocument,
  getSelectionDocumentCursorContext,
  hoverSelectionDocument,
  type SelectionLanguageCompletionResult,
} from './index.js';

const WorkItem = {
  name: 'WorkItem',
  fields: [
    { name: 'id', type: 'id', nullable: false },
    { name: 'title', type: 'string', nullable: false },
    {
      name: 'note',
      type: 'string',
      nullable: true,
      documentation: 'Optional note shown to collaborators.',
    },
    { name: 'completed', type: 'boolean', nullable: false },
    { name: 'score', type: 'number', nullable: false },
    {
      name: 'status',
      type: 'enum',
      valueType: 'WorkStatus',
      nullable: false,
      enumValues: ['open', 'blocked'],
    },
    { name: 'createdAt', type: 'date', nullable: false },
    { name: 'metadata', type: 'json', nullable: false },
    {
      name: 'owner',
      type: 'reference',
      nullable: false,
      reference: { entityName: 'Person' },
    },
  ],
  relations: [{ name: 'tags' }],
} as const;

const labels = (completion: SelectionLanguageCompletionResult) =>
  completion.items.map(item => item.label);

const apply = (document: string, completion: SelectionLanguageCompletionResult, label: string) => {
  const item = completion.items.find(candidate => candidate.label === label)!;
  return `${document.slice(0, completion.from)}${item.apply}${document.slice(completion.to)}`;
};

describe('Selection language completion', () => {
  it('suggests only selectable reflected Fields and root syntax', () => {
    const completion = completeSelectionDocument('', 0, WorkItem);

    expect(completion).toMatchObject({ context: 'expression', from: 0, to: 0 });
    expect(labels(completion)).toEqual([
      'id',
      'title',
      'note',
      'completed',
      'score',
      'status',
      'all',
      'none',
      'not',
      '(',
    ]);
    expect(labels(completion)).not.toContain('owner');
    expect(labels(completion)).not.toContain('tags');
  });

  it('replaces a partial Field from the recovered syntax tree', () => {
    const completion = completeSelectionDocument('compl', 5, WorkItem);

    expect(completion).toMatchObject({ context: 'expression', from: 0, to: 5 });
    expect(apply('compl', completion, 'completed')).toBe('completed');
    expect(getSelectionDocumentCursorContext('compl', 5, WorkItem)).toEqual({
      kind: 'expression',
      from: 0,
      to: 5,
    });
  });

  it.each([
    ['completed ', ['=', 'in']],
    ['note ', ['=', 'in', 'is null']],
    ['score ', ['=', 'in', '<', '<=', '>', '>=']],
  ])('filters operators for %s through the compatibility matrix', (document, expected) => {
    const completion = completeSelectionDocument(document, document.length, WorkItem);

    expect(completion.context).toBe('operator');
    expect(labels(completion)).toEqual(expected);
  });

  it('allows authority-safe execution metadata to narrow affordances without changing meaning', () => {
    const completion = completeSelectionDocument('score ', 6, WorkItem, {
      fields: [{ name: 'score', operators: ['eq'] }],
    });

    expect(labels(completion)).toEqual(['=']);
    expect(analyzeSelectionDocument('score > 2', WorkItem).selection?.expression).toEqual({
      kind: 'predicate',
      fieldName: 'score',
      operator: 'gt',
      value: 2,
    });
  });

  it('uses the recovered error token as the replacement range for a partial operator', () => {
    const document = 'completed i';
    const completion = completeSelectionDocument(document, document.length, WorkItem);

    expect(completion).toMatchObject({ context: 'operator', from: 10, to: 11 });
    expect(apply(document, completion, 'in')).toBe('completed in');
  });

  it.each([
    ['completed = false', 10, 10, 11, 'in', 'completed in false'],
    ['note is null', 7, 5, 12, '=', 'note ='],
  ])(
    'replaces the whole operator when completion opens inside %s',
    (document, position, from, to, replacement, expected) => {
      const completion = completeSelectionDocument(document, position, WorkItem);

      expect(completion).toMatchObject({ context: 'operator', from, to });
      expect(apply(document, completion, replacement)).toBe(expected);
    },
  );

  it.each([
    ['completed = ', ['true', 'false']],
    ['status = ', ['"open"', '"blocked"']],
    ['title = ', ['""']],
    ['score >= ', ['0']],
  ])('offers structural values for %s', (document, expected) => {
    const completion = completeSelectionDocument(document, document.length, WorkItem);

    expect(completion.context).toBe('value');
    expect(labels(completion)).toEqual(expected);
  });

  it('completes a partial enum literal into immediately valid Selection text', () => {
    const document = 'status = "o';
    const completion = completeSelectionDocument(document, document.length, WorkItem);
    const completed = apply(document, completion, '"open"');

    expect(completion).toMatchObject({ context: 'value', from: 9, to: 11 });
    expect(completed).toBe('status = "open"');
    expect(analyzeSelectionDocument(completed, WorkItem).selection?.expression).toEqual({
      kind: 'predicate',
      fieldName: 'status',
      operator: 'eq',
      value: 'open',
    });
  });

  it('guides membership list opening, values, separators, and closure', () => {
    const afterOperator = completeSelectionDocument('status in ', 10, WorkItem);
    const firstValue = completeSelectionDocument('status in [', 11, WorkItem);
    const afterValue = completeSelectionDocument('status in ["open" ', 18, WorkItem);
    const nextValue = completeSelectionDocument('status in ["open", ', 19, WorkItem);

    expect(afterOperator).toMatchObject({ context: 'value' });
    expect(labels(afterOperator)).toEqual(['[']);
    expect(firstValue).toMatchObject({ context: 'list-value' });
    expect(labels(firstValue)).toEqual(['"open"', '"blocked"', ']']);
    expect(afterValue).toMatchObject({ context: 'list-continuation' });
    expect(labels(afterValue)).toEqual([',', ']']);
    expect(nextValue).toMatchObject({ context: 'list-value' });
    expect(labels(nextValue)).toEqual(['"open"', '"blocked"', ']']);
  });

  it.each(['not ', 'completed = false and ', 'completed = false or ', '('])(
    'returns to expression context after %s',
    document => {
      const completion = completeSelectionDocument(document, document.length, WorkItem);

      expect(completion.context).toBe('expression');
      expect(labels(completion)).toContain('completed');
    },
  );

  it('suggests Boolean continuations and recovered group closure', () => {
    expect(labels(completeSelectionDocument('completed = false ', 18, WorkItem))).toEqual([
      'and',
      'or',
    ]);
    expect(labels(completeSelectionDocument('(completed = false ', 19, WorkItem))).toEqual([
      'and',
      'or',
      ')',
    ]);
  });

  it('does not retain Fields from a replaced Entity reflection', () => {
    const before = completeSelectionDocument('', 0, {
      name: 'First',
      fields: [{ name: 'completed', type: 'boolean', nullable: false }],
    });
    const after = completeSelectionDocument('', 0, {
      name: 'Second',
      fields: [{ name: 'archived', type: 'boolean', nullable: false }],
    });

    expect(labels(before)).toContain('completed');
    expect(labels(after)).toContain('archived');
    expect(labels(after)).not.toContain('completed');
  });

  it('handles recovered cursor boundaries without leaving structural context', () => {
    expect(completeSelectionDocument('', -10, WorkItem)).toMatchObject({ from: 0, to: 0 });
    expect(completeSelectionDocument('all', 100, WorkItem).context).toBe('expression');
    expect(completeSelectionDocument('owner ', 6, WorkItem)).toMatchObject({
      context: 'operator',
      items: [],
    });
    expect(labels(completeSelectionDocument('note is n', 9, WorkItem))).toEqual(['null']);
    expect(completeSelectionDocument('note is null ', 13, WorkItem).context).toBe('continuation');
    expect(completeSelectionDocument('status in ["open"] ', 19, WorkItem).context).toBe(
      'continuation',
    );
    expect(completeSelectionDocument('completed = false', 15, WorkItem).context).toBe('value');
  });

  it('preserves keyword boundaries when completion opens before whitespace is typed', () => {
    const afterNot = completeSelectionDocument('not', 3, WorkItem);
    const afterAnd = completeSelectionDocument('completed = false and', 21, WorkItem);

    expect(apply('not', afterNot, 'completed')).toBe('not completed');
    expect(apply('completed = false and', afterAnd, 'completed')).toBe(
      'completed = false and completed',
    );

    const constant = completeSelectionDocument('all', 3, WorkItem);
    expect(constant).toMatchObject({ from: 0, to: 3 });
    expect(apply('all', constant, 'none')).toBe('none');

    const nullCheck = completeSelectionDocument('note is null', 12, WorkItem);
    expect(nullCheck).toMatchObject({ context: 'continuation', from: 12, to: 12 });
    expect(apply('note is null', nullCheck, 'and')).toBe('note is null and');
  });

  it('replaces a lone opening quote with a complete structural string literal', () => {
    const document = 'title = "';
    const completion = completeSelectionDocument(document, document.length, WorkItem);

    expect(completion).toMatchObject({ context: 'value', from: 8, to: 9 });
    expect(apply(document, completion, '""')).toBe('title = ""');
  });
});

describe('Selection language semantic assistance', () => {
  it('classifies resolved, unsupported, and invalid identifiers independently of syntax', () => {
    expect(
      classifySelectionDocument(
        'completed = false or createdAt = "2026-01-01" or tags = "x" or missing = true',
        WorkItem,
      ),
    ).toEqual([
      { kind: 'field', from: 0, to: 9 },
      { kind: 'operator', from: 10, to: 11 },
      { kind: 'value', from: 12, to: 17 },
      { kind: 'keyword', from: 18, to: 20 },
      { kind: 'unsupported-field', from: 21, to: 30 },
      { kind: 'operator', from: 31, to: 32 },
      { kind: 'value', from: 33, to: 45 },
      { kind: 'keyword', from: 46, to: 48 },
      { kind: 'unsupported-relation', from: 49, to: 53 },
      { kind: 'operator', from: 54, to: 55 },
      { kind: 'value', from: 56, to: 59 },
      { kind: 'keyword', from: 60, to: 62 },
      { kind: 'invalid-identifier', from: 63, to: 70 },
      { kind: 'operator', from: 71, to: 72 },
      { kind: 'value', from: 73, to: 77 },
    ]);
  });

  it('reports reflected Field help and preserves source-independent documentation', () => {
    expect(hoverSelectionDocument('note = "hello"', 2, WorkItem)).toEqual({
      from: 0,
      to: 4,
      title: 'WorkItem.note',
      detail: 'string · nullable',
      documentation: 'Optional note shown to collaborators.',
    });
  });

  it('reports canonical operator help from the same parsed predicate', () => {
    expect(hoverSelectionDocument('score >= 2', 7, WorkItem)).toEqual({
      from: 6,
      to: 8,
      title: 'Greater than or equal',
      detail: 'Selection operator · gte',
      documentation:
        'Matches when the number Field is greater than or equal to the supplied number.',
    });
  });

  it('explains unknown identifiers without manufacturing Field meaning', () => {
    expect(hoverSelectionDocument('missing = true', 3, WorkItem)).toEqual({
      from: 0,
      to: 7,
      title: 'Unknown Field missing',
      detail: 'WorkItem',
      documentation: 'This identifier does not resolve in the selected Entity reflection.',
    });
  });

  it('classifies constants, negation, and membership values', () => {
    expect(
      classifySelectionDocument('not (status in ["open", "blocked"] or all)', WorkItem).map(
        classification => classification.kind,
      ),
    ).toEqual(['keyword', 'field', 'operator', 'value', 'value', 'keyword', 'keyword']);
  });

  it('explains unsupported reflected Fields and relations', () => {
    expect(hoverSelectionDocument('createdAt = "today"', 2, WorkItem)).toMatchObject({
      title: 'WorkItem.createdAt',
      detail: 'date · required',
      documentation: 'This Field type is not supported by the Selection language yet.',
    });
    expect(hoverSelectionDocument('tags = "important"', 2, WorkItem)).toMatchObject({
      title: 'WorkItem.tags',
      detail: 'relation · unsupported',
      documentation: 'Relation predicates are not supported by this language version.',
    });
  });
});
