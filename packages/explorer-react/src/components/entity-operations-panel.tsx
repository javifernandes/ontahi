'use client';

import {
  useHasReflectedEntityDataReader,
  useHasReflectedOperationInvoker,
} from '@ontahi/react/graph';
import { ChevronRight, Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import type { ExplorerOperationDescriptor, ExplorerTaskDescriptor } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { humanizeExplorerName } from './display-name.js';
import { ExplorerTaskDetail } from './operation-detail-panels.js';
import {
  canShowExplorerOperationExecutePanel,
  ExplorerOperationDetailPanel,
  type ExplorerOperationDetailTab,
  type ExplorerOperationExecutePanelRenderer,
} from './operation-detail.js';
import type { ExplorerOperationRefInputRenderer } from './operation-execute-panel.js';
import { ExplorerOperationSignature } from './operation-signature.js';

type ExplorerEmbeddedOperationTab = Extract<ExplorerOperationDetailTab, 'execute' | 'schema'>;

export type ExplorerEntityOperationsPanelProps = {
  operations: ExplorerOperationDescriptor[];
  tasks: ExplorerTaskDescriptor[];
  embedded?: boolean;
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
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

const Section = ({
  title,
  children,
  showHeader = true,
}: {
  title: string;
  children: ReactNode;
  showHeader?: boolean;
}) => (
  <section className='rounded-lg border bg-card'>
    {showHeader ? (
      <div className='border-b px-5 py-4'>
        <h2 className='font-semibold'>{title}</h2>
      </div>
    ) : null}
    {children}
  </section>
);

const ExplorerEmbeddedOperationTabs = ({
  activeTab,
  onTabChange,
  showExecute,
}: {
  activeTab: ExplorerEmbeddedOperationTab;
  onTabChange: (tab: ExplorerEmbeddedOperationTab) => void;
  showExecute: boolean;
}) => (
  <div className='mb-4 flex flex-wrap gap-4 border-b'>
    {[
      ...(showExecute ? [{ id: 'execute' as const, label: 'Execute' }] : []),
      { id: 'schema' as const, label: 'Schema' },
    ].map(tab => (
      <button
        key={tab.id}
        type='button'
        onClick={() => onTabChange(tab.id)}
        className={cx(
          'border-b-2 px-1 pb-2 text-sm font-medium transition-colors',
          activeTab === tab.id
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        )}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

const matchesOperationSearch = (operation: ExplorerOperationDescriptor, search: string) => {
  const query = search.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    operation.id,
    operation.name,
    humanizeExplorerName(operation.id),
    humanizeExplorerName(operation.name),
    operation.entityName,
    operation.kind,
    operation.exposure,
    operation.description,
  ].some(value => value?.toLowerCase().includes(query));
};

const OperationPanel = ({
  operation,
  renderExecutePanel,
  renderRefInput,
}: {
  operation: ExplorerOperationDescriptor;
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
}) => {
  const hasReflectedEntityDataReader = useHasReflectedEntityDataReader();
  const hasReflectedOperationInvoker = useHasReflectedOperationInvoker();
  const hasExecutePanel = canShowExplorerOperationExecutePanel({
    hasReflectedEntityDataReader,
    hasReflectedOperationInvoker,
    operation,
    renderExecutePanel,
    renderRefInput,
  });
  const [activeTab, setActiveTab] = useState<ExplorerEmbeddedOperationTab>(
    hasExecutePanel ? 'execute' : 'schema',
  );
  const effectiveTab = activeTab === 'execute' && !hasExecutePanel ? 'schema' : activeTab;

  useEffect(() => {
    if (!hasExecutePanel && activeTab === 'execute') {
      setActiveTab('schema');
    }
  }, [activeTab, hasExecutePanel]);

  return (
    <details className='group border-b last:border-0'>
      <summary className='grid cursor-pointer gap-3 px-5 py-4 marker:content-none md:grid-cols-[minmax(0,1fr)_auto]'>
        <div className='grid gap-2'>
          <div className='text-sm font-semibold text-foreground'>
            {humanizeExplorerName(operation.name)}
          </div>
          <ExplorerOperationSignature operation={operation} />
          {operation.description ? (
            <p className='text-sm text-muted-foreground'>{operation.description}</p>
          ) : null}
        </div>
        <div className='flex items-start gap-2'>
          <Badge>{operation.kind}</Badge>
          <Badge>{operation.exposure}</Badge>
          <ChevronRight className='mt-0.5 size-4 text-muted-foreground transition-transform group-open:rotate-90' />
        </div>
      </summary>
      <div className='px-5 pb-5'>
        <ExplorerEmbeddedOperationTabs
          activeTab={effectiveTab}
          onTabChange={setActiveTab}
          showExecute={hasExecutePanel}
        />
        <ExplorerOperationDetailPanel
          operation={operation}
          activeTab={effectiveTab}
          executeVariant='compact'
          renderExecutePanel={renderExecutePanel}
          renderRefInput={renderRefInput}
        />
      </div>
    </details>
  );
};

const TaskPanel = ({ task }: { task: ExplorerTaskDescriptor }) => (
  <details className='group border-b last:border-0'>
    <summary className='grid cursor-pointer gap-3 px-5 py-4 marker:content-none md:grid-cols-[minmax(0,1fr)_auto]'>
      <div className='grid gap-2'>
        <div className='text-sm font-semibold text-foreground'>
          {humanizeExplorerName(task.name)}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-mono text-xs text-muted-foreground'>{task.id}</span>
        </div>
      </div>
      <div className='flex items-start gap-2'>
        <Badge>{task.entityName}</Badge>
        <Badge>{task.steps.length} steps</Badge>
        <ChevronRight className='mt-0.5 size-4 text-muted-foreground transition-transform group-open:rotate-90' />
      </div>
    </summary>
    <div className='px-5 pb-5'>
      <ExplorerTaskDetail task={task} />
    </div>
  </details>
);

export const ExplorerEntityOperationsPanel = ({
  embedded = false,
  operations,
  renderExecutePanel,
  renderRefInput,
  tasks,
}: ExplorerEntityOperationsPanelProps) => {
  const [operationSearch, setOperationSearch] = useState('');
  const filteredOperations = operations.filter(operation =>
    matchesOperationSearch(operation, operationSearch),
  );

  return (
    <>
      <Section title='Operations' showHeader={!embedded}>
        {operations.length === 0 ? (
          <p className='px-5 py-4 text-sm text-muted-foreground'>No operations for this entity.</p>
        ) : (
          <>
            <div className='border-b px-5 py-3'>
              <label className='relative block'>
                <Search className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                <input
                  value={operationSearch}
                  onChange={event => setOperationSearch(event.target.value)}
                  placeholder='Search operations'
                  aria-label='Search operations'
                  className='min-h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary'
                />
              </label>
            </div>
            {filteredOperations.length === 0 ? (
              <p className='px-5 py-4 text-sm text-muted-foreground'>
                No operations match “{operationSearch}”.
              </p>
            ) : (
              filteredOperations.map(operation => (
                <OperationPanel
                  key={operation.id}
                  operation={operation}
                  renderExecutePanel={renderExecutePanel}
                  renderRefInput={renderRefInput}
                />
              ))
            )}
          </>
        )}
      </Section>

      <Section title='Tasks' showHeader={!embedded}>
        {tasks.length === 0 ? (
          <p className='px-5 py-4 text-sm text-muted-foreground'>No tasks for this entity.</p>
        ) : (
          tasks.map(task => <TaskPanel key={task.id} task={task} />)
        )}
      </Section>
    </>
  );
};
