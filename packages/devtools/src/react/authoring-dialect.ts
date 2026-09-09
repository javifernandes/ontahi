import type { ConsoleDialect } from '@ontahi/language';
import { createContext } from 'react';

// Presentation context, independent of editor state and captured runtime traffic.
export const AuthoringDialectContext = createContext<ConsoleDialect>('ts');
