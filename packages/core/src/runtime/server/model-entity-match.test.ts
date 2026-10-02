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
      read: async () => ({ kind: 'graph-read-result', value: [{ name: 'Inbox' }] }),
    }),
  ).resolves.toEqual({
    status: 'unresolved',
    reason: 'Authorized search for MatchFolder was invalid.',
  });
});
