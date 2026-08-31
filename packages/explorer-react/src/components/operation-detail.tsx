'use client';

import { useHasReflectedEntityDataReader, useReflectedOperationSupport } from '@ontahi/react/graph';
import type { ReactNode } from 'react';

import type { ExplorerOperationDescriptor } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { ExplorerOperationIngress, ExplorerOperationMetadata } from './operation-detail-panels.js';
import {
  ExplorerOperationExecutePanel,
  type ExplorerOperationExecutePanelVariant,
  type ExplorerOperationRefInputRenderer,
} from './operation-execute-panel.js';
import { isExplorerOperationExecutable } from './operation-executor.js';
import { explorerOperationDetailTabs, type ExplorerOperationDetailTab } from './routes.js';
import { ExplorerSchemaPanel } from './schema-panel.js';

export { explorerOperationDetailTabs };
export type { ExplorerOperationDetailTab };

export type ExplorerOperationExecutePanelRenderer = (props: {
  hiddenInputPaths?: readonly string[];
  initialInput?: unknown;
  onSuccess?: (result: unknown) => void | Promise<unknown>;
  operation: ExplorerOperationDescriptor;
  variant: ExplorerOperationExecutePanelVariant;
}) => ReactNode;

export type ExplorerOperationDetailPanelProps = {
  operation: ExplorerOperationDescriptor;
  activeTab?: ExplorerOperationDetailTab;
  executeVariant?: ExplorerOperationExecutePanelVariant;
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
  className?: string;
};

export const canUseDefaultExplorerOperationExecutePanel = ({
  hasReflectedEntityDataReader,
  hasReflectedOperationInvoker,
  operation,
  renderRefInput,
}: {
  hasReflectedEntityDataReader: boolean;
  hasReflectedOperationInvoker: boolean;
  operation: ExplorerOperationDescriptor;
  renderRefInput?: ExplorerOperationRefInputRenderer;
}) => {
  const inputRefs = operation.inputRefs?.filter(inputRef => inputRef.locators.length > 0) ?? [];

  return (
    hasReflectedOperationInvoker &&
    isExplorerOperationExecutable(operation) &&
    (inputRefs.length === 0 || hasReflectedEntityDataReader || Boolean(renderRefInput))
  );
};

export const canShowExplorerOperationExecutePanel = ({
  hasReflectedEntityDataReader,
  hasReflectedOperationInvoker,
  operation,
  renderExecutePanel,
  renderRefInput,
}: {
  hasReflectedEntityDataReader: boolean;
  hasReflectedOperationInvoker: boolean;
  operation: ExplorerOperationDescriptor;
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
}) =>
  Boolean(renderExecutePanel) ||
  canUseDefaultExplorerOperationExecutePanel({
    hasReflectedEntityDataReader,
    hasReflectedOperationInvoker,
    operation,
    renderRefInput,
  });

export const getExplorerOperationDetailEffectiveTab = (
  activeTab: ExplorerOperationDetailTab,
  hasExecutePanel: boolean,
): ExplorerOperationDetailTab =>
  activeTab === 'execute' && !hasExecutePanel ? 'schema' : activeTab;

export const ExplorerOperationDetailPanel = ({
  operation,
  activeTab = 'schema',
  className,
  executeVariant = 'default',
  renderExecutePanel,
  renderRefInput,
}: ExplorerOperationDetailPanelProps) => {
  const hasReflectedEntityDataReader = useHasReflectedEntityDataReader();
  const supportsOperation = useReflectedOperationSupport();
  const hasDefaultExecutePanel = canUseDefaultExplorerOperationExecutePanel({
    hasReflectedEntityDataReader,
    hasReflectedOperationInvoker: supportsOperation(operation),
    operation,
    renderRefInput,
  });
  const hasExecutePanel = Boolean(renderExecutePanel) || hasDefaultExecutePanel;
  const executePanel =
    renderExecutePanel?.({ operation, variant: executeVariant }) ??
    (hasDefaultExecutePanel ? (
      <ExplorerOperationExecutePanel
        operation={operation}
        renderRefInput={renderRefInput}
        variant={executeVariant}
      />
    ) : null);
  const effectiveTab = getExplorerOperationDetailEffectiveTab(activeTab, hasExecutePanel);
  const panels = {
    execute: executePanel,
    schema: (
      <div className='grid gap-5'>
        <ExplorerSchemaPanel title='Input' schema={operation.inputSchema} />
        {operation.durable ? (
          <>
            <ExplorerSchemaPanel title='Started run' schema={operation.durable.runRefSchema} />
            <ExplorerSchemaPanel
              title='Progress snapshot'
              schema={operation.durable.progressSchema}
            />
            <ExplorerSchemaPanel
              title='Final output'
              schema={operation.durable.finalOutputSchema}
            />
          </>
        ) : (
          <ExplorerSchemaPanel title='Return' schema={operation.resultSchema} />
        )}
      </div>
    ),
    ingress: <ExplorerOperationIngress operation={operation} />,
    metadata: <ExplorerOperationMetadata operation={operation} />,
  } satisfies Record<ExplorerOperationDetailTab, ReactNode>;

  return (
    <div className={cx('grid gap-5 bg-background/60', className)}>
      {Object.entries(panels).map(([tab, panel]) =>
        panel ? (
          <div key={tab} hidden={effectiveTab !== tab}>
            {panel}
          </div>
        ) : null,
      )}
    </div>
  );
};
