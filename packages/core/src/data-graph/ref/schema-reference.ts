import type {
  AnyEntityDefinition,
  DeferredEntityReference,
  ReferenceFieldDefinition,
} from '../definitions.js';
import { getEntityVariantContract } from '../entity-variant-contract.js';
import type {
  EntityVariant,
  EntityVariantDescriptor,
  EntityVariantDiscriminator,
  VariantReadEntity,
} from '../entity-variant.js';

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

export type GraphSchemaVariantReferenceDefinition<TTarget extends AnyEntityDefinition> = Omit<
  GraphSchemaReferenceDefinition<TTarget, never, 'existing'>,
  'resolveWith'
> & {
  resolveWith: <TResult>(
    resolver: GraphSchemaReferenceResolver<TTarget, TResult>,
  ) => GraphSchemaVariantReferenceDefinition<TTarget>;
};

const attachResolveWith = <
  TTarget extends AnyEntityDefinition,
  TResolved,
  TRequirement extends GraphSchemaReferenceRequirement,
>(
  definition: ReferenceFieldDefinition<TTarget>,
): GraphSchemaReferenceDefinition<TTarget, TResolved, TRequirement> => {
  if (definition.variant) {
    const descriptor = structuredClone(definition.variant);
    Object.defineProperty(definition, 'variant', {
      enumerable: true,
      get: () => structuredClone(descriptor),
    });
  }
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

type ExistingReferenceFactory = {
  <
    TEntity extends AnyEntityDefinition,
    TName extends string,
    TDiscriminator extends EntityVariantDiscriminator<TEntity>,
  >(
    target: EntityVariant<TEntity, TName, TDiscriminator>,
  ): GraphSchemaVariantReferenceDefinition<VariantReadEntity<TEntity, TDiscriminator>>;
  <TTarget extends AnyEntityDefinition>(
    target: TTarget | DeferredEntityReference<TTarget>,
  ): GraphSchemaReferenceDefinition<TTarget, never, 'existing'>;
};

export const graphSchemaExistingReference: ExistingReferenceFactory = (
  target:
    | AnyEntityDefinition
    | DeferredEntityReference<AnyEntityDefinition>
    | {
        kind: 'entity-variant';
        name: string;
        base: AnyEntityDefinition;
        descriptor: EntityVariantDescriptor;
      },
) => {
  const variant = getEntityVariantContract(target);
  const base = variant?.base ?? target;
  if ('fields' in base && 'ref' in base.fields) {
    throw new Error(
      `Existing Ref target ${base.name} cannot declare a Field named "ref" because that property preserves the participant's portable identity.`,
    );
  }

  return attachResolveWith({
    kind: 'field',
    fieldType: 'reference',
    target: base as AnyEntityDefinition,
    referenceRequirement: 'existing',
    ...(variant ? { variant: variant.descriptor } : {}),
  }) as never;
};

export const getGraphSchemaReferenceResolver = (
  definition: ReferenceFieldDefinition,
): GraphSchemaReferenceResolver | undefined => resolvers.get(definition);
