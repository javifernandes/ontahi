import type { AnyEntityDefinition } from './definitions.js';
import type {
  GraphReadFieldPolicy,
  GraphReadOperator,
  GraphReadPolicy,
} from './read-dispatcher.js';

type EntityFieldName<TEntity extends AnyEntityDefinition> = keyof TEntity['fields'] & string;

export type GraphReadPolicyAllow<TEntity extends AnyEntityDefinition> = {
  readonly select?: readonly EntityFieldName<TEntity>[];
  readonly filter?: Partial<
    Readonly<Record<EntityFieldName<TEntity>, readonly GraphReadOperator[]>>
  >;
  readonly order?: readonly EntityFieldName<TEntity>[];
};

export type DefineGraphReadPolicyOptions<TEntity extends AnyEntityDefinition, TAuthority> = Omit<
  GraphReadPolicy<TEntity, TAuthority>,
  'fields'
> & {
  readonly allow: GraphReadPolicyAllow<TEntity>;
};

const grantFieldCapability = (
  fields: Record<string, GraphReadFieldPolicy>,
  fieldName: string,
  capability: GraphReadFieldPolicy,
) => {
  fields[fieldName] = { ...fields[fieldName], ...capability };
};

/**
 * Defines an explicit Graph Read policy while authoring Field capabilities as separate allowlists.
 * The result is the canonical policy consumed by Graph Read dispatchers.
 */
export const defineGraphReadPolicy = <TEntity extends AnyEntityDefinition, TAuthority = unknown>({
  allow,
  ...policy
}: DefineGraphReadPolicyOptions<TEntity, TAuthority>): GraphReadPolicy<TEntity, TAuthority> => {
  const fields: Record<string, GraphReadFieldPolicy> = {};

  for (const fieldName of allow.select ?? []) {
    grantFieldCapability(fields, fieldName, { select: true });
  }
  for (const [fieldName, operators] of Object.entries(allow.filter ?? {})) {
    grantFieldCapability(fields, fieldName, { filter: operators });
  }
  for (const fieldName of allow.order ?? []) {
    grantFieldCapability(fields, fieldName, { order: true });
  }

  return {
    ...policy,
    fields: fields as GraphReadPolicy<TEntity, TAuthority>['fields'],
  };
};
