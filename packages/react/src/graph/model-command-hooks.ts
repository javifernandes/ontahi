'use client';

import { createRuntimeModelCommandClient } from '@ontahi/core/runtime/protocol';
import { useMemo } from 'react';

import { useRuntimeTransport } from './context.js';

export const useModelCommand = () => {
  const runtimeTransport = useRuntimeTransport();
  return useMemo(() => createRuntimeModelCommandClient(runtimeTransport), [runtimeTransport]);
};
