import { parser } from './generated/selection-parser.js';

export const selectionDocumentParser = parser;
export const consoleDocumentParser = parser.configure({ top: 'ConsoleDocument' });
