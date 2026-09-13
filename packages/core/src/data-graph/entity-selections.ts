import { cloneJson } from '../value/json.js';
import { hasOwn } from '../value/object.js';

import {
  contextualSelectionFactory,
  isContextualSelectionFactory,
  type ContextualSelectionFactory,
  type ClassifiedContextualSelectionFactory,
  type ContextualSelectionDescriptor,
} from './contextual-selection-factories.js';
import type { AnyEntityDefinition } from './definitions.js';
import {
  isEntityVariantDescriptor,
  type EntityVariantDescriptor,
} from './entity-variant-contract.js';
import type { EntityVariantDiscriminator } from './entity-variant.js';
import type { SelectionExpression } from './selection-ast.js';
import { Selection, type SelectionBuilder } from './selection-value.js';
import { GraphSelection } from './selection.js';

type ContextualFactory = {
  readonly descriptor: ContextualSelectionDescriptor;
  from(source: Selection<any>): unknown;
};
export type ContextualSelectionDeclarations = Record<string, ContextualFactory>;
export type EntitySelectionContext<TEntity extends AnyEntityDefinition> = {
  readonly [K in keyof TEntity['relations'] & string]: {
    where: (
      build: SelectionBuilder<TEntity['relations'][K]['target']>,
    ) => ReturnType<typeof contextualSelectionFactory<TEntity, K>>;
  } & ReturnType<typeof contextualSelectionFactory<TEntity, K>>;
};

export type EntityWithSelections<
  TEntity extends AnyEntityDefinition,
  TSelections extends ContextualSelectionDeclarations,
> = keyof TSelections extends never
  ? TEntity
  : TEntity & {
      readonly contextualSelections: {
        readonly [K in keyof TSelections]: TSelections[K]['descriptor'];
      };
      readonly __contextualSelectionTypes?: TSelections;
    };

export type SelectionProperties<TEntity> = TEntity extends {
  readonly __contextualSelectionTypes?: infer TSelections extends ContextualSelectionDeclarations;
}
  ? { readonly [K in keyof TSelections]: ReturnType<TSelections[K]['from']> }
  : {};

const declarations = new WeakMap<object, () => ContextualSelectionDeclarations>();

/** Adds deferred, membership-only properties without copying capabilities onto entity rows. */
export const contextualSelectionProperties = <
  T extends object,
  TEntity extends AnyEntityDefinition,
>(
  value: T,
  entity: TEntity,
  source: () => Selection<TEntity>,
  project: (selection: Selection<any>) => unknown = selection => selection,
  projectClassified: (selection: unknown) => unknown = selection => selection,
): T =>
  new Proxy(value, {
    get(target, name, receiver) {
      if (typeof name !== 'string' || Reflect.has(target, name))
        return Reflect.get(target, name, receiver);
      // Promise assimilation must not compile an unresolved declaration or turn it into a thenable.
      if (name === 'then') return undefined;
      const factories = declarations.get(entity)?.();
      if (!factories || !hasOwn(factories, name)) return undefined;
      const selected = factories[name]!.from(source());
      // Classified membership remains read-only; ordinary bound Selection wrappers expose writes.
      return selected instanceof Selection ? project(selected) : projectClassified(selected);
    },
  });

/** Compiles the declaration once, after its relation targets are available. */
const attachContextualSelections = <
  TEntity extends AnyEntityDefinition,
  const TSelections extends ContextualSelectionDeclarations,
