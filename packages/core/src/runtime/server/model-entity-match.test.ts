import { expect, it, vi } from 'vitest';

import { createEntityRef, field, type GraphReadPolicy } from '../../data-graph/index.js';

import { entity } from './entity.js';
import { resolveAuthorizedModelEntityMatch } from './model-entity-match.js';

const Folder = entity({
  name: 'MatchFolder',
  fields: { id: field.id(), name: field.string(), description: field.string() },
  display: { primary: 'name', secondary: ['description'], search: ['name'] },
});
const policy = {
  entity: Folder,
  modes: ['run'],
  cardinalities: ['many'],
  maxLimit: 25,
  fields: {
    id: { select: true },
    name: { select: true, filter: ['eq'] },
    description: { select: true },
  },
  scope: 'all',
} as const satisfies GraphReadPolicy<typeof Folder, undefined>;

it('searches display metadata through an authorized Graph Read and builds canonical candidates', async () => {
  const read = vi.fn(async request => {
    expect(request).toMatchObject({
      mode: 'run',
      selection: {
        entityName: 'MatchFolder',
        expression: { kind: 'predicate', fieldName: 'name', operator: 'eq', value: 'Inbox' },
      },
      limit: 21,
    });
    return {
      kind: 'graph-read-result' as const,
      value: [{ id: 'inbox', name: 'Inbox', description: 'Incoming work' }],
    };
  });

  await expect(
    resolveAuthorizedModelEntityMatch({
      target: Folder,
      text: 'Inbox',
      policies: [policy],
      read,
      authority: undefined,
    }),
  ).resolves.toEqual({
    status: 'matched',
    candidates: [
      {
        ref: createEntityRef(Folder, { id: 'inbox' }),
        label: 'Inbox',
        aliases: ['Incoming work'],
      },
    ],
  });
});

it('searches across multiple authorized display fields', async () => {
  const SearchableFolder = entity({
    name: 'SearchableFolder',
    fields: { id: field.id(), name: field.string(), description: field.string() },
    display: { primary: 'name', search: ['name', 'description'] },
  });
  const searchablePolicy = {
    ...policy,
    entity: SearchableFolder,
    fields: {
      id: { select: true },
      name: { select: true, filter: ['eq'] },
      description: { select: true, filter: ['eq'] },
    },
  } as const satisfies GraphReadPolicy<typeof SearchableFolder, undefined>;
  const read = vi.fn(async request => {
    expect(request.selection.expression).toMatchObject({
      kind: 'or',
      operands: [
        { fieldName: 'name', value: 'Incoming' },
        { fieldName: 'description', value: 'Incoming' },
      ],
    });
    return {
      kind: 'graph-read-result' as const,
      value: [{ id: 'inbox', name: 'Inbox', description: 'Incoming' }],
    };
  });

  await expect(
    resolveAuthorizedModelEntityMatch({
      target: SearchableFolder,
      text: 'Incoming',
      policies: [searchablePolicy],
      read,
      authority: undefined,
    }),
  ).resolves.toMatchObject({ status: 'matched', candidates: [{ label: 'Inbox' }] });
});

it('requires an authorized searchable display field', async () => {
  const read = vi.fn();
  await expect(
    resolveAuthorizedModelEntityMatch({
      target: Folder,
      text: 'Inbox',
      policies: [{ ...policy, fields: { ...policy.fields, name: { select: true } } }],
      read,
      authority: undefined,
    }),
  ).resolves.toEqual({
    status: 'unresolved',
    reason: 'No authorized search is configured for MatchFolder.',
  });
  expect(read).not.toHaveBeenCalled();
  await expect(
    resolveAuthorizedModelEntityMatch({
      target: Folder,
      text: 'Inbox',
      policies: [
        {
          ...policy,
          fields: { ...policy.fields, id: { select: false } },
        } as unknown as GraphReadPolicy<typeof Folder, undefined>,
      ],
      read,
      authority: undefined,
    }),
  ).resolves.toEqual({
    status: 'unresolved',
    reason: 'No authorized identity is available for MatchFolder.',
  });
});

it('does not accept truncated, rejected, or malformed candidate reads', async () => {
  const common = { target: Folder, text: 'Inbox', policies: [policy], authority: undefined };
  await expect(
    resolveAuthorizedModelEntityMatch({
      ...common,
      read: async () => ({
        kind: 'protocol-error',
        error: { code: 'access_denied', message: 'Denied.' },
      }),
    }),
  ).resolves.toEqual({
    status: 'unresolved',
    reason: 'Authorized search for MatchFolder is unavailable.',
  });
  await expect(
    resolveAuthorizedModelEntityMatch({
      ...common,
      policies: [{ ...policy, maxLimit: 1 }],
      read: async () => ({ kind: 'graph-read-result', value: [{ id: 'one', name: 'Inbox' }] }),
    }),
  ).resolves.toEqual({
    status: 'unresolved',
    reason: 'Too many matching entities. Be more specific.',
  });
  await expect(
    resolveAuthorizedModelEntityMatch({
      ...common,
      read: async () => ({
        kind: 'graph-read-result',
        value: Array.from({ length: 21 }, (_, index) => ({
          id: `match-${index}`,
          name: 'Inbox',
        })),
      }),
    }),
  ).resolves.toEqual({
    status: 'unresolved',
    reason: 'Too many matching entities. Be more specific.',
  });
  await expect(
    resolveAuthorizedModelEntityMatch({
      ...common,
      read: async () => ({ kind: 'graph-read-result', value: [{ name: 'Inbox' }] }),
    }),
  ).resolves.toEqual({
    status: 'unresolved',
    reason: 'Authorized search for MatchFolder was invalid.',
  });
});
