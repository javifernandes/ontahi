import { Effect } from 'effect';

import type { AnyEntityDefinition } from '../definitions.js';
import type { EntityMutationCommand, EntityMutationDelta } from '../entity-mutation-command.js';
import {
  hasEntityMutationCondition,
  materializeEntityMutationDelta,
  toEntityMutationGraphCommand,
} from '../entity-mutation-command.js';

import { executeInMemoryGraphCommandEffect, InMemoryDataGraphError } from './command.js';
import type { InMemoryDataset } from './materialization.js';

const findEntity = (entities: readonly AnyEntityDefinition[], entityName: string) => {
  const entity = entities.find(candidate => candidate.name === entityName);
  if (!entity) {
    throw new InMemoryDataGraphError(`Unknown Entity ${entityName}.`, 'invalid_command');
  }
  return entity;
};

const hasZeroAffectedRows = (error: InMemoryDataGraphError) =>
  typeof error.cause === 'object' &&
  error.cause !== null &&
  'actualAffectedRows' in error.cause &&
  error.cause.actualAffectedRows === 0;

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
    return executeInMemoryGraphCommandEffect<Record<string, unknown>>(
      dataset,
      toEntityMutationGraphCommand(entity, command),
    ).pipe(
      Effect.mapError(error =>
        hasEntityMutationCondition(command) &&
        error.reason === 'cardinality_mismatch' &&
        hasZeroAffectedRows(error)
          ? new InMemoryDataGraphError(
              'Entity mutation condition was not satisfied.',
              'entity_mutation_condition_not_met',
              error,
            )
          : error,
      ),
      Effect.map(values => materializeEntityMutationDelta(entity, command, values)),
    );
  });
