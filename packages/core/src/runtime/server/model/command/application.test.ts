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

  it('rejects malformed and closed command applications', () => {
    const wrapped = (request: unknown, bindings: unknown = proposal.bindings) => ({
      application: { kind: 'graph-command-application', request },
      bindings,
    });
    const baseRequest = application.request;
    const baseCommand = baseRequest.command;
    if (baseCommand.kind !== 'entity-mutation-command' || baseCommand.action === 'create')
      throw new Error('Expected an update command fixture.');

    expect(parseModelGraphCommandApplication(undefined)).toBeUndefined();
    expect(parseModelGraphCommandApplication({ application: null, bindings: {} })).toBeUndefined();
    expect(parseModelGraphCommandApplication({ application, bindings: null })).toBeUndefined();
    expect(
      parseModelGraphCommandApplication({
        application: { kind: 'graph-read-application', request: baseRequest },
        bindings: proposal.bindings,
      }),
    ).toBeUndefined();
    expect(
      parseModelGraphCommandApplication({
        application: { kind: 'graph-command-application', request: null },
        bindings: proposal.bindings,
      }),
    ).toBeUndefined();
    expect(
      parseModelGraphCommandApplication(wrapped({ ...baseRequest, kind: 'graph-read' })),
    ).toBeUndefined();
    expect(
      parseModelGraphCommandApplication(wrapped({ ...baseRequest, version: 2 })),
    ).toBeUndefined();
    expect(
      parseModelGraphCommandApplication(wrapped({ ...baseRequest, command: null })),
    ).toBeUndefined();
    expect(
      parseModelGraphCommandApplication(
        wrapped({ ...baseRequest, command: { ...baseCommand, kind: 'relation-command' } }),
      ),
    ).toBeUndefined();
    expect(
      parseModelGraphCommandApplication(
        wrapped({ ...baseRequest, command: { ...baseCommand, action: 'create' } }),
      ),
    ).toBeUndefined();
    expect(
      parseModelGraphCommandApplication(
        wrapped({ ...baseRequest, command: { ...baseCommand, target: null } }),
      ),
    ).toBeUndefined();
    expect(
      parseModelGraphCommandApplication(
        wrapped({
          ...baseRequest,
          command: { ...baseCommand, target: { ...baseCommand.target, kind: 'ref' } },
        }),
      ),
    ).toBeUndefined();
    expect(
      parseModelGraphCommandApplication(
        wrapped({
          ...baseRequest,
          command: {
            ...baseCommand,
            target: { ...baseCommand.target, expression: null },
          },
        }),
      ),
    ).toBeUndefined();
    expect(
      parseModelGraphCommandApplication({
        application: {
          kind: 'graph-command-application',
          request,
        },
        bindings: {},
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
