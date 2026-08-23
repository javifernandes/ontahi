import type { AnyEntityDefinition, InferEntityRecord } from './definitions.js';
import type { AnyEntityRef } from './ref/index.js';

export type EntityMutationFact = {
  entityName: string;
  ref?: AnyEntityRef;
  values: Record<string, unknown>;
};

export type EntityMutationDelta = {
  created: EntityMutationFact[];
  updated: EntityMutationFact[];
  deleted: EntityMutationFact[];
};

export type EntityMutationCommand =
  | {
      kind: 'entity-mutation-command';
      action: 'create';
      entityName: string;
      values: Record<string, unknown>;
    }
  | {
      kind: 'entity-mutation-command';
      action: 'update';
      entityName: string;
      target: AnyEntityRef;
      values: Record<string, unknown>;
    }
  | {
      kind: 'entity-mutation-command';
      action: 'delete';
      entityName: string;
      target: AnyEntityRef;
    };

export interface EntityMutationCommandExecutionRuntime<TError = never, TOptions = undefined> {
  runEntityMutationCommand(
    command: EntityMutationCommand,
    options?: TOptions,
  ): import('effect').Effect.Effect<EntityMutationDelta, TError>;
}

const assertTarget = (entity: AnyEntityDefinition, target: AnyEntityRef) => {
  if (target.entityName !== entity.name) {
    throw new Error(
      `Expected Entity mutation target Ref for ${entity.name}, got ${target.entityName}.`,
    );
  }
};

export const mutateEntity = <TEntity extends AnyEntityDefinition>(entity: TEntity) => ({
  create: (values: InferEntityRecord<TEntity['fields']>): EntityMutationCommand => ({
    kind: 'entity-mutation-command',
    action: 'create',
    entityName: entity.name,
    values,
  }),
  update: (
    target: AnyEntityRef,
    values: Partial<InferEntityRecord<TEntity['fields']>>,
  ): EntityMutationCommand => {
    assertTarget(entity, target);
    return {
      kind: 'entity-mutation-command',
      action: 'update',
      entityName: entity.name,
      target,
      values,
    };
  },
  delete: (target: AnyEntityRef): EntityMutationCommand => {
    assertTarget(entity, target);
    return {
      kind: 'entity-mutation-command',
      action: 'delete',
      entityName: entity.name,
      target,
    };
  },
});
