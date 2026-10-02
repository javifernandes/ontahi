import { describe, expect, it } from 'vitest';

import { createEntityRef, field, graphSchema, toGraphJsonSchema } from '../../data-graph/index.js';

import { entity } from './entity.js';
import {
  modelOperationApplicationEntityMatches,
  modelOperationApplicationSchema,
  parseModelOperationApplication,
  resolveModelOperationApplication,
} from './model-operation-application.js';

const List = entity({ name: 'OperationList', fields: { id: field.id(), name: field.string() } });
const contract = {
  id: 'OperationList.addItem',
  input: graphSchema.object({ list: graphSchema.ref(List), title: field.string() }),
};
const application = {
  kind: 'operation-application' as const,
  operationId: contract.id,
  arguments: {
    list: { kind: 'hole' as const, id: 'list' },
    title: { kind: 'value' as const, value: 'Buy milk' },
  },
};
const proposal = {
  application,
  bindings: { list: { kind: 'entity-match' as const, text: 'Inbox' } },
};

describe('Model Operation applications', () => {
  it('projects value and Hole arguments and parses separate match bindings', () => {
    expect(
      modelOperationApplicationSchema(contract.id, toGraphJsonSchema(contract.input)),
    ).toMatchObject({
      properties: {
        operationId: { const: contract.id },
        arguments: {
          required: ['list', 'title'],
          properties: {
            list: {
              anyOf: [
                { properties: { kind: { const: 'value' } } },
                { properties: { kind: { const: 'hole' } } },
              ],
            },
          },
        },
      },
    });
    expect(parseModelOperationApplication({ application, bindings: proposal.bindings })).toEqual(
      proposal,
    );
    expect(parseModelOperationApplication({ application, bindings: {} })).toBeUndefined();
  });

  it('derives the Ref target and keeps scalar values closed', () => {
    expect(modelOperationApplicationEntityMatches(proposal, contract)).toEqual([
      { holeId: 'list', target: List, text: 'Inbox' },
    ]);
    expect(
      modelOperationApplicationEntityMatches(
        {
          application: {
            ...application,
            arguments: { ...application.arguments, title: { kind: 'hole', id: 'title' } },
          },
          bindings: {
            ...proposal.bindings,
            title: { kind: 'entity-match', text: 'Buy milk' },
          },
        },
        contract,
      ),
    ).toBeUndefined();
  });

  it('lowers one match and produces canonical choices for ambiguity', () => {
    const inbox = { ref: createEntityRef(List, { id: 'inbox' }), label: 'Inbox' };
    expect(resolveModelOperationApplication(proposal, contract, { list: [inbox] })).toEqual({
      status: 'resolved',
      request: {
        kind: 'invoke',
        operationId: contract.id,
        input: { list: inbox.ref, title: 'Buy milk' },
      },
    });
    expect(
      resolveModelOperationApplication(proposal, contract, {
        list: [inbox, { ref: createEntityRef(List, { id: 'inbox-2' }), label: 'INBOX' }],
      }),
    ).toMatchObject({ status: 'choice', options: [{ label: 'Inbox' }, { label: 'INBOX' }] });
    expect(resolveModelOperationApplication(proposal, contract, {})).toEqual({
      status: 'unresolved',
      reason: 'No visible entity matches this request.',
    });
  });
});
