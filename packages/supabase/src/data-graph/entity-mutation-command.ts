import {
  hasEntityMutationCondition,
  materializeEntityMutationDelta,
  toEntityMutationGraphCommand,
  type AnyEntityDefinition,
  type EntityMutationCommand,
  type EntityMutationDelta,
} from '@ontahi/core/data-graph';
import { Effect } from 'effect';

import { executeSupabaseGraphCommandEffect } from './command.js';
import type { SupabaseErrorFactory, SupabaseLikeClient } from './types.js';

export const executeSupabaseEntityMutationCommandEffect = <
  TClient extends SupabaseLikeClient,
  TError,
  TCommandOptions extends object = {},
>(
  deps: {
    getClient: (options?: TCommandOptions) => Effect.Effect<TClient, TError>;
    createError: SupabaseErrorFactory<TError>;
    entities: readonly AnyEntityDefinition[];
  },
  command: EntityMutationCommand,
  options?: TCommandOptions,
): Effect.Effect<EntityMutationDelta, TError> =>
  Effect.try({
    try: () => {
      const entity = deps.entities.find(candidate => candidate.name === command.entityName);
      if (!entity) {
        throw new Error(
          `Supabase Entity Mutation Command references unregistered Entity "${command.entityName}".`,
        );
      }
      return {
        entity,
        graphCommand: toEntityMutationGraphCommand(entity, command),
      };
    },
    catch: cause =>
      deps.createError({
        message: 'Supabase Entity Mutation Command is invalid.',
        logMessage: 'Supabase Entity Mutation Command validation failed',
        cause,
      }),
  }).pipe(
    Effect.flatMap(({ entity, graphCommand }) =>
      executeSupabaseGraphCommandEffect(
        {
          getClient: deps.getClient,
          createError: deps.createError,
          cardinalityMismatchCause: actualAffectedRows => ({
            reason:
              hasEntityMutationCondition(command) && actualAffectedRows === 0
                ? 'entity_mutation_condition_not_met'
                : 'cardinality_mismatch',
            actualAffectedRows,
          }),
        },
        graphCommand,
        options,
      ).pipe(Effect.map(values => materializeEntityMutationDelta(entity, command, values))),
    ),
  );
