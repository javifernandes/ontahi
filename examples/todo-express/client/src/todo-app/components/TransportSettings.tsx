import { Cable, Globe2, Settings2 } from 'lucide-react';

import {
  defaultTodoTransportRouting,
  httpTodoTransportRouting,
  splitTodoTransportRouting,
  type TodoTransportName,
  type TodoTransportRouting,
} from '../../runtime-transport-routing.js';

export type TransportSettingsProps = {
  routing: TodoTransportRouting;
  onChange(routing: TodoTransportRouting): void;
};

const routes: ReadonlyArray<{
  key: keyof TodoTransportRouting;
  label: string;
  protocol: string;
  description: string;
}> = [
  {
    key: 'graphRead',
    label: 'Graph reads',
    protocol: 'graph.read',
    description: 'Queries and reflected entity reads.',
  },
  {
    key: 'graphCommand',
    label: 'Graph commands',
    protocol: 'graph.command',
    description: 'Entity and relationship mutations.',
  },
  {
    key: 'operation',
    label: 'Operation calls',
    protocol: 'operation',
    description: 'Normal and Durable Operation invocation.',
  },
  {
    key: 'durableProgress',
    label: 'Durable progress',
    protocol: 'observe',
    description: 'HTTP polls; WebSocket receives pushed snapshots.',
  },
];

const routingLabel = (routing: TodoTransportRouting) => {
  const webSocketCount = Object.values(routing).filter(value => value === 'websocket').length;
  if (webSocketCount === routes.length) return 'WebSocket only';
  if (webSocketCount === 0) return 'HTTP only';
  return `${routes.length - webSocketCount} HTTP · ${webSocketCount} WS`;
};

const TransportIcon = ({ transport }: { transport: TodoTransportName }) =>
  transport === 'websocket' ? <Cable aria-hidden='true' /> : <Globe2 aria-hidden='true' />;

export const TransportSettings = ({ routing, onChange }: TransportSettingsProps) => (
  <details className='transport-settings'>
    <summary>
      <span className='transport-settings-title'>
        <Settings2 aria-hidden='true' />
        Runtime transport lab
      </span>
      <span className='transport-settings-summary'>{routingLabel(routing)}</span>
    </summary>

    <div className='transport-settings-body'>
      <div className='transport-settings-intro'>
        <div>
          <h2>Route Runtime Protocol traffic</h2>
          <p>
            Choose a transport per protocol family. Changes apply to new requests; an active Durable
            observation keeps the route on which it started.
          </p>
        </div>
        <div className='transport-presets' aria-label='Transport presets'>
          <button type='button' onClick={() => onChange(defaultTodoTransportRouting)}>
            WebSocket
          </button>
          <button type='button' onClick={() => onChange(splitTodoTransportRouting)}>
            HTTP + push
          </button>
          <button type='button' onClick={() => onChange(httpTodoTransportRouting)}>
            HTTP
          </button>
        </div>
      </div>

      <div className='transport-route-grid'>
        {routes.map(route => (
          <label className='transport-route' key={route.key}>
            <span className='transport-route-icon'>
              <TransportIcon transport={routing[route.key]} />
            </span>
            <span className='transport-route-copy'>
              <strong>{route.label}</strong>
              <code>{route.protocol}</code>
              <small>{route.description}</small>
            </span>
            <select
              aria-label={`Transport for ${route.label.toLowerCase()}`}
              value={routing[route.key]}
              onChange={event =>
                onChange({
                  ...routing,
                  [route.key]: event.currentTarget.value as TodoTransportName,
                })
              }
            >
              <option value='websocket'>WebSocket</option>
              <option value='http'>HTTP</option>
            </select>
          </label>
        ))}
      </div>
    </div>
  </details>
);
