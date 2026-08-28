import type {
  AnyEntityDefinition,
  DeferredEntityReference,
  ReferenceFieldDefinition,
} from '../definitions.js';

import type { EntityRef, EntityRefLocator } from './model.js';

export type GraphSchemaReferenceResolver<
  TTarget extends AnyEntityDefinition = AnyEntityDefinition,
  TResult = unknown,
> = (ref: EntityRef<TTarget['name'], EntityRefLocator>) => TResult;

export type GraphSchemaReferenceRequirement = 'portable' | 'existing';

export type GraphSchemaReferenceDefinition<
  TTarget extends AnyEntityDefinition = AnyEntityDefinition,
  TResolved = never,
  TRequirement extends GraphSchemaReferenceRequirement = 'portable',
> = ReferenceFieldDefinition<TTarget> & {
  /** @internal Type-only custom resolution metadata. */
  readonly __graphSchemaRef?: {
    readonly resolution: TResolved;
    readonly requirement: TRequirement;
  };
  resolveWith: <TNextResolved>(
    resolver: GraphSchemaReferenceResolver<TTarget, TNextResolved>,
  ) => GraphSchemaReferenceDefinition<TTarget, TNextResolved, TRequirement>;
};

const resolvers = new WeakMap<object, GraphSchemaReferenceResolver<any, any>>();

const attachResolveWith = <
  TTarget extends AnyEntityDefinition,
  TResolved,
  TRequirement extends GraphSchemaReferenceRequirement,
>(
  definition: ReferenceFieldDefinition<TTarget>,
): GraphSchemaReferenceDefinition<TTarget, TResolved, TRequirement> => {
  Object.defineProperty(definition, 'resolveWith', {
    configurable: true,
    enumerable: false,
    value: <TNextResolved>(resolver: GraphSchemaReferenceResolver<TTarget, TNextResolved>) => {
      const next = attachResolveWith({ ...definition });
      resolvers.set(next, resolver);
      return next;
    },
  });

  return definition as GraphSchemaReferenceDefinition<TTarget, TResolved, TRequirement>;
};

export const graphSchemaReference = <TTarget extends AnyEntityDefinition>(
  target: TTarget | DeferredEntityReference<TTarget>,
): GraphSchemaReferenceDefinition<TTarget> =>
  attachResolveWith<TTarget, never, 'portable'>({
    kind: 'field',
    fieldType: 'reference',
    target: target as TTarget,
  });

export const graphSchemaExistingReference = <TTarget extends AnyEntityDefinition>(
  target: TTarget | DeferredEntityReference<TTarget>,
): GraphSchemaReferenceDefinition<TTarget, never, 'existing'> => {
  if ('fields' in target && 'ref' in target.fields) {
    throw new Error(
      `Existing Ref target ${target.name} cannot declare a Field named "ref" because that property preserves the participant's portable identity.`,
    );
  }

  return attachResolveWith<TTarget, never, 'existing'>({
    kind: 'field',
    fieldType: 'reference',
    target: target as TTarget,
    referenceRequirement: 'existing',
  });
};

export const getGraphSchemaReferenceResolver = (
  definition: ReferenceFieldDefinition,
): GraphSchemaReferenceResolver | undefined => resolvers.get(definition);
