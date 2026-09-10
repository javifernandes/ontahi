import { createSqlDerivedFieldCompiler } from '@ontahi/sql';

import { postgresDialect } from './dialect.js';
export const compilePostgresDerivedField = createSqlDerivedFieldCompiler(postgresDialect);
