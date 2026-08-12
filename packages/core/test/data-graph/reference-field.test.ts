import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  applyConventionalDataGraphMappings,
  compileQueryPlan,
  createEntityRef,
  createRelatedRootReadSpec,
  createInsertCommandSpec,
  createInMemoryDataGraphRuntime,
  entity,
  field,
  getEntityMapping,
  query,
  safeParseGraphSchema,
  toGraphJsonSchema,
  toGraphSchemaDescriptor,
  type EntityRef,
  type InferEntityRecord,
  type InferQueryResult,
} from '../../src/data-graph/index.js';

const defineTodoGraph = () => {
  const TodoList = entity('TodoList', {
    id: field.id(),
    name: field.string(),
  });
  const Todo = entity('Todo', {
    id: field.id(),
    list: field.ref(TodoList),
    title: field.string(),
  });

  applyConventionalDataGraphMappings({
    entities: [TodoList, Todo],
    naming: {
      table: name => name.toLowerCase(),
      column: name => name.replaceAll(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(),
    },
  });

  return { TodoList, Todo };
};

describe('data-graph reference fields', () => {
  it('declares one semantic value and synthesizes its belongs-to relation', () => {
    const { TodoList, Todo } = defineTodoGraph();

    expect(Todo.fields.list).toMatchObject({
      fieldType: 'reference',
      target: TodoList,
    });
    expect(Todo.relations.list).toMatchObject({
      relationKind: 'belongsTo',
      target: TodoList,
      sourceField: 'list',
    });
    expect(getEntityMapping(Todo).columns.list).toBe('list_id');
    expectTypeOf<InferEntityRecord<typeof Todo.fields>['list']>().toEqualTypeOf<
      EntityRef<'TodoList'>
    >();
  });

  it('preserves nullable reference cardinality when the target is included', () => {
    const TodoList = entity('TodoList', { id: field.id() });
    const Todo = entity('Todo', {
      id: field.id(),
      list: field.nullable(field.ref(TodoList)),
    });
    const todos = query(Todo).include(todo => ({ list: todo.list }));

    expect(Todo.relations.list.nullable).toBe(true);
    expectTypeOf<InferQueryResult<typeof todos>['list']>().toEqualTypeOf<InferEntityRecord<
      typeof TodoList.fields
    > | null>();
  });

  it('uses the reference as a field in selections and as a relation in includes', () => {
    const { TodoList, Todo } = defineTodoGraph();
    const research = createEntityRef(TodoList, { id: 'list-research' });
    const todos = query(Todo)
      .where(todo => todo.list.eq(research))
      .include(todo => ({ list: todo.list }));
    const typedResult: InferQueryResult<typeof todos> = {
      id: 'todo-1',
      list: { id: 'list-research', name: 'Research' },
      title: 'Write the model',
    };
    const plan = compileQueryPlan(todos, undefined);

    expect(plan.selection).toMatchObject({
      operator: 'eq',
      field: 'list',
      column: 'list_id',
      value: 'list-research',
    });
    expect(typedResult.list).toMatchObject({ id: 'list-research' });
    expect(plan.includes[0]).toMatchObject({
      relationName: 'list',
      sourceField: 'list',
      sourceColumn: 'list_id',
      targetField: 'id',
      targetColumn: 'id',
    });
    expectTypeOf<InferQueryResult<typeof todos>['list']>().toEqualTypeOf<
      InferEntityRecord<typeof TodoList.fields>
    >();
    expect(compileQueryPlan(query(TodoList).where(research), undefined).selection).toMatchObject({
      operator: 'eq',
      field: 'id',
      value: 'list-research',
    });
  });

  it('lifts stored identities into Refs and materializes the same path when included', async () => {
    const { TodoList, Todo } = defineTodoGraph();
    const research = createEntityRef(TodoList, { id: 'list-research' });
    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        TodoList: [{ id: 'list-research', name: 'Research' }],
        Todo: [{ id: 'todo-1', list: 'list-research', title: 'Write the model' }],
      },
    });

    await expect(Effect.runPromise(runtime.run(query(Todo), undefined))).resolves.toEqual([
      { id: 'todo-1', list: research, title: 'Write the model' },
    ]);
    await expect(
      Effect.runPromise(
        runtime.run(
          query(Todo)
            .where(todo => todo.list.eq(research))
            .include(todo => ({ list: todo.list })),
          undefined,
        ),
      ),
    ).resolves.toEqual([
      {
        id: 'todo-1',
        list: { id: 'list-research', name: 'Research' },
        title: 'Write the model',
      },
    ]);
  });

  it('uses reference fields as join keys for inverse relation reads and grouped counts', async () => {
    const { TodoList, Todo } = defineTodoGraph();
    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        TodoList: [
          { id: 'list-research', name: 'Research' },
          { id: 'list-inbox', name: 'Inbox' },
        ],
        Todo: [
          { id: 'todo-1', list: 'list-research', title: 'Write the model' },
          { id: 'todo-2', list: 'list-research', title: 'Test the model' },
        ],
      },
    });
    const related = createRelatedRootReadSpec({
      mode: 'countBySource',
      target: query(Todo).build(),
      source: query(TodoList),
      sourceEntity: TodoList,
      relationName: 'list',
    });

    const [result] = await Effect.runPromise(runtime.run(related, undefined));

    expect(result?.countsBySource).toEqual(
      new Map([
        ['list-research', 2],
        ['list-inbox', 0],
      ]),
    );
  });

  it('lowers command payloads and lifts returning reference fields', async () => {
    const { TodoList, Todo } = defineTodoGraph();
    const research = createEntityRef(TodoList, { id: 'list-research' });
    const dataset = { Todo: [] as Array<Record<string, unknown>> };
    const runtime = createInMemoryDataGraphRuntime({ dataset });

    await expect(
      Effect.runPromise(
        runtime.runCommand(
          createInsertCommandSpec(
            Todo,
            { id: 'todo-1', list: research, title: 'Write the model' },
            { returning: ['id', 'list'], cardinality: 'one' },
          ),
        ),
      ),
    ).resolves.toEqual({ id: 'todo-1', list: research });
    expect(dataset.Todo).toEqual([
      { id: 'todo-1', list: 'list-research', title: 'Write the model' },
    ]);
  });

  it('reflects and validates the target identity contract', () => {
    const { TodoList, Todo } = defineTodoGraph();
    const research = createEntityRef(TodoList, { id: 'list-research' });

    expect(toGraphSchemaDescriptor(Todo.fields.list)).toEqual({
      kind: 'entity-ref',
      entityName: 'TodoList',
      identity: { name: 'refById', fields: ['id'] },
    });
    expect(toGraphJsonSchema(Todo.fields.list)).toMatchObject({
      type: 'object',
      properties: { entityName: { const: 'TodoList' } },
      'x-ontahi-entity-ref': {
        entityName: 'TodoList',
        identity: { name: 'refById', fields: ['id'] },
      },
    });
    expect(safeParseGraphSchema(Todo.fields.list, research)).toEqual({
      success: true,
      data: research,
    });
    expect(
      safeParseGraphSchema(Todo.fields.list, createEntityRef(Todo, { id: 'todo-1' })),
    ).toMatchObject({ success: false });
  });

  it('rejects reference storage for a composite target identity in the first slice', () => {
    const Membership = entity('Membership', {
      organizationId: field.id(),
      userId: field.id(),
    })
      .locators({ byOrganizationAndUser: ['organizationId', 'userId'] })
      .identity('byOrganizationAndUser');
    const AuditEntry = entity('AuditEntry', {
      id: field.id(),
      membership: field.ref(Membership),
    });

    expect(() =>
      applyConventionalDataGraphMappings({
        entities: [Membership, AuditEntry],
        naming: { table: name => name, column: name => name },
      }),
    ).toThrow('the target must have a single-field identity');
  });
});
