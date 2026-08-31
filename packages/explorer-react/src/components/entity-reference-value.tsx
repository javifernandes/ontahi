'use client';

import { useReflectedEntityDataQuery } from '@ontahi/react/graph';

import type { ExplorerEntityDetail } from '../contracts/index.js';

import { getExplorerReferenceLabel } from './entity-instance-values.js';

type ExplorerReferenceDescriptor = NonNullable<ExplorerEntityDetail['fields'][number]['reference']>;

const displayValue = (value: unknown) => {
  if (value == null) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
};

export function ExplorerEntityReferenceValue({
  locator,
  reference,
}: {
  locator: Record<string, unknown>;
  reference: ExplorerReferenceDescriptor;
}) {
  const technicalLabel = getExplorerReferenceLabel(reference.entityName, locator);
  const primaryField = reference.display?.primary;
  const locatorPrimary = primaryField ? displayValue(locator[primaryField]) : undefined;
  const displayFields = [primaryField, ...(reference.display?.secondary ?? [])].filter(
    (field): field is string => Boolean(field),
  );
  const identityFields = reference.identity?.fields ?? [];
  const canResolve = Boolean(
    primaryField &&
    identityFields.length > 0 &&
    identityFields.every(field => locator[field] !== undefined) &&
    displayFields.some(field => displayValue(locator[field]) === undefined),
  );
  const targetQuery = useReflectedEntityDataQuery(
    {
      entityName: reference.entityName,
      filters: identityFields.map(field => ({
        field,
        operator: 'equals' as const,
        value: String(locator[field]),
      })),
      page: 1,
      pageSize: 10,
    },
    {
      enabled: canResolve,
      staleTime: 30_000,
    },
  );
  const target = targetQuery.data?.rows[0];
  const displaySource = target ?? locator;
  const resolvedDisplay = targetQuery.data?.display ?? reference.display;
  const primary =
    locatorPrimary ??
    (resolvedDisplay?.primary ? displayValue(displaySource[resolvedDisplay.primary]) : undefined);
  const secondary = (resolvedDisplay?.secondary ?? [])
    .map(field => displayValue(displaySource[field]))
    .filter((value): value is string => Boolean(value && value !== primary))
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' · ');

  return (
    <span title={technicalLabel} className='inline-flex min-w-0 items-baseline gap-2 font-sans'>
      <span className='truncate font-medium'>{primary ?? technicalLabel}</span>
      {secondary ? (
        <span className='truncate text-xs font-normal text-muted-foreground'>{secondary}</span>
      ) : null}
    </span>
  );
}
