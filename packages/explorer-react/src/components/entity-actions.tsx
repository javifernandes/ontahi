'use client';

import type { AnyEntityRef } from '@ontahi/core/data-graph';
import { useHasReflectedEntityDataReader, useReflectedOperationSupport } from '@ontahi/react/graph';
import { ArrowLeft, ArrowUpRight, CirclePlay, Trash2, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

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
  hasExplorerOperationVisibleInputs,
  isExplorerOperationPotentiallyDestructive,
  useExplorerOperationExecutor,
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

export const getExplorerRelationOperations = (
  operations: ExplorerOperationDescriptor[],
  source: AnyEntityRef,
  targetEntityName: string,
) =>
  getExplorerInstanceOperationBindings(operations, source)
    .filter(binding => binding.operation.resultEntityName === targetEntityName)
    .map(binding => binding.operation);

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

export type ExplorerEntityActionsProps = Readonly<{
  ariaLabel: string;
  contextLabel?: string;
  onSuccess?: () => void | Promise<unknown>;
  operations: ExplorerOperationDescriptor[];
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
  renderInPortal?: boolean;
  inlineSingleAction?: boolean;
  source?: AnyEntityRef;
  tasks?: ExplorerTaskDescriptor[];
  triggerClassName?: string;
  triggerIcon?: ReactNode;
}>;

const actionControlClassName =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground';

const getExplorerActionPortalHost = (trigger: HTMLElement) => {
  const explicitHost = trigger.closest<HTMLElement>('[data-explorer-theme-host]');
  if (explicitHost) return explicitHost;

  let current: HTMLElement | null = trigger;

  while (current && current !== document.body) {
    const popover = globalThis.getComputedStyle(current).getPropertyValue('--popover').trim();
    const parentPopover = current.parentElement
      ? globalThis.getComputedStyle(current.parentElement).getPropertyValue('--popover').trim()
      : '';
    if (popover && popover !== parentPopover) {
      return current;
    }
    current = current.parentElement;
  }

  return document.body;
};

const ExplorerActionCloseButton = ({ onClose }: Readonly<{ onClose: () => void }>) => (
  <button
    type='button'
    aria-label='Close actions'
    title='Close actions'
    onClick={onClose}
    className={actionControlClassName}
  >
    <X className='size-4' />
  </button>
);

const ExplorerEntityActionList = ({
  actions,
  ariaLabel,
  onSelect,
  tasks,
}: Readonly<{
  actions: ExplorerOperationAction[];
  ariaLabel: string;
  onSelect: (operationId: string) => void;
  tasks: ExplorerTaskDescriptor[];
}>) => {
  const routes = useExplorerRoutes();

  return (
    <div role='menu' aria-label={ariaLabel} className='max-h-80 overflow-y-auto p-1.5'>
      {actions.map(({ operation }) => (
        <button
          key={operation.id}
          type='button'
          role='menuitem'
          onClick={() => onSelect(operation.id)}
          className='flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-accent'
        >
          <span className='truncate'>{humanizeExplorerName(operation.name)}</span>
        </button>
      ))}
      {tasks.length > 0 ? (
        <div className={cx('mt-1 border-t pt-1', actions.length === 0 && 'mt-0')}>
          {tasks.map(task => (
            <a
              key={task.id}
              href={routes.task(task.id)}
              role='menuitem'
              className='group flex items-center gap-3 rounded-lg px-3 py-2 text-left no-underline transition hover:bg-accent'
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
  );
};

const ExplorerEntityActionDetail = ({
  action,
  contextLabel,
  onBack,
  onClose,
  onSuccess,
  renderExecutePanel,
  renderRefInput,
  source,
}: Readonly<{
  action: ExplorerOperationAction;
  contextLabel?: string;
  onBack: () => void;
  onClose: () => void;
  onSuccess?: () => void | Promise<unknown>;
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
  source?: AnyEntityRef;
}>) => {
  const bindingPath = action.binding ? getBindingPath(action.binding) : undefined;
  const hiddenInputPaths = bindingPath ? [bindingPath] : [];
  const initialInput = useMemo(
    () =>
      action.binding && source
        ? buildExplorerContextualOperationInput(action.binding, source)
        : undefined,
    [action, source],
  );
  const handleOperationSuccess = async () => {
    try {
      await onSuccess?.();
    } finally {
      if (isExplorerOperationPotentiallyDestructive(action.operation)) onClose();
    }
  };
  const variant = source ? 'contextual' : 'compact';
  const executePanel = renderExecutePanel?.({
    hiddenInputPaths,
    initialInput,
    onSuccess: handleOperationSuccess,
    operation: action.operation,
    variant,
  }) ?? (
    <ExplorerOperationExecutePanel
      hiddenInputPaths={hiddenInputPaths}
      initialInput={initialInput}
      onSuccess={handleOperationSuccess}
      operation={action.operation}
      renderRefInput={renderRefInput}
      variant={variant}
    />
  );

  return (
    <>
      <div className='flex items-start gap-2 border-b px-3 py-3'>
        <button
          type='button'
          aria-label='Back to actions'
          onClick={onBack}
          className={actionControlClassName}
        >
          <ArrowLeft className='size-4' />
        </button>
        <div className='min-w-0 flex-1 pt-1'>
          <h3 className='truncate text-sm font-semibold text-foreground'>
            {humanizeExplorerName(action.operation.name)}
          </h3>
          {bindingPath && contextLabel ? (
            <p className='mt-1 truncate font-mono text-[11px] text-muted-foreground'>
              {bindingPath}: {contextLabel}
            </p>
          ) : null}
        </div>
        <ExplorerActionCloseButton onClose={onClose} />
      </div>
      <div className='max-h-[min(32rem,calc(100vh-8rem))] overflow-y-auto p-3'>{executePanel}</div>
    </>
  );
};

const ExplorerEntityActionConfirmation = ({
  action,
  onBack,
  onClose,
  onSuccess,
  source,
}: Readonly<{
  action: ExplorerOperationAction;
  onBack: () => void;
  onClose: () => void;
  onSuccess?: () => void | Promise<unknown>;
  source?: AnyEntityRef;
}>) => {
  const actionLabel = humanizeExplorerName(action.operation.name);
  const initialInput = useMemo(
    () =>
      action.binding && source
        ? buildExplorerContextualOperationInput(action.binding, source)
        : undefined,
    [action, source],
  );
  const executor = useExplorerOperationExecutor({
    initialInput,
    operation: action.operation,
    onSuccess: async () => {
      try {
        await onSuccess?.();
      } finally {
        onClose();
      }
    },
  });
  const running = executor.state.status === 'running';

  return (
    <div role='group' aria-label={`Confirm ${actionLabel}`} className='p-1.5'>
      <div className='grid gap-2 rounded-lg bg-destructive/10 p-3'>
        <p className='text-sm font-medium text-foreground'>{actionLabel}?</p>
        <div className='flex justify-end gap-2'>
          <button
            type='button'
            onClick={onBack}
            className='inline-flex min-h-8 items-center rounded-md px-3 text-xs font-medium text-muted-foreground transition hover:bg-background/70 hover:text-foreground'
          >
            Cancel
          </button>
          <button
            type='button'
            disabled={
              running ||
              !executor.executable ||
              !executor.parsedInputPreview.ok ||
              executor.localValidationIssues.length > 0
            }
            onClick={() => void executor.executeConfirmed()}
            className='inline-flex min-h-8 items-center rounded-md bg-destructive px-3 text-xs font-medium text-white transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {running ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
        {executor.state.status === 'error' ? (
          <p role='status' className='text-xs text-destructive'>
            {executor.state.error}
          </p>
        ) : null}
      </div>
    </div>
  );
};

const ExplorerEntityActionsPopover = ({
  actions,
  ariaLabel,
  contextLabel,
  inlineConfirmation,
  onClose,
  onSelect,
  onSuccess,
  renderExecutePanel,
  renderRefInput,
  selectedAction,
  source,
  tasks,
}: Readonly<{
  actions: ExplorerOperationAction[];
  ariaLabel: string;
  contextLabel?: string;
  inlineConfirmation: boolean;
  onClose: () => void;
  onSelect: (operationId: string | undefined) => void;
  onSuccess?: () => void | Promise<unknown>;
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
  selectedAction?: ExplorerOperationAction;
  source?: AnyEntityRef;
  tasks: ExplorerTaskDescriptor[];
}>) =>
  selectedAction && inlineConfirmation ? (
    <ExplorerEntityActionConfirmation
      action={selectedAction}
      onBack={() => onSelect(undefined)}
      onClose={onClose}
      onSuccess={onSuccess}
      source={source}
    />
  ) : selectedAction ? (
    <ExplorerEntityActionDetail
      action={selectedAction}
      contextLabel={contextLabel}
      onBack={() => onSelect(undefined)}
      onClose={onClose}
      onSuccess={onSuccess}
      renderExecutePanel={renderExecutePanel}
      renderRefInput={renderRefInput}
      source={source}
    />
  ) : (
    <ExplorerEntityActionList
      actions={actions}
      ariaLabel={ariaLabel}
      onSelect={onSelect}
      tasks={tasks}
    />
  );

export function ExplorerEntityActions({
  ariaLabel,
  contextLabel,
  inlineSingleAction = false,
  onSuccess,
  operations,
  renderExecutePanel,
  renderRefInput,
  renderInPortal = false,
  source,
  tasks = [],
  triggerClassName,
  triggerIcon,
}: ExplorerEntityActionsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hasReflectedEntityDataReader = useHasReflectedEntityDataReader();
  const supportsOperation = useReflectedOperationSupport();
  const [open, setOpen] = useState(false);
  const [selectedOperationId, setSelectedOperationId] = useState<string>();
  const [portalStyle, setPortalStyle] = useState<CSSProperties>();
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
  const availableActions = actions.filter(
    ({ operation }) =>
      !(
        operation.kind === 'durable' &&
        operation.durable &&
        tasks.some(task => task.id === operation.durable?.taskId)
      ) &&
      canShowExplorerOperationExecutePanel({
        hasReflectedEntityDataReader,
        hasReflectedOperationInvoker: supportsOperation(operation),
        operation,
        renderExecutePanel,
        renderRefInput,
      }),
  );
  const directAction =
    inlineSingleAction && tasks.length === 0 && availableActions.length === 1
      ? availableActions[0]
      : undefined;
  const selectedAction = availableActions.find(
    action => action.operation.id === selectedOperationId,
  );
  const hiddenInputPaths = selectedAction?.binding ? [getBindingPath(selectedAction.binding)] : [];
  const inlineConfirmation = Boolean(
    selectedAction &&
    !renderExecutePanel &&
    isExplorerOperationPotentiallyDestructive(selectedAction.operation) &&
    !hasExplorerOperationVisibleInputs(selectedAction.operation, hiddenInputPaths),
  );
  const expandedActionDetail = Boolean(selectedAction && !inlineConfirmation);
  const directActionLabel = directAction
    ? `${humanizeExplorerName(directAction.operation.name)} · ${ariaLabel}`
    : ariaLabel;

  const positionPortal = useCallback(() => {
    const trigger = rootRef.current;
    if (!trigger || typeof globalThis.window === 'undefined') return;

    const margin = 16;
    const gap = 8;
    const width = Math.min(expandedActionDetail ? 368 : 272, globalThis.innerWidth - margin * 2);
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = globalThis.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const placeAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
    const left = Math.min(
      Math.max(margin, rect.right - width),
      globalThis.innerWidth - width - margin,
    );

    setPortalStyle({
      left,
      maxHeight: Math.max(0, placeAbove ? spaceAbove : spaceBelow),
      width,
      ...(placeAbove
        ? { bottom: globalThis.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    });
  }, [expandedActionDetail]);

  useLayoutEffect(() => {
    if (!open || !renderInPortal) return;

    positionPortal();
    globalThis.addEventListener('resize', positionPortal);
    globalThis.addEventListener('scroll', positionPortal, true);
    return () => {
      globalThis.removeEventListener('resize', positionPortal);
      globalThis.removeEventListener('scroll', positionPortal, true);
    };
  }, [open, positionPortal, renderInPortal, selectedOperationId]);

  useEffect(() => {
    if (!open) return;

    const closeFromOutside = (event: PointerEvent) => {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !popoverRef.current?.contains(event.target as Node)
      ) {
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

  const popover = open ? (
    <div
      ref={popoverRef}
      style={renderInPortal ? portalStyle : undefined}
      className={cx(
        'z-[300] overflow-y-auto rounded-2xl border bg-popover text-popover-foreground shadow-2xl',
        renderInPortal
          ? 'fixed'
          : cx(
              'absolute right-0 top-[calc(100%+0.5rem)]',
              expandedActionDetail
                ? 'w-[min(23rem,calc(100vw-2rem))]'
                : 'w-[min(17rem,calc(100vw-2rem))]',
            ),
      )}
    >
      <ExplorerEntityActionsPopover
        actions={availableActions}
        ariaLabel={ariaLabel}
        contextLabel={contextLabel}
        inlineConfirmation={inlineConfirmation}
        onClose={closeActions}
        onSelect={setSelectedOperationId}
        onSuccess={onSuccess}
        renderExecutePanel={renderExecutePanel}
        renderRefInput={renderRefInput}
        selectedAction={selectedAction}
        source={source}
        tasks={tasks}
      />
    </div>
  ) : null;

  return (
    <div ref={rootRef} className='relative'>
      <button
        type='button'
        aria-label={directActionLabel}
        aria-expanded={open}
        aria-haspopup={directAction ? 'dialog' : 'menu'}
        title={directActionLabel}
        onClick={() => {
          setOpen(current => {
            const nextOpen = !current;
            setSelectedOperationId(nextOpen ? directAction?.operation.id : undefined);
            return nextOpen;
          });
        }}
        className={cx(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition',
          'hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
          open && 'bg-primary/10 text-primary',
          triggerClassName,
        )}
      >
        {triggerIcon ??
          (directAction && isExplorerOperationPotentiallyDestructive(directAction.operation) ? (
            <Trash2 className='size-4' />
          ) : (
            <CirclePlay className='size-4' />
          ))}
      </button>

      {renderInPortal && popover && typeof document !== 'undefined'
        ? createPortal(
            popover,
            rootRef.current ? getExplorerActionPortalHost(rootRef.current) : document.body,
          )
        : popover}
    </div>
  );
}
