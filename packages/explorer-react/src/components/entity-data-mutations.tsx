'use client';

import type { AnyEntityRef, EntityMutationCommand } from '@ontahi/core/data-graph';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import type { ExplorerEntityDetail } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

export type ExplorerEntityMutationRunner = (command: EntityMutationCommand) => Promise<unknown>;

const mutationErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'The mutation could not be applied.';

const mutationControlStyles = {
  cell: {
    backgroundColor: 'transparent',
    border: 0,
    color: 'hsl(var(--foreground, 150 23% 11%))',
  },
  primary: {
    backgroundColor: 'hsl(var(--primary, 154 43% 28%))',
    border: 0,
    color: 'hsl(var(--primary-foreground, 0 0% 100%))',
  },
  secondary: {
    backgroundColor: 'hsl(var(--card, 0 0% 100%))',
    border: '1px solid hsl(var(--border, 137 14% 82%))',
    color: 'hsl(var(--foreground, 150 23% 11%))',
  },
  destructive: {
    backgroundColor: 'hsl(var(--destructive, 4 50% 42%))',
    border: 0,
    color: 'white',
  },
} satisfies Record<string, CSSProperties>;

const parseDraftValue = (field: ExplorerEntityDetail['fields'][number], draft: string): unknown => {
  if (field.nullable && draft === '') return null;
  if (field.type === 'boolean') return draft === 'true';
  if (['integer', 'int'].includes(field.type)) return Number.parseInt(draft, 10);
  if (['number', 'float', 'double'].includes(field.type)) return Number.parseFloat(draft);
  return draft;
};

const createDrafts = (fields: ExplorerEntityDetail['fields']) =>
  Object.fromEntries(
    fields.map(field => [
      field.name,
      field.type === 'boolean' ? 'false' : field.enumValues?.[0] ? String(field.enumValues[0]) : '',
    ]),
  );

const isGeneratedIdentityField = (
  entity: ExplorerEntityDetail,
  field: ExplorerEntityDetail['fields'][number],
) =>
  entity.identity?.fields.length === 1 &&
  entity.identity.fields[0] === field.name &&
  field.name === 'id';

const parseCreateDraftValue = (
  field: ExplorerEntityDetail['fields'][number],
  draft: string,
): unknown => {
  if (!field.reference) return parseDraftValue(field, draft);
  if (field.nullable && draft === '') return null;

  const identityField = field.reference.identity?.fields[0];
  if (identityField && field.reference.identity?.fields.length === 1) {
    return {
      kind: 'entity-ref',
      entityName: field.reference.entityName,
      locator: { [identityField]: draft },
    };
  }

  return JSON.parse(draft) as unknown;
};

