'use client';

import type { ReactNode } from 'react';

import type {
  ExplorerEntityDescriptor,
  ExplorerEventDescriptor,
  ExplorerOperationDescriptor,
  ExplorerSnapshot,
  ExplorerTaskDescriptor,
  ExplorerTaskRunListItem,
} from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { useExplorerRoutes } from './config.js';
import type { ExplorerRoutes } from './routes.js';

export type ExplorerOverviewProps = {
  snapshot: ExplorerSnapshot;
  className?: string;
};

const tableHeaderClassName =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const tableCellClassName = 'px-4 py-3 align-top text-sm';

const statusClassName = (status: string) => {
  switch (status) {
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'running':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'queued':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
};

const Badge = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span
    className={cx(
      'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
      className,
    )}
  >
    {children}
  </span>
);

const Section = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section className='rounded-lg border bg-card'>
    <div className='border-b px-5 py-4'>
      <h2 className='text-base font-semibold'>{title}</h2>
      {description ? <p className='mt-1 text-sm text-muted-foreground'>{description}</p> : null}
    </div>
    {children}
  </section>
);

const EntityTable = ({
  entities,
  routes,
}: {
  entities: ExplorerEntityDescriptor[];
  routes: ExplorerRoutes;
}) => (
  <div className='overflow-x-auto'>
    <table className='w-full min-w-[760px]'>
      <thead>
        <tr className='border-b bg-muted/35'>
          <th className={tableHeaderClassName}>Entity</th>
          <th className={tableHeaderClassName}>Fields</th>
          <th className={tableHeaderClassName}>Relations</th>
          <th className={tableHeaderClassName}>Operations</th>
          <th className={tableHeaderClassName}>Tasks</th>
          <th className={tableHeaderClassName}>Exposure</th>
        </tr>
      </thead>
      <tbody>
        {entities.slice(0, 8).map(entity => (
          <tr key={entity.name} className='border-b last:border-0'>
            <td className={tableCellClassName}>
              <a
                href={routes.entity(entity.name)}
                className='font-mono font-medium hover:text-primary'
              >
                {entity.name}
              </a>
            </td>
            <td className={tableCellClassName}>{entity.fieldCount}</td>
            <td className={tableCellClassName}>{entity.relationCount}</td>
            <td className={tableCellClassName}>
              {entity.graphOperationCount + entity.domainOperationCount}
              {entity.durableOperationCount > 0 ? (
                <span className='ml-2 text-xs text-muted-foreground'>
                  {entity.durableOperationCount} durable
                </span>
              ) : null}
            </td>
            <td className={tableCellClassName}>{entity.taskCount}</td>
            <td className={tableCellClassName}>
              {entity.exposure ? (
                <Badge>{entity.exposure}</Badge>
              ) : (
                <span className='text-muted-foreground'>-</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const OperationTable = ({
  operations,
  routes,
}: {
  operations: ExplorerOperationDescriptor[];
  routes: ExplorerRoutes;
}) => (
  <div className='overflow-x-auto'>
    <table className='w-full min-w-[760px]'>
      <thead>
        <tr className='border-b bg-muted/35'>
          <th className={tableHeaderClassName}>Operation</th>
          <th className={tableHeaderClassName}>Entity</th>
          <th className={tableHeaderClassName}>Kind</th>
          <th className={tableHeaderClassName}>Exposure</th>
          <th className={tableHeaderClassName}>Runtime</th>
        </tr>
      </thead>
      <tbody>
        {operations.slice(0, 10).map(operation => (
          <tr key={operation.id} className='border-b last:border-0'>
            <td className={cx(tableCellClassName, 'font-mono font-medium')}>
              <a href={routes.operation(operation.id)} className='hover:text-primary'>
                {operation.id}
              </a>
            </td>
            <td className={tableCellClassName}>{operation.entityName}</td>
            <td className={tableCellClassName}>
              <Badge>{operation.kind}</Badge>
            </td>
            <td className={tableCellClassName}>
              <div className='flex flex-wrap gap-1.5'>
                <Badge>{operation.exposure}</Badge>
                {operation.hasBridgeQuery ? <Badge>bridge query</Badge> : null}
                {operation.durable?.hasSubject ? <Badge>subject</Badge> : null}
              </div>
            </td>
            <td className={tableCellClassName}>
              {operation.durable?.runtime ?? <span className='text-muted-foreground'>-</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const TaskList = ({
  tasks,
  routes,
}: {
  tasks: ExplorerTaskDescriptor[];
  routes: ExplorerRoutes;
}) => (
  <div className='divide-y'>
    {tasks.length === 0 ? (
      <p className='p-5 text-sm text-muted-foreground'>No task definitions found.</p>
    ) : (
      tasks.map(task => (
        <div key={`${task.entityName}:${task.id}:${task.name}`} className='grid gap-1 px-5 py-4'>
          <a
            href={routes.task(task.id)}
            className='font-mono text-sm font-medium hover:text-primary'
          >
            {task.id}
          </a>
          <div className='text-sm text-muted-foreground'>
            {task.entityName}.{task.name}
          </div>
        </div>
      ))
    )}
  </div>
);

const EventList = ({
  events,
  routes,
}: {
  events: ExplorerEventDescriptor[];
  routes: ExplorerRoutes;
}) => (
  <div className='divide-y'>
    {events.map(event => (
      <div key={event.type} className='px-5 py-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <a
            href={routes.event(event.type)}
            className='font-mono text-sm font-medium hover:text-primary'
          >
            {event.type}
          </a>
          <Badge>{event.domain}</Badge>
          {event.actorScoped ? <Badge>actor</Badge> : <Badge>system</Badge>}
        </div>
        <p className='mt-2 text-sm text-muted-foreground'>
          {event.payloadFields.map(field => `${field.name}: ${field.type}`).join(', ')}
        </p>
      </div>
    ))}
  </div>
);

const getTaskRunHref = (routes: ExplorerRoutes, run: ExplorerTaskRunListItem) =>
  `${routes.task(run.taskId)}?tab=runs`;

const RecentTaskRuns = ({
  runs,
  routes,
}: {
  runs: ExplorerTaskRunListItem[];
  routes: ExplorerRoutes;
}) => (
  <div className='divide-y'>
    {runs.length === 0 ? (
      <p className='p-5 text-sm text-muted-foreground'>No recent task runs.</p>
    ) : (
      runs.map(run => (
        <div key={`${run.taskId}:${run.runId}`} className='px-5 py-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <a
              href={getTaskRunHref(routes, run)}
              className='font-mono text-sm font-medium hover:text-primary'
            >
              {run.taskId}
            </a>
            <Badge className={statusClassName(run.status)}>{run.status}</Badge>
          </div>
          <div className='mt-2 truncate font-mono text-xs text-muted-foreground'>{run.runId}</div>
          <div className='mt-1 text-xs text-muted-foreground'>Updated {run.updatedAt}</div>
        </div>
      ))
    )}
  </div>
);

export const ExplorerOverview = ({ snapshot, className }: ExplorerOverviewProps) => {
  const routes = useExplorerRoutes();

  return (
    <div className={cx('grid gap-6 text-foreground', className)}>
      <header className='border-b pb-5'>
        <h1 className='text-3xl font-semibold tracking-tight'>Ontahi Explorer</h1>
        <p className='mt-2 max-w-3xl text-sm text-muted-foreground'>
          Inspect the graph runtime: entities, operations, tasks, events, and recent task runs.
        </p>
      </header>

      <section className='grid gap-3 md:grid-cols-4'>
        {snapshot.metrics.map(metric => (
          <div key={metric.label} className='rounded-lg border bg-card px-5 py-4'>
            <div className='text-2xl font-semibold'>{metric.value}</div>
            <div className='mt-1 text-sm text-muted-foreground'>{metric.label}</div>
          </div>
        ))}
      </section>

      <div className='grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.75fr)]'>
        <div className='grid gap-6'>
          <Section title='Entities' description='Graph entity kinds and their reflected surface.'>
            <EntityTable entities={snapshot.entities} routes={routes} />
          </Section>

          <Section
            title='Operations'
            description='Graph and domain operations exposed by the graph API.'
          >
            <OperationTable operations={snapshot.operations} routes={routes} />
          </Section>
        </div>

        <aside className='grid content-start gap-6'>
          <Section title='Tasks' description='Task definitions discovered from graph metadata.'>
            <TaskList tasks={snapshot.tasks} routes={routes} />
          </Section>

          <Section title='Recent Task Runs'>
            <RecentTaskRuns runs={snapshot.recentTaskRuns} routes={routes} />
          </Section>

          <Section title='Events' description='Current domain event kinds and payload shapes.'>
            <EventList events={snapshot.events} routes={routes} />
          </Section>
        </aside>
      </div>
    </div>
  );
};
