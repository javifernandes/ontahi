import type { OntahiSourceLoader } from './contracts.mjs';

export type FileSystemSourceLoaderOptions = {
  rootDir?: string;
  aliases?: Readonly<Record<string, string>>;
  extensions?: readonly string[];
};

export const createFileSystemSourceLoader: (
  options?: FileSystemSourceLoaderOptions,
) => OntahiSourceLoader;
