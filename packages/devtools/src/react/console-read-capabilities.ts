import { isRecord } from '@ontahi/core';
import { isGraphReadCapabilities, type GraphReadCapabilities } from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolExchange,
  isConfigurableRuntimeTransport,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

type Discovery = {
  readonly transport: RuntimeTransport<any>;
  readonly entityName: string;
  readonly route?: string;
  readonly identityKey: string;
  readonly capabilities?: GraphReadCapabilities;
  readonly error?: string;
};

const subscribeUnconfigured = () => () => undefined;

/** Bound to transport, Entity and identity; late replies cannot restore another authority's metadata. */
export const useConsoleReadCapabilities = (
  transport: RuntimeTransport<any> | undefined,
  entityName: string | undefined,
  identityKey = '',
) => {
  const routing =
    transport && isConfigurableRuntimeTransport(transport) ? transport.routing : undefined;
  const route = useSyncExternalStore(
    routing?.subscribe ?? subscribeUnconfigured,
    () => routing?.inspect().assignments['graph.read'],
    () => undefined,
  );
  const [discovery, setDiscovery] = useState<Discovery>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!transport || !entityName) return;
    let active = true;
    const controller = new AbortController();
    setDiscovery(undefined);
    const exchange = createRuntimeProtocolExchange({ transport });
    void exchange(
      {
        family: 'graph.read',
        body: { version: 1, kind: 'graph-read-capabilities', entityName },
      },
      { signal: controller.signal },
    )
      .then(response => {
        if (!isRecord(response)) throw new Error('Invalid Graph Read capabilities response.');
        if (
          response.kind === 'protocol-error' &&
          isRecord(response.error) &&
          typeof response.error.message === 'string'
        )
          throw new Error(response.error.message);
        if (
          response.kind !== 'graph-read-capabilities-result' ||
          response.entityName !== entityName ||
          !isGraphReadCapabilities(response.capabilities)
        )
          throw new Error('This server did not return Graph Read capabilities.');
        if (active)
          setDiscovery({
            transport,
            entityName,
            route,
            identityKey,
            capabilities: response.capabilities,
          });
      })
      .catch((error: unknown) => {
        if (active)
          setDiscovery({
            transport,
            entityName,
            route,
            identityKey,
            error: error instanceof Error ? error.message : 'Could not load ordering permissions.',
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [transport, entityName, route, identityKey, revision]);

  const current =
    discovery &&
    discovery.transport === transport &&
    discovery.entityName === entityName &&
    discovery.route === route &&
    discovery.identityKey === identityKey
      ? discovery
      : undefined;
  const capabilities = current?.capabilities;
  const orderableFields = useMemo(
    () => (name: string) => (name === entityName ? (capabilities?.orderBy ?? []) : []),
    [entityName, capabilities],
  );
  return {
    route,
    capabilities,
    orderableFields,
    error: current?.error,
    loading: Boolean(transport && entityName && !current),
    refresh: () => {
      setDiscovery(undefined);
      setRevision(value => value + 1);
    },
  };
};
