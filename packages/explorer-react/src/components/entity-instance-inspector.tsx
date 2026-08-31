'use client';

import type { AnyEntityRef } from '@ontahi/core/data-graph';
import { ArrowUpRight, Minus, X } from 'lucide-react';
import type { MouseEvent } from 'react';

import type { ExplorerEntityDetail } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { useExplorerRoutes } from './config.js';
import {
  ExplorerEditableEntityCell,
  type ExplorerEntityMutationRunner,
} from './entity-data-mutations.js';
import { ExplorerInstanceRelation } from './entity-instance-relation.js';
import {
  formatExplorerEntityValue,
  getExplorerEntityInstanceLabel,
  getExplorerReferenceLocator,
} from './entity-instance-values.js';
import type { ExplorerInstanceNavigation } from './entity-instance-workspace.js';
import { ExplorerEntityReferenceValue } from './entity-reference-value.js';
import { shouldHandleExplorerNavigation } from './routes.js';

const ExplorerInspectorValue = ({ value }: { value: unknown }) => {
  const colorSwatch =
    typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value)
      ? value
      : undefined;

  return colorSwatch ? (
    <span className='inline-flex items-center gap-2'>
      <span
        aria-hidden='true'
        className='size-3.5 shrink-0 rounded-full border border-black/10 shadow-sm'
        style={{ backgroundColor: colorSwatch }}
      />
      <span>{colorSwatch}</span>
    </span>
  ) : (
    formatExplorerEntityValue(value)
  );
};

export const ExplorerEntityInstanceInspector = ({
  active,
  canReadRelatedData,
  dragging,
  entity,
  onActivate,
  onClose,
  onMinimize,
  onNavigate,
  onUpdated,
  row,
  runMutation,
  source,
}: {
  active: boolean;
  canReadRelatedData: boolean;
  dragging: boolean;
  entity: ExplorerEntityDetail;
  onActivate: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onNavigate: (input: ExplorerInstanceNavigation) => void;
  onUpdated: () => Promise<unknown>;
  row: Record<string, unknown>;
  runMutation?: ExplorerEntityMutationRunner;
  source: AnyEntityRef;
}) => {
  const routes = useExplorerRoutes();
  const label = getExplorerEntityInstanceLabel(entity, row);
  const relations = canReadRelatedData
    ? entity.relations.filter(relation => relation.cardinality === 'many')
    : [];
  return (
    <aside
      aria-label={`${entity.name} instance ${label}`}
      onPointerDown={onActivate}
      onFocusCapture={onActivate}
      className={cx(
        'pointer-events-auto flex h-fit max-h-full w-[min(27rem,calc(100vw-1.5rem))] shrink-0 flex-col overflow-hidden rounded-2xl border bg-card/95 text-card-foreground backdrop-blur transition-[border-color,box-shadow]',
        dragging
          ? 'border-primary/50 shadow-2xl ring-2 ring-primary/20'
          : active
            ? 'border-primary/35 shadow-2xl ring-1 ring-primary/15'
            : 'border-border/80 shadow-xl',
      )}
    >
      <header
        data-explorer-workspace-drag-handle
        title='Drag to move · Double-click to minimize'
        className={cx(
          'flex touch-none select-none items-start justify-between gap-4 border-b px-4 py-3',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <div className='min-w-0'>
          <p className='font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>
            {entity.name}
          </p>
          <h2 className='mt-1 truncate text-xl font-semibold text-foreground'>{label}</h2>
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          <button
            type='button'
            onClick={onMinimize}
            aria-label={`Minimize ${entity.name} instance ${label}`}
            className='inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
          >
            <Minus className='size-4' />
          </button>
          <button
            type='button'
            onClick={onClose}
            aria-label={`Close ${entity.name} instance ${label}`}
            className='inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
          >
            <X className='size-4' />
          </button>
        </div>
      </header>

      <div className='grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4'>
        <dl className='grid gap-0.5'>
          {entity.fields.map(field => {
            const value = row[field.name];
            const locator = field.reference
              ? getExplorerReferenceLocator(value, field.reference.identity)
              : undefined;
            const referenceHref =
              field.reference && locator
                ? routes.entity(field.reference.entityName, { tab: 'data', ref: locator })
                : undefined;
            const referenceSource =
              field.reference && locator
                ? ({
                    kind: 'entity-ref',
                    entityName: field.reference.entityName,
                    locator: locator as AnyEntityRef['locator'],
                  } satisfies AnyEntityRef)
                : undefined;
            const navigateReference = (event: MouseEvent<HTMLAnchorElement>) => {
              if (!referenceHref || !referenceSource || !shouldHandleExplorerNavigation(event)) {
                return;
              }

              event.preventDefault();
              onNavigate({ href: referenceHref, source: referenceSource });
            };
            const editable = Boolean(
              runMutation &&
              !field.derived &&
              !entity.identity?.fields.includes(field.name) &&
              entity.mutations?.update?.fields.includes(field.name),
            );

            return (
              <div
                key={field.name}
                className='grid grid-cols-[minmax(7rem,0.7fr)_minmax(0,1.3fr)] gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40'
              >
                <dt className='truncate font-mono text-xs text-muted-foreground'>{field.name}</dt>
                <dd className='min-w-0 break-words font-mono text-xs text-foreground'>
                  {editable && runMutation ? (
                    <ExplorerEditableEntityCell
                      entityName={entity.name}
                      field={field}
                      href={referenceHref}
                      onNavigate={navigateReference}
                      value={value}
                      target={source}
                      runMutation={runMutation}
                      onApplied={onUpdated}
                    >
                      {field.reference && locator ? (
                        <ExplorerEntityReferenceValue
                          locator={locator}
                          reference={field.reference}
                        />
                      ) : (
                        formatExplorerEntityValue(value)
                      )}
                    </ExplorerEditableEntityCell>
                  ) : field.reference && locator ? (
                    <a
                      href={routes.entity(field.reference.entityName, {
                        tab: 'data',
                        ref: locator,
                      })}
                      onClick={navigateReference}
                      className='inline-flex max-w-full items-center gap-1 text-primary no-underline hover:underline'
                    >
                      <ExplorerEntityReferenceValue locator={locator} reference={field.reference} />
                      <ArrowUpRight className='size-3 shrink-0' />
                    </a>
                  ) : (
                    <ExplorerInspectorValue value={value} />
                  )}
                </dd>
              </div>
            );
          })}
        </dl>

        {relations.length > 0 ? (
          <div className='grid gap-3 border-t pt-4'>
            {relations.map(relation => (
              <ExplorerInstanceRelation
                key={relation.name}
                relation={relation}
                source={source}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
};
