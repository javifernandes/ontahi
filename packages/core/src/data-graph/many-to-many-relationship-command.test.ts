import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  appliedRelationshipCommand,
  createEntityRef,
  createGraphCommandDispatcher,
  createInMemoryDataGraphRuntime,
  createRemoteDataGraphRuntime,
  entity,
  executeInMemoryManyToManyRelationshipCommandEffect,
  field,
  parseGraphCommandRequest,
  query,
  relationConstraint,
  relationshipSet,
  resolveGraphCommandRequest,
  Selection,
  selection,
  toGraphCommandRequest,
  type InMemoryDataset,
  type RelationshipFact,
} from './index.js';

const defineTodoGraph = () => {
  const Tag = entity('Tag', { id: field.id(), name: field.string() });
  const Todo = entity('Todo', { id: field.id(), title: field.string() }).manyToMany('tags', Tag);
  return { Tag, Todo };
};

describe('many-to-many Relationship Commands', () => {
  it('enforces source and target constraints atomically across Selection-valued links', async () => {
    const Tag = entity('ConstrainedTag', { id: field.id(), assignable: field.boolean() });
    const Todo = entity('ConstrainedTodo', {
      id: field.id(),
      completed: field.boolean(),
    });
    Todo.manyToMany('tags', Tag, {
      constraints: [
        relationConstraint.source(Todo, todo => todo.completed.eq(false), {
          code: 'completed_todo_cannot_be_tagged',
          message: 'Completed todos cannot be tagged.',
        }),
        relationConstraint.target(Tag, tag => tag.assignable.eq(true), {
          code: 'tag_not_assignable',
          message: 'This tag cannot be assigned.',
        }),
      ],
    });
    const dataset: InMemoryDataset = {
      ConstrainedTodo: [
        { id: 'open', completed: false },
        { id: 'completed', completed: true },
      ],
      ConstrainedTag: [
        { id: 'assignable', assignable: true },
        { id: 'blocked', assignable: false },
      ],
    };
    const facts: RelationshipFact[] = [];
    const execute = (command: ReturnType<ReturnType<typeof relationshipSet>['add']>) =>
      Effect.runPromise(
        executeInMemoryManyToManyRelationshipCommandEffect(
          dataset,
          [Todo, Tag],
          facts,
          command,
        ).pipe(Effect.either),
      );
    const mixedTodos = Selection.references(Todo, [
      createEntityRef(Todo, { id: 'open' }),
      createEntityRef(Todo, { id: 'completed' }),
    ]);

    await expect(
      execute(
        relationshipSet(Todo, 'tags', mixedTodos).add(createEntityRef(Tag, { id: 'assignable' })),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: {
        reason: 'relation_constraint_rejected',
        rejection: { code: 'completed_todo_cannot_be_tagged' },
      },
    });
    expect(facts).toEqual([]);

    await expect(
      execute(
        relationshipSet(Todo, 'tags', createEntityRef(Todo, { id: 'open' })).add(
          createEntityRef(Tag, { id: 'blocked' }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: {
        reason: 'relation_constraint_rejected',
        rejection: { code: 'tag_not_assignable' },
      },
    });
    expect(facts).toEqual([]);

    await expect(
      execute(
        relationshipSet(Todo, 'tags', createEntityRef(Todo, { id: 'open' })).add(
          createEntityRef(Tag, { id: 'assignable' }),
        ),
      ),
    ).resolves.toMatchObject({ _tag: 'Right' });
    expect(facts).toHaveLength(1);

    const beforeEmpty = [...facts];
    await expect(
      execute(
        relationshipSet(
          Todo,
          'tags',
          selection(Todo, todo => todo.id.eq('missing')),
        ).add(createEntityRef(Tag, { id: 'assignable' })),
      ),
    ).resolves.toMatchObject({
      _tag: 'Right',
      right: { status: 'applied', delta: { added: [], removed: [] } },
    });
    expect(facts).toEqual(beforeEmpty);

    facts.push({
      relation: relationshipSet(Todo, 'tags', createEntityRef(Todo, { id: 'completed' })).add(
        createEntityRef(Tag, { id: 'blocked' }),
      ).relation,
      source: createEntityRef(Todo, { id: 'completed' }),
      target: createEntityRef(Tag, { id: 'blocked' }),
    });
    await expect(
      execute(
        relationshipSet(Todo, 'tags', createEntityRef(Todo, { id: 'completed' })).remove(
          createEntityRef(Tag, { id: 'blocked' }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: 'Right',
      right: { status: 'applied', delta: { removed: expect.any(Array) } },
    });
    expect(facts.some(fact => fact.source.locator.id === 'completed')).toBe(false);
  });
  it('declares direct topology and preserves Selection-valued endpoints', () => {
    const { Tag, Todo } = defineTodoGraph();
    const todos = selection(Todo, todo => todo.id.in(['todo-1', 'todo-2']));
    const tags = selection(Tag, tag => tag.id.eq('tag-1'));

    expect(relationshipSet(Todo, 'tags', todos).add(tags)).toEqual({
      kind: 'many-to-many-relationship-command',
      action: 'link',
      relation: {
        sourceEntityName: 'Todo',
        relationName: 'tags',
        targetEntityName: 'Tag',
        cardinality: 'many-to-many',
      },
      sources: { entityName: 'Todo', selection: todos.expression },
      targets: { entityName: 'Tag', selection: tags.expression },
    });
  });

  it('round-trips Selection endpoints and resolves only server-owned topology', () => {
    const client = defineTodoGraph();
    const server = defineTodoGraph();
    const command = relationshipSet(
      client.Todo,
      'tags',
      selection(client.Todo, todo => todo.id.in(['todo-1', 'todo-2'])),
    ).add(Selection.references(client.Tag, [createEntityRef(client.Tag, { id: 'tag-1' })]));
    const transported = JSON.parse(JSON.stringify(toGraphCommandRequest(command)));
    const parsed = parseGraphCommandRequest(transported);

    expect(parsed).toEqual({ success: true, request: transported });
    if (!parsed.success) throw new Error(parsed.error.error.message);
    expect(
      resolveGraphCommandRequest(parsed.request, { entities: [server.Todo, server.Tag] }),
    ).toEqual({ success: true, request: parsed.request, command });

    const invalid = structuredClone(transported);
    invalid.command.targets.selection = {
      kind: 'predicate',
      operator: 'eq',
      fieldName: 'missing',
      value: 'tag-1',
    };
    const invalidParsed = parseGraphCommandRequest(invalid);
    if (!invalidParsed.success) throw new Error(invalidParsed.error.error.message);
    expect(
      resolveGraphCommandRequest(invalidParsed.request, { entities: [server.Todo, server.Tag] }),
    ).toMatchObject({ success: false, error: { error: { code: 'invalid_selection' } } });
  });

  it('applies the exact Cartesian delta and treats repeated add/remove as no-ops', async () => {
    const { Tag, Todo } = defineTodoGraph();
    const dataset: InMemoryDataset = {
      Todo: [
        { id: 'todo-1', title: 'One' },
        { id: 'todo-2', title: 'Two' },
      ],
      Tag: [
        { id: 'tag-1', name: 'Urgent' },
        { id: 'tag-2', name: 'Research' },
      ],
    };
    const facts: RelationshipFact[] = [];
    const runtime = createInMemoryDataGraphRuntime({
      dataset,
      entities: [Todo, Tag],
      relationships: facts,
    });
    const todos = Selection.references(Todo, [
      createEntityRef(Todo, { id: 'todo-1' }),
      createEntityRef(Todo, { id: 'todo-2' }),
    ]);
    const tags = Selection.references(Tag, [
      createEntityRef(Tag, { id: 'tag-1' }),
      createEntityRef(Tag, { id: 'tag-2' }),
    ]);
    const add = relationshipSet(Todo, 'tags', todos).add(tags);
    const execute = (command: typeof add) =>
      Effect.runPromise(runtime.runManyToManyRelationshipCommand(command));

    const added = await execute(add);
    expect(added).toMatchObject({ status: 'applied' });
    if (added.status !== 'applied') throw new Error('Expected an applied command.');
    expect(added.delta.added).toHaveLength(4);
    expect(added.delta.removed).toEqual([]);
    expect(facts).toEqual(added.delta.added);
    await expect(execute(add)).resolves.toEqual({
      status: 'applied',
      delta: { added: [], removed: [] },
    });
    await expect(
      Effect.runPromise(
        runtime.get(
          query(Todo)
            .where(todo => todo.id.eq('todo-1'))
            .include(todo => ({ tags: todo.tags.orderBy(tag => tag.name) })),
          undefined,
        ),
      ),
    ).resolves.toEqual({
      id: 'todo-1',
      title: 'One',
      tags: [
        { id: 'tag-2', name: 'Research' },
        { id: 'tag-1', name: 'Urgent' },
      ],
    });

    const removeTag = relationshipSet(Todo, 'tags', createEntityRef(Todo, { id: 'todo-1' })).remove(
      createEntityRef(Tag, { id: 'tag-1' }),
    );
    await expect(execute(removeTag)).resolves.toEqual({
      status: 'applied',
      delta: {
        added: [],
        removed: [
          expect.objectContaining({
            source: createEntityRef(Todo, { id: 'todo-1' }),
            target: createEntityRef(Tag, { id: 'tag-1' }),
          }),
        ],
      },
    });
    await expect(execute(removeTag)).resolves.toEqual({
      status: 'applied',
      delta: { added: [], removed: [] },
    });
    expect(facts).toHaveLength(3);
  });

  it('rejects missing explicit Refs atomically but permits empty filtered Selections', async () => {
    const { Tag, Todo } = defineTodoGraph();
    const dataset: InMemoryDataset = {
      Todo: [{ id: 'todo-1', title: 'One' }],
      Tag: [{ id: 'tag-1', name: 'Urgent' }],
    };
    const facts: RelationshipFact[] = [];
    const missing = relationshipSet(
      Todo,
      'tags',
      createEntityRef(Todo, { id: 'missing-todo' }),
    ).add(createEntityRef(Tag, { id: 'tag-1' }));

    await expect(
      Effect.runPromise(
        executeInMemoryManyToManyRelationshipCommandEffect(
          dataset,
          [Todo, Tag],
          facts,
          missing,
        ).pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'cardinality_mismatch' },
    });
    expect(facts).toEqual([]);

    const emptyFiltered = relationshipSet(
      Todo,
      'tags',
      selection(Todo, todo => todo.title.eq('Missing')),
    ).add(selection(Tag, tag => tag.name.eq('Urgent')));
    await expect(
      Effect.runPromise(
        executeInMemoryManyToManyRelationshipCommandEffect(
          dataset,
          [Todo, Tag],
          facts,
          emptyFiltered,
        ),
      ),
    ).resolves.toEqual({ status: 'applied', delta: { added: [], removed: [] } });
  });

  it('is default-deny and executes through an explicit many-to-many policy', async () => {
    const { Tag, Todo } = defineTodoGraph();
    const dataset: InMemoryDataset = {
      Todo: [{ id: 'todo-1', title: 'One' }],
      Tag: [{ id: 'tag-1', name: 'Urgent' }],
    };
    const facts: RelationshipFact[] = [];
    const runtime = createInMemoryDataGraphRuntime({
      dataset,
      entities: [Todo, Tag],
      relationships: facts,
    });
    const todoRef = createEntityRef(Todo, { id: 'todo-1' });
    const tagRef = createEntityRef(Tag, { id: 'tag-1' });
    const command = relationshipSet(Todo, 'tags', todoRef).add(tagRef);
    const denied = createGraphCommandDispatcher({
      policies: [],
      execute: async () => appliedRelationshipCommand({ added: [], removed: [] }),
    });
    const allowed = createGraphCommandDispatcher({
      policies: [{ entity: Todo, relationName: 'tags', actions: ['link', 'unlink'] }],
      execute: async () => appliedRelationshipCommand({ added: [], removed: [] }),
      executeManyToMany: manyCommand =>
        Effect.runPromise(runtime.runManyToManyRelationshipCommand(manyCommand)),
    });

    await expect(
      denied(toGraphCommandRequest(command), { authority: 'system' }),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'access_denied' },
    });
    await expect(allowed(toGraphCommandRequest(command), { authority: 'system' })).resolves.toEqual(
      {
        kind: 'graph-command-result',
        value: {
          status: 'applied',
          delta: {
            added: [expect.objectContaining({ source: todoRef, target: tagRef })],
            removed: [],
          },
        },
      },
    );
    expect(facts).toHaveLength(1);
  });

  it('preserves the same command and delta through remote in-process routing', async () => {
    const client = defineTodoGraph();
    const server = defineTodoGraph();
    const dataset: InMemoryDataset = {
      Todo: [{ id: 'todo-1', title: 'One' }],
      Tag: [{ id: 'tag-1', name: 'Urgent' }],
    };
    const facts: RelationshipFact[] = [];
    const serverRuntime = createInMemoryDataGraphRuntime({
      dataset,
      entities: [server.Todo, server.Tag],
      relationships: facts,
    });
    const dispatch = createGraphCommandDispatcher({
      policies: [{ entity: server.Todo, relationName: 'tags', actions: ['link'] }],
      execute: async () => appliedRelationshipCommand({ added: [], removed: [] }),
      executeManyToMany: command =>
        Effect.runPromise(serverRuntime.runManyToManyRelationshipCommand(command)),
    });
    const remote = createRemoteDataGraphRuntime({
      transport: async () => undefined,
      commandTransport: request => dispatch(request, { authority: 'system' }),
    });
    const command = relationshipSet(
      client.Todo,
      'tags',
      createEntityRef(client.Todo, { id: 'todo-1' }),
    ).add(createEntityRef(client.Tag, { id: 'tag-1' }));

    await expect(
      Effect.runPromise(remote.runManyToManyRelationshipCommand(command)),
    ).resolves.toEqual({
      status: 'applied',
      delta: {
        added: [
          {
            relation: command.relation,
            source: createEntityRef(client.Todo, { id: 'todo-1' }),
            target: createEntityRef(client.Tag, { id: 'tag-1' }),
          },
        ],
        removed: [],
      },
    });
    expect(facts).toHaveLength(1);
  });
});
