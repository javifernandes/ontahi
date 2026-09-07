// @vitest-environment jsdom

import {
  createRuntimeTransportRouter,
  type DurableOperationObservationCapability,
  type GraphObservationCapability,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RuntimeTransportSettings } from './runtime-transport-settings.js';

const request = vi.fn<RuntimeTransport['request']>();
const durableObserve: DurableOperationObservationCapability['observe'] = async function* () {};
const graphObserve: GraphObservationCapability['observe'] = async function* () {};

const createConfigurableTransport = () =>
  createRuntimeTransportRouter({
    transports: {
      http: { request, durableOperation: { observe: durableObserve } },
      websocket: {
        request,
        durableOperation: { observe: durableObserve },
        graph: { observe: graphObserve },
      },
    },
    routing: {
      operation: 'websocket',
      'durable.operation': 'websocket',
      'graph.read': 'websocket',
      'graph.command': 'websocket',
      'durable.operation.observe': 'websocket',
      'graph.observe': 'websocket',
    },
  });

afterEach(cleanup);

describe('RuntimeTransportSettings', () => {
  it('renders registered capabilities and configures the runtime directly', () => {
    const runtimeTransport = createConfigurableTransport();
    render(<RuntimeTransportSettings runtimeTransport={runtimeTransport} />);

    expect(screen.getAllByRole('combobox')).toHaveLength(6);
    const graphRead = screen.getByRole('combobox', { name: 'Transport for graph reads' });
    fireEvent.change(graphRead, { target: { value: 'http' } });

    expect(runtimeTransport.routing.inspect().assignments['graph.read']).toBe('http');
    expect((graphRead as HTMLSelectElement).value).toBe('http');
    const graphObserve = screen.getByRole('combobox', {
      name: 'Transport for graph observation',
    });
    expect(
      (within(graphObserve).getByRole('option', { name: 'HTTP' }) as HTMLOptionElement).disabled,
    ).toBe(true);
  });

  it('derives preferred-transport profiles from registered capabilities', () => {
    const runtimeTransport = createConfigurableTransport();
    render(<RuntimeTransportSettings runtimeTransport={runtimeTransport} />);

    expect(screen.getByText('WebSocket only')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Prefer HTTP' }));

    expect(runtimeTransport.routing.inspect().assignments).toEqual({
      operation: 'http',
      'durable.operation': 'http',
      'graph.read': 'http',
      'graph.command': 'http',
      'durable.operation.observe': 'http',
      'graph.observe': 'websocket',
    });
    expect(screen.getByText('5 HTTP · 1 WebSocket')).toBeTruthy();
    expect(screen.queryByText(/Todo/)).toBeNull();
  });

  it('presents application-defined transport ids without application UI', () => {
    const runtimeTransport = createRuntimeTransportRouter({
      transports: { worker_socket: { request } },
    });

    render(<RuntimeTransportSettings runtimeTransport={runtimeTransport} />);

    expect(screen.getByText('Worker Socket only')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Prefer Worker Socket' })).toBeTruthy();
  });
});
