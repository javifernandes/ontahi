import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { createInMemoryDataGraphStorage, field } from '../../data-graph/index.js';

import { entity, layer, ontahi } from './index.js';
import {
  orderReplicatedEntityPublications,
  prepareReplicatedEntityPublication,
  readReplicatedEntityDependencies,
} from './replicated-entity.js';

describe('orderReplicatedEntityPublications', () => {
  it('orders prepared publications from declared dependencies and allows external inputs', () => {
    const fields = { id: field.id() };
    const observe = (rows: readonly { id: string }[]) => rows;
    const PullRequest = entity({ name: 'PullRequest', fields, replicated: { source: observe } });
    const Plan = entity({ name: 'Plan', fields });
    const Binding = entity({
      name: 'Binding',
      fields,
      replicated: { from: () => [PullRequest, Plan], derive: observe },
    });
    const Annotation = entity({
      name: 'Annotation',
      fields,
      replicated: { from: () => [Binding], derive: observe },
    });
    const input = {
      observed: [{ id: 'new' }],
      current: [],
      equals: () => true,
      scopeOf: () => 'all',
      completeScopes: new Map(),
    };
    const binding = prepareReplicatedEntityPublication(Binding, input);
    const pullRequest = prepareReplicatedEntityPublication(PullRequest, input);
    const annotation = prepareReplicatedEntityPublication(Annotation, input);

    expect(orderReplicatedEntityPublications([annotation, binding, pullRequest])).toEqual([
      pullRequest,
      binding,
      annotation,
    ]);
  });

  it('rejects ambiguous publications for the same Entity', () => {
    const publication = { entityName: 'Binding', dependencies: [] };
    expect(() => orderReplicatedEntityPublications([publication, publication])).toThrow(
      'Duplicate publication for Entity Binding.',
    );
  });

  it('reports the path when dependencies contain a cycle', () => {
    expect(() =>
      orderReplicatedEntityPublications([
        { entityName: 'Binding', dependencies: ['Annotation'] },
        { entityName: 'Annotation', dependencies: ['Binding'] },
      ]),
    ).toThrow('Binding -> Annotation -> Binding');
  });
});

describe('readReplicatedEntityDependencies', () => {
  const binding = {
    name: 'Binding',
    replicated: { from: () => [{ name: 'PullRequest' }, { name: 'Plan' }] },
  };

  it('selects the declared inputs and sees a Plan revision change with the same PR revision', () => {
    const observed = new Map([
      ['Unrelated', 'ignored'],
      ['Plan', 'old-path'],
      ['PullRequest', 'github-cursor'],
    ]);
    expect(readReplicatedEntityDependencies(binding, observed)).toEqual([
      ['PullRequest', 'github-cursor'],
      ['Plan', 'old-path'],
    ]);
    observed.set('Plan', 'new-path');
    expect(readReplicatedEntityDependencies(binding, observed)).toEqual([
      ['PullRequest', 'github-cursor'],
      ['Plan', 'new-path'],
    ]);
  });

  it('fails visibly when the host omits a declared input', () => {
    expect(() =>
      readReplicatedEntityDependencies(binding, new Map([['PullRequest', 'github-cursor']])),
    ).toThrow('Missing observed dependency Plan for replicated Entity Binding.');
  });
});

describe('replicated Entity lifecycle', () => {
  it('executes create, update, and delete as ordinary commands inside the application transaction', async () => {
    const Reference = entity({
      name: 'Reference',
      fields: { id: field.id(), title: field.string() },
      replicated: { source: (rows: readonly { id: string; title: string }[]) => rows },
    });
    const current = [
      { id: 'removed', title: 'Gone' },
      { id: 'updated', title: 'Before' },
    ];
    const observed = [
      { id: 'created', title: 'New' },
      { id: 'updated', title: 'After' },
    ];
    const base = createInMemoryDataGraphStorage({ dataset: { Reference: current } });
    const app = ontahi({
      entities: [Reference],
      storage: {
        ...base,
        createRuntime: () => {
          const runtime = base.createRuntime();
          return Object.assign(runtime, {
            transaction: <TValue, TError, TRequirements>(
              work: (
                scope: ReturnType<typeof base.createRuntime>,
              ) => Effect.Effect<TValue, TError, TRequirements>,
            ) => work(base.createRuntime()),
          });
        },
      },
    });
    const publication = prepareReplicatedEntityPublication(Reference, {
      current,
      observed,
      equals: (left, right) => left.title === right.title,
      scopeOf: () => 'all',
      completeScopes: new Map([['all', () => true]]),
    });
    const publish = layer('tests.replication.publication', {
      concerns: [app.app.graph.withRuntime()],
    }).effect('publish', () =>
      app.app.graph.transaction(publication.remove.pipe(Effect.zipRight(publication.put))),
    );
    await publish();
    expect(app.storage.dataset.Reference).toHaveLength(observed.length);
    expect(app.storage.dataset.Reference).toEqual(expect.arrayContaining(observed));
  });
});
