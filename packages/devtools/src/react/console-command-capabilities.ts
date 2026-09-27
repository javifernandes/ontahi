import { isRecord } from '@ontahi/core';
import {
  isGraphCommandCapabilities,
  type EntityMutationCommandAction,
} from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolExchange,
  isConfigurableRuntimeTransport,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

type Entry = { actions?: readonly EntityMutationCommandAction[]; error?: string };
type Discovery = {
  transport: RuntimeTransport<any>;
  targetsKey: string;
  route?: string;
  identityKey: string;
  entries: ReadonlyMap<string, Entry>;
};
const subscribeUnconfigured = () => () => undefined;

/** Discovers the server policy projection used to author Entity mutation Commands. */
export const useConsoleCommandCapabilities = (
  transport: RuntimeTransport<any> | undefined,
  identityKey: string,
  entityNames: readonly string[],
) => {
  const routing =
    transport && isConfigurableRuntimeTransport(transport) ? transport.routing : undefined;
  const route = useSyncExternalStore(
    routing?.subscribe ?? subscribeUnconfigured,
    () => routing?.inspect().assignments['graph.command'],
    () => undefined,
  );
  const targetsKey = JSON.stringify(entityNames);
  const [discovery, setDiscovery] = useState<Discovery>();

  useEffect(() => {
    if (!transport) return;
    let active = true;
    const controller = new AbortController();
    const entries = new Map<string, Entry>();
    setDiscovery({ transport, targetsKey, route, identityKey, entries });
    const exchange = createRuntimeProtocolExchange({ transport });
    const publish = (name: string, entry: Entry) => {
      if (!active) return;
      entries.set(name, entry);
      setDiscovery({ transport, targetsKey, route, identityKey, entries: new Map(entries) });
    };
    for (const name of JSON.parse(targetsKey) as string[]) {
      void exchange(
        {
          family: 'graph.command',
          body: { version: 1, kind: 'graph-command-capabilities', entityName: name },
        },
        { signal: controller.signal },
      )
        .then(response => {
          if (!isRecord(response)) throw new Error('Invalid Graph Command capabilities response.');
          if (
            response.kind === 'protocol-error' &&
            isRecord(response.error) &&
            typeof response.error.message === 'string'
          )
            throw new Error(response.error.message);
          if (
            response.kind !== 'graph-command-capabilities-result' ||
            response.entityName !== name ||
            !isGraphCommandCapabilities(response.capabilities)
          )
            throw new Error('This server did not return Graph Command capabilities.');
          publish(name, { actions: response.capabilities.entityMutations });
        })
        .catch((error: unknown) =>
          publish(name, {
            error: error instanceof Error ? error.message : 'Could not load Command permissions.',
          }),
        );
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, [transport, targetsKey, route, identityKey]);

  const current = discovery;
  const matching =
    current &&
    current.transport === transport &&
    current.targetsKey === targetsKey &&
    current.route === route &&
    current.identityKey === identityKey
      ? current
      : undefined;

  return useCallback(
    (entityName: string) => matching?.entries.get(entityName)?.actions,
    [matching],
  );
};
