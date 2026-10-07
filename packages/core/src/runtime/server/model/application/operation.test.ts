import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  field,
  graphSchema,
  toGraphJsonSchema,
} from '../../../../data-graph/index.js';
import { entity } from '../../entity.js';

import {
  continueModelOperationApplication,
  modelOperationApplicationEntityChoices,
  modelOperationApplicationEntityMatches,
  modelOperationApplicationSchema,
  parseModelOperationApplication,
  resolveModelOperationApplication,
  submitModelOperationApplicationInput,
} from './operation.js';

const List = entity({ name: 'OperationList', fields: { id: field.id(), name: field.string() } });
const contract = {
  id: 'OperationList.addItem',
  input: graphSchema.object({
    list: graphSchema.ref(List),
    title: field.nonEmptyString({ trim: true }),
  }),
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
    expect(
      parseModelOperationApplication({
        application: { ...application, kind: 'other' },
        bindings: proposal.bindings,
      }),
    ).toBeUndefined();
    expect(
      parseModelOperationApplication({
        application: { ...application, arguments: { ...application.arguments, title: null } },
        bindings: proposal.bindings,
      }),
    ).toBeUndefined();
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
    const choice = resolveModelOperationApplication(proposal, contract, {
      list: [inbox, { ref: createEntityRef(List, { id: 'inbox-2' }), label: 'INBOX' }],
    });
    expect(choice).toMatchObject({
      status: 'choice',
      holeId: 'list',
      options: [{ label: 'Inbox' }, { label: 'INBOX' }],
      proposal: { application },
    });
    if (choice.status !== 'choice') throw new Error('Expected a choice.');
    expect(continueModelOperationApplication(choice, contract, choice.options[1]!.id)).toEqual({
      status: 'resolved',
      request: {
        kind: 'invoke',
        operationId: contract.id,
        input: {
          list: createEntityRef(List, { id: 'inbox-2' }),
          title: 'Buy milk',
        },
      },
    });
    expect(continueModelOperationApplication(choice, contract, 'missing')).toEqual({
      status: 'unresolved',
      reason: 'The selected entity is no longer available.',
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
    expect(
      resolveModelOperationApplication(proposal, contract, {
        list: Array.from({ length: 21 }, (_, index) => ({
          ref: createEntityRef(List, { id: `inbox-${index}` }),
          label: `Inbox ${index}`,
        })),
      }),
    ).toEqual({
      status: 'unresolved',
      reason: 'Too many matching entities. Be more specific.',
    });
    const Other = entity({ name: 'OtherOperationList', fields: { id: field.id() } });
    expect(
      resolveModelOperationApplication(proposal, contract, {
        list: [{ ref: createEntityRef(Other, { id: 'other' }), label: 'Other' }],
      }),
    ).toEqual({
      status: 'unresolved',
      reason: 'The proposed operation could not be completed.',
    });
  });

  it('keeps the partial application and asks for ambiguous Holes one at a time', () => {
    const Destination = entity({
      name: 'OperationDestination',
      fields: { id: field.id(), name: field.string() },
    });
    const multiContract = {
      id: 'OperationList.moveItem',
      input: graphSchema.object({
        source: graphSchema.ref(List),
        destination: graphSchema.ref(Destination),
      }),
    };
    const multiProposal = {
      application: {
        kind: 'operation-application' as const,
        operationId: multiContract.id,
        arguments: {
          source: { kind: 'hole' as const, id: 'source' },
          destination: { kind: 'hole' as const, id: 'destination' },
        },
      },
      bindings: {
        source: { kind: 'entity-match' as const, text: 'Inbox' },
        destination: { kind: 'entity-match' as const, text: 'Later' },
      },
    };
    const candidates = {
      source: [
        { ref: createEntityRef(List, { id: 'inbox-a' }), label: 'Inbox A' },
        { ref: createEntityRef(List, { id: 'inbox-b' }), label: 'Inbox B' },
      ],
      destination: [
        { ref: createEntityRef(Destination, { id: 'later-a' }), label: 'Later A' },
        { ref: createEntityRef(Destination, { id: 'later-b' }), label: 'Later B' },
      ],
    };

    const sourceChoice = resolveModelOperationApplication(multiProposal, multiContract, candidates);
    expect(sourceChoice).toMatchObject({ status: 'choice', holeId: 'source' });
    if (sourceChoice.status !== 'choice') throw new Error('Expected source choice.');
    const destinationChoice = continueModelOperationApplication(
      sourceChoice,
      multiContract,
      sourceChoice.options[1]!.id,
    );
    expect(destinationChoice).toMatchObject({
      status: 'choice',
      holeId: 'destination',
      proposal: {
        application: {
          arguments: {
            source: { kind: 'value', value: createEntityRef(List, { id: 'inbox-b' }) },
            destination: { kind: 'hole', id: 'destination' },
          },
        },
      },
    });
    if (destinationChoice.status !== 'choice') throw new Error('Expected destination choice.');
    expect(
      continueModelOperationApplication(
        destinationChoice,
        multiContract,
        destinationChoice.options[0]!.id,
      ),
    ).toMatchObject({
      status: 'resolved',
      request: {
        input: {
          source: createEntityRef(List, { id: 'inbox-b' }),
          destination: createEntityRef(Destination, { id: 'later-a' }),
        },
      },
    });
  });

  it('continues an omitted Entity choice into a scalar input without another interpretation', () => {
    const open = {
      application: {
        kind: 'operation-application' as const,
        operationId: contract.id,
        arguments: {
          list: { kind: 'hole' as const, id: 'list' },
          title: { kind: 'hole' as const, id: 'title' },
        },
      },
      bindings: {
        list: { kind: 'entity-choice' as const, prompt: 'Which list?' },
        title: { kind: 'free-input' as const, prompt: 'What should the item say?' },
      },
    };
    expect(parseModelOperationApplication(open)).toEqual(open);
    expect(modelOperationApplicationEntityMatches(open, contract)).toEqual([]);
    expect(modelOperationApplicationEntityChoices(open, contract)).toEqual([
      { holeId: 'list', target: List },
    ]);

    const inbox = { ref: createEntityRef(List, { id: 'inbox' }), label: 'Inbox' };
    const later = { ref: createEntityRef(List, { id: 'later' }), label: 'Later' };
    const choice = resolveModelOperationApplication(open, contract, { list: [inbox, later] });
    expect(choice).toMatchObject({ status: 'choice', prompt: 'Which list?', holeId: 'list' });
    if (choice.status !== 'choice') throw new Error('Expected list choice.');
    const input = continueModelOperationApplication(choice, contract, choice.options[0]!.id);
    expect(input).toMatchObject({
      status: 'input',
      prompt: 'What should the item say?',
      holeId: 'title',
      input: { type: 'string' },
    });
    if (input.status !== 'input') throw new Error('Expected title input.');
    expect(submitModelOperationApplicationInput(input, contract, '  Buy milk  ')).toEqual({
      status: 'resolved',
      request: {
        kind: 'invoke',
        operationId: contract.id,
        input: { list: inbox.ref, title: 'Buy milk' },
      },
    });
    expect(submitModelOperationApplicationInput(input, contract, '')).toEqual({
      status: 'unresolved',
      reason: 'The supplied value is invalid.',
    });
  });

  it.each([
    ['count', field.number(), { type: 'number' }, 3],
    ['completed', field.boolean(), { type: 'boolean' }, false],
    ['priority', field.enum(['low', 'high']), { type: 'enum', values: ['low', 'high'] }, 'high'],
    ['note', graphSchema.nullable(field.string()), { type: 'string', nullable: true }, null],
    [
      'direction',
      graphSchema.union([graphSchema.literal('before'), graphSchema.literal('after')]),
      { type: 'enum', values: ['before', 'after'] },
      'after',
    ],
    [
      'state',
      graphSchema.union([graphSchema.literal('active'), graphSchema.literal(null)]),
      { type: 'enum', values: ['active', null], nullable: true },
      null,
    ],
  ] as const)('derives and submits a typed %s Hole', (name, schema, descriptor, value) => {
    const typedContract = {
      id: `OperationList.set-${name}`,
      input: graphSchema.object({ [name]: schema }),
    };
    const typedProposal = {
      application: {
        kind: 'operation-application' as const,
        operationId: typedContract.id,
        arguments: { [name]: { kind: 'hole' as const, id: 'value' } },
      },
      bindings: { value: { kind: 'free-input' as const, prompt: `Choose ${name}` } },
    };
    const input = resolveModelOperationApplication(typedProposal, typedContract, {});
    expect(input).toMatchObject({ status: 'input', holeId: 'value', input: descriptor });
    if (input.status !== 'input') throw new Error('Expected typed input.');
    expect(submitModelOperationApplicationInput(input, typedContract, value)).toEqual({
      status: 'resolved',
      request: {
        kind: 'invoke',
        operationId: typedContract.id,
        input: { [name]: value },
      },
    });
  });

  it('substitutes one compatible named Hole in every position and rejects incompatible positions', () => {
    const repeatedContract = {
      id: 'OperationList.rename',
      input: graphSchema.object({ first: field.string(), second: field.string() }),
    };
    const repeatedProposal = {
      application: {
        kind: 'operation-application' as const,
        operationId: repeatedContract.id,
        arguments: {
          first: { kind: 'hole' as const, id: 'name' },
          second: { kind: 'hole' as const, id: 'name' },
        },
      },
      bindings: { name: { kind: 'free-input' as const, prompt: 'Which name?' } },
    };
    const input = resolveModelOperationApplication(repeatedProposal, repeatedContract, {});
    expect(input).toMatchObject({ status: 'input', input: { type: 'string' } });
    if (input.status !== 'input') throw new Error('Expected repeated input.');
    expect(submitModelOperationApplicationInput(input, repeatedContract, 'Notes')).toMatchObject({
      status: 'resolved',
      request: { input: { first: 'Notes', second: 'Notes' } },
    });

    const incompatibleContract = {
      id: 'OperationList.incompatible',
      input: graphSchema.object({ first: field.string(), second: field.number() }),
    };
    expect(resolveModelOperationApplication(repeatedProposal, incompatibleContract, {})).toEqual({
      status: 'unresolved',
      reason: 'This input position cannot be completed interactively.',
    });
  });
});
