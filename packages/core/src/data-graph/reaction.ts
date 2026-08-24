import type { AnyEntityDefinition } from './definitions.js';
import type { EntityMutationCommand } from './entity-mutation-command.js';
import type {
  AppliedMutationOutcome,
  AppliedRelationshipMutationOutcome,
  EmitEventReactionIntent,
  InvokeOperationReactionIntent,
  MutationReaction,
  MutationReactionIntent,
} from './mutation-reaction.js';
import {
  resolveCanonicalRelationshipIdentity,
  type ManyToManyRelationshipCommand,
  type RelationshipCommand,
} from './relationship-command.js';

type ReactionConfig = Pick<MutationReaction, 'id' | 'delivery'>;
type AppliedDirectRelationshipMutationOutcome = Omit<
  AppliedRelationshipMutationOutcome,
  'command'
> & { command: RelationshipCommand };
type AppliedManyToManyRelationshipMutationOutcome = Omit<
  AppliedRelationshipMutationOutcome,
  'command'
> & { command: ManyToManyRelationshipCommand };
type RelationshipOutcomeFor<
  TEntity extends AnyEntityDefinition,
  TRelationName extends keyof TEntity['relations'] & string,
> = TEntity['relations'][TRelationName]['relationKind'] extends 'manyToMany'
  ? AppliedManyToManyRelationshipMutationOutcome
  : AppliedDirectRelationshipMutationOutcome;
type RelationshipOutcomeProjector<TOutcome, TValue> = (outcome: TOutcome) => TValue;
type RelationshipEventAuthoring<TOutcome> = {
  (project: RelationshipOutcomeProjector<TOutcome, unknown>): MutationReaction;
  (event: unknown): MutationReaction;
};

const emit = (event: unknown): EmitEventReactionIntent => ({ kind: 'emit-event', event });

const invoke = (
  operation: string | { id: string },
  input?: unknown,
): InvokeOperationReactionIntent => ({
  kind: 'invoke-operation',
  request: {
    kind: 'invoke',
    operationId: typeof operation === 'string' ? operation : operation.id,
    ...(input === undefined ? {} : { input }),
  },
});

const execute = (
  command: RelationshipCommand | ManyToManyRelationshipCommand | EntityMutationCommand,
): MutationReactionIntent => {
  if (command.kind === 'relationship-command') {
    return { kind: 'execute-relationship-command', command };
  }
  if (command.kind === 'many-to-many-relationship-command') {
    return { kind: 'execute-many-to-many-relationship-command', command };
  }
  return { kind: 'execute-entity-mutation-command', command };
};

const defineRelationshipReaction = <
  TEntity extends AnyEntityDefinition,
  TRelationName extends keyof TEntity['relations'] & string,
>(
  entity: TEntity,
  relationName: TRelationName,
  action: RelationshipCommand['action'],
  config: ReactionConfig,
) => {
  const then = (
    project: RelationshipOutcomeProjector<
      RelationshipOutcomeFor<TEntity, TRelationName>,
      readonly MutationReactionIntent[]
    >,
  ): MutationReaction => {
    const declaration = {
      ...config,
      get when() {
        return {
          mutationKind: 'relationship-command' as const,
          action,
          relation: resolveCanonicalRelationshipIdentity(entity, relationName),
        };
      },
      react: (outcome: AppliedMutationOutcome) =>
        project(outcome as RelationshipOutcomeFor<TEntity, TRelationName>),
    } satisfies MutationReaction;
    return declaration;
  };

  const emitReaction = ((
    event:
      | unknown
      | RelationshipOutcomeProjector<RelationshipOutcomeFor<TEntity, TRelationName>, unknown>,
  ) =>
    then(outcome => [
      emit(typeof event === 'function' ? event(outcome) : event),
    ])) as RelationshipEventAuthoring<RelationshipOutcomeFor<TEntity, TRelationName>>;

  return { then, emit: emitReaction };
};

const relationship = <
  TEntity extends AnyEntityDefinition,
  TRelationName extends keyof TEntity['relations'] & string,
>(
  entity: TEntity,
  relationName: TRelationName,
) => ({
  added: (config: ReactionConfig) =>
    defineRelationshipReaction(entity, relationName, 'link', config),
  removed: (config: ReactionConfig) =>
    defineRelationshipReaction(entity, relationName, 'unlink', config),
});

export const reaction = {
  relationship,
  intent: {
    emit,
    invoke,
    execute,
  },
};
