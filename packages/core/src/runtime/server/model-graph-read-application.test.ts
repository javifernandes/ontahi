import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  field,
  graphSchema,
  query,
  toGraphJsonSchema,
  toGraphReadRequest,
} from '../../data-graph/index.js';
import { openGraphReadApplication } from '../../semantic-program/graph-read-application.js';

import { entity } from './entity.js';
import {
  openModelGraphReadSchema,
  parseModelGraphReadApplication,
  resolveModelGraphReadApplication,
} from './model-graph-read-application.js';

const List = entity({ name: 'ModelList', fields: { id: field.id(), name: field.string() } });
const Item = entity({
  name: 'ModelItem',
  fields: { id: field.id(), list: field.ref(List), completed: field.boolean() },
});
const inbox = createEntityRef(List, { id: 'inbox' });
const request = toGraphReadRequest(
  query(Item)
    .where(item => item.list.eq(inbox))
    .where(item => item.completed.eq(false)),
  'run',
);
const application = openGraphReadApplication(request, [List, Item], { list: 'list' });
const proposal = {
  application,
  bindings: { list: { kind: 'entity-match' as const, text: 'Inbox' } },
};

describe('Model Graph Read applications', () => {
  it('projects Ref values as either canonical Refs or pure Holes', () => {
    const schema = openModelGraphReadSchema(
      toGraphJsonSchema(
        graphSchema.object({ list: graphSchema.ref(List), completed: field.boolean() }),
      ),
    );
    expect(schema).toMatchObject({
      properties: {
        list: {
          anyOf: [
            { properties: { kind: { const: 'entity-ref' } } },
            { properties: { kind: { const: 'hole' }, id: { type: 'string' } } },
          ],
        },
        completed: { type: 'boolean' },
      },
    });
  });

  it('parses a separate entity-match hint and rejects stray or missing bindings', () => {
    expect(
      parseModelGraphReadApplication({
        application,
        bindings: { list: { kind: 'entity-match', text: 'Inbox' } },
      }),
    ).toEqual(proposal);
    expect(parseModelGraphReadApplication({ application, bindings: {} })).toBeUndefined();
    expect(
      parseModelGraphReadApplication({
        application: { kind: 'other', request: application.request },
        bindings: {},
      }),
    ).toBeUndefined();
    expect(
      parseModelGraphReadApplication({
        application: {
          kind: 'graph-read-application',
          request: { ...application.request, mode: 'delete' },
        },
        bindings: {},
      }),
    ).toBeUndefined();
    expect(
      parseModelGraphReadApplication({
        application: {
          ...application,
          request: {
            ...application.request,
            selection: {
              ...application.request.selection,
              expression: { kind: 'and', operands: 'not-an-array' },
            },
          },
        },
        bindings: {},
      }),
    ).toBeUndefined();
    expect(
      parseModelGraphReadApplication({
        application,
        bindings: {
          list: { kind: 'entity-match', text: 'Inbox' },
          invented: { kind: 'entity-match', text: 'Other' },
        },
      }),
    ).toBeUndefined();
  });

  it('closes a unique authorized match without changing known predicates', () => {
    expect(
      resolveModelGraphReadApplication({
        proposal,
        entities: [List, Item],
        candidates: [
          { ref: inbox, label: 'Inbox' },
          { ref: createEntityRef(List, { id: 'later' }), label: 'Later' },
        ],
      }),
    ).toEqual({ status: 'resolved', request });
  });

  it('matches authorized aliases and rejects candidates with invalid canonical identities', () => {
    expect(
      resolveModelGraphReadApplication({
        proposal,
        entities: [List, Item],
        candidates: [{ ref: inbox, label: 'Incoming', aliases: [' inbox '] }],
      }),
    ).toEqual({ status: 'resolved', request });
    expect(
      resolveModelGraphReadApplication({
        proposal,
        entities: [List, Item],
        candidates: [
          {
            ref: createEntityRef(List, { wrongIdentity: 'inbox' }) as never,
            label: 'Inbox',
          },
        ],
      }),
    ).toEqual({ status: 'unresolved', reason: 'The proposed read could not be completed.' });
  });

  it('returns a choice for ambiguous visible matches and unresolved for no match', () => {
    const ambiguous = resolveModelGraphReadApplication({
      proposal,
      entities: [List, Item],
      candidates: [
        { ref: inbox, label: 'Inbox' },
        { ref: createEntityRef(List, { id: 'inbox-2' }), label: 'INBOX' },
        { ref: createEntityRef(Item, { id: 'wrong-target' }), label: 'Inbox' },
      ],
    });
    expect(ambiguous).toMatchObject({
      status: 'choice',
      options: [{ label: 'Inbox' }, { label: 'INBOX' }],
    });
    expect(
      resolveModelGraphReadApplication({
        proposal,
        entities: [List, Item],
        candidates: [{ ref: inbox, label: 'Archive' }],
      }),
    ).toEqual({ status: 'unresolved', reason: 'No visible ModelList matches “Inbox”.' });
  });

  it('rejects an oversized match expansion before producing choices', () => {
    expect(
      resolveModelGraphReadApplication({
        proposal,
        entities: [List, Item],
        candidates: Array.from({ length: 21 }, (_, index) => ({
          ref: createEntityRef(List, { id: `inbox-${index}` }),
          label: 'Inbox',
        })),
      }),
    ).toEqual({
      status: 'unresolved',
      reason: 'Too many matching entities. Be more specific.',
    });
  });

  it('does not resolve Holes on scalar fields', () => {
    const scalarApplication = openGraphReadApplication(request, [List, Item], {
      completed: 'completed',
    });
    expect(
      resolveModelGraphReadApplication({
        proposal: {
          application: scalarApplication,
          bindings: { completed: { kind: 'entity-match', text: 'false' } },
        },
        entities: [List, Item],
        candidates: [],
      }),
    ).toEqual({ status: 'unresolved', reason: 'Cannot resolve completed as an entity.' });
  });
});
