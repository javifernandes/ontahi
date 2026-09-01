'use client';

import {
  selectionReferences,
  type AnyEntityRef,
  type ManyToManyRelationshipCommand,
} from '@ontahi/core/data-graph';
import {
  useGraphExecutorCapability,
  useReflectedEntityDataQuery,
  useReflectedRelatedEntityDataQuery,
} from '@ontahi/react/graph';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, LoaderCircle, Network, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ExplorerEntityDetail, ExplorerOperationDescriptor } from '../contracts/index.js';

import { useExplorerRoutes } from './config.js';
import { humanizeExplorerName } from './display-name.js';
import { ExplorerEntityActions, getExplorerRelationOperations } from './entity-actions.js';
import { getExplorerRelatedRowLabel } from './entity-instance-values.js';
import type { ExplorerInstanceNavigation } from './entity-instance-workspace.js';
import type { ExplorerOperationExecutePanelRenderer } from './operation-detail.js';
import type { ExplorerOperationRefInputRenderer } from './operation-execute-panel.js';
import { shouldHandleExplorerNavigation } from './routes.js';

const relatedRowLocator = (
  row: Record<string, unknown>,
  relation: ExplorerEntityDetail['relations'][number],
) => {
  const fields = relation.targetIdentity?.fields ?? [];
  return fields.length > 0 && fields.every(field => row[field] !== undefined)
    ? Object.fromEntries(fields.map(field => [field, row[field]]))
    : undefined;
};

const relatedRowRef = (
  row: Record<string, unknown>,
  relation: ExplorerEntityDetail['relations'][number],
): AnyEntityRef | undefined => {
  const locator = relatedRowLocator(row, relation);
  return locator
    ? {
        kind: 'entity-ref',
        entityName: relation.target,
        locator: locator as AnyEntityRef['locator'],
      }
    : undefined;
};

const refKey = (ref: AnyEntityRef) =>
  JSON.stringify({ entityName: ref.entityName, locator: ref.locator });

export const createExplorerManyToManyRelationshipCommand = (
  action: ManyToManyRelationshipCommand['action'],
  relation: ExplorerEntityDetail['relations'][number],
  subject: AnyEntityRef,
  participant: AnyEntityRef,
): ManyToManyRelationshipCommand => {
  const identity = relation.canonicalIdentity;
  if (!identity || !('relationName' in identity)) {
    throw new Error(
      `Relation ${subject.entityName}.${relation.name} is not canonical many-to-many.`,
    );
  }

  const source = subject.entityName === identity.sourceEntityName ? subject : participant;
  const target = subject.entityName === identity.targetEntityName ? subject : participant;
  if (
    source.entityName !== identity.sourceEntityName ||
    target.entityName !== identity.targetEntityName
  ) {
    throw new Error(
      `Relation ${subject.entityName}.${relation.name} received invalid participants.`,
    );
  }

  return {
    kind: 'many-to-many-relationship-command',
    action,
    relation: identity,
    sources: {
      entityName: identity.sourceEntityName,
      selection: selectionReferences([source]),
    },
    targets: {
      entityName: identity.targetEntityName,
      selection: selectionReferences([target]),
    },
  };
};

