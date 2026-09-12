import type { ConsoleDialect } from '../model/contracts.js';

import type { Dialect } from './contract.js';
import { declarativeDialect } from './declarative.js';
import { tsDialect } from './ts.js';

const dialects: Readonly<Record<ConsoleDialect, Dialect>> = {
  ts: tsDialect,
  declarative: declarativeDialect,
};

export const getDialect = (id: ConsoleDialect = 'ts'): Dialect => dialects[id];
