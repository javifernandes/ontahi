import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

const isFile = sourcePath => {
  if (!existsSync(sourcePath)) {
    return false;
  }

  try {
    return statSync(sourcePath).isFile();
  } catch {
    return false;
  }
};

const resolveExistingModulePath = (basePath, extensions) => {
  const candidates = [
    basePath,
    ...extensions.map(extension => `${basePath}${extension}`),
    ...extensions.map(extension => path.join(basePath, `index${extension}`)),
  ];

  return candidates.find(isFile);
};

export const createFileSystemSourceLoader = ({
  rootDir = process.cwd(),
  aliases = {},
  extensions = DEFAULT_EXTENSIONS,
} = {}) => {
  const resolvedRootDir = path.resolve(rootDir);
  const resolvedAliases = Object.entries(aliases)
    .map(([alias, targetPath]) => [
      alias.replace(/\/$/, ''),
      path.isAbsolute(targetPath)
        ? path.normalize(targetPath)
        : path.resolve(resolvedRootDir, targetPath),
    ])
    .sort(([left], [right]) => right.length - left.length);

  const resolveSourcePath = sourcePath =>
    resolveExistingModulePath(
      path.isAbsolute(sourcePath) ? sourcePath : path.resolve(resolvedRootDir, sourcePath),
      extensions,
    );

  const resolveImportPath = (fromSourcePath, importPath) => {
    const aliasEntry = resolvedAliases.find(
      ([alias]) => importPath === alias || importPath.startsWith(`${alias}/`),
    );

    if (aliasEntry) {
      const [alias, targetPath] = aliasEntry;
      const suffix = importPath === alias ? '' : importPath.slice(alias.length + 1);
      return resolveExistingModulePath(path.join(targetPath, suffix), extensions);
    }

    if (path.isAbsolute(importPath)) {
      return resolveExistingModulePath(importPath, extensions);
    }

    if (!importPath.startsWith('.') || !fromSourcePath) {
      return undefined;
    }

    return resolveExistingModulePath(
      path.resolve(path.dirname(fromSourcePath), importPath),
      extensions,
    );
  };

  const readSource = sourcePath => {
    const resolvedSourcePath = resolveSourcePath(sourcePath);

    if (!resolvedSourcePath) {
      throw new Error(`Could not resolve source module ${sourcePath}.`);
    }

    return {
      sourcePath: resolvedSourcePath,
      sourceText: readFileSync(resolvedSourcePath, 'utf8'),
    };
  };

  const resolveImportSource = (fromSourcePath, importPath) => {
    const sourcePath = resolveImportPath(fromSourcePath, importPath);

    return sourcePath
      ? {
          sourcePath,
          sourceText: readFileSync(sourcePath, 'utf8'),
        }
      : undefined;
  };

  return {
    readSource,
    resolveImportSource,
  };
};
