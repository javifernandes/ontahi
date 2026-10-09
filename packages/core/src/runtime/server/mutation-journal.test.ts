import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createInMemoryDataGraphStorage,
  createEntityRef,
  field,
  relationship,
  relationshipSet,
  toGraphCommandRequest,
  type CommittedMutation,
  type DataGraphTransactionCapability,
  type EntityMutationCommand,
  type EntityMutationDelta,
  type MutationReaction,
  type RelationshipCommand,
  type RelationshipCommandResult,
} from '../../data-graph/index.js';

import { configureServerRuntime, resetServerRuntimeForTests } from './config.js';
import {
  deferDataGraphPostCommitWork,
  withDataGraph,
  withDataGraphTransaction,
} from './data-graph.js';
import {
  applyContextualEntityMutationReactions,
  applyContextualRelationshipMutationReactions,
} from './mutation-reaction.js';
import type { GraphCommandableOntahiApplication } from './ontahi.js';
import { runServerEffect } from './runtime-effect.js';
import {
  declareGraphMutation,
  declareSelectionChange,
  getRequiredUnitOfWork,
  sealCurrentUnitOfWorkMutationJournal,
} from './unit-of-work.js';

import { entity, ontahi, relation } from './index.js';

const book = createEntityRef('Book', { id: 'book-1' });
const updateBook: EntityMutationCommand = {
  kind: 'entity-mutation-command',
  action: 'update',
  entityName: 'Book',
  target: book,
  values: { title: 'Revised' },
};
const updatedBook: EntityMutationDelta = {
  created: [],
  updated: [{ entityName: 'Book', ref: book, values: { title: 'Revised' } }],
  deleted: [],
};

interface TestTransactionRuntime extends DataGraphTransactionCapability<TestTransactionRuntime> {
  runEntityMutationCommand: (command: EntityMutationCommand) => Effect.Effect<EntityMutationDelta>;
  runRelationshipCommand: (
    command: RelationshipCommand,
  ) => Effect.Effect<RelationshipCommandResult>;
}

const createRuntime = (): TestTransactionRuntime => {
  const runtime: TestTransactionRuntime = {
    transaction: work => work(runtime),
    runEntityMutationCommand: command =>
      Effect.succeed({
        created:
          command.action === 'create'
            ? [{ entityName: command.entityName, values: command.values }]
            : [],
        updated: command.action === 'update' ? updatedBook.updated : [],
        deleted: [],
      }),
    runRelationshipCommand: command =>
      Effect.succeed({
        status: 'applied',
        delta: {
          added: command.target
            ? [{ relation: command.relation, source: command.source, target: command.target }]
            : [],
          removed: [],
        },
      }),
  };
  return runtime;
};

let outcomeSequence = 0;
const capture = (
  command: EntityMutationCommand = updateBook,
  delta: EntityMutationDelta = updatedBook,
  reactions: readonly MutationReaction[] = [],
) =>
  applyContextualEntityMutationReactions(command, delta, undefined, {
    getReactions: () => reactions,
    createOutcomeId: () => `outcome-${++outcomeSequence}`,
  });

const runWithRuntime = <TValue>(effect: Effect.Effect<TValue, unknown>): Promise<TValue> => {
  const runtime = createRuntime();
  return runServerEffect(effect, {
    scope: 'tests.runtime.mutation-journal',
    concerns: [withDataGraph({ createRuntime: () => runtime })],
  });
};

const transaction = <TValue>(effect: Effect.Effect<TValue, unknown>) =>
  withDataGraphTransaction<TestTransactionRuntime, TValue, unknown>(effect);

const recordedCommand = (mutation: CommittedMutation) =>
  mutation.effect.kind === 'graph-command' ? mutation.effect.request.command : undefined;

const runWithMutationBudget = async <TValue>(
  budget: { maxEntries: number; maxBytes: number },
  effect: Effect.Effect<TValue, unknown>,
): Promise<TValue> => {
  configureServerRuntime({ mutationJournal: budget });
  try {
    return await runWithRuntime(effect);
  } finally {
    resetServerRuntimeForTests();
  }
};

