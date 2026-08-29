'use client';

import type { ReactNode } from 'react';

import type { ExplorerEntityDetail, ExplorerEventDescriptor } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { ExplorerCollapsibleSection } from './collapsible-section.js';
import { useExplorerRoutes } from './config.js';
import { ExplorerFieldRow } from './schema-fields.js';

type ExplorerEntityReferenceProps = {
  entityName: string;
  className: string;
};

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

const ExplorerEntityReference = ({ entityName, className }: ExplorerEntityReferenceProps) => {
  const routes = useExplorerRoutes();

  return (
    <a href={routes.entity(entityName)} className={className}>
      {entityName}
    </a>
  );
};

export type ExplorerEntityStructurePanelProps = {
  entity: ExplorerEntityDetail;
  renderDiagram?: (diagram: string) => ReactNode;
};

export const ExplorerEntityStructurePanel = ({
  entity,
  renderDiagram,
}: ExplorerEntityStructurePanelProps) => (
  <div className='grid gap-6'>
    {renderDiagram ? (
      <ExplorerCollapsibleSection title='Diagram'>
        {renderDiagram(entity.diagram)}
      </ExplorerCollapsibleSection>
    ) : null}

    {entity.relationOwner ? (
      <ExplorerCollapsibleSection title='Relation Owner'>
        <div className='grid gap-2'>
          <ExplorerFieldRow name='source' type={entity.relationOwner.source} />
          <ExplorerFieldRow
            name='relation'
            type={`${entity.relationOwner.name} (${entity.relationOwner.cardinality})`}
          />
          <ExplorerFieldRow name='target' type={entity.relationOwner.target} />
        </div>
      </ExplorerCollapsibleSection>
    ) : null}

    <ExplorerCollapsibleSection title='Fields'>
      <div className='grid gap-2'>
        {entity.fields.map(field => (
          <ExplorerFieldRow
            key={field.name}
            name={field.name}
            type={field.type}
            required={!field.nullable}
            derivedDependencies={field.derived?.dependencies.map(dependency =>
              dependency.kind === 'field'
                ? dependency.field
                : `${dependency.relation}.${dependency.aggregate}`,
            )}
          />
        ))}
      </div>
    </ExplorerCollapsibleSection>

    <ExplorerCollapsibleSection title='Relations'>
      {entity.relations.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No reflected relations.</p>
      ) : (
        <div className='grid gap-2'>
          {entity.relations.map(relation => (
            <div
              key={relation.name}
              className='flex flex-col gap-2 rounded-md bg-muted/35 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between'
            >
              <span className='break-all font-mono text-foreground'>{relation.name}</span>
              <div className='flex flex-wrap items-center gap-3 md:justify-end'>
                <span className='rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary'>
                  {relation.kind}
                </span>
                <ExplorerEntityReference
                  entityName={relation.target}
                  className='font-mono text-xs text-foreground hover:text-primary hover:underline'
                />
                {relation.direction ? <Badge>{relation.direction}</Badge> : null}
                {relation.provenance === 'derived-inverse' ? <Badge>derived inverse</Badge> : null}
                {relation.cardinality ? <Badge>{relation.cardinality}</Badge> : null}
                {relation.cardinality === 'one' ? (
                  <Badge>{relation.required ? 'required' : 'nullable'}</Badge>
                ) : null}
                {relation.structuralVerbs?.length ? (
                  <span
                    className='font-mono text-xs text-muted-foreground'
                    aria-label={`Structural verbs: ${relation.structuralVerbs.join(', ')}`}
                  >
                    {relation.structuralVerbs.join(' · ')}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </ExplorerCollapsibleSection>
  </div>
);

export type ExplorerEventDetailProps = {
  event: ExplorerEventDescriptor;
};

export const ExplorerEventDetail = ({ event }: ExplorerEventDetailProps) => (
  <div className='grid content-start gap-5'>
    <div>
      <div className='flex flex-wrap items-center gap-2'>
        <h2 className='break-all font-mono text-base font-semibold text-foreground'>
          {event.type}
        </h2>
        <Badge>{event.actorScoped ? 'actor' : 'system'}</Badge>
      </div>
      <p className='mt-2 text-sm text-muted-foreground'>{event.domain}</p>
    </div>

    <ExplorerCollapsibleSection title='Related Entities'>
      {event.relatedEntities.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No related entities.</p>
      ) : (
        <div className='flex flex-wrap gap-2'>
          {event.relatedEntities.map(entityName => (
            <ExplorerEntityReference
              key={entityName}
              entityName={entityName}
              className='rounded-md border bg-background px-2 py-1 font-mono text-xs hover:border-primary hover:text-primary'
            />
          ))}
        </div>
      )}
    </ExplorerCollapsibleSection>

    <ExplorerCollapsibleSection title='Payload'>
      {event.payloadFields.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No payload fields.</p>
      ) : (
        <div className='grid gap-1.5'>
          {event.payloadFields.map(field => (
            <ExplorerFieldRow key={field.name} name={field.name} type={field.type} />
          ))}
        </div>
      )}
    </ExplorerCollapsibleSection>

    <ExplorerCollapsibleSection title='Handlers'>
      <p className='break-all text-sm text-muted-foreground'>
        {event.handlers.join(', ') || 'No handlers registered'}
      </p>
    </ExplorerCollapsibleSection>
  </div>
);
