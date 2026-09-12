import { cloneJson } from '../value/json.js';
import { hasOwn } from '../value/object.js';

import type { AnyEntityDefinition } from './definitions.js';
import { graphSchema } from './definitions.js';
import type { SelectionProperties } from './entity-selections.js';
import { getEntityVariantContract } from './entity-variant-contract.js';
import type {
  EntityVariant,
  EntityVariantDiscriminator,
  VariantSelection,
} from './entity-variant.js';
import { parseGraphSchema } from './schema.js';
import type { SelectionAst } from './selection-ast.js';
import { Selection, type SelectionBuilder } from './selection-value.js';

export type ContextualSelectionDescriptor = {
  version: number;
  input: { context: { kind: 'selection'; entityName: string } };
  output: { kind: 'selection'; entityName: string };
  template: { relationName: string; target: SelectionAst };
};

export interface ContextualSelectionFactory<
  TSource extends AnyEntityDefinition,
  TTarget extends AnyEntityDefinition,
> {
  readonly descriptor: ContextualSelectionDescriptor;
  as<TName extends string, TDiscriminator extends EntityVariantDiscriminator<TTarget>>(
    variant: EntityVariant<TTarget, TName, TDiscriminator>,
  ): ClassifiedContextualSelectionFactory<TSource, TTarget, TName, TDiscriminator>;
  from<TContext extends TSource>(
    source: Selection<TContext>,
  ): Selection<TTarget, undefined> & SelectionProperties<TTarget>;
}

export interface ClassifiedContextualSelectionFactory<
  TSource extends AnyEntityDefinition,
  TTarget extends AnyEntityDefinition,
  TName extends string,
  TDiscriminator extends EntityVariantDiscriminator<TTarget>,
> {
  readonly descriptor: ContextualSelectionDescriptor;
  from<TContext extends TSource>(
    source: Selection<TContext>,
  ): VariantSelection<TTarget, TName, TDiscriminator> & SelectionProperties<TTarget>;
}

const compiledFactories = new WeakSet<object>();
export const isContextualSelectionFactory = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && compiledFactories.has(value);

/** Experimental parameterless contextual counterpart of a pure named `by` factory. */
export const contextualSelectionFactory = <
  TSource extends AnyEntityDefinition,
  TKey extends keyof TSource['relations'] & string,
>(
  owner: TSource,
  relationName: TKey,
  where?: SelectionBuilder<TSource['relations'][TKey]['target']>,
): ContextualSelectionFactory<TSource, TSource['relations'][TKey]['target']> => {
  if (!hasOwn(owner.relations, relationName))
    throw new TypeError(`Unknown relation ${owner.name}.${relationName}.`);
  const target: TSource['relations'][TKey]['target'] = owner.relations[relationName]!.target;
  const membership = where ? Selection.where(target, where) : Selection.all(target);
  // Capture compiled data once. The callback is declaration sugar, not an invocation resolver.
  const template = cloneJson(membership.toAst());
  parseGraphSchema(graphSchema.selection(target, { entities: [owner] }), template);
  const descriptor = {
    version: 1,
    input: { context: { kind: 'selection' as const, entityName: owner.name } },
    output: { kind: 'selection' as const, entityName: target.name },
    template: { relationName, target: template },
  };
  const factory: ContextualSelectionFactory<TSource, TSource['relations'][TKey]['target']> = {
    as(variant) {
      if (getEntityVariantContract(variant)?.base !== target)
        throw new TypeError(
          `Contextual variant must classify the target of ${owner.name}.${relationName}.`,
        );
      const classified = {
        get descriptor(): ContextualSelectionDescriptor {
          return {
            ...cloneJson(descriptor),
            output: { kind: 'selection', entityName: variant.name },
            template: {
              relationName,
              target: { ...cloneJson(template), entityName: variant.name },
            },
          };
        },
        from<TContext extends TSource>(source: Selection<TContext>) {
          return variant.from(factory.from(source));
        },
      };
      compiledFactories.add(classified);
      return classified;
    },
    get descriptor() {
      return cloneJson(descriptor);
    },
    from<TContext extends TSource>(source: Selection<TContext>) {
      if (source.root !== owner)
        throw new TypeError(`Expected ${owner.name} context from this model definition.`);
      const filter = parseGraphSchema(
        graphSchema.selection(target, { entities: [owner] }),
        cloneJson(template),
      );
      return new Selection(owner, source.build())
        .through(relationName)
        .and(new Selection(target, filter.expression));
    },
  };
  compiledFactories.add(factory);
  return factory;
};
