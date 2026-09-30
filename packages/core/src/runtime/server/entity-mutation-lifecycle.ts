import { Effect } from 'effect';

import {
  createEntityIdentityRef,
  isDataGraphTransactionCapability,
  relationshipSet,
  selectionAll,
  selectionReferences,
  toEntityMutationGraphCommand,
  type AnyEntityDefinition,
  type DataGraphExecutionRuntime,
  type EntityMutationCommand,
  type EntityMutationCommandExecutionRuntime,
  type EntityMutationDelta,
  type ManyToManyRelationshipCommand,
  type ManyToManyRelationshipCommandExecutionRuntime,
  type RelationshipCommandResult,
} from '../../data-graph/index.js';

export type EntityMutationLifecycleOutcome =
  | {
      kind: 'entity';
      command: EntityMutationCommand;
      delta: EntityMutationDelta;
    }
  | {
      kind: 'relationship';
      command: ManyToManyRelationshipCommand;
      result: RelationshipCommandResult;
    };

type LifecycleRuntime = DataGraphExecutionRuntime<unknown, unknown, unknown, unknown> &
  EntityMutationCommandExecutionRuntime<unknown, unknown> &
  Partial<ManyToManyRelationshipCommandExecutionRuntime<unknown, unknown>>;

const entitySelection = (entity: AnyEntityDefinition, command: EntityMutationCommand) => ({
  kind: 'query' as const,
  root: entity,
  selection: toEntityMutationGraphCommand(entity, command).selection,
  orderBy: [],
});

const refsSelection = (
  entity: AnyEntityDefinition,
  refs: NonNullable<ReturnType<typeof createEntityIdentityRef>>[],
) => ({
  root: entity,
  expression: selectionReferences(refs),
});

const allSelection = (entity: AnyEntityDefinition) => ({
  root: entity,
  expression: selectionAll(),
});

const executeDeleteTree = (
  runtime: LifecycleRuntime,
  entities: readonly AnyEntityDefinition[],
  command: EntityMutationCommand & { action: 'delete' },
  options: unknown,
  visited: Set<string>,
): Effect.Effect<readonly EntityMutationLifecycleOutcome[], unknown> =>
  Effect.gen(function* () {
    const entity = entities.find(candidate => candidate.name === command.entityName);
    if (!entity) throw new Error(`Unknown Entity ${command.entityName}.`);
    const rows = yield* runtime.run(entitySelection(entity, command), undefined, options);
    const refs = rows.flatMap(row => {
      const ref = createEntityIdentityRef(entity, row as Record<string, unknown>);
      if (!ref) {
        throw new Error(
          `Entity ${entity.name} needs an identity locator before lifecycle deletion can run.`,
        );
      }
      const key = `${ref.entityName}:${JSON.stringify(ref.locator)}`;
      if (visited.has(key)) return [];
      visited.add(key);
      return [ref];
    });
    const outcomes: EntityMutationLifecycleOutcome[] = [];

    for (const [relationName, relation] of Object.entries(entity.relations)) {
      if (relation.onDelete !== 'cascade') continue;
      if (relation.relationKind !== 'hasMany' || !relation.targetField) {
        throw new Error(
          `Cascade lifecycle ${entity.name}.${relationName} requires hasMany via a target Reference Field.`,
        );
      }
      for (const ref of refs) {
        const childCommand: EntityMutationCommand & { action: 'delete' } = {
          kind: 'entity-mutation-command',
          action: 'delete',
          entityName: relation.target.name,
          target: {
            kind: 'selection',
            entityName: relation.target.name,
            expression: {
              kind: 'predicate',
              operator: 'eq',
              fieldName: relation.targetField,
              value: ref,
            },
          },
        };
        outcomes.push(
          ...(yield* executeDeleteTree(runtime, entities, childCommand, options, visited)),
        );
      }
    }

    const detach = function* (
      source: AnyEntityDefinition,
      relationName: string,
      sources: ReturnType<typeof allSelection>,
      targets: ReturnType<typeof allSelection>,
    ) {
      if (typeof runtime.runManyToManyRelationshipCommand !== 'function') {
        throw new Error('Storage runtime does not support many-to-many lifecycle cleanup.');
      }
      const unlink = relationshipSet(source, relationName, sources).remove(targets);
      const result = yield* runtime.runManyToManyRelationshipCommand(unlink, options);
      outcomes.push({ kind: 'relationship', command: unlink, result });
    };

    if (refs.length > 0) {
      for (const [relationName, relation] of Object.entries(entity.relations)) {
        if (relation.relationKind !== 'manyToMany' || relation.onDelete !== 'detach') continue;
        yield* Effect.gen(() =>
          detach(entity, relationName, refsSelection(entity, refs), allSelection(relation.target)),
        );
      }
      for (const source of entities) {
        for (const [relationName, relation] of Object.entries(source.relations)) {
          if (
            relation.relationKind !== 'manyToMany' ||
            relation.onDelete !== 'detach' ||
            relation.target.name !== entity.name
          )
            continue;
          yield* Effect.gen(() =>
            detach(source, relationName, allSelection(source), refsSelection(entity, refs)),
          );
        }
      }
    }

    const delta = yield* runtime.runEntityMutationCommand(command, options);
    outcomes.push({ kind: 'entity', command, delta });
    return outcomes;
  });

export const executeEntityMutationLifecycle = (
  runtime: LifecycleRuntime,
  entities: readonly AnyEntityDefinition[],
  command: EntityMutationCommand,
  options: unknown,
): Effect.Effect<
  { delta: EntityMutationDelta; outcomes: readonly EntityMutationLifecycleOutcome[] },
  unknown
> => {
  if (command.action !== 'delete') {
    return runtime
      .runEntityMutationCommand(command, options)
      .pipe(Effect.map(delta => ({ delta, outcomes: [{ kind: 'entity', command, delta }] })));
  }
  const run = (activeRuntime: LifecycleRuntime) =>
    executeDeleteTree(activeRuntime, entities, command, options, new Set()).pipe(
      Effect.map(outcomes => {
        const primary = [...outcomes]
          .reverse()
          .find(outcome => outcome.kind === 'entity' && outcome.command === command);
        if (!primary || primary.kind !== 'entity') {
          throw new Error(`Lifecycle deletion did not execute ${command.entityName}.`);
        }
        return { delta: primary.delta, outcomes };
      }),
    );

  return isDataGraphTransactionCapability<LifecycleRuntime, unknown>(runtime)
    ? runtime.transaction(run)
    : run(runtime);
};
