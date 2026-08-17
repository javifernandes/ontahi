import ts from 'typescript';

export const createTypeScriptSourceFile = (sourceText, fileName = 'module.ts') =>
  ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const formatSourceParseDiagnostics = sourceFile =>
  sourceFile.parseDiagnostics.map(item => {
    const message = ts.flattenDiagnosticMessageText(item.messageText, '\n');
    if (item.start === undefined) {
      return `Invalid TypeScript source: ${message}`;
    }

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(item.start);
    return `Invalid TypeScript source at ${line + 1}:${character + 1}: ${message}`;
  });

export const parseTypeScriptSource = (sourceText, fileName = 'module.ts') => {
  const sourceFile = createTypeScriptSourceFile(sourceText, fileName);

  return {
    sourceFile,
    diagnostics: formatSourceParseDiagnostics(sourceFile),
  };
};
