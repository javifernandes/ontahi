import type {
  ReflectedEntityDataReader,
  ReflectedRelatedEntityDataReader,
} from '@ontahi/core/data-graph';
import { OntahiGraphProvider } from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ExplorerEntityDetail,
  ExplorerOperationDescriptor,
  ExplorerSchemaDescriptor,
  ExplorerTaskDescriptor,
} from '../contracts/index.js';

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
}: {
  children: ReactNode;
  readEntityData?: ReflectedEntityDataReader['readEntityData'];
  readRelatedEntityData?: ReflectedRelatedEntityDataReader['readRelatedEntityData'];
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
  it('renders entity detail with package-owned routes and host panels', () => {
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

    const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'));

    expect(screen.getByRole('heading', { name: 'Entity Browser' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Book' })).toBeTruthy();
    expect(screen.getByText('Get Sharing Info')).toBeTruthy();
    expect(screen.getByText('Import Book')).toBeTruthy();
    expect(screen.getByTestId('execute-panel').textContent).toBe('execute Book.getSharingInfo');
    expect(hrefs).toContain('/internal/graph/entities/Book');
    expect(hrefs).toContain('/internal/graph/entities/Profile');
  });

  it('uses local entity and tab navigation while preserving route-shaped URLs', async () => {
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

    await user.click(screen.getAllByRole('link', { name: /Profile/ })[0]!);

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeTruthy();
    expect(globalThis.location.pathname).toBe('/internal/graph/entities/Profile');

    await user.click(screen.getByRole('button', { name: 'Data' }));

    expect(screen.getByTestId('data-panel').textContent).toBe('data Profile');
    expect(globalThis.location.search).toBe('?tab=data');
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
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: 'Data' }));

    expect(await screen.findByText('Ontahi')).toBeTruthy();
    expect(readEntityData).toHaveBeenCalledWith(
      expect.objectContaining({
        entityName: 'Book',
        page: 1,
        pageSize: 25,
      }),
    );
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
        readRelatedEntityData: vi.fn(),
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

    await user.click(screen.getByRole('button', { name: 'Data' }));

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

    await user.click(screen.getByRole('button', { name: 'Data' }));
    await user.click(await screen.findByRole('button', { name: 'collaborators' }));

    expect((await screen.findByRole('link', { name: 'Ada' })).getAttribute('href')).toBe(
      '/internal/graph/entities/Profile?tab=data&ref=%7B%22id%22%3A%22profile-1%22%7D',
    );
    expect(screen.getByRole('link', { name: 'profile-2' }).getAttribute('href')).toBe(
      '/internal/graph/entities/Profile?tab=data&ref=%7B%22id%22%3A%22profile-2%22%7D',
    );
    expect(readRelatedEntityData).toHaveBeenLastCalledWith({
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

    await user.type(screen.getByLabelText('Search entities'), 'Profile');

    expect(screen.queryByRole('link', { name: /Book/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: /Profile/ }).length).toBeGreaterThan(0);
  });
});