export const ExplorerInstanceRelation = ({
  onNavigate,
  onUpdated,
  operations,
  relation,
  renderExecutePanel,
  renderRefInput,
  source,
  sourceLabel,
}: {
  onNavigate: (input: ExplorerInstanceNavigation) => void;
  onUpdated: () => Promise<unknown>;
  operations: ExplorerOperationDescriptor[];
  relation: ExplorerEntityDetail['relations'][number];
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
  source: AnyEntityRef;
  sourceLabel: string;
}) => {
  const routes = useExplorerRoutes();
  const graphExecutor = useGraphExecutorCapability();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mutationKey, setMutationKey] = useState<string>();
  const [mutationError, setMutationError] = useState<string>();
  const displayName = humanizeExplorerName(
    relation.provenance === 'derived-inverse' ? relation.target : relation.name,
  );
  const targetName = humanizeExplorerName(relation.target);
  const query = useReflectedRelatedEntityDataQuery({
    source,
    relationName: relation.name,
    sourceEntityName: source.entityName,
    targetEntityName: relation.target,
    page: 1,
    pageSize: 25,
  });
  const canRunManyToMany = Boolean(
    relation.kind === 'manyToMany' && graphExecutor?.runManyToManyRelationshipCommand,
  );
  const canAdd = canRunManyToMany && relation.mutations?.add === true;
  const canRemove = canRunManyToMany && relation.mutations?.remove === true;
  const relationOperations = useMemo(
    () => getExplorerRelationOperations(operations, source, relation.target),
    [operations, relation.target, source],
  );
  const candidates = useReflectedEntityDataQuery(
    {
      entityName: relation.target,
      search,
      filters: [],
      page: 1,
      pageSize: 25,
    },
    { enabled: pickerOpen && canAdd },
  );
  const linkedKeys = useMemo(
    () =>
      new Set(
        (query.data?.rows ?? [])
          .map(row => relatedRowRef(row, relation))
          .filter((ref): ref is AnyEntityRef => Boolean(ref))
          .map(refKey),
      ),
    [query.data?.rows, relation],
  );
  const availableCandidates = (candidates.data?.rows ?? []).filter(row => {
    const ref = relatedRowRef(row, relation);
    return ref && !linkedKeys.has(refKey(ref));
  });
  const refreshRelation = async () => {
    await Promise.allSettled([
      onUpdated(),
      queryClient.invalidateQueries({ queryKey: ['graph', 'reflected-related-entity-data'] }),
    ]);
  };

  const mutate = async (
    action: ManyToManyRelationshipCommand['action'],
    participant: AnyEntityRef,
  ) => {
    if (!graphExecutor?.runManyToManyRelationshipCommand) return;

    const key = `${action}:${refKey(participant)}`;
    setMutationKey(key);
    setMutationError(undefined);
    try {
      const result = await graphExecutor.runManyToManyRelationshipCommand(
        createExplorerManyToManyRelationshipCommand(action, relation, source, participant),
      );
      if (result.status === 'not-applied') {
        throw new Error(result.diagnostic.rejection.message);
      }
      if (action === 'link') {
        setPickerOpen(false);
        setSearch('');
      }
      await refreshRelation();
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'The relationship could not be changed.',
      );
    } finally {
      setMutationKey(undefined);
    }
  };

  return (
    <section className='grid gap-2' aria-label={`${relation.name} relation`}>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <Network className='size-3.5 shrink-0 text-muted-foreground' />
          <h3 title={relation.name} className='truncate text-sm font-medium text-foreground'>
            {displayName}
          </h3>
        </div>
        <div className='flex shrink-0 items-center gap-1.5'>
          <span className='rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground'>
            {query.isLoading ? '…' : query.error ? '!' : (query.data?.totalCount ?? 0)}
          </span>
          {relationOperations.length > 0 ? (
            <ExplorerEntityActions
              ariaLabel={`Actions for ${displayName} relation`}
              contextLabel={sourceLabel}
              onSuccess={refreshRelation}
              operations={relationOperations}
              renderInPortal
              renderExecutePanel={renderExecutePanel}
              renderRefInput={renderRefInput}
              source={source}
              triggerIcon={<Plus className='size-4' />}
            />
          ) : null}
          {canAdd ? (
            <button
              type='button'
              aria-label={`Add ${targetName}`}
              title={`Add ${targetName}`}
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen(open => !open)}
              className='inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
            >
              <Plus className='size-4' />
            </button>
          ) : null}
        </div>
      </div>

      {pickerOpen ? (
        <div
          role='dialog'
          aria-label={`Add ${targetName}`}
          className='grid gap-2 rounded-xl border bg-background p-2 shadow-sm'
        >
          <div className='flex items-center gap-1.5'>
            <label className='relative min-w-0 flex-1'>
              <Search className='pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
              <input
                autoFocus
                value={search}
                onChange={event => setSearch(event.target.value)}
                aria-label={`Search ${targetName}`}
                placeholder={`Search ${targetName.toLowerCase()}…`}
                className='min-h-8 w-full rounded-lg border bg-card pl-8 pr-2 text-xs outline-none focus:border-primary'
              />
            </label>
            <button
              type='button'
              aria-label={`Close Add ${targetName}`}
              onClick={() => setPickerOpen(false)}
              className='inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground'
            >
              <X className='size-3.5' />
            </button>
          </div>
          {candidates.error ? (
            <p className='px-2 py-1 text-xs text-destructive'>{candidates.error.message}</p>
          ) : null}
          {!candidates.isLoading && availableCandidates.length === 0 ? (
            <p className='px-2 py-1 text-xs text-muted-foreground'>No available instances.</p>
          ) : null}
          {availableCandidates.length > 0 ? (
            <div className='grid max-h-44 gap-1 overflow-y-auto'>
              {availableCandidates.map((row, index) => {
                const participant = relatedRowRef(row, relation);
                if (!participant) return null;
                const label = getExplorerRelatedRowLabel(row, relation);
                const pending = mutationKey === `link:${refKey(participant)}`;

                return (
                  <button
                    key={refKey(participant) || index}
                    type='button'
                    aria-label={`Link ${label}`}
                    disabled={Boolean(mutationKey)}
                    onClick={() => void mutate('link', participant)}
                    className='flex min-h-8 items-center justify-between gap-2 rounded-lg px-2.5 text-left text-xs text-foreground transition hover:bg-accent disabled:opacity-50'
                  >
                    <span className='truncate'>{label}</span>
                    {pending ? <LoaderCircle className='size-3.5 animate-spin' /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {mutationError ? (
        <p className='rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive'>
          {mutationError}
        </p>
      ) : null}
      {query.error ? (
        <p className='rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive'>
          {query.error.message}
        </p>
      ) : null}
      {!query.isLoading && !query.error && query.data?.rows.length === 0 ? (
        <p className='rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground'>
          No related instances.
        </p>
      ) : null}
      {query.data?.rows.length ? (
        <ul className='m-0 grid list-none gap-1 p-0'>
          {query.data.rows.map((relatedRow, index) => {
            const participant = relatedRowRef(relatedRow, relation);
            const locator = participant?.locator;
            const href = locator
              ? routes.entity(relation.target, { tab: 'data', ref: locator })
              : routes.entity(relation.target, { tab: 'data' });
            const label = getExplorerRelatedRowLabel(relatedRow, relation);
            const pending = participant ? mutationKey === `unlink:${refKey(participant)}` : false;

            return (
              <li
                key={participant ? refKey(participant) : index}
                className='group flex min-w-0 items-center rounded-lg transition hover:bg-accent'
              >
                <a
                  href={href}
                  onClick={event => {
                    if (!shouldHandleExplorerNavigation(event)) return;
                    event.preventDefault();
                    onNavigate({ href, row: relatedRow, source: participant });
                  }}
                  className='flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-sm text-foreground no-underline'
                >
                  <span className='truncate'>{label}</span>
                  <ArrowUpRight className='size-3.5 shrink-0 text-muted-foreground transition group-hover:text-foreground' />
                </a>
                {participant ? (
                  <ExplorerEntityActions
                    ariaLabel={`Actions for ${relation.target} instance ${label}`}
                    contextLabel={label}
                    inlineSingleAction
                    onSuccess={refreshRelation}
                    operations={operations}
                    renderInPortal
                    renderExecutePanel={renderExecutePanel}
                    renderRefInput={renderRefInput}
                    source={participant}
                    triggerClassName='opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                  />
                ) : null}
                {canRemove && participant ? (
                  <button
                    type='button'
                    aria-label={`Unlink ${label}`}
                    title={`Unlink ${label}`}
                    disabled={Boolean(mutationKey)}
                    onClick={() => void mutate('unlink', participant)}
                    className='mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-background hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:opacity-40'
                  >
                    {pending ? (
                      <LoaderCircle className='size-3.5 animate-spin' />
                    ) : (
                      <X className='size-3.5' />
                    )}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
};
