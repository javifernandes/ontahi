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

export type GraphSchemaReferenceDefinition<
  TTarget extends AnyEntityDefinition = AnyEntityDefinition,
  TResolved = never,
> = ReferenceFieldDefinition<TTarget> & {
  /** @internal Type-only custom resolution metadata. */
  readonly __graphSchemaRef?: { readonly resolution: TResolved };
  resolveWith: <TNextResolved>(
    resolver: GraphSchemaReferenceResolver<TTarget, TNextResolved>,
  ) => GraphSchemaReferenceDefinition<TTarget, TNextResolved>;
};

const resolvers = new WeakMap<object, GraphSchemaReferenceResolver<any, any>>();

const attachResolveWith = <TTarget extends AnyEntityDefinition, TResolved>(
  definition: ReferenceFieldDefinition<TTarget>,
): GraphSchemaReferenceDefinition<TTarget, TResolved> => {
  Object.defineProperty(definition, 'resolveWith', {
    configurable: true,
    enumerable: false,
    value: <TNextResolved>(resolver: GraphSchemaReferenceResolver<TTarget, TNextResolved>) => {
      const next = attachResolveWith({ ...definition });
      resolvers.set(next, resolver);
      return next;
    },
  });

  return definition as GraphSchemaReferenceDefinition<TTarget, TResolved>;
};

export const graphSchemaReference = <TTarget extends AnyEntityDefinition>(
  target: TTarget | DeferredEntityReference<TTarget>,
): GraphSchemaReferenceDefinition<TTarget> =>
  attachResolveWith({
    kind: 'field',
    fieldType: 'reference',
    target: target as TTarget,
  });

export const getGraphSchemaReferenceResolver = (
  definition: ReferenceFieldDefinition,
): GraphSchemaReferenceResolver | undefined => resolvers.get(definition);
