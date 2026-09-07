import {
  createRuntimeProtocolResponse,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { OntahiGraphProvider } from '@ontahi/react/graph';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExplorerEntityDetail } from '../contracts/index.js';

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
  fields: [
    { name: 'id', type: 'id', nullable: false },
    { name: 'title', type: 'string', nullable: false },
    { name: 'completed', type: 'boolean', nullable: false },
  ],
  relations: [],
};

const renderPanel = (request: RuntimeTransport['request'], initialDocument = 'completed = false') =>
  render(
    <OntahiGraphProvider
      runtime={{ name: 'test-runtime' }}
      runtimeTransport={{ request }}
      client={false}
    >
      <ExplorerSelectionLanguageDataPanel entity={entity} initialDocument={initialDocument} />
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
  });

  it('does not show a running state when an invalid initial document blocks execution', () => {
    const request = vi.fn<RuntimeTransport['request']>();
    renderPanel(request, 'completed =');

    expect(screen.getByText('Expected a string, number, or Boolean literal.')).toBeTruthy();
    expect(screen.queryByText('Running Selection…')).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
