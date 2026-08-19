import { Effect } from 'effect';

import type { AnyEntityDefinition } from '../definitions.js';
import type {
  EntityMutationCommand,
  EntityMutationDelta,
  EntityMutationFact,
} from '../entity-mutation-command.js';
import { createEntityIdentityRef } from '../ref.js';
import { selectionNone, selectionReferences } from '../selection-ast.js';

import { executeInMemoryGraphCommandEffect, InMemoryDataGraphError } from './command.js';
import type { InMemoryDataset } from './materialization.js';

const findEntity = (entities: readonly AnyEntityDefinition[], entityName: string) => {
  const entity = entities.find(candidate => candidate.name === entityName);
  if (!entity) {
    throw new InMemoryDataGraphError(`Unknown Entity ${entityName}.`, 'invalid_command');
  }
  return entity;
};

const emptyDelta = (): EntityMutationDelta => ({ created: [], updated: [], deleted: [] });

const graphOperationFor = (action: EntityMutationCommand['action']) => {
  if (action === 'create') return 'insert';
  if (action === 'update') return 'update';
  return 'delete';
};

export const executeInMemoryEntityMutationCommandEffect = (
  dataset: InMemoryDataset,
  entities: readonly AnyEntityDefinition[],
  command: EntityMutationCommand,
): Effect.Effect<EntityMutationDelta, InMemoryDataGraphError> =>
  Effect.suspend(() => {
    const entity = findEntity(entities, command.entityName);
    if ('target' in command && command.target.entityName !== entity.name) {
      return Effect.fail(
        new InMemoryDataGraphError(
          `Expected Entity mutation target Ref for ${entity.name}, got ${command.target.entityName}.`,
          'invalid_command',
        ),
      );
    }

    const fields = Object.keys(entity.fields);
    return executeInMemoryGraphCommandEffect<Record<string, unknown>>(dataset, {
      kind: 'command',
      operation: graphOperationFor(command.action),
      root: entity,
      selection: 'target' in command ? selectionReferences([command.target]) : selectionNone(),
      ...('values' in command ? { payload: command.values } : {}),
      returning: fields,
      cardinality: 'one',
    }).pipe(
      Effect.map(values => {
        const fact: EntityMutationFact = {
          entityName: entity.name,
          ...(createEntityIdentityRef(entity, values)
            ? { ref: createEntityIdentityRef(entity, values) }
            : {}),
          values,
        };
        const delta = emptyDelta();
        if (command.action === 'create') delta.created.push(fact);
        else if (command.action === 'update') delta.updated.push(fact);
        else delta.deleted.push(fact);
        return delta;
      }),
    );
  });
