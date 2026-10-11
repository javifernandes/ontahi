import {
  createRuntimeTransportRouter,
  type ConfigurableRuntimeTransport,
  type RuntimeTransport,
  type RuntimeTransportRouterOptions,
} from '@ontahi/core/runtime/protocol';

import { createOntahiDiagnostics, type OntahiDiagnosticsOptions } from './diagnostics.js';
import {
  associateRuntimeTransportDiagnostics,
  instrumentRuntimeTransport,
} from './instrument-runtime-transport.js';

type AnyRuntimeTransport = RuntimeTransport<any>;

type RuntimeTransportOptionsOf<TTransport> =
  TTransport extends RuntimeTransport<infer TTransportOptions> ? TTransportOptions : never;

export type DiagnosticRuntimeTransportRouterOptions<
  TTransports extends Readonly<Record<string, AnyRuntimeTransport>>,
> = RuntimeTransportRouterOptions<TTransports> & {
  /** Pass false to keep the same composition in builds where diagnostics are disabled. */
  readonly diagnostics: OntahiDiagnosticsOptions | false;
};

export const createDiagnosticRuntimeTransportRouter = <
  const TTransports extends Readonly<Record<string, AnyRuntimeTransport>>,
>({
  diagnostics: diagnosticOptions,
  transports,
  routing,
}: DiagnosticRuntimeTransportRouterOptions<TTransports>): ConfigurableRuntimeTransport<
  RuntimeTransportOptionsOf<TTransports[keyof TTransports]>
> => {
  if (diagnosticOptions === false) return createRuntimeTransportRouter({ transports, routing });

  const diagnostics = createOntahiDiagnostics(diagnosticOptions);
  const instrumentedTransports = Object.fromEntries(
    Object.entries(transports).map(([id, transport]) => [
      id,
      instrumentRuntimeTransport({
        diagnostics,
        id,
        kind: transport.descriptor?.kind ?? id,
        transport,
      }),
    ]),
  ) as TTransports;
  const runtimeTransport = createRuntimeTransportRouter({
    transports: instrumentedTransports,
    routing,
  });
  associateRuntimeTransportDiagnostics(runtimeTransport, diagnostics);
  return runtimeTransport;
};
