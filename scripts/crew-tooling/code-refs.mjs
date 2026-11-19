#!/usr/bin/env node
// B-WORKFLOW-IMPROVE OBJ-4 (Q3) - type-aware references to a symbol, from the repo's own pinned TypeScript.
// A LEAD for an audit, never a verdict: text the type checker cannot follow (raw SQL, string keys,
// dynamic imports, shell scripts) is NOT covered, and the output says so in `unresolved_surfaces`.
// Usage:  node scripts/crew-tooling/code-refs.mjs <symbol> [--file <path declaring it>] [--root <repo dir>]
// Output: one JSON object on stdout.
// Exit:   0 references found (other than the declaration), 1 none, 2 error (symbol not declared, ambiguous, or TS failure).
// Plain Node + the repo's node_modules/typescript, so a Claude and a Codex session run the same thing.
import { createRequire } from 'node:module';
import { resolve, relative, join } from 'node:path';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const symbol = args.find((a, i) => !a.startsWith('--') && !['--file', '--root'].includes(args[i - 1]));
const ROOT = resolve(opt('--root') || process.cwd());
const fileFilter = opt('--file');
const out = (o, code) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const base = { tool: 'code-refs.mjs', tool_version: '1.0', root: ROOT, symbol: symbol || null };

if (!symbol) out({ ...base, error: 'usage: code-refs.mjs <symbol> [--file <path>] [--root <repo dir>]' }, 2);
let ts;
try { ts = createRequire(join(ROOT, 'package.json'))('typescript'); }
catch (e) { out({ ...base, error: `cannot load the repo's typescript from ${ROOT}: ${e.message}` }, 2); }

const UNRESOLVED = [
  'raw SQL strings (table and column names in sql`...` or text queries)',
  'string-keyed access (obj[name], route strings, config keys, JSON)',
  'dynamic import() with a computed path, require() of a computed path',
  'shell, Python and systemd files outside the TypeScript program',
  'files excluded by both tsconfigs (server/legacy/**, build output)',
];

function parse(cfgPath) {
  const abs = join(ROOT, cfgPath);
  if (!existsSync(abs)) return null;
  const read = ts.readConfigFile(abs, ts.sys.readFile);
  if (read.error) throw new Error(`${cfgPath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')}`);
  return ts.parseJsonConfigFileContent(read.config, ts.sys, resolve(abs, '..'), undefined, abs);
}

try {
  const rootCfg = parse('tsconfig.json');
  if (!rootCfg) out({ ...base, error: 'no tsconfig.json at root' }, 2);
  const serverCfg = parse('server/tsconfig.json');
  // Test files: the root tsconfig excludes **/*.test.ts, but a reader in a test is still a reader.
  const testCfg = ts.parseJsonConfigFileContent({ compilerOptions: {}, include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'client/src/**/*.test.ts', 'server/tests/**/*.ts'], exclude: ['node_modules'] }, ts.sys, ROOT);
  const files = [...new Set([...rootCfg.fileNames, ...(serverCfg ? serverCfg.fileNames : []), ...testCfg.fileNames])];
  const options = { ...rootCfg.options, noEmit: true };
  const versions = new Map(files.map((f) => [f, '0']));
  const host = {
    getScriptFileNames: () => files,
    getScriptVersion: (f) => versions.get(f) || '0',
    getScriptSnapshot: (f) => (ts.sys.fileExists(f) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(f)) : undefined),
    getCurrentDirectory: () => ROOT,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists, getDirectories: ts.sys.getDirectories,
  };
  const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
  const program = ls.getProgram();
  const rel = (f) => relative(ROOT, f).split('\\').join('/');

  // Find top-level declarations of the name.
  const decls = [];
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf.fileName.includes('/node_modules/')) continue;
    if (fileFilter && rel(sf.fileName) !== fileFilter.split('\\').join('/')) continue;
    const visit = (node) => {
      const n = node.name;
      if (n && ts.isIdentifier(n) && n.text === symbol && (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isVariableDeclaration(node))) {
        decls.push({ file: rel(sf.fileName), abs: sf.fileName, pos: n.getStart(sf), line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
      }
      if (ts.isSourceFile(node) || ts.isVariableStatement(node) || ts.isVariableDeclarationList(node) || ts.isModuleBlock(node) || ts.isModuleDeclaration(node)) ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  const tsconfigs = ['tsconfig.json', serverCfg ? 'server/tsconfig.json' : null, '(test files added)'].filter(Boolean);
  const common = { ...base, ts_version: ts.version, tsconfigs, program_files: files.length, unresolved_surfaces: UNRESOLVED };
  if (decls.length === 0) out({ ...common, error: `no top-level declaration of "${symbol}" found${fileFilter ? ` in ${fileFilter}` : ''}` }, 2);
  if (decls.length > 1) out({ ...common, error: 'ambiguous: several declarations; pass --file', declarations: decls.map(({ file, line }) => ({ file, line })) }, 2);

  const d = decls[0];
  const groups = ls.findReferences(d.abs, d.pos) || [];
  const refs = [];
  const seen = new Set();
  for (const g of groups) for (const r of g.references) {
    const sf = program.getSourceFile(r.fileName);
    const line = sf ? sf.getLineAndCharacterOfPosition(r.textSpan.start).line + 1 : null;
    const key = `${r.fileName}:${r.textSpan.start}`;
    if (seen.has(key)) continue; seen.add(key);
    refs.push({ file: rel(r.fileName), line, is_definition: !!r.isDefinition, text: sf ? sf.text.split('\n')[line - 1].trim().slice(0, 160) : null });
  }
  refs.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const uses = refs.filter((r) => !r.is_definition);
  out({
    ...common,
    declaration: { file: d.file, line: d.line },
    counts: { references_total: refs.length, uses: uses.length, definitions: refs.length - uses.length, files_total: new Set(refs.map((r) => r.file)).size, files_with_uses: new Set(uses.map((r) => r.file)).size },
    references: refs,
  }, uses.length ? 0 : 1);
} catch (e) {
  out({ ...base, error: `TypeScript failure: ${e.stack || e.message}` }, 2);
}
