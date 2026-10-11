import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  entity,
  field,
  toGraphCommandRequest,
} from '../../../../data-graph/index.js';
import { openGraphCommandApplication } from '../../../../semantic-program/graph-command-application.js';

import {
  modelGraphCommandApplicationEntityMatches,
  parseModelGraphCommandApplication,
  resolveModelGraphCommandApplication,
} from './application.js';

const List = entity('ModelCommandList', { id: field.id(), name: field.string() });
const Item = entity('ModelCommandItem', {
  id: field.id(),
  list: field.existingRef(List),
  completed: field.boolean(),
});
const request = toGraphCommandRequest({
  kind: 'entity-mutation-command',
  action: 'update',
  entityName: Item.name,
  target: {
    kind: 'selection',
    entityName: Item.name,
    expression: {
      kind: 'and',
      operands: [
        {
          kind: 'predicate',
          fieldName: 'list',
          operator: 'eq',
          value: createEntityRef(List, { id: 'placeholder' }),
        },
        { kind: 'predicate', fieldName: 'completed', operator: 'eq', value: false },
      ],
    },
  },
  values: { completed: true },
});
const application = openGraphCommandApplication(request, [List, Item], {}, { list: 'list' });
const proposal = {
  application,
  bindings: { list: { kind: 'entity-match' as const, text: 'Later' } },
};

describe('Model Graph Command applications', () => {
  it('parses only bounded Selection-targeted command applications', () => {
    expect(parseModelGraphCommandApplication({ status: 'application', ...proposal })).toEqual(
      proposal,
    );
    expect(parseModelGraphCommandApplication({ application, bindings: {} })).toBeUndefined();
    expect(
      parseModelGraphCommandApplication({
        application: { ...application, kind: 'graph-read-application' },
        bindings: proposal.bindings,
      }),
    ).toBeUndefined();
  });

  it('projects reference predicate Holes as authorized entity matches', () => {
    expect(modelGraphCommandApplicationEntityMatches(proposal, [List, Item])).toEqual([
      { target: List, match: { kind: 'entity-match', text: 'Later' } },
    ]);
  });

  it('resolves one candidate and preserves the Selection update', () => {
    expect(
      resolveModelGraphCommandApplication({
        proposal,
        entities: [List, Item],
        candidates: [{ ref: createEntityRef(List, { id: 'later' }), label: 'Later' }],
      }),
    ).toMatchObject({
      status: 'resolved',
      request: {
        version: 3,
        command: {
          action: 'update',
          target: {
            expression: {
              operands: [
                { fieldName: 'list', value: { locator: { id: 'later' } } },
                { fieldName: 'completed', value: false },
              ],
            },
          },
          values: { completed: true },
        },
      },
    });
  });

  it('returns a choice for duplicate visible matches and rejects missing matches', () => {
    expect(
      resolveModelGraphCommandApplication({
        proposal,
        entities: [List, Item],
        candidates: [
          { ref: createEntityRef(List, { id: 'later-1' }), label: 'Later' },
          { ref: createEntityRef(List, { id: 'later-2' }), label: 'Later' },
        ],
      }),
    ).toMatchObject({ status: 'choice', options: [{ label: 'Later' }, { label: 'Later' }] });
    expect(
      resolveModelGraphCommandApplication({ proposal, entities: [List, Item], candidates: [] }),
    ).toEqual({ status: 'unresolved', reason: 'No visible ModelCommandList matches “Later”.' });
  });
});
