import type {
  ReflectedEntityDataReader,
  ReflectedOperationInvoker,
  ReflectedRelatedEntityDataReader,
} from '@ontahi/core/data-graph';
import { OntahiGraphProvider, type ReactGraphExecutor } from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { CSSProperties, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ExplorerEntityDetail,
  ExplorerOperationDescriptor,
  ExplorerSchemaDescriptor,
  ExplorerTaskDescriptor,
} from '../contracts/index.js';

import { ExplorerEntityActions } from './entity-actions.js';
import {
  ExplorerEditableEntityCell,
  ExplorerEntityCreateButton,
  ExplorerEntityDeleteButton,
} from './entity-data-mutations.js';

import { ExplorerEntityBrowser, ExplorerEntityDataPanel, ExplorerProvider } from './index.js';

const emptySchema: ExplorerSchemaDescriptor = {
  source: 'unknown',
  summary: 'unknown',
  fields: [],
};

const entities: ExplorerEntityDetail[] = [
  {
    name: 'Book',
    fieldCount: 2,
    relationCount: 1,
    graphOperationCount: 1,
    domainOperationCount: 0,
    durableOperationCount: 0,
    taskCount: 1,
    exposure: 'public',
    diagram: 'graph TD; Book-->Profile;',
    fields: [
      {
        name: 'id',
        type: 'uuid',
        nullable: false,
      },
      {
        name: 'title',
        type: 'text',
        nullable: true,
      },
    ],
    relations: [
      {
        name: 'owner',
        kind: 'belongsTo',
        target: 'Profile',
      },
    ],
  },
  {
    name: 'Profile',
    fieldCount: 1,
    relationCount: 0,
    graphOperationCount: 0,
    domainOperationCount: 0,
    durableOperationCount: 0,
    taskCount: 0,
    diagram: 'graph TD; Profile;',
    fields: [
      {
        name: 'id',
        type: 'uuid',
        nullable: false,
      },
    ],
    relations: [],
  },
];

const relationEntity: ExplorerEntityDetail = {
  ...entities[1]!,
  name: 'BookToProfile',
  relationOwner: {
    source: 'Book',
    name: 'owner',
    cardinality: 'one',
    target: 'Profile',
  },
};

const operation: ExplorerOperationDescriptor = {
  id: 'Book.getSharingInfo',
  entityName: 'Book',
  name: 'getSharingInfo',
  kind: 'graph',
  authority: 'server',
  exposure: 'internal',
  description: 'Return sharing data.',
  inputSchema: {
    source: 'ontahi',
    summary: 'object',
    fields: [
      {
        path: 'bookSlug',
        type: 'string',
        required: true,
      },
    ],
  },
  resultSchema: emptySchema,
};

const task: ExplorerTaskDescriptor = {
  id: 'book.import',
  entityName: 'Book',
  name: 'importBook',
  inputSchema: emptySchema,
  progressSchema: emptySchema,
  resultSchema: emptySchema,
  steps: [
    {
      id: 'extract',
      inputSchema: emptySchema,
      resultSchema: emptySchema,
    },
  ],
};

beforeEach(() => {
  globalThis.history.replaceState(null, '', '/');
});

afterEach(cleanup);

const withReflectedEntityDataReader = ({
  children,
  readEntityData = vi.fn().mockResolvedValue({
    entityName: 'Book',
    columns: [
      {
        field: 'title',
        type: 'string',
        nullable: false,
      },
    ],
    rows: [
      {
        title: 'Ontahi',
      },
    ],
    page: 1,
    pageSize: 25,
    totalCount: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  }),
  readRelatedEntityData,
  reflectedOperationInvoker,
  graphExecutor,
}: {
  children: ReactNode;
  readEntityData?: ReflectedEntityDataReader['readEntityData'];
  readRelatedEntityData?: ReflectedRelatedEntityDataReader['readRelatedEntityData'];
  reflectedOperationInvoker?: ReflectedOperationInvoker;
  graphExecutor?: ReactGraphExecutor;
}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <OntahiGraphProvider
        runtime={{ name: 'test-runtime' }}
        graphExecutor={graphExecutor}
        reflectedEntityDataReader={{ readEntityData }}
        reflectedRelatedEntityDataReader={
          readRelatedEntityData ? { readRelatedEntityData } : undefined
        }
        reflectedOperationInvoker={reflectedOperationInvoker}
      >
        {children}
      </OntahiGraphProvider>
    </QueryClientProvider>
  );
};

