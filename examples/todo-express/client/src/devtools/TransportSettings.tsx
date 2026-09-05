import { Cable, Globe2 } from 'lucide-react';

import {
  defaultTodoTransportRouting,
  httpTodoTransportRouting,
  splitTodoTransportRouting,
  type TodoTransportName,
  type TodoTransportRouting,
} from '../runtime-transport-routing.js';

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
    description: 'Immediate and long-running Operation invocations.',
  },
  {
    key: 'durableProgress',
    label: 'Operation progress',
    protocol: 'durable.operation',
    description: 'HTTP polls or WebSocket pushed updates.',
  },
];

const presets: ReadonlyArray<{
  label: string;
  routing: TodoTransportRouting;
}> = [
  { label: 'WebSocket', routing: defaultTodoTransportRouting },
  { label: 'HTTP + push', routing: splitTodoTransportRouting },
  { label: 'HTTP', routing: httpTodoTransportRouting },
];

const routingLabel = (routing: TodoTransportRouting) => {
  const webSocketCount = Object.values(routing).filter(value => value === 'websocket').length;
  if (webSocketCount === routes.length) return 'WebSocket only';
  if (webSocketCount === 0) return 'HTTP only';
  return `${routes.length - webSocketCount} HTTP · ${webSocketCount} WS`;
};

const sameRouting = (left: TodoTransportRouting, right: TodoTransportRouting) =>
  routes.every(route => left[route.key] === right[route.key]);

const TransportIcon = ({ transport }: { transport: TodoTransportName }) =>
  transport === 'websocket' ? <Cable aria-hidden='true' /> : <Globe2 aria-hidden='true' />;

export const TransportSettings = ({ routing, onChange }: TransportSettingsProps) => (
  <div className='devtools-transport-settings'>
    <header className='devtools-transport-header'>
      <div>
        <span className='devtools-settings-eyebrow'>Transport routing</span>
        <h3>Runtime transport</h3>
        <p>
          Choose the transport for new Runtime Protocol work. An active progress stream stays on the
          route where it started.
        </p>
      </div>
      <span className='devtools-transport-summary'>{routingLabel(routing)}</span>
    </header>

    <div className='devtools-transport-presets' aria-label='Transport presets'>
      {presets.map(preset => (
        <button
          key={preset.label}
          type='button'
          aria-pressed={sameRouting(routing, preset.routing)}
          onClick={() => onChange(preset.routing)}
        >
          {preset.label}
        </button>
      ))}
    </div>

    <div className='devtools-transport-route-grid'>
      {routes.map(route => (
        <label className='devtools-transport-route' key={route.key}>
          <span className='devtools-transport-route-icon'>
            <TransportIcon transport={routing[route.key]} />
          </span>
          <span className='devtools-transport-route-copy'>
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
);
