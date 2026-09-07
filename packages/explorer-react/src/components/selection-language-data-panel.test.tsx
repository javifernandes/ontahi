import {
  createRuntimeProtocolResponse,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { OntahiGraphProvider } from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExplorerEntityDetail } from '../contracts/index.js';

import { ExplorerProvider } from './config.js';
import { ExplorerEntityBrowser } from './entity-browser.js';
import {
  ExplorerSelectionLanguageDataPanel,
  toSelectionLanguageEntityReflection,
} from './selection-language-data-panel.js';

vi.mock('./selection-language-editor.js', () => ({
  ExplorerSelectionLanguageEditor: ({
    label,
    onChange,
    value,
  }: {
    label: string;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <textarea aria-label={label} value={value} onChange={event => onChange(event.target.value)} />
  ),
}));

const entity: ExplorerEntityDetail = {
  name: 'TodoItem',
  fieldCount: 3,
  relationCount: 0,
  graphOperationCount: 0,
  domainOperationCount: 0,
  durableOperationCount: 0,
  taskCount: 0,
  diagram: 'graph TD',
  identity: { name: 'refById', fields: ['id'] },
  display: { primary: 'title' },
  fields: [
    { name: 'id', type: 'id', nullable: false },
    { name: 'title', type: 'string', nullable: false },
    { name: 'completed', type: 'boolean', nullable: false },
  ],
  relations: [],
};

const renderPanel = (
  request: RuntimeTransport['request'],
  initialDocument = 'completed = false',
  selectedEntity = entity,
) =>
  render(
    <OntahiGraphProvider
      runtime={{ name: 'test-runtime' }}
      runtimeTransport={{ request }}
      client={false}
    >
      <ExplorerSelectionLanguageDataPanel
        entity={selectedEntity}
        initialDocument={initialDocument}
      />
    </OntahiGraphProvider>,
  );

afterEach(cleanup);

describe('ExplorerSelectionLanguageDataPanel', () => {
  it('projects structural Field semantics without exposing Explorer contracts', () => {
    expect(
      toSelectionLanguageEntityReflection({
        ...entity,
        fields: [
          {
            name: 'status',
            type: 'enum',
            nullable: false,
            enumValues: ['open', 'closed'],
          },
          {
            name: 'owner',
            type: 'reference',
            valueType: 'PersonRef',
            nullable: true,
            reference: { entityName: 'Person' },
          },
        ],
        relations: [{ name: 'assignee', kind: 'belongsTo', target: 'Person' }],
      }),
    ).toEqual({
      name: 'TodoItem',
      fields: [
        {
          name: 'status',
          type: 'enum',
          nullable: false,
          enumValues: ['open', 'closed'],
        },
        {
          name: 'owner',
          type: 'reference',
          valueType: 'PersonRef',
          nullable: true,
          reference: { entityName: 'Person' },
        },
      ],
      relations: [{ name: 'assignee' }],
    });
  });

  it('lowers a valid document into graph.read and keeps the last rows for an invalid draft', async () => {
    const request = vi.fn<RuntimeTransport['request']>(async envelope =>
      createRuntimeProtocolResponse(envelope, {
        kind: 'graph-read-result',
        value: [{ id: 'todo-1', title: 'Stable parser', completed: false }],
      }),
    );
    renderPanel(request);

    expect(
      screen.getByText('Ctrl-Space for suggestions · hover a Field or operator for help.'),
    ).toBeTruthy();

    await waitFor(() => expect(screen.getByText('Stable parser')).toBeTruthy());
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      family: 'graph.read',
      body: {
        version: 1,
        kind: 'graph-read',
        mode: 'run',
        selection: {
          kind: 'selection',
          entityName: 'TodoItem',
          expression: {
            kind: 'predicate',
            fieldName: 'completed',
            operator: 'eq',
            value: false,
          },
        },
        orderBy: [],
        limit: 25,
      },
    });
    expect(request.mock.calls[0]?.[1]).toMatchObject({ signal: expect.any(AbortSignal) });

    fireEvent.change(screen.getByLabelText('Selection expression for TodoItem'), {
      target: { value: 'completed =' },
    });

    expect(await screen.findByText('Expected a string, number, or Boolean literal.')).toBeTruthy();
    expect(screen.getByText('Stable parser')).toBeTruthy();
    expect(request).toHaveBeenCalledOnce();
    expect(
      screen
        .getByText('Expected a string, number, or Boolean literal.')
        .getAttribute('data-diagnostic-channel'),
    ).toBe('syntax');
  });

  it('uses empty input as host-owned all and keeps semantic diagnostics out of execution', async () => {
    const request = vi.fn<RuntimeTransport['request']>(async envelope =>
      createRuntimeProtocolResponse(envelope, { kind: 'graph-read-result', value: [] }),
    );
    renderPanel(request, '');

    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      body: {
        selection: {
          kind: 'selection',
          entityName: 'TodoItem',
          expression: { kind: 'all' },
        },
      },
    });

    fireEvent.change(screen.getByLabelText('Selection expression for TodoItem'), {
      target: { value: 'title = false' },
    });

    expect(
      await screen.findByText('Field TodoItem.title expects a string value, received Boolean.'),
    ).toBeTruthy();
    expect(request).toHaveBeenCalledOnce();
    expect(
      screen
        .getByText('Field TodoItem.title expects a string value, received Boolean.')
        .getAttribute('data-diagnostic-channel'),
    ).toBe('semantic');
  });

  it('sends composed expressions through the same canonical graph.read request', async () => {
    const request = vi.fn<RuntimeTransport['request']>(async envelope =>
      createRuntimeProtocolResponse(envelope, { kind: 'graph-read-result', value: [] }),
    );
    renderPanel(request, 'completed = false or completed = true');

    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      family: 'graph.read',
      body: {
        selection: {
          kind: 'selection',
          entityName: 'TodoItem',
          expression: {
            kind: 'or',
            operands: [
              {
                kind: 'predicate',
                fieldName: 'completed',
                operator: 'eq',
                value: false,
              },
              {
                kind: 'predicate',
                fieldName: 'completed',
                operator: 'eq',
                value: true,
              },
            ],
          },
        },
      },
    });
  });

  it('resets draft and successful rows when the selected Entity changes', async () => {
    let call = 0;
    const request = vi.fn<RuntimeTransport['request']>(async envelope => {
      call += 1;
      return createRuntimeProtocolResponse(envelope, {
        kind: 'graph-read-result',
        value:
          call === 1
            ? [{ id: 'todo-1', title: 'Stable parser', completed: false }]
            : [{ id: 'tag-1', name: 'Important' }],
      });
    });
    const rendered = renderPanel(request);
    await screen.findByText('Stable parser');

    const tag: ExplorerEntityDetail = {
      ...entity,
      name: 'Tag',
      fieldCount: 2,
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'name', type: 'string', nullable: false },
      ],
      relations: [],
    };
    rendered.rerender(
      <OntahiGraphProvider
        runtime={{ name: 'test-runtime' }}
        runtimeTransport={{ request }}
        client={false}
      >
        <ExplorerSelectionLanguageDataPanel entity={tag} initialDocument='all' />
      </OntahiGraphProvider>,
    );

    expect(screen.queryByText('Stable parser')).toBeNull();
    expect(
      (screen.getByLabelText('Selection expression for Tag') as HTMLTextAreaElement).value,
    ).toBe('all');
    await screen.findByText('Important');
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      body: {
        selection: {
          entityName: 'Tag',
          expression: { kind: 'all' },
        },
      },
    });
  });

  it('opens a reflected instance workspace from a Selection result row', async () => {
    const user = userEvent.setup();
    const request = vi.fn<RuntimeTransport['request']>(async envelope =>
      createRuntimeProtocolResponse(envelope, {
        kind: 'graph-read-result',
        value: [{ id: 'todo-1', title: 'Stable parser', completed: false }],
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <OntahiGraphProvider
          runtime={{ name: 'test-runtime' }}
          runtimeTransport={{ request }}
          reflectedEntityDataReader={{
            readEntityData: vi.fn().mockResolvedValue({
              entityName: entity.name,
              columns: entity.fields,
              rows: [],
              page: 1,
              pageSize: 25,
              totalCount: 0,
              hasPreviousPage: false,
              hasNextPage: false,
            }),
          }}
          client={false}
        >
          <ExplorerProvider basePath='/explorer'>
            <ExplorerEntityBrowser
              entities={[entity]}
              operations={[]}
              tasks={[]}
              selectedEntityName={entity.name}
              selectedTab='data'
              renderDataPanel={({ entity: selectedEntity }) => (
                <ExplorerSelectionLanguageDataPanel
                  embedded
                  entity={selectedEntity}
                  initialDocument='completed = false'
                />
              )}
            />
          </ExplorerProvider>
        </OntahiGraphProvider>
      </QueryClientProvider>,
    );

    const row = await screen.findByRole('row', { name: /todo-1 Stable parser false/ });
    await user.click(row);

    expect(
      screen.getByRole('complementary', { name: 'TodoItem instance Stable parser' }),
    ).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('complementary', { name: 'TodoItem instance Stable parser' }),
    ).toBeNull();
    await user.keyboard('{Enter}');
    expect(
      screen.getByRole('complementary', { name: 'TodoItem instance Stable parser' }),
    ).toBeTruthy();
  });

  it('preserves the reflected Color presentation in Selection result cells', async () => {
    const colorEntity: ExplorerEntityDetail = {
      ...entity,
      name: 'TodoList',
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'name', type: 'string', nullable: false },
        { name: 'color', type: 'string', valueType: 'Color', nullable: false },
      ],
    };
    const request = vi.fn<RuntimeTransport['request']>(async envelope =>
      createRuntimeProtocolResponse(envelope, {
        kind: 'graph-read-result',
        value: [{ id: 'list-inbox', name: 'Inbox', color: '#f5ddd5' }],
      }),
    );

    const rendered = renderPanel(request, 'color in ["#f5ddd5"]', colorEntity);

    await screen.findByText('#f5ddd5');
    expect(rendered.container.querySelector('[data-explorer-color-swatch="#f5ddd5"]')).toBeTruthy();
  });

  it('renders protocol rejection only through the execution channel', async () => {
    const request = vi.fn<RuntimeTransport['request']>(async envelope =>
      createRuntimeProtocolResponse(envelope, {
        kind: 'protocol-error',
        error: { code: 'access_denied', message: 'Selection is not allowed.' },
      }),
    );
    renderPanel(request);

    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe('Selection is not allowed.');
    expect(error.getAttribute('data-diagnostic-channel')).toBe('execution');
    expect(screen.queryByText('Unknown Field')).toBeNull();

    fireEvent.change(screen.getByLabelText('Selection expression for TodoItem'), {
      target: { value: 'completed =' },
    });

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('Expected a string, number, or Boolean literal.')).toBeTruthy();
  });

  it('can retry a transient execution failure without rewriting the Selection', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const request = vi.fn<RuntimeTransport['request']>(async envelope => {
      attempt += 1;
      if (attempt === 1) {
        return createRuntimeProtocolResponse(envelope, {
          kind: 'protocol-error',
          error: {
            code: 'execution_unavailable',
            message: 'Selection execution is temporarily unavailable.',
          },
        });
      }
      return createRuntimeProtocolResponse(envelope, {
        kind: 'graph-read-result',
        value: [{ id: 'todo-1', title: 'Recovered', completed: false }],
      });
    });
    renderPanel(request);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Selection execution is temporarily unavailable.',
    );
    await user.click(screen.getByRole('button', { name: 'Retry Selection' }));

    expect(await screen.findByText('Recovered')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not show a running state when an invalid initial document blocks execution', () => {
    const request = vi.fn<RuntimeTransport['request']>();
    renderPanel(request, 'completed =');

    expect(screen.getByText('Expected a string, number, or Boolean literal.')).toBeTruthy();
    expect(screen.queryByText('Running Selection…')).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
