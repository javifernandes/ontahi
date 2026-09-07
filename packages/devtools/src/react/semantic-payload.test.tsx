// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SemanticPayload } from './semantic-payload.js';

afterEach(cleanup);

describe('SemanticPayload', () => {
  it('shows Operation inputs and values without protocol wrappers', () => {
    const ui = render(
      <SemanticPayload
        value={{
          kind: 'invoke',
          operationId: 'TodoItem.createItem',
          input: {
            list: {
              kind: 'entity-ref',
              entityName: 'TodoList',
              locator: { id: 'list-later' },
            },
            title: 'nuevo item',
          },
        }}
      />,
    );
    expect(screen.getByText('Input')).toBeTruthy();
    expect(screen.getByText('list-later')).toBeTruthy();
    expect(screen.queryByText('operationId')).toBeNull();

    ui.rerender(
      <SemanticPayload
        value={{
          kind: 'invocation-result',
          result: {
            ok: true,
            kind: 'success',
            value: {
              owner: {
                kind: 'entity-ref',
                entityName: 'User',
                locator: { tenant: 'acme', slug: 'javi', scope: null, path: { team: 'runtime' } },
              },
            },
          },
        }}
      />,
    );
    expect(screen.getByText('Returned value')).toBeTruthy();
    expect(
      screen.getByText('tenant: acme · slug: javi · scope: null · path: {"team":"runtime"}'),
    ).toBeTruthy();
    expect(screen.queryByText('entity-ref')).toBeNull();
  });

  it('projects empty inputs, void results, failures, permissions, and protocol errors', () => {
    const ui = render(<SemanticPayload value={{ kind: 'invoke' }} />);
    expect(screen.getByText('No input.')).toBeTruthy();

    ui.rerender(
      <SemanticPayload
        value={{ kind: 'invocation-result', result: { ok: true, kind: 'success' } }}
      />,
    );
    expect(screen.getByText('No value returned.')).toBeTruthy();

    ui.rerender(
      <SemanticPayload
        value={{
          kind: 'invocation-result',
          result: {
            ok: false,
            kind: 'rejected',
            executed: false,
            reason: 'policy',
            message: 'Not allowed',
          },
        }}
      />,
    );
    expect(screen.getByText('Failure')).toBeTruthy();
    expect(screen.getByText('Not allowed')).toBeTruthy();
    expect(screen.queryByText('executed')).toBeNull();

    ui.rerender(
      <SemanticPayload
        value={{ kind: 'permission-result', result: { allowed: false, reason: 'owner-only' } }}
      />,
    );
    expect(screen.getByText('Permission')).toBeTruthy();
    expect(screen.getByText('owner-only')).toBeTruthy();

    ui.rerender(
      <SemanticPayload
        value={{ kind: 'protocol-error', error: { code: 'invalid_request', message: 'Bad input' } }}
      />,
    );
    expect(screen.getByText('Protocol error')).toBeTruthy();
    expect(screen.getByText('Bad input')).toBeTruthy();
  });

  it('renders generic scalars, arrays, records, and graph read results', () => {
    const ui = render(<SemanticPayload value={[1, 'two', null]} />);
    expect(screen.getByText('1, two, null')).toBeTruthy();

    ui.rerender(<SemanticPayload value={[]} />);
    expect(screen.getByText('Empty list')).toBeTruthy();

    ui.rerender(
      <SemanticPayload
        value={{
          kind: 'graph-read-result',
          value: [{ id: 'todo-1', done: true, meta: { rank: 1 } }],
        }}
      />,
    );
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('todo-1')).toBeTruthy();
    expect(screen.getByText('1 fields')).toBeTruthy();

    ui.rerender(<SemanticPayload value='done' />);
    expect(screen.getByText('done')).toBeTruthy();
  });

  it('renders ordered movement as source, member, and destination cards', () => {
    render(
      <SemanticPayload
        value={{
          kind: 'graph-command',
          command: {
            kind: 'ordered-relationship-command',
            action: 'move',
            relation: {
              sourceEntityName: 'TodoList',
              relationName: 'items',
              targetEntityName: 'TodoItem',
              cardinality: 'ordered-many',
            },
            source: { kind: 'entity-ref', entityName: 'TodoList', locator: { id: 'list-inbox' } },
            member: {
              kind: 'entity-ref',
              entityName: 'TodoItem',
              locator: { id: 'todo-explorer' },
            },
            position: {
              before: {
                kind: 'entity-ref',
                entityName: 'TodoItem',
                locator: { id: 'todo-inline-editing' },
              },
            },
          },
        }}
      />,
    );

    expect(
      screen.getByText('TodoList.items.move(todo-explorer, before: todo-inline-editing)'),
    ).toBeTruthy();
    expect(screen.getByText('Source / List')).toBeTruthy();
    expect(screen.getByText('Moving item')).toBeTruthy();
    expect(screen.getByText('todo-explorer')).toBeTruthy();
    expect(screen.getByText('Destination')).toBeTruthy();
    expect(screen.getByText('Before todo-inline-editing')).toBeTruthy();
  });
});
