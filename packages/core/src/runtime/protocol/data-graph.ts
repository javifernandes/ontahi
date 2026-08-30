import {
  parseGraphCommandRequest,
  type GraphCommandRequest,
  type GraphCommandProtocolError,
} from '../../data-graph/command-protocol.js';
import {
  parseGraphReadRequest,
  type GraphReadProtocolError,
  type GraphReadRequestV1,
} from '../../data-graph/read-protocol.js';

import { defineRuntimeProtocolFamily } from './registry.js';

export const graphReadRuntimeProtocolFamily = defineRuntimeProtocolFamily<
  'graph.read',
  GraphReadRequestV1,
  GraphReadProtocolError
>({
  name: 'graph.read',
  parseRequest: parseGraphReadRequest,
});

export const graphCommandRuntimeProtocolFamily = defineRuntimeProtocolFamily<
  'graph.command',
  GraphCommandRequest,
  GraphCommandProtocolError
>({
  name: 'graph.command',
  parseRequest: parseGraphCommandRequest,
});

export const dataGraphRuntimeProtocolFamilies = [
  graphReadRuntimeProtocolFamily,
  graphCommandRuntimeProtocolFamily,
] as const;