const MutationValueInput = ({
  autoFocus = true,
  draft,
  field,
  label = `Edit ${field.name}`,
  onChange,
  onKeyDown,
}: {
  autoFocus?: boolean;
  draft: string;
  field: ExplorerEntityDetail['fields'][number];
  label?: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) => {
  const options =
    field.type === 'boolean' ? ['true', 'false'] : field.enumValues ? [...field.enumValues] : [];

  return options.length > 0 ? (
    <select
      autoFocus={autoFocus}
      value={draft}
      onChange={event => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      aria-label={label}
      className='min-h-8 min-w-28 rounded-md border bg-background px-2 text-xs outline-none focus:border-primary'
    >
      {field.nullable ? <option value=''>null</option> : null}
      {options.map(option => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  ) : (
    <input
      autoFocus={autoFocus}
      value={draft}
      type={
        ['integer', 'int', 'number', 'float', 'double'].includes(field.type) ? 'number' : 'text'
      }
      onChange={event => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      aria-label={label}
      className='min-h-8 min-w-28 rounded-md border bg-background px-2 font-mono text-xs outline-none focus:border-primary'
    />
  );
};

export const ExplorerEntityCreateButton = ({
  entity,
  onApplied,
  runMutation,
}: {
  entity: ExplorerEntityDetail;
  onApplied: () => Promise<unknown>;
  runMutation: ExplorerEntityMutationRunner;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const createFields = (entity.mutations?.create?.fields ?? [])
    .map(fieldName => entity.fields.find(field => field.name === fieldName))
    .filter((field): field is ExplorerEntityDetail['fields'][number] => Boolean(field));
  const inputFields = createFields.filter(field => !isGeneratedIdentityField(entity, field));
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState(() => createDrafts(inputFields));
  const [error, setError] = useState<string>();
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    setOpen(false);
    setDrafts(createDrafts(inputFields));
    setError(undefined);
  }, [entity.name]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);

    const missingField = inputFields.find(
      field => !field.nullable && field.type !== 'boolean' && !drafts[field.name]?.trim(),
    );
    if (missingField) {
      setError(`${missingField.name} is required.`);
      return;
    }

    setIsCreating(true);
    try {
      const values = Object.fromEntries(
        createFields.map(field => [
          field.name,
          isGeneratedIdentityField(entity, field)
            ? globalThis.crypto.randomUUID()
            : parseCreateDraftValue(field, drafts[field.name] ?? ''),
        ]),
      );
      await runMutation({
        kind: 'entity-mutation-command',
        action: 'create',
        entityName: entity.name,
        values,
      });
      await onApplied();
      setDrafts(createDrafts(inputFields));
      setOpen(false);
    } catch (caught) {
      setError(mutationErrorMessage(caught));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div ref={rootRef} className='relative ml-auto'>
      <button
        type='button'
        onClick={() => {
          setError(undefined);
          setOpen(current => !current);
        }}
        aria-expanded={open}
        className='inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
      >
        <Plus className='size-4' />
        New {entity.name}
      </button>

      {open ? (
        <form
          onSubmit={create}
          className='absolute right-0 top-[calc(100%+0.5rem)] z-50 grid w-[min(22rem,calc(100vw-2rem))] gap-4 rounded-2xl border bg-popover p-4 text-popover-foreground shadow-xl'
          aria-label={`Create ${entity.name}`}
        >
          <div className='flex items-center justify-between gap-3'>
            <strong className='text-sm'>New {entity.name}</strong>
            <button
              type='button'
              onClick={() => setOpen(false)}
              className='inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground'
              aria-label='Close create form'
            >
              <X className='size-4' />
            </button>
          </div>

          <div className='grid gap-3'>
            {inputFields.map((field, index) => (
              <label key={field.name} className='grid gap-1.5 text-xs font-medium'>
                <span>
                  {field.name}
                  {field.nullable ? (
                    <span className='ml-1 font-normal text-muted-foreground'>optional</span>
                  ) : null}
                </span>
                <MutationValueInput
                  autoFocus={index === 0}
                  draft={drafts[field.name] ?? ''}
                  field={field}
                  label={`Create ${field.name}`}
                  onChange={value => setDrafts(current => ({ ...current, [field.name]: value }))}
                  onKeyDown={() => undefined}
                />
              </label>
            ))}
          </div>

          {error ? <p className='text-xs text-destructive'>{error}</p> : null}
          <button
            type='submit'
            disabled={isCreating}
            className='inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50'
          >
            {isCreating ? 'Creating…' : `Create ${entity.name}`}
          </button>
        </form>
      ) : null}
    </div>
  );
};

export const ExplorerEditableEntityCell = ({
  children,
  entityName,
  field,
  onApplied,
  runMutation,
  target,
  value,
}: {
  children: ReactNode;
  entityName: string;
  field: ExplorerEntityDetail['fields'][number];
  onApplied: () => Promise<unknown>;
  runMutation: ExplorerEntityMutationRunner;
  target: AnyEntityRef;
  value: unknown;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => (value == null ? '' : String(value)));
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value == null ? '' : String(value));
  }, [editing, value]);

  const cancel = () => {
    setDraft(value == null ? '' : String(value));
    setError(undefined);
    setEditing(false);
  };
  const save = async () => {
    setIsSaving(true);
    setError(undefined);
    try {
      await runMutation({
        kind: 'entity-mutation-command',
        action: 'update',
        entityName,
        target,
        values: { [field.name]: parseDraftValue(field, draft) },
      });
      await onApplied();
      setEditing(false);
    } catch (caught) {
      setError(mutationErrorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') cancel();
    if (event.key === 'Enter') {
      event.preventDefault();
      void save();
    }
  };

  if (!editing) {
    const colorSwatch =
      typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value)
        ? value
        : undefined;

    return (
      <button
        type='button'
        onClick={() => setEditing(true)}
        aria-label={`Edit ${field.name}`}
        title={`Edit ${field.name}`}
        style={mutationControlStyles.cell}
        className={cx(
          'group -mx-2 inline-flex max-w-full items-center gap-2 rounded-md bg-transparent px-2 py-1 text-left text-foreground',
          'transition-colors hover:bg-accent/70 hover:text-accent-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        )}
      >
        {colorSwatch ? (
          <span
            aria-hidden='true'
            className='size-3 shrink-0 rounded-full border border-black/10 shadow-sm'
            style={{ backgroundColor: colorSwatch }}
          />
        ) : null}
        <span className='truncate'>{children}</span>
        <Pencil
          className='size-3.5 shrink-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'
          style={{ color: 'hsl(var(--muted-foreground, 145 9% 43%))', opacity: 0.72 }}
        />
      </button>
    );
  }

  return (
    <div className='grid min-w-48 gap-1.5'>
      <div className='flex items-center gap-1.5'>
        <MutationValueInput
          draft={draft}
          field={field}
          onChange={setDraft}
          onKeyDown={handleKeyDown}
        />
        <button
          type='button'
          onClick={() => void save()}
          disabled={isSaving}
          aria-label={`Save ${field.name}`}
          title={`Save ${field.name}`}
          style={mutationControlStyles.primary}
          className='inline-flex min-h-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium disabled:opacity-50'
        >
          <Check className='size-4' />
          <span>Save</span>
        </button>
        <button
          type='button'
          onClick={cancel}
          disabled={isSaving}
          aria-label={`Cancel ${field.name}`}
          title={`Cancel ${field.name}`}
          style={mutationControlStyles.secondary}
          className='inline-flex min-h-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium disabled:opacity-50'
        >
          <X className='size-4' />
          <span>Cancel</span>
        </button>
      </div>
      {error ? <span className='text-xs text-destructive'>{error}</span> : null}
    </div>
  );
};

export const ExplorerEntityDeleteButton = ({
  entityName,
  onApplied,
  runMutation,
  target,
}: {
  entityName: string;
  onApplied: () => Promise<unknown>;
  runMutation: ExplorerEntityMutationRunner;
  target: AnyEntityRef;
}) => {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [isDeleting, setIsDeleting] = useState(false);

  const remove = async () => {
    setIsDeleting(true);
    setError(undefined);
    try {
      await runMutation({
        kind: 'entity-mutation-command',
        action: 'delete',
        entityName,
        target,
      });
      await onApplied();
    } catch (caught) {
      setError(mutationErrorMessage(caught));
      setConfirming(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className='grid justify-items-start gap-1'>
      {confirming ? (
        <div className='inline-flex items-center gap-1 rounded-lg border border-destructive/20 bg-destructive/5 p-1'>
          <button
            type='button'
            onClick={() => void remove()}
            disabled={isDeleting}
            style={mutationControlStyles.destructive}
            className='inline-flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-xs font-medium text-white disabled:opacity-50'
          >
            <Trash2 className='size-3' />
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
          <button
            type='button'
            onClick={() => setConfirming(false)}
            disabled={isDeleting}
            style={mutationControlStyles.secondary}
            className='rounded-md bg-transparent px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-card hover:text-foreground'
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type='button'
          onClick={() => setConfirming(true)}
          aria-label='Delete row'
          title='Delete row'
          style={mutationControlStyles.cell}
          className={cx(
            'inline-flex size-8 items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground',
            'transition-colors hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30',
          )}
        >
          <Trash2 className='size-4' />
        </button>
      )}
      {error ? <span className='max-w-48 text-xs text-destructive'>{error}</span> : null}
    </div>
  );
};
