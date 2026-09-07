import {
  type ConfigurableRuntimeTransport,
  type RuntimeTransportCapability,
  type RuntimeTransportRouting,
} from '@ontahi/core/runtime/protocol';
import { useSyncExternalStore } from 'react';

import { transportSettingsStyles as styles } from './transport-settings-styles.js';

export type RuntimeTransportSettingsProps = {
  readonly runtimeTransport: ConfigurableRuntimeTransport<any>;
};

const capabilityCopy: Record<
  RuntimeTransportCapability,
  { readonly label: string; readonly description: string }
> = {
  operation: {
    label: 'Operation calls',
    description: 'Immediate and long-running Operation invocations.',
  },
  'durable.operation': {
    label: 'Durable status requests',
    description: 'Direct inspection requests for durable runs.',
  },
  'graph.read': {
    label: 'Graph reads',
    description: 'Queries and reflected Entity reads.',
  },
  'graph.command': {
    label: 'Graph commands',
    description: 'Entity and Relationship mutations.',
  },
  'durable.operation.observe': {
    label: 'Operation progress',
    description: 'Polling or pushed updates for an active durable run.',
  },
  'graph.observe': {
    label: 'Graph observation',
    description: 'Live invalidation and graph update streams.',
  },
};

const familiarTransportNames: Readonly<Record<string, string>> = {
  http: 'HTTP',
  https: 'HTTPS',
  websocket: 'WebSocket',
  ws: 'WebSocket',
};

const displayName = (transportId: string) =>
  familiarTransportNames[transportId.toLowerCase()] ??
  transportId
    .split(/[._-]/)
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');

const sameRouting = (left: RuntimeTransportRouting, right: RuntimeTransportRouting) =>
  Object.entries(left).every(
    ([capability, transportId]) => right[capability as RuntimeTransportCapability] === transportId,
  );

const routingLabel = (routing: RuntimeTransportRouting) => {
  const counts = new Map<string, number>();
  for (const transportId of Object.values(routing)) {
    if (transportId) counts.set(transportId, (counts.get(transportId) ?? 0) + 1);
  }
  if (counts.size === 1) return `${displayName([...counts.keys()][0]!)} only`;
  return [...counts]
    .map(([transportId, count]) => `${count} ${displayName(transportId)}`)
    .join(' · ');
};

export const RuntimeTransportSettings = ({ runtimeTransport }: RuntimeTransportSettingsProps) => {
  const snapshot = useSyncExternalStore(
    runtimeTransport.routing.subscribe,
    runtimeTransport.routing.inspect,
    runtimeTransport.routing.inspect,
  );
  const capabilities = Object.keys(snapshot.assignments) as RuntimeTransportCapability[];
  const profiles = snapshot.transports.map(preferred => ({
    id: preferred.id,
    assignments: Object.fromEntries(
      capabilities.map(capability => [
        capability,
        preferred.capabilities.includes(capability)
          ? preferred.id
          : snapshot.transports.find(transport => transport.capabilities.includes(capability))!.id,
      ]),
    ) as RuntimeTransportRouting,
  }));

  const applyRouting = (routing: RuntimeTransportRouting) => {
    for (const capability of capabilities) {
      runtimeTransport.routing.configure(capability, routing[capability]!);
    }
  };

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.heading}>
          <span style={styles.eyebrow}>Transport routing</span>
          <h3 style={styles.title}>Runtime transport</h3>
          <p style={styles.description}>
            Choose the transport for new Runtime work. Active observations stay on the route where
            they started.
          </p>
        </div>
        <span style={styles.summary}>{routingLabel(snapshot.assignments)}</span>
      </header>

      <div style={styles.presets} aria-label='Transport profiles'>
        {profiles.map(profile => (
          <button
            key={profile.id}
            type='button'
            style={{
              ...styles.preset,
              ...(sameRouting(snapshot.assignments, profile.assignments)
                ? styles.activePreset
                : {}),
            }}
            aria-pressed={sameRouting(snapshot.assignments, profile.assignments)}
            onClick={() => applyRouting(profile.assignments)}
          >
            Prefer {displayName(profile.id)}
          </button>
        ))}
      </div>

      <div style={styles.routeGrid}>
        {capabilities.map(capability => {
          const copy = capabilityCopy[capability];
          const transportId = snapshot.assignments[capability]!;
          return (
            <label style={styles.route} key={capability}>
              <span style={styles.routeIcon}>{transportId.slice(0, 2)}</span>
              <span style={styles.routeCopy}>
                <strong style={styles.routeLabel}>{copy.label}</strong>
                <code style={styles.capability}>{capability}</code>
                <small style={styles.routeDescription}>{copy.description}</small>
              </span>
              <select
                style={styles.select}
                aria-label={`Transport for ${copy.label.toLowerCase()}`}
                value={transportId}
                onChange={event =>
                  runtimeTransport.routing.configure(capability, event.currentTarget.value)
                }
              >
                {snapshot.transports.map(transport => (
                  <option
                    key={transport.id}
                    value={transport.id}
                    disabled={!transport.capabilities.includes(capability)}
                  >
                    {displayName(transport.id)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
};
