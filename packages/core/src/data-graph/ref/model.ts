import { isPlainObject } from '../../value/object.js';

type NamedEntity = { name: string };

export type EntityName<TEntity extends NamedEntity | string> = TEntity extends string
  ? TEntity
  : TEntity extends { name: infer TName extends string }
    ? TName
    : never;

export type EntityRefLocatorValue =
  | string
  | number
  | boolean
  | null
  | readonly EntityRefLocatorValue[]
  | { readonly [key: string]: EntityRefLocatorValue };

export type EntityRefLocator = Record<string, EntityRefLocatorValue>;

export type EntityRefLocatorFactory = ((...args: readonly any[]) => EntityRefLocator) & {
  fields?: readonly string[];
};

export type EntityRefLocatorDeclarations = Record<string, EntityRefLocatorFactory>;

export type EntityRef<
  TEntityName extends string = string,
  TLocator extends EntityRefLocator = EntityRefLocator,
> = {
  kind: 'entity-ref';
  entityName: TEntityName;
  locator: TLocator;
};

export type AnyEntityRef = EntityRef<string, EntityRefLocator>;

export const resolveEntityRefName = <TEntity extends NamedEntity | string>(
  entityOrName: TEntity,
): EntityName<TEntity> =>
  (typeof entityOrName === 'string' ? entityOrName : entityOrName.name) as EntityName<TEntity>;

const normalizeEntityRefLocatorValue = (value: EntityRefLocatorValue): string => {
  if (Array.isArray(value)) {
    return `[${value.map(normalizeEntityRefLocatorValue).join(',')}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${normalizeEntityRefLocatorValue(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

export const isEntityRefLocatorValue = (value: unknown): value is EntityRefLocatorValue =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (Array.isArray(value) && value.every(isEntityRefLocatorValue)) ||
  (isPlainObject(value) && Object.values(value).every(isEntityRefLocatorValue));

export const createEntityRef = <
  TEntity extends NamedEntity | string,
  TLocator extends EntityRefLocator,
>(
  entityOrName: TEntity,
  locator: TLocator,
): EntityRef<EntityName<TEntity>, TLocator> => ({
  kind: 'entity-ref',
  entityName: resolveEntityRefName(entityOrName),
  locator,
});

export const isEntityRef = (value: unknown): value is AnyEntityRef =>
  isPlainObject(value) &&
  value.kind === 'entity-ref' &&
  typeof value.entityName === 'string' &&
  isPlainObject(value.locator);

export const normalizeEntityRef = (ref: AnyEntityRef): string =>
  `${ref.entityName}:${normalizeEntityRefLocatorValue(ref.locator)}`;

export const entityRefsEqual = (left: AnyEntityRef, right: AnyEntityRef): boolean =>
  normalizeEntityRef(left) === normalizeEntityRef(right);
