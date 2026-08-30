import type {
  ReflectedEntityDataReader,
  ReflectedRelatedEntityDataReader,
} from '@ontahi/core/data-graph';
import { OntahiGraphProvider, type ReactGraphExecutor } from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ExplorerEntityDetail,
  ExplorerOperationDescriptor,
  ExplorerSchemaDescriptor,
  ExplorerTaskDescriptor,
} from '../contracts/index.js';

import {
  ExplorerEditableEntityCell,
  ExplorerEntityCreateButton,
  ExplorerEntityDeleteButton,
} from './entity-data-mutations.js';

import { ExplorerEntityBrowser, ExplorerProvider } from './index.js';

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
  graphExecutor,
}: {
  children: ReactNode;
  readEntityData?: ReflectedEntityDataReader['readEntityData'];
  readRelatedEntityData?: ReflectedRelatedEntityDataReader['readRelatedEntityData'];
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
        { name: 'color', type: 'string', nullable: false },
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
        { field: 'color', type: 'string', nullable: false },
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

    await user.selectOptions(screen.getByRole('combobox', { name: 'Create published' }), 'true');
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
        scope: { workspaceId: 'workspace-1', slug: 'main' },
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

  it('spans loading rows across the conditional Related column', () => {
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
    ).toBe(relatedBook.fields.length + 1);
  });

  it('shows pending related counts without blocking entity rows', async () => {
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

    expect((await screen.findByRole('button', { name: 'collaborators' })).textContent).toContain(
      '…',
    );
    expect(readRelatedEntityData).toHaveBeenCalledWith(
      expect.objectContaining({ relationName: 'collaborators', pageSize: 1 }),
    );
  });

  it('distinguishes an unavailable related count from an empty relation', async () => {
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

    const button = await screen.findByRole('button', { name: 'collaborators' });
    await waitFor(() => expect(button.textContent).toContain('!'));
    expect(screen.getByTitle('Related count unavailable')).toBeTruthy();
  });

  it('renders a Reference Field as a semantic Entity link instead of a raw id cell', async () => {
    const user = userEvent.setup();
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
          readEntityData: vi.fn().mockResolvedValue({
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
          }),
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

    const owner = await screen.findByRole('link', { name: 'Profile · profile-1' });
    expect(owner.getAttribute('href')).toBe(
      '/internal/graph/entities/Profile?tab=data&ref=%7B%22id%22%3A%22profile-1%22%7D',
    );
    expect(screen.getByRole('link', { name: 'Profile · profile-2' }).getAttribute('href')).toBe(
      '/internal/graph/entities/Profile?tab=data&ref=%7B%22id%22%3A%22profile-2%22%7D',
    );
    expect(screen.queryByText('profile-1')).toBeNull();
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

    await user.click(await screen.findByRole('button', { name: 'collaborators' }));

    expect((await screen.findByRole('link', { name: 'Ada' })).getAttribute('href')).toBe(
      '/internal/graph/entities/Profile?tab=data&ref=%7B%22id%22%3A%22profile-1%22%7D',
    );
    expect(screen.getByRole('link', { name: 'profile-2' }).getAttribute('href')).toBe(
      '/internal/graph/entities/Profile?tab=data&ref=%7B%22id%22%3A%22profile-2%22%7D',
    );
    expect(readRelatedEntityData).toHaveBeenCalledWith({
      source: { kind: 'entity-ref', entityName: 'Book', locator: { id: 'book-1' } },
      relationName: 'collaborators',
      sourceEntityName: 'Book',
      targetEntityName: 'Profile',
      page: 1,
      pageSize: 25,
    });

    await user.click(screen.getByRole('button', { name: 'reviewers' }));
    await vi.waitFor(() =>
      expect(readRelatedEntityData).toHaveBeenLastCalledWith(
        expect.objectContaining({ relationName: 'reviewers' }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Close related instances' }));
    expect(screen.queryByRole('region', { name: 'Related instances' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'collaborators' }));
    expect(await screen.findByRole('region', { name: 'Related instances' })).toBeTruthy();
    await user.type(screen.getByPlaceholderText('Search scalar fields'), 'changed');
    expect(screen.queryByRole('region', { name: 'Related instances' })).toBeNull();
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
