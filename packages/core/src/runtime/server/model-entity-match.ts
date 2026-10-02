import {
  createEntityIdentityRef,
  createRecursiveEntityView,
  getEntityIdentityLocator,
  query,
  toGraphReadRequest,
  type AnyEntityDefinition,
  type GraphReadDispatcher,
  type GraphReadPolicy,
  type SelectionExpression,
} from '../../data-graph/index.js';

import type { ModelEntityCandidate } from './model-graph-read-application.js';

export type ModelEntityMatchResult =
  | { readonly status: 'matched'; readonly candidates: readonly ModelEntityCandidate[] }
  | { readonly status: 'unresolved'; readonly reason: string };

const directDisplayFields = (entity: AnyEntityDefinition): readonly string[] => {
  const display = entity.displayMetadata;
  return [...new Set([display?.primary, ...(display?.secondary ?? []), ...(display?.search ?? [])])]
    .filter((name): name is string => typeof name === 'string' && !name.includes('.'))
    .filter(name => entity.fields[name]?.kind === 'field');
};

const displayValue = (snapshot: Record<string, unknown>, fields: readonly string[]) =>
  fields.flatMap(name => (typeof snapshot[name] === 'string' ? [snapshot[name]] : []));

/** Resolves a textual entity hint only through a registered, receiver-authorized Graph Read. */
export const resolveAuthorizedModelEntityMatch = async <TAuthority>({
  target,
  text,
  policies,
  read,
  authority,
}: {
  target: AnyEntityDefinition;
  text: string;
  policies: readonly GraphReadPolicy<any, TAuthority>[];
  read: GraphReadDispatcher<TAuthority>;
  authority: TAuthority;
}): Promise<ModelEntityMatchResult> => {
  const policy = policies.find(candidate => candidate.entity === target);
  const identity = getEntityIdentityLocator(target);
  const displayFields = directDisplayFields(target);
  const configuredSearch = target.displayMetadata?.search?.length
    ? target.displayMetadata.search
    : target.displayMetadata?.primary
      ? [target.displayMetadata.primary]
      : [];
  const searchable = configuredSearch.filter(
    (name): name is string =>
      typeof name === 'string' &&
      !name.includes('.') &&
      target.fields[name]?.kind === 'field' &&
      Boolean(policy?.fields[name]?.select) &&
      Boolean(policy?.fields[name]?.filter?.includes('eq')),
  );
  if (
    !policy ||
    !policy.modes.includes('run') ||
    !identity?.locator.fields?.length ||
    !searchable.length
  )
    return {
      status: 'unresolved',
      reason: `No authorized search is configured for ${target.name}.`,
    };

  const selected = [...new Set([...identity.locator.fields, ...displayFields])].filter(
    name => policy.fields[name]?.select,
  );
  if (identity.locator.fields.some(name => !selected.includes(name)))
    return {
      status: 'unresolved',
      reason: `No authorized identity is available for ${target.name}.`,
    };
  const expression: SelectionExpression =
    searchable.length === 1
      ? { kind: 'predicate', fieldName: searchable[0]!, operator: 'eq', value: text }
      : {
          kind: 'or',
          operands: searchable.map(fieldName => ({
            kind: 'predicate' as const,
            fieldName,
            operator: 'eq' as const,
            value: text,
          })),
        };
  const limit = Math.min(policy.maxLimit, 21);
  const view = createRecursiveEntityView(
    target,
    `${target.name}ModelEntityMatch`,
    Object.fromEntries(selected.map(name => [name, true])) as never,
  );
  const spec = query(target).as(view).limit(limit).build();
  const response = await read(toGraphReadRequest({ ...spec, selection: expression }, 'run'), {
    authority,
  });
  if (response.kind !== 'graph-read-result' || !Array.isArray(response.value))
    return { status: 'unresolved', reason: `Authorized search for ${target.name} is unavailable.` };
  if (response.value.length >= limit && limit <= 20)
    return { status: 'unresolved', reason: 'Too many matching entities. Be more specific.' };
  const candidates = response.value.flatMap(value => {
    if (typeof value !== 'object' || value === null) return [];
    const snapshot = value as Record<string, unknown>;
    const ref = createEntityIdentityRef(target, snapshot);
    const labels = displayValue(snapshot, displayFields);
    return ref && labels.length
      ? [{ ref, label: labels[0]!, ...(labels.length > 1 ? { aliases: labels.slice(1) } : {}) }]
      : [];
  });
  if (candidates.length !== response.value.length)
    return { status: 'unresolved', reason: `Authorized search for ${target.name} was invalid.` };
  return { status: 'matched', candidates };
};
