import type { AnyEntityRef } from '@ontahi/core/data-graph';
import type { ReactNode } from 'react';

import type { ExplorerEntityDetail } from '../contracts/index.js';

export const formatExplorerEntityValue = (value: unknown): ReactNode => {
  if (value === undefined) {
    return <span className='text-muted-foreground'>not available</span>;
  }

  if (value === null) {
    return <span className='text-muted-foreground'>null</span>;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

export const getExplorerReferenceLocator = (
  value: unknown,
  identity: { fields: string[] } | undefined,
): Record<string, unknown> | undefined => {
  if (value == null) return undefined;

  if (
    typeof value === 'object' &&
    'kind' in value &&
    value.kind === 'entity-ref' &&
    'locator' in value &&
    typeof value.locator === 'object' &&
    value.locator !== null
  ) {
    return value.locator as Record<string, unknown>;
  }

  return identity?.fields.length === 1 ? { [identity.fields[0]!]: value } : undefined;
};

export const getExplorerReferenceLabel = (entityName: string, locator: Record<string, unknown>) =>
  `${entityName} · ${Object.values(locator)
    .map(value => String(value))
    .join(' · ')}`;

export const getExplorerRowRef = (
  entity: ExplorerEntityDetail,
  row: Record<string, unknown>,
): AnyEntityRef | undefined => {
  const fields = entity.identity?.fields;
  if (!fields?.length || fields.some(field => row[field] === undefined)) return undefined;

  return {
    kind: 'entity-ref',
    entityName: entity.name,
    locator: Object.fromEntries(
      fields.map(field => [field, row[field]]),
    ) as AnyEntityRef['locator'],
  };
};

export const getExplorerEntityInstanceLabel = (
  entity: ExplorerEntityDetail,
  row: Record<string, unknown>,
) => {
  const primary = entity.display?.primary;
  if (primary && row[primary] != null) return String(row[primary]);

  const identityFields = entity.identity?.fields ?? [];
  if (identityFields.length > 0) {
    return identityFields.map(field => String(row[field] ?? '')).join(' · ');
  }

  return entity.name;
};

export const getExplorerRelatedRowLabel = (
  row: Record<string, unknown>,
  relation: ExplorerEntityDetail['relations'][number],
) => {
  const primary = relation.targetDisplay?.primary;
  if (primary && row[primary] != null) return String(row[primary]);

  const fields = relation.targetIdentity?.fields ?? [];
  return fields.length > 0
    ? fields.map(field => String(row[field] ?? '')).join(' · ')
    : JSON.stringify(row);
};
