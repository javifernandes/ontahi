import {
  parseGraphCommandRequest,
  type GraphCommandRequest,
  type GraphCommandProtocolError,
} from '../../data-graph/command-protocol.js';
import {
  parseGraphReadFamilyRequest,
  type GraphReadProtocolError,
  type GraphReadFamilyRequest,
} from '../../data-graph/read-protocol.js';

import { defineRuntimeProtocolFamily } from './registry.js';

export const graphReadRuntimeProtocolFamily = defineRuntimeProtocolFamily<
  'graph.read',
  GraphReadFamilyRequest,
  GraphReadProtocolError
>({
  name: 'graph.read',
  parseRequest: parseGraphReadFamilyRequest,
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