describe('UnitOfWork mutation journal', () => {
  it('publishes a sealed child journal only after its transaction commits', async () => {
    const observed = await runWithRuntime(
      Effect.gen(function* () {
        const before = getRequiredUnitOfWork().mutations.snapshot();
        const inside = yield* transaction(
          capture().pipe(Effect.map(() => getRequiredUnitOfWork().mutations.snapshot())),
        );
        const after = getRequiredUnitOfWork().mutations.snapshot();
        return { after, before, inside };
      }),
    );

    expect(observed.before).toEqual({ mutations: [], precision: 'exact' });
    expect(observed.inside.mutations).toHaveLength(1);
    expect(observed.after).toMatchObject({
      precision: 'intensional',
      mutations: [
        {
          provenance: 'captured',
          effect: { kind: 'graph-command', request: { command: updateBook } },
        },
      ],
    });
  });

  it('does not publish failed or interrupted transaction work', async () => {
    const observed = await runWithRuntime(
      Effect.gen(function* () {
        const failed = yield* transaction(
          capture().pipe(Effect.zipRight(Effect.fail('rollback'))),
        ).pipe(Effect.either);
        const interrupted = yield* transaction(capture().pipe(Effect.zipRight(Effect.never))).pipe(
          Effect.timeout('1 millis'),
          Effect.either,
        );
        return {
          failed: failed._tag,
          interrupted: interrupted._tag,
          mutations: getRequiredUnitOfWork().mutations.snapshot(),
        };
      }),
    );

    expect(observed).toEqual({
      failed: 'Left',
      interrupted: 'Left',
      mutations: { mutations: [], precision: 'exact' },
    });
  });

  it('retains committed mutations when later post-commit work fails', async () => {
    const observed = await runWithRuntime(
      Effect.gen(function* () {
        const result = yield* transaction(
          capture().pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                deferDataGraphPostCommitWork(() => Promise.reject(new Error('post-commit failed')));
              }),
            ),
          ),
        ).pipe(Effect.exit);
        return {
          result: result._tag,
          mutations: getRequiredUnitOfWork().mutations.snapshot(),
        };
      }),
    );

    expect(observed.result).toBe('Failure');
    expect(observed.mutations.mutations).toHaveLength(1);
  });

  it('isolates concurrent transaction journals before merging both committed sets', async () => {
    const secondCommand: EntityMutationCommand = {
      ...updateBook,
      target: createEntityRef('Book', { id: 'book-2' }),
    };
    const observed = await runWithRuntime(
      Effect.gen(function* () {
        const children = yield* Effect.all(
          [
            transaction(
              capture().pipe(
                Effect.map(() => getRequiredUnitOfWork().mutations.snapshot().mutations.length),
              ),
            ),
            transaction(
              capture(secondCommand).pipe(
                Effect.map(() => getRequiredUnitOfWork().mutations.snapshot().mutations.length),
              ),
            ),
          ],
          { concurrency: 'unbounded' },
        );
        return { children, mutations: getRequiredUnitOfWork().mutations.snapshot() };
      }),
    );

    expect(observed.children).toEqual([1, 1]);
    expect(
      observed.mutations.mutations
        .map(mutation => {
          const command = recordedCommand(mutation);
          return command?.kind === 'entity-mutation-command' &&
            command.action !== 'create' &&
            'locator' in command.target
            ? command.target.locator.id
            : undefined;
        })
        .sort(),
    ).toEqual(['book-1', 'book-2']);
  });

  it('does not leak mutations between concurrent top-level invocations', async () => {
    const secondCommand: EntityMutationCommand = {
      ...updateBook,
      target: createEntityRef('Book', { id: 'book-2' }),
    };
    const runInvocation = (command: EntityMutationCommand) =>
      runWithRuntime(
        Effect.gen(function* () {
          yield* transaction(capture(command));
          return getRequiredUnitOfWork().mutations.snapshot();
        }),
      );

    const snapshots = await Promise.all([runInvocation(updateBook), runInvocation(secondCommand)]);

    expect(
      snapshots.map(snapshot =>
        snapshot.mutations.map(mutation => {
          const command = recordedCommand(mutation);
          return command?.kind === 'entity-mutation-command' &&
            command.action !== 'create' &&
            'locator' in command.target
            ? command.target.locator.id
            : undefined;
        }),
      ),
    ).toEqual([['book-1'], ['book-2']]);
  });

  it('merges nested transaction work once while preserving command order', async () => {
    const secondCommand: EntityMutationCommand = {
      ...updateBook,
      target: createEntityRef('Book', { id: 'book-2' }),
    };
    const mutations = await runWithRuntime(
      Effect.gen(function* () {
        yield* transaction(capture().pipe(Effect.zipRight(transaction(capture(secondCommand)))));
        return getRequiredUnitOfWork().mutations.snapshot();
      }),
    );

    expect(
      mutations.mutations.map(mutation => {
        const command = recordedCommand(mutation);
        return command?.kind === 'entity-mutation-command' &&
          command.action !== 'create' &&
          'locator' in command.target
          ? command.target.locator.id
          : undefined;
      }),
    ).toEqual(['book-1', 'book-2']);
  });

  it('captures post-commit Mutation Reaction follow-ups once and in causal order', async () => {
    const assignAuthor: RelationshipCommand = {
      kind: 'relationship-command',
      action: 'link',
      relation: {
        sourceEntityName: 'Book',
        fieldName: 'author',
        targetEntityName: 'Author',
      },
      source: book,
      target: createEntityRef('Author', { id: 'author-1' }),
    };
    const reactions: readonly MutationReaction[] = [
      {
        id: 'audit-book-update',
        delivery: 'inline',
        when: { mutationKind: 'entity-mutation-command', action: 'update', entityName: 'Book' },
        react: () => [{ kind: 'execute-relationship-command', command: assignAuthor }],
      },
    ];

    const mutations = await runWithRuntime(
      Effect.gen(function* () {
        yield* transaction(capture(updateBook, updatedBook, reactions));
        return getRequiredUnitOfWork().mutations.snapshot();
      }),
    );

    expect(mutations.mutations.map(mutation => recordedCommand(mutation)?.kind)).toEqual([
      'entity-mutation-command',
      'relationship-command',
    ]);
  });

  it('captures an applied relationship root but ignores a not-applied result', async () => {
    const command: RelationshipCommand = {
      kind: 'relationship-command',
      action: 'link',
      relation: {
        sourceEntityName: 'Book',
        fieldName: 'author',
        targetEntityName: 'Author',
      },
      source: book,
      target: createEntityRef('Author', { id: 'author-1' }),
    };

    const mutations = await runWithRuntime(
      Effect.gen(function* () {
        yield* applyContextualRelationshipMutationReactions(
          command,
          { status: 'applied', delta: { added: [], removed: [] } },
          undefined,
          { getReactions: () => [], createOutcomeId: () => 'relationship-applied' },
        );
        yield* applyContextualRelationshipMutationReactions(
          command,
          {
            status: 'not-applied',
            diagnostic: {
              reason: 'relationship_precondition_failed',
              rejection: {
                version: 1,
                code: 'relationship_precondition_failed',
                message: 'Precondition failed.',
              },
            },
          },
          undefined,
          { getReactions: () => [], createOutcomeId: () => 'relationship-skipped' },
        );
        return getRequiredUnitOfWork().mutations.snapshot();
      }),
    );

    expect(mutations.mutations).toHaveLength(1);
    expect(mutations.mutations[0] && recordedCommand(mutations.mutations[0])).toEqual(command);
  });

  it('declares one constant-size Graph Command for native bulk work', async () => {
    const bulkCommand: EntityMutationCommand = {
      kind: 'entity-mutation-command',
      action: 'update',
      entityName: 'TodoItem',
      target: {
        kind: 'selection',
        entityName: 'TodoItem',
        expression: {
          kind: 'predicate',
          operator: 'eq',
          fieldName: 'createdOn',
          value: '2026-10-08',
        },
      },
      values: { completed: true },
    };
    const mutations = await runWithRuntime(
      Effect.sync(() => {
        declareGraphMutation(bulkCommand);
        return getRequiredUnitOfWork().mutations.snapshot();
      }),
    );

    expect(mutations).toEqual({
      precision: 'intensional',
      mutations: [
        {
          effect: { kind: 'graph-command', request: toGraphCommandRequest(bulkCommand) },
          provenance: 'declared',
        },
      ],
    });
  });

  it('declares an honest non-executable Selection change and rolls it back transactionally', async () => {
    const changed = {
      kind: 'selection' as const,
      entityName: 'TodoItem',
      expression: {
        kind: 'predicate' as const,
        operator: 'eq' as const,
        fieldName: 'listId',
        value: 'later',
      },
    };
    const observed = await runWithRuntime(
      Effect.gen(function* () {
        yield* transaction(
          Effect.sync(() => declareSelectionChange(changed)).pipe(
            Effect.zipRight(Effect.fail('rollback')),
          ),
        ).pipe(Effect.either);
        const afterRollback = getRequiredUnitOfWork().mutations.snapshot();
        declareSelectionChange(changed);
        return { afterDeclaration: getRequiredUnitOfWork().mutations.snapshot(), afterRollback };
      }),
    );

    expect(observed.afterRollback).toEqual({ mutations: [], precision: 'exact' });
    expect(observed.afterDeclaration).toEqual({
      precision: 'intensional',
      mutations: [
        { effect: { kind: 'selection-change', selection: changed }, provenance: 'declared' },
      ],
    });
  });

  it('deduplicates equal effects and retains their strongest provenance', async () => {
    const mutations = await runWithRuntime(
      Effect.gen(function* () {
        declareGraphMutation(updateBook);
        yield* capture();
        declareGraphMutation(updateBook);
        return getRequiredUnitOfWork().mutations.snapshot();
      }),
    );

    expect(mutations.mutations).toHaveLength(1);
    expect(mutations.mutations[0]).toMatchObject({ provenance: 'captured' });
  });

  it('widens an over-budget command loop to one conservative Entity root', async () => {
    const mutations = await runWithMutationBudget(
      { maxEntries: 2, maxBytes: 4096 },
      Effect.sync(() => {
        for (const id of ['book-1', 'book-2', 'book-3', 'book-4']) {
          declareGraphMutation({ ...updateBook, target: createEntityRef('Book', { id }) });
        }
        return getRequiredUnitOfWork().mutations.snapshot();
      }),
    );

    expect(mutations).toEqual({
      precision: 'widened',
      mutations: [
        {
          effect: {
            kind: 'selection-change',
            selection: { kind: 'selection', entityName: 'Book', expression: { kind: 'all' } },
          },
          provenance: 'conservative',
        },
      ],
    });
  });

  it('widens an oversized command by bytes without retaining its large values', async () => {
    const mutations = await runWithMutationBudget(
      { maxEntries: 10, maxBytes: 300 },
      Effect.sync(() => {
        declareGraphMutation({ ...updateBook, values: { title: 'x'.repeat(2000) } });
        return getRequiredUnitOfWork().mutations.snapshot();
      }),
    );

    expect(mutations.precision).toBe('widened');
    expect(JSON.stringify(mutations)).not.toContain('x'.repeat(100));
    expect(mutations.mutations[0]?.effect).toMatchObject({
      kind: 'selection-change',
      selection: { entityName: 'Book', expression: { kind: 'all' } },
    });
  });

  it('widens relationship commands to both participating Entity roots', async () => {
    const mutations = await runWithMutationBudget(
      { maxEntries: 2, maxBytes: 4096 },
      Effect.sync(() => {
        for (const id of ['book-1', 'book-2', 'book-3']) {
          declareGraphMutation({
            kind: 'relationship-command',
            action: 'link',
            relation: {
              sourceEntityName: 'Book',
              fieldName: 'author',
              targetEntityName: 'Author',
            },
            source: createEntityRef('Book', { id }),
            target: createEntityRef('Author', { id: 'author-1' }),
          });
        }
        return getRequiredUnitOfWork().mutations.snapshot();
      }),
    );

    expect(
      mutations.mutations.map(mutation =>
        mutation.effect.kind === 'selection-change' ? mutation.effect.selection.entityName : null,
      ),
    ).toEqual(['Author', 'Book']);
    expect(mutations.precision).toBe('widened');
  });

  it('merges a widened child set into its parent conservatively', async () => {
    const mutations = await runWithMutationBudget(
      { maxEntries: 2, maxBytes: 4096 },
      Effect.gen(function* () {
        declareGraphMutation({
          ...updateBook,
          entityName: 'Author',
          target: createEntityRef('Author', { id: 'author-1' }),
        });
        yield* transaction(
          Effect.sync(() => {
            for (const id of ['book-1', 'book-2', 'book-3']) {
              declareGraphMutation({ ...updateBook, target: createEntityRef('Book', { id }) });
            }
          }),
        );
        return getRequiredUnitOfWork().mutations.snapshot();
      }),
    );

    expect(mutations.precision).toBe('widened');
    expect(
      mutations.mutations.map(mutation =>
        mutation.effect.kind === 'selection-change' ? mutation.effect.selection.entityName : null,
      ),
    ).toEqual(['Author', 'Book']);
  });

  it('falls back to a graph-wide change when conservative Entity roots exceed the budget', async () => {
    const mutations = await runWithMutationBudget(
      { maxEntries: 2, maxBytes: 4096 },
      Effect.sync(() => {
        for (const entityName of ['Book', 'Author', 'Publisher']) {
          declareGraphMutation({
            ...updateBook,
            entityName,
            target: createEntityRef(entityName, { id: 'one' }),
          });
        }
        declareGraphMutation({
          ...updateBook,
          entityName: 'Store',
          target: createEntityRef('Store', { id: 'one' }),
        });
        return getRequiredUnitOfWork().mutations.snapshot();
      }),
    );

    expect(mutations).toEqual({
      precision: 'widened',
      mutations: [{ effect: { kind: 'graph-change' }, provenance: 'conservative' }],
    });
  });

  it('rejects invalid journal budgets when opening a Unit of Work', async () => {
    await expect(
      runWithMutationBudget(
        { maxEntries: 0, maxBytes: 4096 },
        Effect.sync(() => getRequiredUnitOfWork()),
      ),
    ).rejects.toThrow('maxEntries');
    await expect(
      runWithMutationBudget(
        { maxEntries: 2, maxBytes: 127 },
        Effect.sync(() => getRequiredUnitOfWork()),
      ),
    ).rejects.toThrow('maxBytes');
  });

  it('does not accept declarations after the journal is sealed', async () => {
    await expect(
      runWithRuntime(
        Effect.sync(() => {
          sealCurrentUnitOfWorkMutationJournal();
          declareGraphMutation(updateBook);
        }),
      ),
    ).rejects.toThrow('already sealed');
  });

  it('captures every relationship command family dispatched through the Ontahi application', async () => {
    const Author = entity({ name: 'JournalAuthor', fields: { id: field.id() } });
    const Tag = entity({ name: 'JournalTag', fields: { id: field.id() } });
    const Book = entity({
      name: 'JournalBook',
      fields: { id: field.id(), author: field.nullable(field.ref(Author)) },
      relations: () => ({ tags: relation.manyToMany(Tag) }),
    });
    const ListFields = { id: field.id() };
    const Item = entity({
      name: 'JournalItem',
      fields: {
        id: field.id(),
        list: field.ref(entity.ref('JournalList', { fields: ListFields })),
      },
    });
    const List = entity({
      name: 'JournalList',
      fields: ListFields,
      relations: () => ({ items: relation.hasMany(Item, { via: 'list', ordered: true }) }),
    });
    const application = ontahi({
      entities: [Author, Book, Tag, List, Item],
      storage: createInMemoryDataGraphStorage({
        dataset: {
          JournalAuthor: [{ id: 'author-1' }],
          JournalBook: [{ id: 'book-1', author: null }],
          JournalTag: [{ id: 'tag-1' }],
          JournalList: [{ id: 'list-1' }],
          JournalItem: [
            { id: 'item-1', list: 'list-1' },
            { id: 'item-2', list: 'list-1' },
          ],
        },
      }),
    });
    const dispatch = (
      application as unknown as GraphCommandableOntahiApplication
    ).createGraphCommandDispatcher([
      { entity: Book, fieldName: 'author', actions: ['link'] },
      { entity: Book, relationName: 'tags', actions: ['link'] },
      { entity: List, relationName: 'items', actions: ['move'] },
    ]);
    const authorCommand: RelationshipCommand = {
      kind: 'relationship-command',
      action: 'link',
      relation: {
        sourceEntityName: 'JournalBook',
        fieldName: 'author',
        targetEntityName: 'JournalAuthor',
      },
      source: createEntityRef(Book, { id: 'book-1' }),
      target: createEntityRef(Author, { id: 'author-1' }),
    };
    const tagCommand = relationshipSet(Book, 'tags', createEntityRef(Book, { id: 'book-1' })).add(
      createEntityRef(Tag, { id: 'tag-1' }),
    );
    const orderedCommand = relationship(
      List,
      'items',
      createEntityRef(List, { id: 'list-1' }),
    ).prepend(createEntityRef(Item, { id: 'item-2' }));

    const mutations = await runServerEffect(
      Effect.promise(async () => {
        for (const command of [authorCommand, tagCommand, orderedCommand]) {
          await dispatch(toGraphCommandRequest(command), { authority: undefined });
        }
        return getRequiredUnitOfWork().mutations.snapshot();
      }),
      { scope: 'tests.runtime.mutation-journal.dispatcher' },
    );

    expect(mutations.mutations).toEqual(
      [authorCommand, tagCommand, orderedCommand].map(command => ({
        effect: { kind: 'graph-command', request: toGraphCommandRequest(command) },
        provenance: 'captured',
      })),
    );
  });
});
