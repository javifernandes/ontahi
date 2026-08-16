import ts from 'typescript';

export const collectImportMap = sourceFile => {
  const importMap = new Map();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) {
      continue;
    }

    const moduleSpecifier = ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : undefined;

    if (!moduleSpecifier) {
      continue;
    }

    const namedBindings = statement.importClause.namedBindings;

    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        importMap.set(element.name.text, moduleSpecifier);
      }
    }
  }

  return importMap;
};

export const collectConstDeclarations = sourceFile => {
  const declarations = new Map();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }

      declarations.set(declaration.name.text, declaration);
    }
  }

  return declarations;
};

export const createSchemaContext = ({
  sourceFile,
  sourcePath,
  resolveImportSource,
  moduleCache = new Map(),
}) => ({
  sourceFile,
  sourcePath,
  declarations: collectConstDeclarations(sourceFile),
  importMap: collectImportMap(sourceFile),
  resolveImportSource,
  moduleCache,
});

export const resolveImportedSchemaContext = (identifierName, context) => {
  const importPath = context.importMap.get(identifierName);

  if (!importPath || !context.resolveImportSource) {
    return undefined;
  }

  const resolved = context.resolveImportSource(context.sourcePath, importPath);

  if (!resolved) {
    return undefined;
  }

  const cacheKey = resolved.sourcePath ?? importPath;
  const cached = context.moduleCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const sourceFile = ts.createSourceFile(
    resolved.sourcePath ?? importPath,
    resolved.sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const importedContext = createSchemaContext({
    sourceFile,
    sourcePath: resolved.sourcePath,
    resolveImportSource: context.resolveImportSource,
    moduleCache: context.moduleCache,
  });

  context.moduleCache.set(cacheKey, importedContext);
  return importedContext;
};
