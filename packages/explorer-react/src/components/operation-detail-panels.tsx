'use client';

import type { ReactNode } from 'react';

import type { ExplorerOperationDescriptor, ExplorerTaskDescriptor } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { ExplorerCollapsibleSection } from './collapsible-section.js';
import { ExplorerSchemaPanel } from './schema-panel.js';

const Badge = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span
    className={cx(
      'inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground',
      className,
    )}
  >
    {children}
  </span>
);

const ExplorerOperationMetadataRow = ({ label, value }: { label: string; value: string }) => (
  <div className='grid gap-1 rounded-md bg-muted/35 px-3 py-2 text-sm md:grid-cols-[120px_minmax(0,1fr)] md:gap-3'>
    <span className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
      {label}
    </span>
    <span className='break-all font-mono text-foreground'>{value}</span>
  </div>
);

export const ExplorerOperationMetadata = ({
  operation,
}: {
  operation: ExplorerOperationDescriptor;
}) => {
  const rows = [
    { label: 'Operation', value: `${operation.entityName}.${operation.name}` },
    { label: 'Kind', value: operation.kind },
    { label: 'Exposure', value: operation.exposure },
    { label: 'Authority', value: operation.authority },
    ...(operation.hasBridgeQuery
      ? [{ label: 'Bridge Query', value: `${operation.bridgeQueryCount} query key parts` }]
      : []),
    ...(operation.bridgeInvalidationCount
      ? [{ label: 'Invalidate', value: `${operation.bridgeInvalidationCount} invalidations` }]
      : []),
    ...(operation.durable?.runtime ? [{ label: 'Runtime', value: operation.durable.runtime }] : []),
    ...(operation.durable?.hasSubject ? [{ label: 'Subject', value: 'yes' }] : []),
    ...(operation.durable?.idempotencyPolicy
      ? [{ label: 'Idempotency', value: operation.durable.idempotencyPolicy }]
      : []),
  ];

  return (
    <div className='grid gap-4'>
      {rows.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No additional metadata for this operation.</p>
      ) : (
        <div className='grid gap-2'>
          {rows.map(row => (
            <ExplorerOperationMetadataRow
              key={`${row.label}:${row.value}`}
              label={row.label}
              value={row.value}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ExplorerOperationIngress = ({
  operation,
}: {
  operation: ExplorerOperationDescriptor;
}) => {
  const ingressRoutes = operation.ingressRoutes ?? [];

  if (ingressRoutes.length === 0) {
    return <p className='text-sm text-muted-foreground'>No ingress routes for this operation.</p>;
  }

  return (
    <div className='grid gap-3'>
      {ingressRoutes.map(route => (
        <div
          key={`${route.method}:${route.route}:${route.channel ?? 'none'}`}
          className='rounded-md bg-muted/35 p-4'
        >
          <div className='flex flex-wrap items-center gap-2'>
            <Badge>{route.kind}</Badge>
            <Badge>{route.method}</Badge>
            {route.provider ? <Badge>{route.provider}</Badge> : null}
            {route.channel ? <Badge>{route.channel}</Badge> : null}
          </div>
          <div className='mt-3 break-all font-mono text-sm text-foreground'>{route.route}</div>
        </div>
      ))}
    </div>
  );
};

export const ExplorerTaskDetail = ({ task }: { task: ExplorerTaskDescriptor }) => (
  <div className='grid gap-5 bg-background/60'>
    <ExplorerSchemaPanel title='Input' schema={task.inputSchema} />
    <ExplorerSchemaPanel title='Progress snapshot' schema={task.progressSchema} />
    <ExplorerSchemaPanel title='Final output' schema={task.resultSchema} />
    {task.steps.length > 0 ? (
      <ExplorerCollapsibleSection title='Steps'>
        <div className='grid gap-3'>
          {task.steps.map(step => (
            <div key={step.id} className='rounded-lg border bg-card p-4'>
              <div className='font-mono text-sm font-semibold text-foreground'>{step.id}</div>
              <div className='mt-4 grid gap-4'>
                <ExplorerSchemaPanel title='Step Input' schema={step.inputSchema} />
                <ExplorerSchemaPanel title='Step Return' schema={step.resultSchema} />
              </div>
            </div>
          ))}
        </div>
      </ExplorerCollapsibleSection>
    ) : null}
  </div>
);
