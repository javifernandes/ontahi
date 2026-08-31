'use client';

import type { AnyEntityRef } from '@ontahi/core/data-graph';
import { useHasReflectedEntityDataReader, useReflectedOperationSupport } from '@ontahi/react/graph';
import { ArrowLeft, ArrowUpRight, CirclePlay, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  ExplorerOperationDescriptor,
  ExplorerOperationInputRefDescriptor,
  ExplorerSchemaField,
  ExplorerTaskDescriptor,
} from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { useExplorerRoutes } from './config.js';
import { humanizeExplorerName } from './display-name.js';
import {
  canShowExplorerOperationExecutePanel,
  type ExplorerOperationExecutePanelRenderer,
} from './operation-detail.js';
import {
  ExplorerOperationExecutePanel,
  type ExplorerOperationRefInputRenderer,
} from './operation-execute-panel.js';
import {
  buildExplorerOperationInputDraft,
  isExplorerOperationPotentiallyDestructive,
} from './operation-executor.js';

export type ExplorerInstanceOperationBinding =
  | {
      kind: 'reference';
      inputRef: ExplorerOperationInputRefDescriptor;
      locator: ExplorerOperationInputRefDescriptor['locators'][number];
      operation: ExplorerOperationDescriptor;
    }
  | {
      kind: 'selection';
      field: ExplorerSchemaField;
      operation: ExplorerOperationDescriptor;
    };

const hasLocatorFields = (
  source: AnyEntityRef,
  locator: ExplorerOperationInputRefDescriptor['locators'][number],
) =>
  locator.sourceFields.length > 0 &&
  locator.sourceFields.every(field => Object.prototype.hasOwnProperty.call(source.locator, field));

export const getExplorerInstanceOperationBinding = (
  operation: ExplorerOperationDescriptor,
  source: AnyEntityRef,
): ExplorerInstanceOperationBinding | null => {
  const candidates = (operation.inputRefs ?? []).flatMap(inputRef =>
    inputRef.entityName === source.entityName
      ? inputRef.locators
          .filter(locator => hasLocatorFields(source, locator))
          .map(locator => ({ kind: 'reference' as const, inputRef, locator, operation }))
      : [],
  );
  const receiverCandidates = candidates.filter(candidate => candidate.inputRef.receiver);
  if (receiverCandidates.length > 0) {
    return receiverCandidates.length === 1 ? receiverCandidates[0]! : null;
  }

  const selectionCandidates = operation.inputSchema.fields.flatMap(field =>
    field.selection?.entityName === source.entityName && field.selection.cardinality === 'one'
      ? [{ kind: 'selection' as const, field, operation }]
      : [],
  );
  const resolvedCandidates: ExplorerInstanceOperationBinding[] = [
    ...candidates,
    ...selectionCandidates,
  ];

  return resolvedCandidates.length === 1 ? resolvedCandidates[0]! : null;
};

export const getExplorerInstanceOperationBindings = (
  operations: ExplorerOperationDescriptor[],
  source: AnyEntityRef,
) =>
  operations.flatMap(operation => {
    const binding = getExplorerInstanceOperationBinding(operation, source);
    return binding ? [binding] : [];
  });

export const buildExplorerContextualOperationInput = (
  binding: ExplorerInstanceOperationBinding,
  source: AnyEntityRef,
) => {
  const boundValue =
    binding.kind === 'reference'
      ? {
          kind: 'entity-ref' as const,
          entityName: source.entityName,
          locator: Object.fromEntries(
            binding.locator.sourceFields.map(field => [field, source.locator[field]]),
          ),
        }
      : {
          kind: 'selection' as const,
          entityName: source.entityName,
          expression: {
            kind: 'references' as const,
            refs: [source],
          },
        };

  return {
    ...buildExplorerOperationInputDraft(binding.operation),
    [binding.kind === 'reference' ? binding.inputRef.path : binding.field.path]: boundValue,
  };
};

const getBindingPath = (binding: ExplorerInstanceOperationBinding) =>
  binding.kind === 'reference' ? binding.inputRef.path : binding.field.path;

type ExplorerOperationAction = {
  binding?: ExplorerInstanceOperationBinding;
  operation: ExplorerOperationDescriptor;
};

