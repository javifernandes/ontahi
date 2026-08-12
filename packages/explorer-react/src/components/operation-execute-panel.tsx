'use client';

import type {
  OperationInvocationResult,
  OperationValidationIssue,
} from '@ontahi/core/runtime/contracts';
import { ArrowRight, ExternalLink, Play, RefreshCw, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';

import type {
  ExplorerOperationDescriptor,
  ExplorerOperationInputRefDescriptor,
  ExplorerSchemaField,
  ExplorerTaskRunRef,
  ExplorerTaskRunSource,
} from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { ExplorerCollapsibleSection } from './collapsible-section.js';
import { useExplorerConfig, useExplorerRoutes } from './config.js';
import { ExplorerEntityRefInput } from './entity-ref-input.js';
import { ExplorerJsonEditor } from './json-editor.js';
import {
  buildExplorerOperationInputDraft,
  getExplorerEntityRefInputLocator,
  getExplorerInputFieldDraftValue,
  getExplorerOperationScalarInputFields,
  updateExplorerEntityRefInputDraft,
  updateExplorerInputFieldDraft,
  useExplorerOperationExecutor,
} from './operation-executor.js';
import { ExplorerSelect } from './select.js';
import { ExplorerSelectionInput } from './selection-input.js';
import type { ExplorerThemePreference } from './theme.js';

export type ExplorerOperationExecutePanelVariant = 'default' | 'compact';

export type ExplorerOperationRefInputRenderProps = {
  input: unknown;
  inputRef: ExplorerOperationInputRefDescriptor;
  locator: ExplorerOperationInputRefDescriptor['locators'][number];
  onChange: (nextInput: unknown) => void;
  variant: ExplorerOperationExecutePanelVariant;
};

export type ExplorerOperationRefInputRenderer = (
  props: ExplorerOperationRefInputRenderProps,
) => ReactNode;

export type ExplorerOperationExecutePanelProps = {
  operation: ExplorerOperationDescriptor;
  variant?: ExplorerOperationExecutePanelVariant;
  renderRefInput?: ExplorerOperationRefInputRenderer;
  theme?: ExplorerThemePreference;
  className?: string;
};

const formatJsonValue = (value: unknown) => JSON.stringify(value, null, 2);

const durableTaskRunPollIntervalMs = 2000;
const taskRunStatuses = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const;

const isTerminalTaskRunStatus = (status: ExplorerTaskRunSource['status']) =>
  status === 'completed' || status === 'failed' || status === 'cancelled';

const isExplorerTaskRunRef = (
  value: unknown,
): value is ExplorerTaskRunRef & {
  status: ExplorerTaskRunSource['status'];
} =>
  typeof value === 'object' &&
  value !== null &&
  'taskId' in value &&
  typeof value.taskId === 'string' &&
  'runId' in value &&
  typeof value.runId === 'string' &&
  'status' in value &&
  typeof value.status === 'string' &&
  taskRunStatuses.some(status => status === value.status);

const useExplorerDurableTaskRun = (runRef: ExplorerTaskRunRef | undefined) => {
  const { loadTaskRunSource } = useExplorerConfig();
  const taskId = runRef?.taskId;
  const runId = runRef?.runId;
  const [source, setSource] = useState<ExplorerTaskRunSource>();
  const [error, setError] = useState<string>();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!loadTaskRunSource || !taskId || !runId) {
      return;
    }

    setIsRefreshing(true);
    setError(undefined);

    try {
      setSource(
        await loadTaskRunSource({
          taskId,
          runId,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load the task run.');
    } finally {
      setIsRefreshing(false);
    }
  }, [loadTaskRunSource, runId, taskId]);

  useEffect(() => {
    setSource(undefined);
    setError(undefined);

    if (!loadTaskRunSource || !taskId || !runId) {
      return undefined;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const nextSource = await loadTaskRunSource({
          taskId,
          runId,
        });

        if (cancelled) {
          return;
        }

        setSource(nextSource);
        setError(undefined);

        if (!isTerminalTaskRunStatus(nextSource.status)) {
          timeout = setTimeout(poll, durableTaskRunPollIntervalMs);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Failed to load the task run.');
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;

      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [loadTaskRunSource, runId, taskId]);

  return {
    error,
    isRefreshing,
    loadable: Boolean(loadTaskRunSource),
    refresh,
    source,
  };
};

const ExplorerDurableOperationRun = ({
  operation,
  runRef,
  theme,
}: {
  operation: ExplorerOperationDescriptor;
  runRef: ExplorerTaskRunRef & { status: ExplorerTaskRunSource['status'] };
  theme?: ExplorerThemePreference;
}) => {
  const routes = useExplorerRoutes();
  const taskRun = useExplorerDurableTaskRun(runRef);
  const status = taskRun.source?.status ?? runRef.status;
  const progress = taskRun.source?.progress;

  return (
    <section className='grid gap-4 rounded-lg border bg-muted/20 p-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h5 className='text-xs font-semibold uppercase tracking-wide text-primary'>
            Task run started
          </h5>
          <p className='mt-1 font-mono text-sm text-foreground'>{runRef.runId}</p>
        </div>
        <div className='flex items-center gap-2'>
          <span
            className={cx(
              'rounded-md border px-2 py-1 text-xs font-medium',
              status === 'completed'
                ? 'border-primary/40 text-primary'
                : status === 'failed' || status === 'cancelled'
                  ? 'border-destructive/40 text-destructive'
                  : 'text-muted-foreground',
            )}
          >
            {status}
          </span>
          {taskRun.loadable ? (
            <button
              type='button'
              title='Refresh task run'
              aria-label='Refresh task run'
              onClick={() => void taskRun.refresh()}
              disabled={taskRun.isRefreshing}
              className='inline-flex size-8 items-center justify-center rounded-md border bg-background text-foreground hover:bg-accent disabled:opacity-50'
            >
              <RefreshCw className={cx('size-4', taskRun.isRefreshing && 'animate-spin')} />
            </button>
          ) : null}
        </div>
      </div>

      <dl className='grid gap-3 text-sm sm:grid-cols-2'>
        <div>
          <dt className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
            Task
          </dt>
          <dd className='mt-1 break-all font-mono text-foreground'>{runRef.taskId}</dd>
        </div>
        <div>
          <dt className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Run</dt>
          <dd className='mt-1 break-all font-mono text-foreground'>{runRef.runId}</dd>
        </div>
      </dl>

      {progress ? (
        <div className='grid gap-2'>
          <div className='flex items-center justify-between gap-3 text-sm'>
            <span className='font-medium text-foreground'>
              {progress.message ?? progress.phase}
            </span>
            {typeof progress.percent === 'number' ? (
              <span className='text-muted-foreground'>{progress.percent}%</span>
            ) : null}
          </div>
          {typeof progress.percent === 'number' ? (
            <div className='h-2 overflow-hidden rounded-md bg-muted'>
              <div
                className='h-full bg-primary transition-[width]'
                role='progressbar'
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
                style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {taskRun.source?.error ? (
        <p className='text-sm text-destructive'>{taskRun.source.error.message}</p>
      ) : null}
      {taskRun.error ? <p className='text-sm text-destructive'>{taskRun.error}</p> : null}

      <a
        href={routes.task(runRef.taskId, { tab: 'runs' })}
        className='inline-flex w-fit items-center gap-2 text-sm font-medium text-primary hover:underline'
      >
        View task runs
        <ExternalLink className='size-4' />
      </a>

      {taskRun.source?.status === 'completed' && taskRun.source.result !== undefined ? (
        <div className='grid gap-2'>
          <h5 className='text-xs font-semibold uppercase tracking-wide text-primary'>
            Final output
          </h5>
          <ExplorerJsonEditor
            label='Final Output'
            value={formatJsonValue(taskRun.source.result)}
            path={`explorer://${operation.id}/runs/${runRef.runId}/final-output.json`}
            height='320px'
            readOnly
            theme={theme}
          />
        </div>
      ) : null}
    </section>
  );
};

const formatLocatorName = (name: string) => name.replace(/^ref(?=By[A-Z]|[A-Z])/, '');

const isBooleanInputField = (field: ExplorerSchemaField) =>
  field.type.toLowerCase().includes('boolean');

const isEnumInputField = (field: ExplorerSchemaField) => (field.enumValues?.length ?? 0) > 0;

const isNumberInputField = (field: ExplorerSchemaField) => {
  const type = field.type.toLowerCase();

  return type.includes('number') || type.includes('integer');
};

const isStructuredInputField = (field: ExplorerSchemaField) => {
  const type = field.type.toLowerCase();

  return type.includes('array') || type.includes('object') || type.includes('json');
};

const isSelectionInputField = (field: ExplorerSchemaField) => Boolean(field.selection);

const formatInputFieldControlValue = (value: unknown) => {
  if (value == null) {
    return '';
  }

  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value, null, 2);
};

const parseInputFieldControlValue = (field: ExplorerSchemaField, value: string) => {
  if (isNumberInputField(field)) {
    if (value === '') {
      return field.required ? '' : null;
    }

    const parsed = Number(value);

    return Number.isNaN(parsed) ? value : parsed;
  }

  if (isStructuredInputField(field)) {
    if (value === '') {
      return field.required ? '' : null;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value === '' && !field.required ? null : value;
};

const getBooleanInputLabels = (field: ExplorerSchemaField) => ({
  true: field.presentation?.booleanLabels?.true ?? 'Yes',
  false: field.presentation?.booleanLabels?.false ?? 'No',
  unset: field.presentation?.booleanLabels?.unset ?? 'Unset',
});

const getCompactInputTypeLabel = (field: ExplorerSchemaField) => {
  if (field.selection) {
    return `${field.selection.entityName} selection (${field.selection.cardinality})`;
  }

  if (isEnumInputField(field)) {
    return 'choice';
  }

  if (isBooleanInputField(field)) {
    const labels = getBooleanInputLabels(field);

    return `${labels.true.toLowerCase()}/${labels.false.toLowerCase()}`;
  }

  if (isNumberInputField(field)) {
    return 'number';
  }

  if (isStructuredInputField(field)) {
    return field.type.toLowerCase().includes('array') ? 'list' : 'object';
  }

  return 'text';
};

const EXPLORER_UNSET_SELECT_VALUE = '__explorer_unset__';

const getEditableInputValue = (
  operation: ExplorerOperationDescriptor,
  parsedInputPreview: ReturnType<typeof useExplorerOperationExecutor>['parsedInputPreview'],
) =>
  parsedInputPreview.ok ? parsedInputPreview.value : buildExplorerOperationInputDraft(operation);

const ExplorerBooleanChoice = ({
  field,
  value,
  onChange,
  variant,
  showFieldLabel = false,
}: {
  field: ExplorerSchemaField;
  value: unknown;
  onChange: (nextValue: boolean | null) => void;
  variant: ExplorerOperationExecutePanelVariant;
  showFieldLabel?: boolean;
}) => {
  const labels = getBooleanInputLabels(field);
  const options = [
    ...(!field.required ? [{ value: null, label: labels.unset }] : []),
    { value: true, label: labels.true },
    { value: false, label: labels.false },
  ];
  const selectedValue = value == null && !field.required ? null : Boolean(value);

  return (
    <div className='flex min-w-0 items-center gap-3'>
      {showFieldLabel ? (
        <span className='min-w-0 truncate text-sm font-medium text-foreground' title={field.path}>
          {field.path}
        </span>
      ) : null}
      <div
        role='radiogroup'
        aria-label={field.path}
        className={cx(
          'inline-flex min-w-0 overflow-hidden rounded-md border bg-background p-0.5',
          variant === 'compact' ? 'w-fit max-w-full border-0 bg-background/60' : 'min-h-10',
        )}
      >
        {options.map(option => {
          const selected = selectedValue === option.value;

          return (
            <button
              key={option.label}
              type='button'
              role='radio'
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cx(
                'rounded px-2.5 py-1 text-sm font-medium transition-colors',
                variant === 'compact' ? 'text-xs' : 'min-h-8',
                selected
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const ExplorerRefInputRow = ({
  input,
  inputRef,
  issues = [],
  onChange,
  renderRefInput,
  variant = 'default',
  showInputArrow = false,
}: {
  input: unknown;
  inputRef: ExplorerOperationInputRefDescriptor;
  issues?: OperationValidationIssue[];
  onChange: (nextInput: unknown) => void;
  renderRefInput?: ExplorerOperationRefInputRenderer;
  variant?: ExplorerOperationExecutePanelVariant;
  showInputArrow?: boolean;
}) => {
  const issueId = useId();
  const issue = issues[0];
  const selectedLocator = getExplorerEntityRefInputLocator(input, inputRef);
  const selectedLocatorName = selectedLocator?.name ?? '';

  if (!selectedLocator) {
    return null;
  }

  const locatorSummary = `${formatLocatorName(selectedLocator.name)}${
    selectedLocator.sourceFields.length > 0 ? `(${selectedLocator.sourceFields.join(', ')})` : ''
  }`;
  const changeLocator = (locatorName: string) => {
    const nextLocator =
      inputRef.locators.find(locator => locator.name === locatorName) ?? selectedLocator;
    onChange(
      updateExplorerEntityRefInputDraft({
        input,
        inputRef,
        locatorName,
        sourceField: nextLocator.sourceFields[0] ?? '',
        value: '',
      }),
    );
  };
  const refControl = renderRefInput?.({
    input,
    inputRef,
    locator: selectedLocator,
    onChange,
    variant,
  }) ?? (
    <ExplorerEntityRefInput
      input={input}
      inputRef={inputRef}
      locator={selectedLocator}
      onChange={onChange}
      variant={variant}
    />
  );
  const locatorSelect = (
    <ExplorerSelect
      value={selectedLocatorName}
      onValueChange={changeLocator}
      options={inputRef.locators.map(locator => ({
        value: locator.name,
        label: formatLocatorName(locator.name),
      }))}
      triggerClassName='font-mono text-xs text-muted-foreground'
      placeholder='Locator'
      aria-label={`${inputRef.path} locator`}
    />
  );

  if (variant === 'compact') {
    return (
      <div
        className={cx(
          'grid min-h-10 grid-cols-[0.875rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-md bg-muted/25 px-3 py-1.5',
          issue && 'ring-1 ring-inset ring-destructive/45',
        )}
      >
        {showInputArrow ? (
          <ArrowRight className='size-3 text-primary' aria-hidden='true' />
        ) : (
          <span className='size-3' aria-hidden='true' />
        )}

        <div
          aria-describedby={issue ? issueId : undefined}
          aria-invalid={Boolean(issue)}
          aria-required={!inputRef.optional}
        >
          {refControl}
        </div>

        <span className='shrink-0 text-sm text-muted-foreground'>{inputRef.entityName}</span>
        {issue ? (
          <p id={issueId} className='col-start-2 col-end-4 text-xs text-destructive'>
            {issue.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className='grid gap-2 py-3 md:grid-cols-[minmax(120px,180px)_minmax(0,1fr)_auto] md:items-center'>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-mono text-sm font-semibold text-foreground'>{inputRef.path}</span>
          {inputRef.optional ? (
            <span className='text-xs text-muted-foreground'>optional</span>
          ) : null}
        </div>
        <div className='mt-1 truncate text-xs text-muted-foreground'>
          {inputRef.entityName} · {locatorSummary}
        </div>
      </div>

      <div className='grid gap-1' aria-describedby={issue ? issueId : undefined}>
        <div aria-invalid={Boolean(issue)} aria-required={!inputRef.optional}>
          {refControl}
        </div>
        {issue ? (
          <p id={issueId} className='text-xs text-destructive'>
            {issue.message}
          </p>
        ) : null}
      </div>

      <div className='w-full md:w-32'>{locatorSelect}</div>
    </div>
  );
};

const ExplorerScalarInputRow = ({
  input,
  field,
  issues = [],
  onChange,
  variant = 'default',
  showInputArrow = false,
}: {
  input: unknown;
  field: ExplorerSchemaField;
  issues?: OperationValidationIssue[];
  onChange: (nextInput: unknown) => void;
  variant?: ExplorerOperationExecutePanelVariant;
  showInputArrow?: boolean;
}) => {
  const issueId = useId();
  const issue = issues[0];
  const value = getExplorerInputFieldDraftValue(input, field.path);
  const updateValue = (nextValue: unknown) =>
    onChange(
      updateExplorerInputFieldDraft({
        input,
        path: field.path,
        value: nextValue,
      }),
    );
  const enumValues = field.enumValues ?? [];
  const enumOptions = [
    ...(!field.required
      ? [
          {
            value: EXPLORER_UNSET_SELECT_VALUE,
            label: 'optional',
          },
        ]
      : []),
    ...enumValues.map(enumValue => ({
      value: enumValue,
      label: enumValue,
    })),
  ];
  const enumSelectValue =
    typeof value === 'string' && enumValues.includes(value)
      ? value
      : field.required
        ? ''
        : EXPLORER_UNSET_SELECT_VALUE;
  const enumControl = (
    <ExplorerSelect
      value={enumSelectValue}
      onValueChange={nextValue =>
        updateValue(nextValue === EXPLORER_UNSET_SELECT_VALUE ? null : nextValue)
      }
      options={enumOptions}
      placeholder={variant === 'compact' ? field.path : field.type}
      triggerClassName={cx(
        'justify-between',
        variant === 'compact'
          ? 'h-8 min-h-8 border-0 bg-transparent px-0 text-sm font-medium text-foreground shadow-none hover:bg-transparent'
          : 'h-10 min-h-10 bg-background',
      )}
      aria-describedby={issue ? issueId : undefined}
      aria-invalid={Boolean(issue)}
      aria-label={field.path}
      required={field.required}
    />
  );
  const selectionControl = field.selection ? (
    <ExplorerSelectionInput
      field={{ ...field, selection: field.selection }}
      value={value}
      onChange={updateValue}
    />
  ) : null;
  const control = isSelectionInputField(field) ? (
    selectionControl
  ) : isEnumInputField(field) ? (
    enumControl
  ) : isBooleanInputField(field) ? (
    <ExplorerBooleanChoice field={field} value={value} onChange={updateValue} variant='default' />
  ) : isStructuredInputField(field) ? (
    <textarea
      value={formatInputFieldControlValue(value)}
      onChange={event => updateValue(parseInputFieldControlValue(field, event.target.value))}
      placeholder={field.required ? field.type : 'optional'}
      rows={variant === 'compact' ? 2 : 3}
      aria-describedby={issue ? issueId : undefined}
      aria-invalid={Boolean(issue)}
      required={field.required}
      className='min-h-20 rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-primary aria-[invalid=true]:border-destructive'
    />
  ) : (
    <input
      type={isNumberInputField(field) ? 'number' : 'text'}
      inputMode={isNumberInputField(field) ? 'numeric' : undefined}
      step={field.type.toLowerCase().includes('integer') ? 1 : undefined}
      value={formatInputFieldControlValue(value)}
      onChange={event => updateValue(parseInputFieldControlValue(field, event.target.value))}
      placeholder={field.required ? field.type : 'optional'}
      aria-describedby={issue ? issueId : undefined}
      aria-invalid={Boolean(issue)}
      required={field.required}
      className='min-h-10 rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-primary aria-[invalid=true]:border-destructive'
    />
  );
  const compactControl = isSelectionInputField(field) ? (
    selectionControl
  ) : isEnumInputField(field) ? (
    enumControl
  ) : isBooleanInputField(field) ? (
    <ExplorerBooleanChoice
      field={field}
      value={value}
      onChange={updateValue}
      variant='compact'
      showFieldLabel
    />
  ) : isStructuredInputField(field) ? (
    <textarea
      value={formatInputFieldControlValue(value)}
      onChange={event => updateValue(parseInputFieldControlValue(field, event.target.value))}
      placeholder={field.path}
      rows={1}
      aria-describedby={issue ? issueId : undefined}
      aria-invalid={Boolean(issue)}
      required={field.required}
      className='min-h-8 resize-none bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-foreground/80'
    />
  ) : (
    <input
      type={isNumberInputField(field) ? 'number' : 'text'}
      inputMode={isNumberInputField(field) ? 'numeric' : undefined}
      step={field.type.toLowerCase().includes('integer') ? 1 : undefined}
      value={formatInputFieldControlValue(value)}
      onChange={event => updateValue(parseInputFieldControlValue(field, event.target.value))}
      placeholder={field.path}
      aria-describedby={issue ? issueId : undefined}
      aria-invalid={Boolean(issue)}
      required={field.required}
      className='min-h-8 min-w-0 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-foreground/80'
    />
  );

  if (variant === 'compact') {
    return (
      <div
        className={cx(
          'grid min-h-10 grid-cols-[0.875rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-md bg-muted/25 px-3 py-1.5',
          issue && 'ring-1 ring-inset ring-destructive/45',
        )}
      >
        {showInputArrow ? (
          <ArrowRight className='size-3 text-primary' aria-hidden='true' />
        ) : (
          <span className='size-3' aria-hidden='true' />
        )}

        <div className='min-w-0'>{compactControl}</div>
        <span className='shrink-0 text-sm text-muted-foreground'>
          {getCompactInputTypeLabel(field)}
        </span>
        {issue ? (
          <p id={issueId} className='col-start-2 col-end-4 text-xs text-destructive'>
            {issue.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className='grid gap-2 py-3 md:grid-cols-[minmax(120px,180px)_minmax(0,1fr)_auto] md:items-center'>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-mono text-sm font-semibold text-foreground'>{field.path}</span>
          {!field.required ? <span className='text-xs text-muted-foreground'>optional</span> : null}
        </div>
        <div className='mt-1 truncate text-xs text-muted-foreground'>{field.type}</div>
      </div>

      <div className='grid gap-1'>
        {control}
        {issue ? (
          <p id={issueId} className='text-xs text-destructive'>
            {issue.message}
          </p>
        ) : null}
      </div>

      <div className='hidden md:block' />
    </div>
  );
};

const ExplorerOperationInputForm = ({
  operation,
  executor,
  renderRefInput,
  variant = 'default',
}: {
  operation: ExplorerOperationDescriptor;
  executor: ReturnType<typeof useExplorerOperationExecutor>;
  renderRefInput?: ExplorerOperationRefInputRenderer;
  variant?: ExplorerOperationExecutePanelVariant;
}) => {
  const inputRefs = operation.inputRefs?.filter(inputRef => inputRef.locators.length > 0) ?? [];
  const scalarFields = getExplorerOperationScalarInputFields(operation);
  const hasInputFields = inputRefs.length > 0 || scalarFields.length > 0;

  if (!hasInputFields) {
    return null;
  }

  const input = getEditableInputValue(operation, executor.parsedInputPreview);
  const issuesForPath = (path: string) =>
    executor.validationIssues.filter(
      issue => issue.path === path || issue.path?.startsWith(`${path}.`),
    );

  return (
    <section
      className={cx(
        'grid rounded-lg',
        variant === 'compact' ? 'gap-1' : 'gap-1 bg-muted/20 px-3 py-1',
      )}
    >
      {!executor.parsedInputPreview.ok ? (
        <p className='rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive'>
          The input text is invalid, so these controls will start from the operation draft.
        </p>
      ) : null}

      <div className={cx(variant === 'compact' ? 'grid gap-1' : 'divide-y')}>
        {inputRefs.map((inputRef, index) => (
          <ExplorerRefInputRow
            key={inputRef.path}
            input={input}
            inputRef={inputRef}
            issues={issuesForPath(inputRef.path)}
            onChange={executor.setInputValue}
            renderRefInput={renderRefInput}
            variant={variant}
            showInputArrow={index === 0}
          />
        ))}
        {scalarFields.map((field, index) => (
          <ExplorerScalarInputRow
            key={field.path}
            input={input}
            field={field}
            issues={issuesForPath(field.path)}
            onChange={executor.setInputValue}
            variant={variant}
            showInputArrow={inputRefs.length === 0 && index === 0}
          />
        ))}
      </div>
      {executor.localValidationIssues.length > 0 ? (
        <p className='px-1 py-2 text-xs text-destructive' role='status'>
          Complete the required operation inputs before running.
        </p>
      ) : null}
    </section>
  );
};

const ExplorerJsonInputInspector = ({
  operation,
  executor,
  theme,
}: {
  operation: ExplorerOperationDescriptor;
  executor: ReturnType<typeof useExplorerOperationExecutor>;
  theme?: ExplorerThemePreference;
}) => {
  const [isOpen, setIsOpen] = useState(!executor.parsedInputPreview.ok);

  useEffect(() => {
    if (!executor.parsedInputPreview.ok) {
      setIsOpen(true);
    }
  }, [executor.parsedInputPreview.ok]);

  return (
    <details
      open={isOpen}
      onToggle={event => setIsOpen(event.currentTarget.open || !executor.parsedInputPreview.ok)}
      className='overflow-hidden rounded-md border bg-background'
    >
      <summary className='flex min-h-10 cursor-pointer items-center justify-between gap-3 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
        <span>{executor.inputSyntax === 'expression' ? 'Input expression' : 'JSON input'}</span>
        <span>{executor.parsedInputPreview.ok ? 'inspect / edit' : 'invalid'}</span>
      </summary>
      {isOpen ? (
        <ExplorerJsonEditor
          label='Input'
          value={executor.inputJson}
          onChange={executor.setInputJson}
          language={executor.inputSyntax === 'expression' ? 'typescript' : 'json'}
          path={`explorer://${operation.id}/input.${
            executor.inputSyntax === 'expression' ? 'ts' : 'json'
          }`}
          className='rounded-none border-0 border-t'
          showHeader={false}
          theme={theme}
        />
      ) : null}
    </details>
  );
};

const getInvocationErrorPresentation = (invocation?: OperationInvocationResult) => {
  switch (invocation?.kind) {
    case 'input_invalid':
      return { title: 'Invalid input', execution: 'Not executed' };
    case 'rejected':
      return { title: 'Operation rejected', execution: 'Not executed' };
    case 'failed':
      return { title: 'Operation failed', execution: 'Executed' };
    case 'errored':
      return { title: 'Runtime error', execution: 'Execution uncertain' };
    default:
      return { title: 'Execution error', execution: undefined };
  }
};

const ExplorerOperationErrorFeedback = ({
  error,
  invocation,
  operation,
  permission,
  runtimeResult,
  theme,
}: {
  error: string;
  invocation?: OperationInvocationResult;
  operation: ExplorerOperationDescriptor;
  permission?: unknown;
  runtimeResult?: unknown;
  theme?: ExplorerThemePreference;
}) => {
  const presentation = getInvocationErrorPresentation(invocation);

  return (
    <section className='grid gap-3 rounded-lg border border-destructive/35 bg-destructive/5 p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h5 className='text-xs font-semibold uppercase tracking-wide text-destructive'>
          {presentation.title}
        </h5>
        {presentation.execution ? (
          <span className='rounded-md border border-destructive/30 px-2 py-1 text-xs text-muted-foreground'>
            {presentation.execution}
          </span>
        ) : null}
      </div>
      <p className='text-sm text-destructive'>{error}</p>

      {invocation?.kind === 'input_invalid' && invocation.issues.length > 0 ? (
        <ul className='grid gap-2' aria-label='Input validation issues'>
          {invocation.issues.map((issue, index) => (
            <li
              key={`${issue.path ?? 'input'}-${issue.code ?? 'invalid'}-${index}`}
              className='rounded-md border border-destructive/25 bg-background/75 px-3 py-2 text-sm'
            >
              <div className='flex flex-wrap items-baseline gap-2'>
                <span className='font-mono font-semibold text-foreground'>
                  {issue.path ?? 'input'}
                </span>
                {issue.code ? (
                  <span className='text-xs text-muted-foreground'>{issue.code}</span>
                ) : null}
              </div>
              <p className='mt-1 text-destructive'>{issue.message}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {invocation?.kind === 'rejected' ? (
        <p className='text-xs text-muted-foreground'>Reason: {invocation.reason}</p>
      ) : null}
      {invocation?.kind === 'errored' && invocation.errorType ? (
        <p className='text-xs text-muted-foreground'>Error type: {invocation.errorType}</p>
      ) : null}

      {invocation ? (
        <ExplorerCollapsibleSection title='Raw operation result' defaultOpen={false}>
          <ExplorerJsonEditor
            label='Operation Result'
            value={formatJsonValue(invocation)}
            path={`explorer://${operation.id}/operation-result.json`}
            height='220px'
            readOnly
            theme={theme}
          />
        </ExplorerCollapsibleSection>
      ) : null}
      {permission ? (
        <ExplorerCollapsibleSection title='Permission detail' defaultOpen={false}>
          <ExplorerJsonEditor
            label='Permission'
            value={formatJsonValue(permission)}
            path={`explorer://${operation.id}/permission.json`}
            height='180px'
            readOnly
            theme={theme}
          />
        </ExplorerCollapsibleSection>
      ) : null}
      {runtimeResult ? (
        <ExplorerCollapsibleSection title='Runtime result' defaultOpen={false}>
          <ExplorerJsonEditor
            label='Runtime Result'
            value={formatJsonValue(runtimeResult)}
            path={`explorer://${operation.id}/runtime-result.json`}
            height='220px'
            readOnly
            theme={theme}
          />
        </ExplorerCollapsibleSection>
      ) : null}
    </section>
  );
};

export function ExplorerOperationExecutePanel({
  className,
  operation,
  renderRefInput,
  theme,
  variant = 'default',
}: ExplorerOperationExecutePanelProps) {
  const executor = useExplorerOperationExecutor({ operation });

  return (
    <div className={cx('grid gap-4', className)}>
      {executor.executable ? (
        <>
          <ExplorerOperationInputForm
            operation={operation}
            executor={executor}
            renderRefInput={renderRefInput}
            variant={variant}
          />
          <ExplorerJsonInputInspector operation={operation} executor={executor} theme={theme} />
          {!executor.parsedInputPreview.ok ? (
            <p className='text-sm text-destructive'>{executor.parsedInputPreview.error}</p>
          ) : null}
          {executor.destructive ? (
            <label className='flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-foreground'>
              <input
                type='checkbox'
                checked={executor.confirmed}
                onChange={event => executor.setConfirmed(event.target.checked)}
                className='mt-0.5'
              />
              <span>
                I understand this operation can delete or remove data. The operation input may also
                require its own confirmation field.
              </span>
            </label>
          ) : null}
          <div className='flex flex-wrap gap-2'>
            <button
              type='button'
              onClick={() => void executor.execute()}
              disabled={!executor.canExecute || !executor.parsedInputPreview.ok}
              className='inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50'
            >
              <Play className='size-4' />
              {executor.state.status === 'running'
                ? operation.kind === 'durable'
                  ? 'Starting'
                  : 'Running'
                : operation.kind === 'durable'
                  ? 'Start'
                  : 'Run'}
            </button>
            <button
              type='button'
              onClick={executor.resetInput}
              className='inline-flex min-h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent'
            >
              <RotateCcw className='size-4' />
              Reset input
            </button>
          </div>

          {executor.state.status === 'success' && operation.kind === 'durable' ? (
            isExplorerTaskRunRef(executor.state.result) ? (
              <ExplorerDurableOperationRun
                operation={operation}
                runRef={executor.state.result}
                theme={theme}
              />
            ) : (
              <div className='grid gap-2'>
                <h5 className='text-xs font-semibold uppercase tracking-wide text-destructive'>
                  Durable contract violation
                </h5>
                <p className='text-sm text-destructive'>
                  This durable operation did not return a task run reference.
                </p>
                <ExplorerJsonEditor
                  label='Unexpected Result'
                  value={formatJsonValue(executor.state.result)}
                  path={`explorer://${operation.id}/unexpected-result.json`}
                  height='220px'
                  readOnly
                  theme={theme}
                />
              </div>
            )
          ) : null}

          {executor.state.status === 'success' && operation.kind !== 'durable' ? (
            <div className='grid gap-2'>
              <h5 className='text-xs font-semibold uppercase tracking-wide text-primary'>
                Result value
              </h5>
              <ExplorerJsonEditor
                label='Result Value'
                value={formatJsonValue(executor.state.result)}
                path={`explorer://${operation.id}/result.json`}
                height='320px'
                readOnly
                theme={theme}
              />
              {executor.state.runtimeResult ? (
                <ExplorerCollapsibleSection title='Runtime result' defaultOpen={false}>
                  <ExplorerJsonEditor
                    label='Runtime Result'
                    value={formatJsonValue(executor.state.runtimeResult)}
                    path={`explorer://${operation.id}/runtime-result.json`}
                    height='220px'
                    readOnly
                    theme={theme}
                  />
                </ExplorerCollapsibleSection>
              ) : null}
            </div>
          ) : null}

          {executor.state.status === 'error' ? (
            <ExplorerOperationErrorFeedback
              error={executor.state.error}
              invocation={executor.state.invocation}
              operation={operation}
              permission={executor.state.permission}
              runtimeResult={executor.state.runtimeResult}
              theme={theme}
            />
          ) : null}
        </>
      ) : (
        <p className='rounded-md bg-muted/35 px-3 py-2 text-sm text-muted-foreground'>
          Execution is not available for this operation yet.
        </p>
      )}
    </div>
  );
}
