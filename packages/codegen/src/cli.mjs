#!/usr/bin/env node

import { runClientEntityCodegenCli } from './client-entities.mjs';

try {
  await runClientEntityCodegenCli();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