describe('ExplorerEntityBrowser', () => {
  it('renders entity detail with package-owned routes and host panels', async () => {
    const user = userEvent.setup();

    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerEntityBrowser
          entities={entities}
          operations={[operation]}
          tasks={[task]}
          selectedEntityName='Book'
          selectedTab='operations'
          renderDataPanel={({ entity }) => <div data-testid='data-panel'>data {entity.name}</div>}
          renderDiagram={diagram => <pre data-testid='diagram'>{diagram}</pre>}
          renderExecutePanel={({ operation: selectedOperation }) => (
            <div data-testid='execute-panel'>execute {selectedOperation.id}</div>
          )}
        />
      </ExplorerProvider>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Select entity, Book' }));
    const hrefs = screen.getAllByRole('option').map(option => option.getAttribute('href'));

    expect(screen.queryByRole('heading', { name: 'Explore your data' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Select entity, Book' })).toBeTruthy();
    expect(screen.getByText('Get Sharing Info')).toBeTruthy();
    expect(screen.getByText('Import Book')).toBeTruthy();
    expect(screen.getByTestId('execute-panel').textContent).toBe('execute Book.getSharingInfo');
    expect(hrefs).toContain('/internal/graph/entities/Book');
    expect(hrefs).toContain('/internal/graph/entities/Profile');
    expect(screen.queryByText('2 fields')).toBeNull();
  });

  it('keeps instance browsing primary across local entity navigation', async () => {
    const user = userEvent.setup();

    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerEntityBrowser
          entities={entities}
          operations={[operation]}
          tasks={[task]}
          selectedEntityName='Book'
          renderDataPanel={({ entity }) => <div data-testid='data-panel'>data {entity.name}</div>}
        />
      </ExplorerProvider>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Select entity, Book' }));
    await user.click(screen.getByRole('option', { name: /Profile/ }));

    expect(screen.getByRole('combobox', { name: 'Select entity, Profile' })).toBeTruthy();
    expect(screen.getByTestId('data-panel').textContent).toBe('data Profile');
    expect(globalThis.location.pathname).toBe('/internal/graph/entities/Profile');
    expect(globalThis.location.search).toBe('');

    await user.click(screen.getByRole('button', { name: 'Schema' }));

    expect(screen.getByText('Fields')).toBeTruthy();
    expect(globalThis.location.search).toBe('?tab=structure');
  });

  it('keeps executable Entity actions inside the collection node instead of a section button', async () => {
    const user = userEvent.setup();
    const readEntityData = vi.fn().mockResolvedValue({
      entityName: 'Book',
      columns: [{ field: 'title', type: 'string', nullable: false }],
      rows: [{ title: 'Ontahi' }],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });
    const invokeOperation = vi.fn().mockResolvedValue({
      ok: true,
      kind: 'success',
      value: { refreshed: true },
    });
    const collectionOperation: ExplorerOperationDescriptor = {
      ...operation,
      id: 'Book.refreshCatalog',
      name: 'refreshCatalog',
      kind: 'domain',
      exposure: 'bridge',
      inputSchema: { source: 'ontahi', summary: 'object', fields: [] },
    };

    render(
      withReflectedEntityDataReader({
        readEntityData,
        reflectedOperationInvoker: { invokeOperation },
        children: (
          <ExplorerEntityBrowser
            entities={entities}
            operations={[collectionOperation]}
            tasks={[]}
            selectedEntityName='Book'
          />
        ),
      }),
    );

    expect(screen.queryByRole('button', { name: /^Actions$/ })).toBeNull();
    const actionsButton = screen.getByRole('button', { name: 'Actions for Book instances' });
    await user.click(actionsButton);
    expect(actionsButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Close actions' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(actionsButton.getAttribute('aria-expanded')).toBe('false');

    await user.click(actionsButton);
    await user.click(screen.getByRole('menuitem', { name: /^Refresh Catalog/ }));
    await user.click(screen.getByRole('button', { name: 'Close actions' }));
    expect(actionsButton.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();

    await user.click(actionsButton);
    await user.click(screen.getByRole('menuitem', { name: /^Refresh Catalog/ }));
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(invokeOperation).toHaveBeenCalledWith(
        expect.objectContaining({ operationId: 'Book.refreshCatalog', input: {} }),
      ),
    );
    await waitFor(() => expect(readEntityData.mock.calls.length).toBeGreaterThan(1));
  });

  it('shows a durable capability only as its reflected Task', async () => {
    const user = userEvent.setup();
    const durableOperation: ExplorerOperationDescriptor = {
      ...operation,
      id: 'Book.import',
      name: 'importBook',
      kind: 'durable',
      exposure: 'bridge',
      inputSchema: emptySchema,
      durable: {
        taskId: task.id,
        runtime: 'in-process',
        hasSubject: false,
        runRefSchema: emptySchema,
        progressSchema: emptySchema,
        finalOutputSchema: emptySchema,
      },
    };

    render(
      withReflectedEntityDataReader({
        reflectedOperationInvoker: {
          invokeOperation: vi.fn().mockResolvedValue({ ok: true, kind: 'success', value: {} }),
        },
        children: (
          <ExplorerEntityBrowser
            entities={entities}
            operations={[durableOperation]}
            tasks={[task]}
            selectedEntityName='Book'
          />
        ),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Actions for Book instances' }));
    const actionMenu = screen.getByRole('menu', { name: 'Actions for Book instances' });

    expect(within(actionMenu).getAllByText('Import Book')).toHaveLength(1);
    expect(within(actionMenu).getByRole('menuitem', { name: /Import Book\s*Task/ })).toBeTruthy();
  });

  it('moves, minimizes, and restores the Entity collection node', async () => {
    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerEntityBrowser
          entities={entities}
          operations={[]}
          tasks={[]}
          selectedEntityName='Book'
          renderDataPanel={({ entity }) => <div data-testid='data-panel'>data {entity.name}</div>}
        />
      </ExplorerProvider>,
    );

    const collection = screen.getByRole('region', { name: 'Book instances' });
    const position = collection.parentElement!;
    const header = collection.querySelector('header')!;
    Object.defineProperty(position, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 424,
        height: 400,
        left: 24,
        right: 920,
        top: 24,
        width: 896,
        x: 24,
        y: 24,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(header, { button: 0, clientX: 60, clientY: 50, pointerId: 5 });
    fireEvent.pointerMove(header, { clientX: 100, clientY: 100, pointerId: 5 });
    fireEvent.pointerUp(header, { clientX: 100, clientY: 100, pointerId: 5 });

    expect(position.style.left).toBe('64px');
    expect(position.style.top).toBe('74px');
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));

    fireEvent.click(screen.getByRole('button', { name: 'Minimize Book instances' }));
    expect(screen.queryByRole('region', { name: 'Book instances' })).toBeNull();
    let restore = screen.getByRole('button', { name: 'Restore Book instances' });
    Object.defineProperty(position, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 130,
        height: 56,
        left: 64,
        right: 352,
        top: 74,
        width: 288,
        x: 64,
        y: 74,
        toJSON: () => ({}),
      }),
    });
    fireEvent.pointerDown(restore, { button: 0, clientX: 80, clientY: 90, pointerId: 6 });
    fireEvent.pointerMove(restore, { clientX: 100, clientY: 110, pointerId: 6 });
    fireEvent.pointerUp(restore, { clientX: 100, clientY: 110, pointerId: 6 });

    expect(position.style.left).toBe('84px');
    expect(position.style.top).toBe('94px');
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));

    fireEvent.click(restore, { detail: 0 });
    let restored = screen.getByRole('region', { name: 'Book instances' });
    fireEvent.doubleClick(restored.querySelector('header')!);
    restore = screen.getByRole('button', { name: 'Restore Book instances' });

    fireEvent.doubleClick(restore);
    restored = screen.getByRole('region', { name: 'Book instances' });
    expect(restored.parentElement?.style.left).toBe('84px');
    expect(restored.parentElement?.style.top).toBe('94px');
    expect(screen.getByTestId('data-panel').textContent).toBe('data Book');
  });

  it('hides data when no host data panel is supplied or the entity is a relation owner', () => {
    const { rerender } = render(
      <ExplorerEntityBrowser
        entities={entities}
        operations={[]}
        tasks={[]}
        selectedEntityName='Book'
        selectedTab='data'
      />,
    );

    expect(screen.queryByRole('button', { name: 'Data' })).toBeNull();
    expect(screen.getByText('Fields')).toBeTruthy();

    rerender(
      <ExplorerEntityBrowser
        entities={[relationEntity]}
        operations={[]}
        tasks={[]}
        selectedEntityName='BookToProfile'
        selectedTab='data'
        renderDataPanel={({ entity }) => <div>data {entity.name}</div>}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Data' })).toBeNull();
    expect(screen.getByText('Relation Owner')).toBeTruthy();
  });

  it('renders the default data panel when a reflected entity data reader is registered', async () => {
    const readEntityData = vi.fn().mockResolvedValue({
      entityName: 'Book',
      columns: [
        {
          field: 'title',
          type: 'string',
          nullable: false,
        },
      ],
      rows: [
        {
          title: 'Ontahi',
        },
      ],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });

    render(
      withReflectedEntityDataReader({
        readEntityData,
        children: (
          <ExplorerEntityBrowser
            entities={entities}
            operations={[]}
            tasks={[]}
            selectedEntityName='Book'
          />
        ),
      }),
    );

    expect(await screen.findByText('Ontahi')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit title' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete row' })).toBeNull();
    expect(readEntityData).toHaveBeenCalledWith(
      expect.objectContaining({
        entityName: 'Book',
        page: 1,
        pageSize: 25,
      }),
    );
  });

  it('keeps the Entity data panel usable as a standalone public surface', async () => {
    const standaloneBook: ExplorerEntityDetail = {
      ...entities[0]!,
      identity: { name: 'refById', fields: ['id'] },
      mutations: {
        create: { fields: ['id', 'title'] },
        delete: true,
      },
    };
    const graphExecutor = {
      get: vi.fn(),
      run: vi.fn(),
      count: vi.fn(),
      runCommand: vi.fn(),
      runEntityMutationCommand: vi.fn(),
    } as unknown as ReactGraphExecutor;

    render(
      <ExplorerProvider basePath='/internal/graph'>
        {withReflectedEntityDataReader({
          graphExecutor,
          readEntityData: vi.fn().mockResolvedValue({
            entityName: 'Book',
            columns: [
              { field: 'id', type: 'id', nullable: false },
              { field: 'title', type: 'string', nullable: true },
            ],
            omittedColumns: [
              {
                column: 'legacy_notes',
                field: 'legacyNotes',
                reason: 'The legacy column is not queryable.',
              },
            ],
            rows: [{ id: 'book-1', title: 'Ontahi' }],
            page: 1,
            pageSize: 25,
            totalCount: 1,
            hasPreviousPage: false,
            hasNextPage: false,
          }),
          children: <ExplorerEntityDataPanel entity={standaloneBook} />,
        })}
      </ExplorerProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Data' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New Book' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Delete row' })).toBeTruthy();
    expect(screen.getByText('Some mapped fields are not queryable in this table.')).toBeTruthy();
    expect(screen.getByText('legacyNotes (legacy_notes)')).toBeTruthy();
  });

  it('edits authorized scalar fields and deletes exact rows through Entity mutation Commands', async () => {
    const user = userEvent.setup();
    const editableTag: ExplorerEntityDetail = {
      ...entities[1]!,
      name: 'Tag',
      fieldCount: 3,
      identity: { name: 'id', fields: ['id'] },
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'name', type: 'string', nullable: false },
        { name: 'color', type: 'string', valueType: 'Color', nullable: false },
      ],
      mutations: {
        create: { fields: ['id', 'name', 'color'] },
        update: { fields: ['name', 'color'] },
        delete: true,
      },
    };
    const readEntityData = vi.fn().mockResolvedValue({
      entityName: 'Tag',
      columns: [
        { field: 'id', type: 'id', nullable: false },
        { field: 'name', type: 'string', nullable: false },
        { field: 'color', type: 'string', valueType: 'Color', nullable: false },
      ],
      rows: [{ id: 'tag-1', name: 'Urgent', color: '#d95d4f' }],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });
    const runEntityMutationCommand = vi.fn().mockResolvedValue({
      created: [],
      updated: [],
      deleted: [],
    });
    const graphExecutor = {
      get: vi.fn(),
      run: vi.fn(),
      count: vi.fn(),
      runCommand: vi.fn(),
      runEntityMutationCommand,
    } as unknown as ReactGraphExecutor;

    render(
      withReflectedEntityDataReader({
        graphExecutor,
        readEntityData,
        children: (
          <ExplorerEntityBrowser
            entities={[editableTag]}
            operations={[]}
            tasks={[]}
            selectedEntityName='Tag'
          />
        ),
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'New Tag' }));
    await user.type(screen.getByRole('textbox', { name: 'Create name' }), 'Later');
    await user.type(screen.getByRole('textbox', { name: 'Create color' }), '#abc123');
    await user.click(screen.getByRole('button', { name: 'Create Tag' }));

    await waitFor(() =>
      expect(runEntityMutationCommand).toHaveBeenCalledWith({
        kind: 'entity-mutation-command',
        action: 'create',
        entityName: 'Tag',
        values: { id: expect.any(String), name: 'Later', color: '#abc123' },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Edit color' }));
    fireEvent.change(screen.getByLabelText('Edit color color picker'), {
      target: { value: '#4263eb' },
    });
    const saveColor = screen.getByRole('button', { name: 'Save color' });
    expect(saveColor.textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Cancel color' }).textContent).toBe('');
    await user.click(saveColor);

    await waitFor(() =>
      expect(runEntityMutationCommand).toHaveBeenCalledWith({
        kind: 'entity-mutation-command',
        action: 'update',
        entityName: 'Tag',
        target: { kind: 'entity-ref', entityName: 'Tag', locator: { id: 'tag-1' } },
        values: { color: '#4263eb' },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Edit name' }));
    await user.clear(screen.getByRole('textbox', { name: 'Edit name' }));
    await user.type(screen.getByRole('textbox', { name: 'Edit name' }), 'Important');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() =>
      expect(runEntityMutationCommand).toHaveBeenCalledWith({
        kind: 'entity-mutation-command',
        action: 'update',
        entityName: 'Tag',
        target: { kind: 'entity-ref', entityName: 'Tag', locator: { id: 'tag-1' } },
        values: { name: 'Important' },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Delete row' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(runEntityMutationCommand).toHaveBeenLastCalledWith({
        kind: 'entity-mutation-command',
        action: 'delete',
        entityName: 'Tag',
        target: { kind: 'entity-ref', entityName: 'Tag', locator: { id: 'tag-1' } },
      }),
    );
    expect(readEntityData.mock.calls.length).toBeGreaterThan(1);
  });

  it('restores cancelled edits and reports remote update failures', async () => {
    const user = userEvent.setup();
    const runMutation = vi.fn().mockRejectedValue(new Error('Update unavailable.'));
    const onApplied = vi.fn();

    render(
      <ExplorerEditableEntityCell
        entityName='Tag'
        field={{ name: 'name', type: 'string', nullable: false }}
        onApplied={onApplied}
        runMutation={runMutation}
        target={{ kind: 'entity-ref', entityName: 'Tag', locator: { id: 'tag-1' } }}
        value='Urgent'
      >
        Urgent
      </ExplorerEditableEntityCell>,
    );

    await user.click(screen.getByRole('button', { name: 'Edit name' }));
    await user.clear(screen.getByRole('textbox', { name: 'Edit name' }));
    await user.type(screen.getByRole('textbox', { name: 'Edit name' }), 'Draft');
    await user.click(screen.getByRole('button', { name: 'Cancel name' }));
    expect(screen.getByRole('button', { name: 'Edit name' }).textContent).toContain('Urgent');

    await user.click(screen.getByRole('button', { name: 'Edit name' }));
    await user.clear(screen.getByRole('textbox', { name: 'Edit name' }));
    await user.type(screen.getByRole('textbox', { name: 'Edit name' }), 'Important{Enter}');

    expect(await screen.findByText('Update unavailable.')).toBeTruthy();
    expect(runMutation).toHaveBeenCalledWith({
      kind: 'entity-mutation-command',
      action: 'update',
      entityName: 'Tag',
      target: { kind: 'entity-ref', entityName: 'Tag', locator: { id: 'tag-1' } },
      values: { name: 'Important' },
    });
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('chooses specialized editors from reflected value types instead of field names', async () => {
    const user = userEvent.setup();

    render(
      <ExplorerEditableEntityCell
        entityName='Theme'
        field={{ name: 'color', type: 'string', nullable: false }}
        onApplied={vi.fn()}
        runMutation={vi.fn()}
        target={{ kind: 'entity-ref', entityName: 'Theme', locator: { id: 'theme-1' } }}
        value='#dbe8f4'
      >
        #dbe8f4
      </ExplorerEditableEntityCell>,
    );

    await user.click(screen.getByRole('button', { name: 'Edit color' }));

    expect(screen.queryByLabelText('Edit color color picker')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Edit color' })).toBeTruthy();
  });

  it('parses named numeric Fields through their primitive type', async () => {
    const user = userEvent.setup();
    const runMutation = vi.fn().mockResolvedValue({ created: [], updated: [], deleted: [] });

    render(
      <ExplorerEditableEntityCell
        entityName='Counter'
        field={{ name: 'count', type: 'number', valueType: 'Count', nullable: false }}
        onApplied={vi.fn()}
        runMutation={runMutation}
        target={{ kind: 'entity-ref', entityName: 'Counter', locator: { id: 'counter-1' } }}
        value={1}
      >
        1
      </ExplorerEditableEntityCell>,
    );

    await user.click(screen.getByRole('button', { name: 'Edit count' }));
    await user.clear(screen.getByRole('spinbutton', { name: 'Edit count' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Edit count' }), '12');
    await user.click(screen.getByRole('button', { name: 'Save count' }));

    expect(runMutation).toHaveBeenCalledWith(expect.objectContaining({ values: { count: 12 } }));
  });

  it('uses reflected editors for booleans, enums, numbers, dates, JSON, references, and null', async () => {
    const user = userEvent.setup();
    const runMutation = vi.fn().mockResolvedValue({ created: [], updated: [], deleted: [] });
    const onApplied = vi.fn().mockResolvedValue(undefined);
    const target = {
      kind: 'entity-ref',
      entityName: 'Record',
      locator: { id: 'record-1' },
    } as const;
    const cells = [
      { field: { name: 'completed', type: 'boolean', nullable: false }, value: false },
      {
        field: {
          name: 'status',
          type: 'enum',
          nullable: false,
          enumValues: ['draft', 'ready'],
        },
        value: 'draft',
      },
      { field: { name: 'score', type: 'number', nullable: false }, value: 1 },
      {
        field: { name: 'scheduledAt', type: 'date', nullable: false },
        value: '2026-08-30T10:00:00.000Z',
      },
      { field: { name: 'metadata', type: 'json', nullable: false }, value: { rank: 1 } },
      {
        field: {
          name: 'owner',
          type: 'reference',
          nullable: false,
          reference: {
            entityName: 'Profile',
            identity: { name: 'refById', fields: ['id'] },
          },
        },
        value: { kind: 'entity-ref', entityName: 'Profile', locator: { id: 'profile-1' } },
      },
      { field: { name: 'note', type: 'string', nullable: true }, value: 'Keep me' },
    ] satisfies Array<{
      field: ExplorerEntityDetail['fields'][number];
      value: unknown;
    }>;

    render(
      <div>
        {cells.map(({ field, value }) => (
          <ExplorerEditableEntityCell
            key={field.name}
            entityName='Record'
            field={field}
            href={field.name === 'owner' ? '/profiles/profile-1' : undefined}
            onApplied={onApplied}
            runMutation={runMutation}
            target={target}
            value={value}
          >
            {field.name === 'owner' ? 'Profile · profile-1' : String(value)}
          </ExplorerEditableEntityCell>
        ))}
      </div>,
    );

    expect(screen.getByRole('link', { name: 'Profile · profile-1' }).getAttribute('href')).toBe(
      '/profiles/profile-1',
    );

    await user.click(screen.getByRole('switch', { name: 'Edit completed' }));
    await waitFor(() =>
      expect(runMutation).toHaveBeenCalledWith(
        expect.objectContaining({ values: { completed: true } }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Edit status' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Edit status' }), 'ready');
    await user.click(screen.getByRole('button', { name: 'Save status' }));

    await user.click(screen.getByRole('button', { name: 'Edit score' }));
    await user.clear(screen.getByRole('spinbutton', { name: 'Edit score' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Edit score' }), '42.5');
    await user.click(screen.getByRole('button', { name: 'Save score' }));

    await user.click(screen.getByRole('button', { name: 'Edit scheduledAt' }));
    fireEvent.change(screen.getByLabelText('Edit scheduledAt'), {
      target: { value: '2026-08-30T12:45' },
    });
    await user.click(screen.getByRole('button', { name: 'Save scheduledAt' }));

    await user.click(screen.getByRole('button', { name: 'Edit metadata' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit metadata' }), {
      target: { value: '{"rank":2}' },
    });
    await user.click(screen.getByRole('button', { name: 'Save metadata' }));

    await user.click(screen.getByRole('button', { name: 'Edit owner' }));
    await user.clear(screen.getByRole('textbox', { name: 'Edit owner' }));
    await user.type(screen.getByRole('textbox', { name: 'Edit owner' }), 'profile-2');
    await user.click(screen.getByRole('button', { name: 'Save owner' }));

    await user.click(screen.getByRole('button', { name: 'Edit note' }));
    await user.click(screen.getByRole('checkbox', { name: 'Edit note is null' }));
    await user.click(screen.getByRole('button', { name: 'Save note' }));

    expect(runMutation).toHaveBeenCalledWith(
      expect.objectContaining({ values: { status: 'ready' } }),
    );
    expect(runMutation).toHaveBeenCalledWith(expect.objectContaining({ values: { score: 42.5 } }));
    expect(runMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        values: { scheduledAt: new Date('2026-08-30T12:45').toISOString() },
      }),
    );
    expect(runMutation).toHaveBeenCalledWith(
      expect.objectContaining({ values: { metadata: { rank: 2 } } }),
    );
    expect(runMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        values: {
          owner: {
            kind: 'entity-ref',
            entityName: 'Profile',
            locator: { id: 'profile-2' },
          },
        },
      }),
    );
    expect(runMutation).toHaveBeenCalledWith(expect.objectContaining({ values: { note: null } }));
  });

  it('validates rich create inputs, closes its popover, and reports mutation failures', async () => {
    const user = userEvent.setup();
    const entity: ExplorerEntityDetail = {
      ...entities[1]!,
      name: 'Assignment',
      identity: { name: 'id', fields: ['id'] },
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'published', type: 'boolean', nullable: false },
        { name: 'status', type: 'string', nullable: false, enumValues: ['draft', 'ready'] },
        {
          name: 'owner',
          type: 'reference',
          nullable: true,
          reference: {
            entityName: 'Profile',
            identity: { name: 'refById', fields: ['id'] },
          },
        },
        {
          name: 'scope',
          type: 'reference',
          nullable: false,
          reference: {
            entityName: 'Scope',
            identity: { name: 'composite', fields: ['workspaceId', 'slug'] },
          },
        },
        { name: 'score', type: 'integer', nullable: false },
      ],
      mutations: {
        create: { fields: ['id', 'published', 'status', 'owner', 'scope', 'score'] },
      },
    };
    const runMutation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Create unavailable.'))
      .mockResolvedValue({ created: [], updated: [], deleted: [] });
    const onApplied = vi.fn().mockResolvedValue(undefined);

    render(
      <ExplorerEntityCreateButton
        entity={entity}
        onApplied={onApplied}
        runMutation={runMutation}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'New Assignment' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('form', { name: 'Create Assignment' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'New Assignment' }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('form', { name: 'Create Assignment' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'New Assignment' }));
    await user.click(screen.getByRole('button', { name: 'Close create form' }));
    expect(screen.queryByRole('form', { name: 'Create Assignment' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'New Assignment' }));
    await user.click(screen.getByRole('button', { name: 'Create Assignment' }));
    expect(await screen.findByText('scope is required.')).toBeTruthy();
    expect(screen.getByText('JSON · workspaceId, slug')).toBeTruthy();

    await user.click(screen.getByRole('switch', { name: 'Create published' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Create status' }), 'ready');
    fireEvent.change(screen.getByRole('textbox', { name: 'Create scope' }), {
      target: { value: 'not-json' },
    });
    await user.type(screen.getByRole('spinbutton', { name: 'Create score' }), '42');
    await user.click(screen.getByRole('button', { name: 'Create Assignment' }));
    expect(await screen.findByText('scope needs JSON with workspaceId, slug.')).toBeTruthy();
    expect(runMutation).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Create scope' }), {
      target: { value: '{"workspaceId":"workspace-1","slug":"main"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Create Assignment' }));

    expect(await screen.findByText('Create unavailable.')).toBeTruthy();
    expect(onApplied).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Create Assignment' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
    expect(runMutation).toHaveBeenLastCalledWith({
      kind: 'entity-mutation-command',
      action: 'create',
      entityName: 'Assignment',
      values: {
        id: expect.any(String),
        published: true,
        status: 'ready',
        owner: null,
        scope: {
          kind: 'entity-ref',
          entityName: 'Scope',
          locator: { workspaceId: 'workspace-1', slug: 'main' },
        },
        score: 42,
      },
    });
    expect(screen.queryByRole('form', { name: 'Create Assignment' })).toBeNull();
  });

  it('cancels delete confirmation and reports non-Error mutation failures', async () => {
    const user = userEvent.setup();
    const runMutation = vi.fn().mockRejectedValue('offline');
    const onApplied = vi.fn();

    render(
      <ExplorerEntityDeleteButton
        entityName='Tag'
        onApplied={onApplied}
        runMutation={runMutation}
        target={{ kind: 'entity-ref', entityName: 'Tag', locator: { id: 'tag-1' } }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete row' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete row' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Delete row' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('The mutation could not be applied.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete row' })).toBeTruthy();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('spans loading rows across reflected Entity fields', () => {
    const pendingRead: ReflectedEntityDataReader['readEntityData'] = () =>
      new Promise(() => undefined);
    const relatedBook: ExplorerEntityDetail = {
      ...entities[0]!,
      relations: [
        {
          name: 'collaborators',
          kind: 'hasMany',
          target: 'Profile',
          cardinality: 'many',
        },
      ],
    };

    render(
      withReflectedEntityDataReader({
        readEntityData: vi.fn(pendingRead),
        readRelatedEntityData: vi.fn().mockResolvedValue({
          entityName: 'Profile',
          columns: [],
          rows: [],
          page: 1,
          pageSize: 25,
          totalCount: 0,
          hasPreviousPage: false,
          hasNextPage: false,
        }),
        children: (
          <ExplorerEntityBrowser
            entities={[relatedBook, entities[1]!]}
            operations={[]}
            tasks={[]}
            selectedEntityName='Book'
            selectedTab='data'
          />
        ),
      }),
    );

    expect(
      (screen.getByText('Loading rows...').closest('td') as HTMLTableCellElement | null)?.colSpan,
    ).toBe(relatedBook.fields.length);
  });

  it('shows pending related data without blocking the selected instance', async () => {
    const user = userEvent.setup();
    const pendingRelatedRead: ReflectedRelatedEntityDataReader['readRelatedEntityData'] = () =>
      new Promise(() => undefined);
    const readRelatedEntityData = vi.fn(pendingRelatedRead);
    const relatedBook: ExplorerEntityDetail = {
      ...entities[0]!,
      identity: { name: 'refById', fields: ['id'] },
      relations: [
        {
          name: 'collaborators',
          kind: 'hasMany',
          target: 'Profile',
          cardinality: 'many',
        },
      ],
    };

    render(
      withReflectedEntityDataReader({
        readEntityData: vi.fn().mockResolvedValue({
          entityName: 'Book',
          columns: [{ field: 'id', type: 'id', nullable: false }],
          rows: [{ id: 'book-1' }],
          page: 1,
          pageSize: 25,
          totalCount: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        }),
        readRelatedEntityData,
        children: (
          <ExplorerEntityBrowser
            entities={[relatedBook, entities[1]!]}
            operations={[]}
            tasks={[]}
            selectedEntityName='Book'
          />
        ),
      }),
    );

    await user.click(await screen.findByRole('row', { name: 'book-1' }));
    expect(screen.getByRole('region', { name: 'collaborators relation' }).textContent).toContain(
      '…',
    );
    expect(readRelatedEntityData).toHaveBeenCalledWith(
      expect.objectContaining({ relationName: 'collaborators', pageSize: 25 }),
    );
  });

  it('distinguishes unavailable related data from an empty relation', async () => {
    const user = userEvent.setup();
    const relatedBook: ExplorerEntityDetail = {
      ...entities[0]!,
      identity: { name: 'refById', fields: ['id'] },
      relations: [
        {
          name: 'collaborators',
          kind: 'hasMany',
          target: 'Profile',
          cardinality: 'many',
        },
      ],
    };

    render(
      withReflectedEntityDataReader({
        readEntityData: vi.fn().mockResolvedValue({
          entityName: 'Book',
          columns: [{ field: 'id', type: 'id', nullable: false }],
          rows: [{ id: 'book-1' }],
          page: 1,
          pageSize: 25,
          totalCount: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        }),
        readRelatedEntityData: vi.fn().mockRejectedValue(new Error('Count unavailable.')),
        children: (
          <ExplorerEntityBrowser
            entities={[relatedBook, entities[1]!]}
            operations={[]}
            tasks={[]}
            selectedEntityName='Book'
          />
        ),
      }),
    );

    await user.click(await screen.findByRole('row', { name: 'book-1' }));
    const relation = screen.getByRole('region', { name: 'collaborators relation' });
    await waitFor(() => expect(relation.textContent).toContain('!'));
    expect(screen.getByText('Count unavailable.')).toBeTruthy();
  });

  it('renders a Reference Field as a semantic Entity link instead of a raw id cell', async () => {
    const user = userEvent.setup();
    const readEntityData = vi.fn<ReflectedEntityDataReader['readEntityData']>(async query => {
      if (query.entityName === 'Profile') {
        const id = query.filters?.find(filter => filter.field === 'id')?.value;
        return {
          entityName: 'Profile',
          columns: [
            { field: 'id', type: 'id', nullable: false },
            { field: 'name', type: 'string', nullable: false },
          ],
          display: { primary: 'name' },
          rows: id ? [{ id, name: id === 'profile-1' ? 'Alice' : 'Bob' }] : [],
          page: 1,
          pageSize: 10,
          totalCount: id ? 1 : 0,
          hasPreviousPage: false,
          hasNextPage: false,
        };
      }

      return {
        entityName: 'Book',
        columns: [{ field: 'owner', type: 'reference', nullable: false }],
        rows: [
          {
            owner: {
              kind: 'entity-ref',
              entityName: 'Profile',
              locator: { id: 'profile-1' },
            },
          },
          { owner: 'profile-2' },
        ],
        page: 1,
        pageSize: 25,
        totalCount: 2,
        hasPreviousPage: false,
        hasNextPage: false,
      };
    });
    const bookWithOwner: ExplorerEntityDetail = {
      ...entities[0]!,
      fields: [
        ...entities[0]!.fields,
        {
          name: 'owner',
          type: 'reference',
          nullable: false,
          reference: {
            entityName: 'Profile',
            identity: { name: 'refById', fields: ['id'] },
            display: { primary: 'name' },
          },
        },
      ],
    };

    render(
      <ExplorerProvider basePath='/internal/graph'>
        {withReflectedEntityDataReader({
          readEntityData,
          children: (
            <ExplorerEntityBrowser
              entities={[bookWithOwner, entities[1]!]}
              operations={[]}
              tasks={[]}
              selectedEntityName='Book'
            />
          ),
        })}
      </ExplorerProvider>,
    );

    const owner = await screen.findByRole('link', { name: 'Alice' });
    expect(owner.getAttribute('href')).toBe(
      '/internal/graph/entities/Profile?tab=data&ref=%7B%22id%22%3A%22profile-1%22%7D',
    );
    expect(screen.getByRole('link', { name: 'Bob' }).getAttribute('href')).toBe(
      '/internal/graph/entities/Profile?tab=data&ref=%7B%22id%22%3A%22profile-2%22%7D',
    );
    expect(owner.querySelector('[title="Profile · profile-1"]')).toBeTruthy();
    expect(readEntityData).toHaveBeenCalledWith({
      entityName: 'Profile',
      filters: [{ field: 'id', operator: 'equals', value: 'profile-1' }],
      page: 1,
      pageSize: 10,
    });
  });

  it('opens a reflected instance inspector from the row and closes it from the keyboard', async () => {
    const user = userEvent.setup();
    const inspectableBook: ExplorerEntityDetail = {
      ...entities[0]!,
      identity: { name: 'refById', fields: ['id'] },
      display: { primary: 'title' },
      fields: [
        ...entities[0]!.fields,
        {
          name: 'owner',
          type: 'reference',
          nullable: false,
          reference: {
            entityName: 'Profile',
            identity: { name: 'refById', fields: ['id'] },
          },
        },
      ],
      relations: [],
    };

    render(
      <ExplorerProvider basePath='/internal/graph'>
        {withReflectedEntityDataReader({
          readEntityData: vi.fn().mockResolvedValue({
            entityName: 'Book',
            columns: [
              { field: 'id', type: 'id', nullable: false },
              { field: 'title', type: 'string', nullable: true },
              { field: 'owner', type: 'reference', nullable: false },
            ],
            rows: [
              {
                id: 'book-1',
                title: 'Ontahi',
                owner: {
                  kind: 'entity-ref',
                  entityName: 'Profile',
                  locator: { id: 'profile-1' },
                },
              },
            ],
            page: 1,
            pageSize: 25,
            totalCount: 1,
            hasPreviousPage: false,
            hasNextPage: false,
          }),
          children: (
            <ExplorerEntityBrowser
              entities={[inspectableBook, entities[1]!]}
              operations={[]}
              tasks={[]}
              selectedEntityName='Book'
            />
          ),
        })}
      </ExplorerProvider>,
    );

    await user.click(await screen.findByRole('row', { name: /book-1 Ontahi/ }));

    expect(screen.getByRole('complementary', { name: 'Book instance Ontahi' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ontahi' })).toBeTruthy();
    expect(
      within(screen.getByRole('complementary', { name: 'Book instance Ontahi' }))
        .getByRole('link', { name: 'Profile · profile-1' })
        .getAttribute('href'),
    ).toBe('/internal/graph/entities/Profile?tab=data&ref=%7B%22id%22%3A%22profile-1%22%7D');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Book instance Ontahi' })).toBeNull();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('complementary', { name: 'Book instance Ontahi' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close Book instance Ontahi' }));
    expect(screen.queryByRole('complementary', { name: 'Book instance Ontahi' })).toBeNull();
  });

  it('invokes a contextual operation with the current instance already bound', async () => {
    const user = userEvent.setup();
    const invokeOperation = vi.fn().mockResolvedValue({
      ok: true,
      kind: 'success',
      value: { id: 'book-1', title: 'Executable ontologies' },
    });
    const readEntityData = vi.fn().mockResolvedValue({
      entityName: 'Book',
      columns: [
        { field: 'id', type: 'id', nullable: false },
        { field: 'title', type: 'string', nullable: false },
      ],
      rows: [{ id: 'book-1', title: 'Ontahi' }],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });
    const inspectableBook: ExplorerEntityDetail = {
      ...entities[0]!,
      identity: { name: 'refById', fields: ['id'] },
      display: { primary: 'title' },
      relations: [],
    };
    const contextualOperation: ExplorerOperationDescriptor = {
      id: 'Library.renameBook',
      entityName: 'Library',
      name: 'renameBook',
      kind: 'domain',
      authority: 'server',
      exposure: 'bridge',
      inputSchema: {
        source: 'ontahi',
        summary: 'object',
        fields: [
          { path: 'book', type: 'Book', required: true },
          { path: 'title', type: 'string', required: true },
        ],
      },
      inputRefs: [
        {
          path: 'book',
          entityName: 'Book',
          receiver: false,
          optional: false,
          locators: [{ name: 'refById', fields: ['book'], sourceFields: ['id'] }],
        },
      ],
      resultSchema: emptySchema,
    };

    render(
      withReflectedEntityDataReader({
        readEntityData,
        reflectedOperationInvoker: { invokeOperation },
        children: (
          <ExplorerEntityBrowser
            entities={[inspectableBook]}
            operations={[contextualOperation]}
            tasks={[]}
            selectedEntityName='Book'
          />
        ),
      }),
    );

    await user.click(await screen.findByRole('row', { name: /book-1 Ontahi/ }));
    await user.click(screen.getByRole('button', { name: 'Actions for Book instance Ontahi' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename Book' }));

    expect(screen.queryByLabelText('book Book')).toBeNull();
    expect(screen.getByText('book: Ontahi')).toBeTruthy();
    await user.type(screen.getByPlaceholderText('title'), 'Executable ontologies');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(invokeOperation).toHaveBeenCalledWith({
        operationId: 'Library.renameBook',
        operation: {
          id: 'Library.renameBook',
          entityName: 'Library',
          name: 'renameBook',
          kind: 'domain',
          authority: 'server',
          exposure: 'bridge',
        },
        input: {
          book: { kind: 'entity-ref', entityName: 'Book', locator: { id: 'book-1' } },
          title: 'Executable ontologies',
        },
      }),
    );
    expect(await screen.findByText('Done')).toBeTruthy();
    await waitFor(() => expect(readEntityData.mock.calls.length).toBeGreaterThan(1));
  });

  it('closes a contextual destructive action after it succeeds', async () => {
    const user = userEvent.setup();
    const invokeOperation = vi.fn().mockResolvedValue({
      ok: true,
      kind: 'success',
      value: { deleted: true },
    });
    const readEntityData = vi.fn().mockResolvedValue({
      entityName: 'Book',
      columns: [
        { field: 'id', type: 'id', nullable: false },
        { field: 'title', type: 'string', nullable: false },
      ],
      rows: [{ id: 'book-1', title: 'Ontahi' }],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });
    const inspectableBook: ExplorerEntityDetail = {
      ...entities[0]!,
      identity: { name: 'refById', fields: ['id'] },
      display: { primary: 'title' },
      relations: [],
    };
    const deleteOperation: ExplorerOperationDescriptor = {
      id: 'Library.deleteBook',
      entityName: 'Library',
      name: 'deleteBook',
      kind: 'domain',
      authority: 'server',
      exposure: 'bridge',
      inputSchema: {
        source: 'ontahi',
        summary: 'object',
        fields: [{ path: 'book', type: 'Book', required: true }],
      },
      inputRefs: [
        {
          path: 'book',
          entityName: 'Book',
          receiver: false,
          optional: false,
          locators: [{ name: 'refById', fields: ['book'], sourceFields: ['id'] }],
        },
      ],
      resultSchema: emptySchema,
    };

    render(
      withReflectedEntityDataReader({
        readEntityData,
        reflectedOperationInvoker: { invokeOperation },
        children: (
          <ExplorerEntityBrowser
            entities={[inspectableBook]}
            operations={[deleteOperation]}
            tasks={[]}
            selectedEntityName='Book'
          />
        ),
      }),
    );

    await user.click(await screen.findByRole('row', { name: /book-1 Ontahi/ }));
    const actionsButton = screen.getByRole('button', {
      name: 'Actions for Book instance Ontahi',
    });
    await user.click(actionsButton);
    const actionMenu = screen.getByRole('menu', {
      name: 'Actions for Book instance Ontahi',
    });
    expect(within(actionMenu).queryByRole('heading', { name: 'Actions' })).toBeNull();
    expect(within(actionMenu).queryByText('Ontahi')).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Delete Book' }));
    let confirmation = screen.getByRole('group', { name: 'Confirm Delete Book' });
    expect(within(confirmation).getByText('Delete Book?')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Confirm this destructive action.' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset input' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    await user.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete Book' }));
    confirmation = screen.getByRole('group', { name: 'Confirm Delete Book' });
    await user.click(within(confirmation).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(invokeOperation).toHaveBeenCalledOnce());
    await waitFor(() => expect(actionsButton.getAttribute('aria-expanded')).toBe('false'));
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });

  it('disables inline confirmation when a bound locator is locally invalid', async () => {
    const user = userEvent.setup();
    const deleteOperation: ExplorerOperationDescriptor = {
      id: 'Library.deleteBook',
      entityName: 'Library',
      name: 'deleteBook',
      kind: 'domain',
      authority: 'server',
      exposure: 'bridge',
      inputSchema: {
        source: 'ontahi',
        summary: 'object',
        fields: [{ path: 'book', type: 'Book', required: true }],
      },
      inputRefs: [
        {
          path: 'book',
          entityName: 'Book',
          receiver: false,
          optional: false,
          locators: [{ name: 'refById', fields: ['book'], sourceFields: ['id'] }],
        },
      ],
      resultSchema: emptySchema,
    };

    render(
      withReflectedEntityDataReader({
        reflectedOperationInvoker: {
          invokeOperation: vi.fn().mockResolvedValue({ ok: true, kind: 'success', value: {} }),
        },
        children: (
          <ExplorerEntityActions
            ariaLabel='Actions for invalid Book'
            operations={[deleteOperation]}
            source={{ kind: 'entity-ref', entityName: 'Book', locator: { id: '' } }}
          />
        ),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Actions for invalid Book' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete Book' }));

    expect(screen.getByRole('button', { name: 'Confirm' }).hasAttribute('disabled')).toBe(true);
  });

  it('moves, minimizes, restores, and closes independent instance windows', async () => {
    const user = userEvent.setup();
    const inspectableBook: ExplorerEntityDetail = {
      ...entities[0]!,
      identity: { name: 'refById', fields: ['id'] },
      display: { primary: 'title' },
      relations: [],
    };

    render(
      withReflectedEntityDataReader({
        readEntityData: vi.fn().mockResolvedValue({
          entityName: 'Book',
          columns: [
            { field: 'id', type: 'id', nullable: false },
            { field: 'title', type: 'string', nullable: true },
          ],
          rows: [
            { id: 'book-1', title: 'Ontahi' },
            { id: 'book-2', title: 'Executable ontologies' },
          ],
          page: 1,
          pageSize: 25,
          totalCount: 2,
          hasPreviousPage: false,
          hasNextPage: false,
        }),
        children: (
          <ExplorerEntityBrowser
            entities={[inspectableBook]}
            operations={[]}
            tasks={[]}
            selectedEntityName='Book'
          />
        ),
      }),
    );

    await user.click(await screen.findByRole('row', { name: /book-1 Ontahi/ }));
    await user.click(screen.getByRole('row', { name: /book-2 Executable ontologies/ }));

    expect(screen.getByRole('complementary', { name: 'Book instance Ontahi' })).toBeTruthy();
    expect(
      screen.getByRole('complementary', { name: 'Book instance Executable ontologies' }),
    ).toBeTruthy();

    const collectionLayer = screen.getByLabelText('Open collection views');
    const instanceLayer = screen.getByLabelText('Open instance windows');
    const collection = screen.getByRole('region', { name: 'Book instances' });
    expect(collectionLayer.style.zIndex).toBe('50');
    expect(instanceLayer.style.zIndex).toBe('60');

    fireEvent.pointerDown(collection);
    expect(collectionLayer.style.zIndex).toBe('60');
    expect(instanceLayer.style.zIndex).toBe('50');

    fireEvent.pointerDown(
      screen.getByRole('complementary', { name: 'Book instance Executable ontologies' }),
    );
    expect(collectionLayer.style.zIndex).toBe('50');
    expect(instanceLayer.style.zIndex).toBe('60');

    const ontahiWindow = screen.getByRole('complementary', { name: 'Book instance Ontahi' });
    const ontahiPosition = ontahiWindow.parentElement!;
    const initialLeft = ontahiPosition.style.left;
    Object.defineProperty(ontahiPosition, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 396,
        height: 300,
        left: 532,
        right: 964,
        top: 96,
        width: 432,
        x: 532,
        y: 96,
        toJSON: () => ({}),
      }),
    });
    const ontahiHeader = screen.getByRole('heading', { name: 'Ontahi' }).closest('header')!;
    fireEvent.pointerDown(ontahiHeader, { button: 0, clientX: 560, clientY: 112, pointerId: 7 });
    fireEvent.pointerMove(ontahiHeader, { clientX: 562, clientY: 113, pointerId: 7 });
    expect(ontahiPosition.style.left).toBe(initialLeft);
    fireEvent.pointerMove(ontahiHeader, { clientX: 320, clientY: 220, pointerId: 7 });
    fireEvent.pointerUp(ontahiHeader, { clientX: 320, clientY: 220, pointerId: 7 });

    expect(ontahiPosition.style.left).not.toBe(initialLeft);
    expect(ontahiPosition.style.left).toBe('292px');
    expect(ontahiPosition.style.top).toBe('204px');
    const movedLeft = ontahiPosition.style.left;
    const movedTop = ontahiPosition.style.top;

    expect(fireEvent.click(ontahiHeader)).toBe(false);
    expect(fireEvent.doubleClick(ontahiHeader)).toBe(false);
    expect(screen.getByRole('complementary', { name: 'Book instance Ontahi' })).toBeTruthy();
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));

    fireEvent.doubleClick(ontahiHeader);
    expect(screen.queryByRole('complementary', { name: 'Book instance Ontahi' })).toBeNull();
    const restoreOntahi = screen.getByRole('button', { name: 'Restore Book instance Ontahi' });
    Object.defineProperty(ontahiPosition, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 262,
        height: 58,
        left: 292,
        right: 548,
        top: 204,
        width: 256,
        x: 292,
        y: 204,
        toJSON: () => ({}),
      }),
    });
    fireEvent.pointerDown(restoreOntahi, {
      button: 0,
      clientX: 320,
      clientY: 220,
      pointerId: 8,
    });
    fireEvent.pointerMove(restoreOntahi, {
      clientX: 520,
      clientY: 320,
      pointerId: 8,
    });
    fireEvent.pointerUp(restoreOntahi, { clientX: 520, clientY: 320, pointerId: 8 });

    expect(ontahiPosition.style.left).toBe('492px');
    expect(ontahiPosition.style.top).toBe('304px');
    expect(screen.queryByRole('complementary', { name: 'Book instance Ontahi' })).toBeNull();
    expect(
      screen.getByRole('complementary', { name: 'Book instance Executable ontologies' }),
    ).toBeTruthy();

    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    fireEvent.doubleClick(restoreOntahi);
    const restoredOntahi = screen.getByRole('complementary', { name: 'Book instance Ontahi' });
    expect(restoredOntahi.parentElement?.style.left).not.toBe(movedLeft);
    expect(restoredOntahi.parentElement?.style.top).not.toBe(movedTop);
    expect(restoredOntahi.parentElement?.style.left).toBe('492px');
    expect(restoredOntahi.parentElement?.style.top).toBe('304px');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Book instance Ontahi' })).toBeNull();
    expect(
      screen.getByRole('complementary', { name: 'Book instance Executable ontologies' }),
    ).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: 'Close Book instance Executable ontologies' }),
    );
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('keeps the instance workspace across Entity navigation', async () => {
    const user = userEvent.setup();
    const inspectableBook: ExplorerEntityDetail = {
      ...entities[0]!,
      identity: { name: 'refById', fields: ['id'] },
      display: { primary: 'title' },
      relations: [],
    };
    const inspectableProfile: ExplorerEntityDetail = {
      ...entities[1]!,
      identity: { name: 'refById', fields: ['id'] },
      display: { primary: 'name' },
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'name', type: 'string', nullable: false },
      ],
    };
    const readEntityData = vi.fn(async query => {
      const profile = query.entityName === 'Profile';
      return {
        entityName: query.entityName,
        columns: profile
          ? [
              { field: 'id', type: 'id', nullable: false },
              { field: 'name', type: 'string', nullable: false },
            ]
          : [
              { field: 'id', type: 'id', nullable: false },
              { field: 'title', type: 'string', nullable: true },
            ],
        rows: profile ? [{ id: 'profile-1', name: 'Ada' }] : [{ id: 'book-1', title: 'Ontahi' }],
        page: 1,
        pageSize: 25,
        totalCount: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      };
    });

    render(
      withReflectedEntityDataReader({
        readEntityData,
        children: (
          <ExplorerEntityBrowser
            entities={[inspectableBook, inspectableProfile]}
            operations={[]}
            tasks={[]}
            selectedEntityName='Book'
          />
        ),
      }),
    );

    await user.click(await screen.findByRole('row', { name: /book-1 Ontahi/ }));
    await user.click(screen.getByRole('button', { name: 'Minimize Book instance Ontahi' }));

    await user.click(screen.getByRole('combobox', { name: 'Select entity, Book' }));
    await user.click(screen.getByRole('option', { name: /Profile/ }));

    expect(await screen.findByRole('row', { name: /profile-1 Ada/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore Book instance Ontahi' })).toBeTruthy();

    await user.click(screen.getByRole('row', { name: /profile-1 Ada/ }));
    expect(screen.getByRole('complementary', { name: 'Profile instance Ada' })).toBeTruthy();

    await user.dblClick(screen.getByRole('button', { name: 'Restore Book instance Ontahi' }));
    expect(screen.getByRole('complementary', { name: 'Book instance Ontahi' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Profile instance Ada' })).toBeTruthy();
  });

  it('keeps every instance window when navigating through a related instance', async () => {
    const user = userEvent.setup();
    const inspectableList: ExplorerEntityDetail = {
      ...entities[0]!,
      identity: { name: 'refById', fields: ['id'] },
      display: { primary: 'title' },
      relations: [
        {
          name: 'items',
          kind: 'hasMany',
          target: 'Profile',
          targetIdentity: { name: 'refById', fields: ['id'] },
          targetDisplay: { primary: 'name' },
          cardinality: 'many',
        },
      ],
    };
    const inspectableItem: ExplorerEntityDetail = {
      ...entities[1]!,
      identity: { name: 'refById', fields: ['id'] },
      display: { primary: 'name' },
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'name', type: 'string', nullable: false },
      ],
    };
    const readEntityData = vi.fn(async query => {
      const readingItems = query.entityName === 'Profile';
      return {
        entityName: query.entityName,
        columns: readingItems
          ? [
              { field: 'id', type: 'id', nullable: false },
              { field: 'name', type: 'string', nullable: false },
            ]
          : [
              { field: 'id', type: 'id', nullable: false },
              { field: 'title', type: 'string', nullable: false },
            ],
        rows: readingItems
          ? [{ id: 'item-1', name: 'First item' }]
          : [
              { id: 'list-1', title: 'Inbox' },
              { id: 'list-2', title: 'Later' },
            ],
        page: 1,
        pageSize: 25,
        totalCount: readingItems ? 1 : 2,
        hasPreviousPage: false,
        hasNextPage: false,
      };
    });

    render(
      <ExplorerProvider basePath='/internal/graph'>
        {withReflectedEntityDataReader({
          readEntityData,
          readRelatedEntityData: vi.fn().mockResolvedValue({
            entityName: 'Profile',
            columns: [
              { field: 'id', type: 'id', nullable: false },
              { field: 'name', type: 'string', nullable: false },
            ],
            rows: [{ id: 'item-1', name: 'First item' }],
            page: 1,
            pageSize: 25,
            totalCount: 1,
            hasPreviousPage: false,
            hasNextPage: false,
          }),
          children: (
            <ExplorerEntityBrowser
              entities={[inspectableList, inspectableItem]}
              operations={[]}
              tasks={[]}
              selectedEntityName='Book'
            />
          ),
        })}
      </ExplorerProvider>,
    );

    await user.click(await screen.findByRole('row', { name: /list-1 Inbox/ }));
    await user.click(screen.getByRole('button', { name: 'Minimize Book instance Inbox' }));
    await user.click(screen.getByRole('row', { name: /list-2 Later/ }));

    const later = screen.getByRole('complementary', { name: 'Book instance Later' });
    const itemLink = await within(later).findByRole('link', { name: 'First item' });

    expect(fireEvent.click(itemLink)).toBe(false);
    expect(
      await screen.findByRole('complementary', { name: 'Profile instance First item' }),
    ).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Book instance Later' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore Book instance Inbox' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Select entity, Profile' })).toBeTruthy();
  });

  it('edits authorized scalar fields inside an instance window and keeps it fresh', async () => {
    const user = userEvent.setup();
    const editableTag: ExplorerEntityDetail = {
      ...entities[1]!,
      name: 'Tag',
      identity: { name: 'id', fields: ['id'] },
      display: { primary: 'name' },
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'name', type: 'string', nullable: false },
        { name: 'color', type: 'string', valueType: 'Color', nullable: false },
      ],
      mutations: {
        update: { fields: ['name', 'color'] },
      },
    };
    const initialResult = {
      entityName: 'Tag',
      columns: [
        { field: 'id', type: 'id', nullable: false },
        { field: 'name', type: 'string', nullable: false },
        { field: 'color', type: 'string', valueType: 'Color', nullable: false },
      ],
      rows: [{ id: 'tag-1', name: 'Urgent', color: '#d95d4f' }],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    };
    const readEntityData = vi
      .fn()
      .mockResolvedValueOnce(initialResult)
      .mockResolvedValueOnce({
        ...initialResult,
        rows: [{ id: 'tag-1', name: 'Important', color: '#d95d4f' }],
      })
      .mockResolvedValue({
        ...initialResult,
        rows: [{ id: 'tag-1', name: 'Important', color: '#4263eb' }],
      });
    const runEntityMutationCommand = vi.fn().mockResolvedValue({
      created: [],
      updated: [],
      deleted: [],
    });
    const graphExecutor = {
      get: vi.fn(),
      run: vi.fn(),
      count: vi.fn(),
      runCommand: vi.fn(),
      runEntityMutationCommand,
    } as unknown as ReactGraphExecutor;

    render(
      withReflectedEntityDataReader({
        graphExecutor,
        readEntityData,
        children: (
          <ExplorerEntityBrowser
            entities={[editableTag]}
            operations={[]}
            tasks={[]}
            selectedEntityName='Tag'
          />
        ),
      }),
    );

    await user.click(await screen.findByRole('row', { name: /tag-1 Urgent/ }));
    const inspector = screen.getByRole('complementary', { name: 'Tag instance Urgent' });
    expect(within(inspector).queryByRole('button', { name: 'Edit id' })).toBeNull();

    await user.click(within(inspector).getByRole('button', { name: 'Edit name' }));
    await user.clear(within(inspector).getByRole('textbox', { name: 'Edit name' }));
    await user.type(within(inspector).getByRole('textbox', { name: 'Edit name' }), 'Draft');
    await user.keyboard('{Escape}');

    expect(screen.getByRole('complementary', { name: 'Tag instance Urgent' })).toBeTruthy();
    expect(within(inspector).getByRole('button', { name: 'Edit name' }).textContent).toContain(
      'Urgent',
    );

    await user.click(within(inspector).getByRole('button', { name: 'Edit name' }));
    await user.clear(within(inspector).getByRole('textbox', { name: 'Edit name' }));
    await user.type(within(inspector).getByRole('textbox', { name: 'Edit name' }), 'Important');
    await user.click(within(inspector).getByRole('button', { name: 'Save name' }));

    await waitFor(() =>
      expect(screen.getByRole('complementary', { name: 'Tag instance Important' })).toBeTruthy(),
    );
    expect(runEntityMutationCommand).toHaveBeenCalledWith({
      kind: 'entity-mutation-command',
      action: 'update',
      entityName: 'Tag',
      target: { kind: 'entity-ref', entityName: 'Tag', locator: { id: 'tag-1' } },
      values: { name: 'Important' },
    });

    const refreshedInspector = screen.getByRole('complementary', {
      name: 'Tag instance Important',
    });
    await user.click(within(refreshedInspector).getByRole('button', { name: 'Edit color' }));
    fireEvent.change(within(refreshedInspector).getByLabelText('Edit color color picker'), {
      target: { value: '#4263eb' },
    });
    await user.click(within(refreshedInspector).getByRole('button', { name: 'Save color' }));

    await waitFor(() =>
      expect(runEntityMutationCommand).toHaveBeenCalledWith({
        kind: 'entity-mutation-command',
        action: 'update',
        entityName: 'Tag',
        target: { kind: 'entity-ref', entityName: 'Tag', locator: { id: 'tag-1' } },
        values: { color: '#4263eb' },
      }),
    );
    expect(within(refreshedInspector).getByText('#4263eb')).toBeTruthy();
  });

  it('applies a portable locator from the URL and safely ignores malformed locator input', async () => {
    const linkedEntities: ExplorerEntityDetail[] = [
      { ...entities[0]!, identity: { name: 'refById', fields: ['id'] } },
      entities[1]!,
    ];
    const readEntityData = vi.fn().mockResolvedValue({
      entityName: 'Book',
      columns: [{ field: 'id', type: 'id', nullable: false }],
      rows: [{ id: 'book-1' }],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });
    globalThis.history.replaceState(null, '', '/?tab=data&ref=%7B%22id%22%3A%22book-1%22%7D');

    const rendered = render(
      <ExplorerProvider>
        {withReflectedEntityDataReader({
          readEntityData,
          children: (
            <ExplorerEntityBrowser
              entities={linkedEntities}
              operations={[]}
              tasks={[]}
              selectedEntityName='Book'
              selectedTab='data'
            />
          ),
        })}
      </ExplorerProvider>,
    );

    await vi.waitFor(() =>
      expect(readEntityData).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: [{ field: 'id', operator: 'equals', value: 'book-1' }],
        }),
      ),
    );

    rendered.unmount();
    readEntityData.mockClear();
    globalThis.history.replaceState(null, '', '/?tab=data&ref=%7Bmalformed');
    render(
      <ExplorerProvider>
        {withReflectedEntityDataReader({
          readEntityData,
          children: (
            <ExplorerEntityBrowser
              entities={linkedEntities}
              operations={[]}
              tasks={[]}
              selectedEntityName='Book'
              selectedTab='data'
            />
          ),
        })}
      </ExplorerProvider>,
    );
    await vi.waitFor(() =>
      expect(readEntityData).toHaveBeenCalledWith(expect.objectContaining({ filters: [] })),
    );
  });

  it('lists has-many and many-to-many instances through the injected related Query reader', async () => {
    const user = userEvent.setup();
    const readRelatedEntityData = vi.fn().mockResolvedValue({
      entityName: 'Profile',
      columns: [
        { field: 'id', type: 'id', nullable: false },
        { field: 'name', type: 'string', nullable: false },
      ],
      display: { primary: 'name' },
      rows: [
        { id: 'profile-1', name: 'Ada' },
        { id: 'profile-2', name: null },
      ],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });
    const relatedBook: ExplorerEntityDetail = {
      ...entities[0]!,
      identity: { name: 'refById', fields: ['id'] },
      relations: [
        {
          name: 'collaborators',
          provenance: 'derived-inverse',
          kind: 'hasMany',
          target: 'Profile',
          targetIdentity: { name: 'refById', fields: ['id'] },
          targetDisplay: { primary: 'name' },
          direction: 'inverse',
          cardinality: 'many',
          nullable: false,
          required: false,
          structuralVerbs: ['add', 'remove'],
        },
        {
          name: 'reviewers',
          kind: 'manyToMany',
          target: 'Profile',
          targetIdentity: { name: 'refById', fields: ['id'] },
          targetDisplay: { primary: 'name' },
          direction: 'forward',
          cardinality: 'many',
          nullable: false,
          required: false,
          structuralVerbs: ['add', 'remove'],
        },
      ],
    };

    render(
      <ExplorerProvider basePath='/internal/graph'>
        {withReflectedEntityDataReader({
          readEntityData: vi.fn().mockResolvedValue({
            entityName: 'Book',
            columns: [{ field: 'id', type: 'id', nullable: false }],
            rows: [{ id: 'book-1' }],
            page: 1,
            pageSize: 25,
            totalCount: 1,
            hasPreviousPage: false,
            hasNextPage: false,
          }),
          readRelatedEntityData,
          children: (
            <ExplorerEntityBrowser
              entities={[relatedBook, entities[1]!]}
              operations={[]}
              tasks={[]}
              selectedEntityName='Book'
            />
          ),
        })}
      </ExplorerProvider>,
    );

    await user.click(await screen.findByRole('row', { name: 'book-1' }));

    const collaborators = screen.getByRole('region', { name: 'collaborators relation' });
    expect(
      (await within(collaborators).findByRole('link', { name: 'Ada' })).getAttribute('href'),
    ).toBe('/internal/graph/entities/Profile?tab=data&ref=%7B%22id%22%3A%22profile-1%22%7D');
    expect(
      within(collaborators).getByRole('link', { name: 'profile-2' }).getAttribute('href'),
    ).toBe('/internal/graph/entities/Profile?tab=data&ref=%7B%22id%22%3A%22profile-2%22%7D');
    expect(readRelatedEntityData).toHaveBeenCalledWith({
      source: { kind: 'entity-ref', entityName: 'Book', locator: { id: 'book-1' } },
      relationName: 'collaborators',
      sourceEntityName: 'Book',
      targetEntityName: 'Profile',
      page: 1,
      pageSize: 25,
    });

    await vi.waitFor(() =>
      expect(readRelatedEntityData).toHaveBeenCalledWith(
        expect.objectContaining({ relationName: 'reviewers', pageSize: 25 }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Close Book instance book-1' }));
    expect(screen.queryByRole('complementary', { name: 'Book instance book-1' })).toBeNull();

    await user.click(screen.getByRole('row', { name: 'book-1' }));
    expect(screen.getByRole('complementary', { name: 'Book instance book-1' })).toBeTruthy();
    await user.type(screen.getByPlaceholderText('Search scalar fields'), 'changed');
    expect(screen.getByRole('complementary', { name: 'Book instance book-1' })).toBeTruthy();
  });

  it('projects create Actions into a Relation header and instance Actions into related rows', async () => {
    const user = userEvent.setup();
    const invokeOperation = vi.fn().mockResolvedValue({
      ok: true,
      kind: 'success',
      value: { id: 'profile-3', name: 'Grace' },
    });
    const readRelatedEntityData = vi.fn().mockResolvedValue({
      entityName: 'Profile',
      columns: [
        { field: 'id', type: 'id', nullable: false },
        { field: 'name', type: 'string', nullable: false },
      ],
      display: { primary: 'name' },
      rows: [{ id: 'profile-1', name: 'Ada' }],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });
    const relatedBook: ExplorerEntityDetail = {
      ...entities[0]!,
      identity: { name: 'refById', fields: ['id'] },
      relations: [
        {
          name: 'collaborators',
          provenance: 'derived-inverse',
          kind: 'hasMany',
          target: 'Profile',
          targetIdentity: { name: 'refById', fields: ['id'] },
          targetDisplay: { primary: 'name' },
          direction: 'inverse',
          cardinality: 'many',
        },
      ],
    };
    const profile: ExplorerEntityDetail = {
      ...entities[1]!,
      identity: { name: 'refById', fields: ['id'] },
      display: { primary: 'name' },
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'name', type: 'string', nullable: false },
      ],
    };
    const createProfile: ExplorerOperationDescriptor = {
      id: 'Profile.createForBook',
      entityName: 'Profile',
      resultEntityName: 'Profile',
      name: 'create',
      kind: 'domain',
      authority: 'server',
      exposure: 'bridge',
      inputSchema: {
        source: 'ontahi',
        summary: 'object',
        fields: [
          { path: 'book', type: 'Book', required: true },
          { path: 'name', type: 'string', required: true },
        ],
      },
      inputRefs: [
        {
          path: 'book',
          entityName: 'Book',
          receiver: false,
          optional: false,
          locators: [{ name: 'refById', fields: ['book'], sourceFields: ['id'] }],
        },
      ],
      resultSchema: emptySchema,
    };
    const archiveProfile: ExplorerOperationDescriptor = {
      id: 'Profile.archive',
      entityName: 'Profile',
      name: 'archive',
      kind: 'domain',
      authority: 'server',
      exposure: 'bridge',
      inputSchema: {
        source: 'ontahi',
        summary: 'object',
        fields: [{ path: 'profile', type: 'Profile', required: true }],
      },
      inputRefs: [
        {
          path: 'profile',
          entityName: 'Profile',
          receiver: false,
          optional: false,
          locators: [{ name: 'refById', fields: ['profile'], sourceFields: ['id'] }],
        },
      ],
      resultSchema: emptySchema,
    };

    render(
      <div
        data-testid='outer-theme'
        data-explorer-theme-host
        style={{ '--popover': '120 20% 10%' } as CSSProperties}
      >
        <div
          data-testid='explorer-theme'
          data-explorer-theme-host
          style={{ '--popover': '0 0% 100%' } as CSSProperties}
        >
          <ExplorerProvider basePath='/internal/graph'>
            {withReflectedEntityDataReader({
              readEntityData: vi.fn().mockResolvedValue({
                entityName: 'Book',
                columns: [{ field: 'id', type: 'id', nullable: false }],
                rows: [{ id: 'book-1' }],
                page: 1,
                pageSize: 25,
                totalCount: 1,
                hasPreviousPage: false,
                hasNextPage: false,
              }),
              readRelatedEntityData,
              reflectedOperationInvoker: { invokeOperation },
              children: (
                <ExplorerEntityBrowser
                  entities={[relatedBook, profile]}
                  operations={[createProfile, archiveProfile]}
                  tasks={[]}
                  selectedEntityName='Book'
                />
              ),
            })}
          </ExplorerProvider>
        </div>
      </div>,
    );

    await user.click(await screen.findByRole('row', { name: 'book-1' }));
    const relation = screen.getByRole('region', { name: 'collaborators relation' });
    await within(relation).findByRole('link', { name: 'Ada' });

    await user.click(
      within(relation).getByRole('button', { name: 'Actions for Profile relation' }),
    );
    const relationActionMenu = screen.getByRole('menu', {
      name: 'Actions for Profile relation',
    });
    expect(screen.getByTestId('explorer-theme').contains(relationActionMenu)).toBe(true);
    await user.click(within(relationActionMenu).getByRole('menuitem', { name: 'Create' }));
    expect(screen.getByText('book: book-1')).not.toBeNull();
    expect(screen.queryByLabelText('book Book')).toBeNull();
    await user.type(screen.getByPlaceholderText('name'), 'Grace');
    const relatedReadsBeforeCreate = readRelatedEntityData.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(invokeOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'Profile.createForBook',
          input: {
            book: { kind: 'entity-ref', entityName: 'Book', locator: { id: 'book-1' } },
            name: 'Grace',
          },
        }),
      ),
    );
    await waitFor(() =>
      expect(readRelatedEntityData.mock.calls.length).toBeGreaterThan(relatedReadsBeforeCreate),
    );
    await user.click(screen.getByRole('button', { name: 'Close actions' }));

    await user.click(
      within(relation).getByRole('button', {
        name: 'Archive · Actions for Profile instance Ada',
      }),
    );
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(invokeOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'Profile.archive',
          input: {
            profile: { kind: 'entity-ref', entityName: 'Profile', locator: { id: 'profile-1' } },
          },
        }),
      ),
    );
  });

  it('adds and removes authorized many-to-many participants from an instance relation', async () => {
    const user = userEvent.setup();
    const taggedTodo: ExplorerEntityDetail = {
      ...entities[0]!,
      name: 'TodoItem',
      identity: { name: 'refById', fields: ['id'] },
      display: { primary: 'title' },
      relations: [
        {
          name: 'tags',
          kind: 'manyToMany',
          target: 'Tag',
          targetIdentity: { name: 'refById', fields: ['id'] },
          targetDisplay: { primary: 'name' },
          direction: 'forward',
          cardinality: 'many',
          structuralVerbs: ['add', 'remove'],
          mutations: { add: true, remove: true },
          canonicalIdentity: {
            sourceEntityName: 'TodoItem',
            relationName: 'tags',
            targetEntityName: 'Tag',
            cardinality: 'many-to-many',
          },
        },
      ],
    };
    const tag: ExplorerEntityDetail = {
      ...entities[1]!,
      name: 'Tag',
      identity: { name: 'refById', fields: ['id'] },
      display: { primary: 'name' },
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'name', type: 'string', nullable: false },
      ],
    };
    const readEntityData = vi.fn(async query => ({
      entityName: query.entityName,
      columns:
        query.entityName === 'Tag'
          ? [
              { field: 'id', type: 'id', nullable: false },
              { field: 'name', type: 'string', nullable: false },
            ]
          : [
              { field: 'id', type: 'id', nullable: false },
              { field: 'title', type: 'string', nullable: false },
            ],
      rows:
        query.entityName === 'Tag'
          ? [
              { id: 'tag-1', name: 'Urgent' },
              { id: 'tag-2', name: 'Ideas' },
            ]
          : [{ id: 'todo-1', title: 'Try relation editing' }],
      page: 1,
      pageSize: 25,
      totalCount: query.entityName === 'Tag' ? 2 : 1,
      hasPreviousPage: false,
      hasNextPage: false,
    }));
    const runManyToManyRelationshipCommand = vi.fn().mockResolvedValue({
      status: 'applied',
      delta: { added: [], removed: [] },
    });
    const graphExecutor = {
      get: vi.fn(),
      run: vi.fn(),
      count: vi.fn(),
      runCommand: vi.fn(),
      runManyToManyRelationshipCommand,
    } as unknown as ReactGraphExecutor;

    render(
      withReflectedEntityDataReader({
        graphExecutor,
        readEntityData,
        readRelatedEntityData: vi.fn().mockResolvedValue({
          entityName: 'Tag',
          columns: [
            { field: 'id', type: 'id', nullable: false },
            { field: 'name', type: 'string', nullable: false },
          ],
          rows: [{ id: 'tag-1', name: 'Urgent' }],
          page: 1,
          pageSize: 25,
          totalCount: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        }),
        children: (
          <ExplorerEntityBrowser
            entities={[taggedTodo, tag]}
            operations={[]}
            tasks={[]}
            selectedEntityName='TodoItem'
          />
        ),
      }),
    );

    await user.click(await screen.findByRole('row', { name: /todo-1 Try relation editing/ }));
    const inspector = screen.getByRole('complementary', {
      name: 'TodoItem instance Try relation editing',
    });

    await user.click(within(inspector).getByRole('button', { name: 'Add Tag' }));
    expect(within(inspector).queryByRole('button', { name: 'Link Urgent' })).toBeNull();
    await user.click(await within(inspector).findByRole('button', { name: 'Link Ideas' }));

    expect(runManyToManyRelationshipCommand).toHaveBeenLastCalledWith({
      kind: 'many-to-many-relationship-command',
      action: 'link',
      relation: {
        sourceEntityName: 'TodoItem',
        relationName: 'tags',
        targetEntityName: 'Tag',
        cardinality: 'many-to-many',
      },
      sources: {
        entityName: 'TodoItem',
        selection: {
          kind: 'references',
          refs: [{ kind: 'entity-ref', entityName: 'TodoItem', locator: { id: 'todo-1' } }],
        },
      },
      targets: {
        entityName: 'Tag',
        selection: {
          kind: 'references',
          refs: [{ kind: 'entity-ref', entityName: 'Tag', locator: { id: 'tag-2' } }],
        },
      },
    });

    await user.click(within(inspector).getByRole('button', { name: 'Unlink Urgent' }));
    expect(runManyToManyRelationshipCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'many-to-many-relationship-command',
        action: 'unlink',
        targets: expect.objectContaining({
          selection: expect.objectContaining({
            refs: [{ kind: 'entity-ref', entityName: 'Tag', locator: { id: 'tag-1' } }],
          }),
        }),
      }),
    );
  });

  it('filters entities by search text', async () => {
    const user = userEvent.setup();

    render(<ExplorerEntityBrowser entities={entities} operations={[]} tasks={[]} />);

    await user.click(screen.getByRole('combobox', { name: 'Select entity, Book' }));
    await user.type(screen.getByLabelText('Search entities'), 'Profile');

    expect(screen.queryByRole('option', { name: /Book/ })).toBeNull();
    expect(screen.getByRole('option', { name: /Profile/ })).toBeTruthy();
  });
});
