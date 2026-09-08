import { parser } from './generated/selection-parser.js';

export { parser as selectionDocumentParser } from './generated/selection-parser.js';
export const consoleDocumentParser = parser.configure({ top: 'ConsoleDocument' });
