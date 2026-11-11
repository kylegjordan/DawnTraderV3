import { pathToFileURL } from 'node:url';

/**
 * True only when the module is the command-line entry point.  Keeping this
 * comparison in one place makes operational scripts safe to import in tests
 * without weakening their existing `tsx path/to/script.ts` command surface.
 */
export function isDirectEntry(moduleUrl: string, argvEntry = process.argv[1]): boolean {
  if (!argvEntry) return false;
  return moduleUrl === pathToFileURL(argvEntry).href;
}
