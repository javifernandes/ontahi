import {
  parseGraphCommandFamilyRequest,
  type GraphCommandFamilyRequest,
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
  GraphCommandFamilyRequest,
  GraphCommandProtocolError
>({
  name: 'graph.command',
  parseRequest: parseGraphCommandFamilyRequest,
});

export const dataGraphRuntimeProtocolFamilies = [
  graphReadRuntimeProtocolFamily,
  graphCommandRuntimeProtocolFamily,
] as const;