>(
  entity: TEntity,
  declare: (context: { self: EntitySelectionContext<TEntity> }) => TSelections,
): EntityWithSelections<TEntity, TSelections> => {
  if (declarations.has(entity) || 'contextualSelections' in entity)
    throw new TypeError(`Contextual Selections already declared on ${entity.name}.`);
  let compiled: TSelections | undefined;
  let compiling = false;
  const materialize = (): TSelections => {
    if (compiled) return compiled;
    if (compiling)
      throw new TypeError(`Cyclic contextual Selection declaration on ${entity.name}.`);
    compiling = true;
    try {
      const self = new Proxy(
        {},
        {
          get(_target, key) {
            if (typeof key !== 'string' || !hasOwn(entity.relations, key))
              throw new TypeError(
                `Unknown relation ${entity.name}.${String(key)}; resolve entity relations before using its Selections.`,
              );
            return Object.assign(contextualSelectionFactory(entity, key), {
              where: (build: SelectionBuilder<AnyEntityDefinition>) =>
                contextualSelectionFactory(entity, key, build),
            });
          },
        },
      ) as EntitySelectionContext<TEntity>;
      const result = declare({ self });
      for (const [name, factory] of Object.entries(result)) {
        if (
          !/^[A-Za-z][A-Za-z0-9_]*$/.test(name) ||
          name in Selection.prototype ||
          name in GraphSelection.prototype ||
          [
            'root',
            'expression',
            'name',
            'cardinality',
            'factoryInvocation',
            'builder',
            'factories',
            'then',
            'run',
            'get',
            'count',
            'stream',
            'observe',
            'exists',
            'exec',
          ].includes(name)
        )
          throw new TypeError(
            `Contextual Selection ${entity.name}.${name} conflicts with the Selection API.`,
          );
        if (!isContextualSelectionFactory(factory))
          throw new TypeError(
            `Contextual Selection ${entity.name}.${name} must be built from self relations.`,
          );
        factory.from(Selection.all(entity));
        Object.freeze(factory);
      }
      compiled = Object.freeze({ ...result });
      return compiled;
    } finally {
      compiling = false;
    }
  };
  declarations.set(entity, materialize);
  Object.defineProperty(entity, 'contextualSelections', {
    get: () =>
      Object.fromEntries(
        Object.entries(materialize()).map(([name, factory]) => [
          name,
          cloneJson(factory.descriptor),
        ]),
      ),
  });
  return entity as EntityWithSelections<TEntity, TSelections>;
};

export type ContextualSelectionTemplates<TEntity extends AnyEntityDefinition> = Record<
  string,
  {
    readonly relationName: keyof TEntity['relations'] & string;
    readonly expression: SelectionExpression;
    readonly variant?: EntityVariantDescriptor;
  }
>;
type TemplateFactory<
  TEntity extends AnyEntityDefinition,
  TTarget extends AnyEntityDefinition,
  TTemplate,
> = TTemplate extends { variant: infer TVariant extends EntityVariantDescriptor }
  ? {
      [K in TVariant['discriminator']['fieldName']]: TVariant['discriminator']['value'];
    } extends infer TDiscriminator extends EntityVariantDiscriminator<TTarget>
    ? ClassifiedContextualSelectionFactory<TEntity, TTarget, TVariant['name'], TDiscriminator>
    : never
  : ContextualSelectionFactory<TEntity, TTarget>;

type FactoriesFromTemplates<
  TEntity extends AnyEntityDefinition,
  TTemplates extends ContextualSelectionTemplates<TEntity>,
> = {
  [K in keyof TTemplates]: TemplateFactory<
    TEntity,
    TEntity['relations'][TTemplates[K]['relationName']]['target'],
    TTemplates[K]
  >;
};

export function withContextualSelections<
  TEntity extends AnyEntityDefinition,
  const TSelections extends ContextualSelectionDeclarations,
>(
  entity: TEntity,
  declare: (context: { self: EntitySelectionContext<TEntity> }) => TSelections,
): EntityWithSelections<TEntity, TSelections>;
export function withContextualSelections<
  TEntity extends AnyEntityDefinition,
  const TTemplates extends ContextualSelectionTemplates<TEntity>,
>(
  entity: TEntity,
  templates: TTemplates,
): EntityWithSelections<TEntity, FactoriesFromTemplates<TEntity, TTemplates>>;
export function withContextualSelections<TEntity extends AnyEntityDefinition>(
  entity: TEntity,
  declaration:
    | ((context: { self: EntitySelectionContext<TEntity> }) => ContextualSelectionDeclarations)
    | ContextualSelectionTemplates<TEntity>,
) {
  const captured = typeof declaration === 'function' ? declaration : cloneJson(declaration);
  return attachContextualSelections(
    entity,
    typeof captured === 'function'
      ? captured
      : () =>
          Object.fromEntries(
            Object.entries(captured).map(([name, template]) => {
              const factory = contextualSelectionFactory(
                entity,
                template.relationName,
                () => template.expression,
              );
              if (!template.variant) return [name, factory];
              const target = entity.relations[template.relationName]!.target;
              const variant = template.variant;
              if (!isEntityVariantDescriptor(variant) || variant.baseEntityName !== target.name)
                throw new TypeError(
                  'Contextual variant template must classify its relation target.',
                );
              return [
                name,
                factory.as(
                  target.variant(variant.name, {
                    discriminator: {
                      [variant.discriminator.fieldName]: variant.discriminator.value,
                    } as never,
                  }),
                ),
              ];
            }),
          ),
  );
}

export const reflectContextualSelections = (
  entity: object,
): Readonly<Record<string, ContextualSelectionDescriptor>> | undefined =>
  'contextualSelections' in entity
    ? (cloneJson(entity.contextualSelections) as Readonly<
        Record<string, ContextualSelectionDescriptor>
      >)
    : undefined;