export function ExplorerEntityActions({
  ariaLabel,
  contextLabel,
  onSuccess,
  operations,
  renderExecutePanel,
  renderRefInput,
  source,
  tasks = [],
}: {
  ariaLabel: string;
  contextLabel?: string;
  onSuccess?: () => void | Promise<unknown>;
  operations: ExplorerOperationDescriptor[];
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
  source?: AnyEntityRef;
  tasks?: ExplorerTaskDescriptor[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const routes = useExplorerRoutes();
  const hasReflectedEntityDataReader = useHasReflectedEntityDataReader();
  const supportsOperation = useReflectedOperationSupport();
  const [open, setOpen] = useState(false);
  const [selectedOperationId, setSelectedOperationId] = useState<string>();
  const closeActions = useCallback(() => {
    setOpen(false);
    setSelectedOperationId(undefined);
  }, []);
  const actions = useMemo<ExplorerOperationAction[]>(
    () =>
      source
        ? getExplorerInstanceOperationBindings(operations, source).map(binding => ({
            binding,
            operation: binding.operation,
          }))
        : operations.map(operation => ({ operation })),
    [operations, source],
  );
  const availableActions = actions.filter(({ operation }) =>
    canShowExplorerOperationExecutePanel({
      hasReflectedEntityDataReader,
      hasReflectedOperationInvoker: supportsOperation(operation),
      operation,
      renderExecutePanel,
      renderRefInput,
    }),
  );
  const selectedAction = availableActions.find(
    action => action.operation.id === selectedOperationId,
  );
  const initialInput = useMemo(
    () =>
      selectedAction?.binding && source
        ? buildExplorerContextualOperationInput(selectedAction.binding, source)
        : undefined,
    [selectedAction, source],
  );

  useEffect(() => {
    if (!open) return;

    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeActions();
      }
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeActions();
      }
    };

    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeFromKeyboard, true);
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeFromKeyboard, true);
    };
  }, [closeActions, open]);

  useEffect(() => {
    if (selectedOperationId && !selectedAction) {
      setSelectedOperationId(undefined);
    }
  }, [selectedAction, selectedOperationId]);

  if (availableActions.length === 0 && tasks.length === 0) {
    return null;
  }

  const handleOperationSuccess = selectedAction
    ? async () => {
        try {
          await onSuccess?.();
        } finally {
          if (isExplorerOperationPotentiallyDestructive(selectedAction.operation)) {
            closeActions();
          }
        }
      }
    : undefined;

  const executePanel = selectedAction
    ? (renderExecutePanel?.({
        hiddenInputPaths: selectedAction.binding ? [getBindingPath(selectedAction.binding)] : [],
        initialInput,
        onSuccess: handleOperationSuccess,
        operation: selectedAction.operation,
        variant: source ? 'contextual' : 'compact',
      }) ?? (
        <ExplorerOperationExecutePanel
          hiddenInputPaths={
            selectedAction.binding ? [getBindingPath(selectedAction.binding)] : undefined
          }
          initialInput={initialInput}
          onSuccess={handleOperationSuccess}
          operation={selectedAction.operation}
          renderRefInput={renderRefInput}
          variant={source ? 'contextual' : 'compact'}
        />
      ))
    : null;

  return (
    <div ref={rootRef} className='relative'>
      <button
        type='button'
        aria-label={ariaLabel}
        aria-expanded={open}
        title={ariaLabel}
        onClick={() => {
          setOpen(current => !current);
          setSelectedOperationId(undefined);
        }}
        className={cx(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition',
          'hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
          open && 'bg-primary/10 text-primary',
        )}
      >
        <CirclePlay className='size-4' />
      </button>

      {open ? (
        <div className='absolute right-0 top-[calc(100%+0.5rem)] z-[100] w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl'>
          {selectedAction ? (
            <>
              <div className='flex items-start gap-2 border-b px-3 py-3'>
                <button
                  type='button'
                  aria-label='Back to actions'
                  onClick={() => setSelectedOperationId(undefined)}
                  className='inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground'
                >
                  <ArrowLeft className='size-4' />
                </button>
                <div className='min-w-0 flex-1 pt-1'>
                  <h3 className='truncate text-sm font-semibold text-foreground'>
                    {humanizeExplorerName(selectedAction.operation.name)}
                  </h3>
                  {selectedAction.binding && contextLabel ? (
                    <p className='mt-1 truncate font-mono text-[11px] text-muted-foreground'>
                      {getBindingPath(selectedAction.binding)}: {contextLabel}
                    </p>
                  ) : null}
                </div>
                <button
                  type='button'
                  aria-label='Close actions'
                  title='Close actions'
                  onClick={closeActions}
                  className='inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground'
                >
                  <X className='size-4' />
                </button>
              </div>
              <div className='max-h-[min(32rem,calc(100vh-8rem))] overflow-y-auto p-3'>
                {executePanel}
              </div>
            </>
          ) : (
            <>
              <div className='flex items-start justify-between gap-3 border-b px-4 py-3'>
                <div className='min-w-0'>
                  <h3 className='text-sm font-semibold text-foreground'>Actions</h3>
                  {contextLabel ? (
                    <p className='mt-0.5 truncate text-xs text-muted-foreground'>{contextLabel}</p>
                  ) : null}
                </div>
                <button
                  type='button'
                  aria-label='Close actions'
                  title='Close actions'
                  onClick={closeActions}
                  className='inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground'
                >
                  <X className='size-4' />
                </button>
              </div>
              <div className='max-h-80 overflow-y-auto p-2'>
                {availableActions.map(({ operation }) => (
                  <button
                    key={operation.id}
                    type='button'
                    onClick={() => setSelectedOperationId(operation.id)}
                    className='group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-accent'
                  >
                    <CirclePlay className='size-4 shrink-0 text-primary' />
                    <span className='grid min-w-0 flex-1 gap-0.5'>
                      <span className='truncate text-sm font-medium text-foreground'>
                        {humanizeExplorerName(operation.name)}
                      </span>
                      {operation.description ? (
                        <span className='line-clamp-2 text-xs text-muted-foreground'>
                          {operation.description}
                        </span>
                      ) : null}
                    </span>
                    <ArrowUpRight className='size-3.5 shrink-0 text-muted-foreground transition group-hover:text-foreground' />
                  </button>
                ))}
                {tasks.length > 0 ? (
                  <div
                    className={cx('mt-1 border-t pt-1', availableActions.length === 0 && 'mt-0')}
                  >
                    {tasks.map(task => (
                      <a
                        key={task.id}
                        href={routes.task(task.id)}
                        className='group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left no-underline transition hover:bg-accent'
                      >
                        <span className='min-w-0 flex-1 truncate text-sm font-medium text-foreground'>
                          {humanizeExplorerName(task.name)}
                        </span>
                        <span className='text-xs text-muted-foreground'>Task</span>
                        <ArrowUpRight className='size-3.5 shrink-0 text-muted-foreground transition group-hover:text-foreground' />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
