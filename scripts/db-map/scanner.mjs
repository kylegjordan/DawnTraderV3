import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG, classifyPath } from './config.mjs';
import { compareBytes, relationKey, sha256File } from './util.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const TYPESCRIPT_PATH = require.resolve('typescript');

export async function scannerRuntime() {
  return { version: ts.version, path: TYPESCRIPT_PATH, sha256: await sha256File(TYPESCRIPT_PATH) };
}

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function declarationFromCall(call, schemaVars) {
  if (!ts.isCallExpression(call) || !call.arguments.length || !ts.isStringLiteralLike(call.arguments[0])) return null;
  if (ts.isIdentifier(call.expression) && call.expression.text === 'pgTable') return relationKey('public', call.arguments[0].text);
  if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'table' && ts.isIdentifier(call.expression.expression)) {
    const schema = schemaVars.get(call.expression.expression.text);
    if (schema) return relationKey(schema, call.arguments[0].text);
  }
  return null;
}

function collectTypeScriptFacts(files) {
  const parsed = new Map();
  const declarations = new Map();
  const conflicts = new Set();
  const declarationByFile = new Map();
  for (const file of files) {
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, file.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    parsed.set(file.path, source);
    const schemaVars = new Map();
    const fileDeclarations = new Map();
    source.forEachChild((node) => {
      if (!ts.isVariableStatement(node)) return;
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        if (ts.isCallExpression(decl.initializer) && ts.isIdentifier(decl.initializer.expression) && decl.initializer.expression.text === 'pgSchema' && ts.isStringLiteralLike(decl.initializer.arguments[0])) schemaVars.set(decl.name.text, decl.initializer.arguments[0].text);
      }
    });
    source.forEachChild((node) => {
      if (!ts.isVariableStatement(node)) return;
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const key = declarationFromCall(decl.initializer, schemaVars);
        if (!key) continue;
        fileDeclarations.set(decl.name.text, key);
        if (declarations.has(decl.name.text) && declarations.get(decl.name.text) !== key) conflicts.add(decl.name.text);
        else declarations.set(decl.name.text, key);
      }
    });
    declarationByFile.set(file.path, fileDeclarations);
  }
  for (const name of conflicts) declarations.delete(name);
  return { parsed, declarations, declarationByFile, conflicts };
}

function localSymbols(source, declarations, ownDeclarations) {
  const symbols = new Map(ownDeclarations);
  source.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !node.importClause?.namedBindings || !ts.isNamedImports(node.importClause.namedBindings)) return;
    for (const specifier of node.importClause.namedBindings.elements) {
      const imported = specifier.propertyName?.text ?? specifier.name.text;
      if (declarations.has(imported)) symbols.set(specifier.name.text, declarations.get(imported));
    }
  });
  return symbols;
}

function sqlTexts(source, text) {
  const out = [];
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push({ text: node.text, offset: node.getStart(source) });
    if (ts.isTemplateExpression(node)) {
      out.push({ text: `${node.head.text}${node.templateSpans.map((span) => `__DYNAMIC_IDENTIFIER__${span.literal.text}`).join('')}`, offset: node.getStart(source), dynamic: true });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return out.filter((item) => /\b(select|from|join|insert|update|delete|alter|create|drop|truncate|copy)\b/i.test(item.text));
}

const SQL_RELATION = /\b(from|join|insert\s+into|update|delete\s+from|truncate(?:\s+table)?|copy|alter\s+table|create\s+table|drop\s+table)\s+(?:"?([A-Za-z_][\w$]*)"?\.)?"?([A-Za-z_][\w$]*)"?/gi;

function operationFor(token) {
  const value = token.toLowerCase().replace(/\s+/g, ' ');
  if (value === 'from' || value === 'join') return 'read';
  if (value.startsWith('insert')) return 'insert';
  if (value === 'update') return 'update';
  if (value.startsWith('delete')) return 'delete';
  return 'ddl';
}

function resolveSqlReference(schema, name, catalog, context) {
  if (schema) {
    const key = relationKey(schema, name);
    return catalog.byKey.has(key) ? { key } : { unresolved: 'qualified relation is absent from catalog' };
  }
  const candidates = catalog.byBare.get(name) ?? [];
  if (candidates.length === 1) return { key: candidates[0] };
  if (!candidates.length) return { unresolved: 'bare relation is absent from catalog' };
  return { unresolved: `ambiguous bare relation (${candidates.join(', ')})`, context };
}

function scanSql(text, item, file, catalog, usage, unresolved) {
  if (item.dynamic || item.text.includes('__DYNAMIC_IDENTIFIER__')) unresolved.push({ file: file.path, line: lineAt(text, item.offset), kind: 'dynamic_sql', detail: 'computed SQL requires hand resolution', evidence_class: classifyPath(file.path) });
  SQL_RELATION.lastIndex = 0;
  for (const match of item.text.matchAll(SQL_RELATION)) {
    const operation = operationFor(match[1]);
    const resolved = resolveSqlReference(match[2] || null, match[3], catalog, item.text.slice(0, 160));
    const evidence = { file: file.path, line: lineAt(text, item.offset + match.index), operation, source: 'raw_sql', evidence_class: classifyPath(file.path) };
    if (resolved.key) usage.push({ relation: resolved.key, ...evidence });
    else unresolved.push({ ...evidence, kind: 'sql_relation', token: match[0], detail: resolved.unresolved });
  }
}

function scanDrizzle(source, file, symbols, catalog, usage, unresolved) {
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      let operation = null;
      if (method === 'from' || method === 'join' || method.endsWith('Join')) operation = 'read';
      if (['insert', 'update', 'delete'].includes(method)) operation = method;
      if (operation && node.arguments[0]) {
        const arg = node.arguments[0];
        if (ts.isIdentifier(arg) && symbols.has(arg.text)) {
          const key = symbols.get(arg.text);
          const evidence = { relation: key, file: file.path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, operation, source: 'drizzle', evidence_class: classifyPath(file.path) };
          if (catalog.byKey.has(key)) usage.push(evidence);
          else unresolved.push({ ...evidence, kind: 'drizzle_relation', detail: 'typed relation is absent from catalog' });
        } else if (ts.isIdentifier(arg) || ts.isPropertyAccessExpression(arg)) {
          unresolved.push({ file: file.path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, operation, source: 'drizzle', kind: 'drizzle_symbol', token: arg.getText(source), detail: 'Drizzle relation symbol did not resolve', evidence_class: classifyPath(file.path) });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function helperFacts(file, usage, unresolved) {
  const patterns = [
    ['node-postgres Pool', /new\s+(?:pg\.)?Pool\s*\(/],
    ['node-postgres Client', /new\s+(?:pg\.)?Client\s*\(/],
    ['psql process', /(?:spawn|execFile|exec|command|run)[^\n]{0,180}\bpsql\b/],
    ['dt-sql login', /\bdt-sql-login\b/],
    ['python postgres client', /\b(?:psycopg2?|asyncpg)\s*\.\s*connect\s*\(/],
  ];
  const helpers = [];
  for (const [kind, regex] of patterns) {
    const match = regex.exec(file.text);
    if (!match) continue;
    const evidence = usage.filter((row) => row.file === file.path);
    const open = unresolved.filter((row) => row.file === file.path
      && (row.kind !== 'helper_usage' || row.helper_kind === kind));
    if (!evidence.length && !open.length) {
      const disposition = {
        file: file.path,
        line: lineAt(file.text, match.index),
        kind: 'helper_usage',
        helper_kind: kind,
        detail: `${kind} has no file-local relation evidence; constructor-only or delegated use requires hand resolution`,
        evidence_class: classifyPath(file.path),
      };
      unresolved.push(disposition);
      open.push(disposition);
    }
    helpers.push({ file: file.path, line: lineAt(file.text, match.index), kind, operations: evidence, unresolved: open });
  }
  return helpers;
}

export async function scanRepository(root, population, catalog) {
  const catalogIndex = { byKey: new Set(catalog.relations.map((row) => row.key)), byBare: new Map() };
  for (const row of catalog.relations) {
    if (!catalogIndex.byBare.has(row.name)) catalogIndex.byBare.set(row.name, []);
    catalogIndex.byBare.get(row.name).push(row.key);
  }
  const files = [];
  for (const row of population.included) {
    let text;
    try { text = await readFile(join(root, row.path), 'utf8'); } catch (error) {
      files.push({ ...row, text: '', readError: error.message });
      continue;
    }
    files.push({ ...row, text });
  }
  const tsFiles = files.filter((file) => /\.(?:ts|tsx|js|mjs|cjs|mts)$/.test(file.path));
  const facts = collectTypeScriptFacts(tsFiles);
  const usage = [];
  const unresolved = [];
  for (const file of files) {
    if (file.readError) {
      unresolved.push({ file: file.path, line: 1, kind: 'read_error', detail: file.readError, evidence_class: classifyPath(file.path) });
      continue;
    }
    const source = facts.parsed.get(file.path);
    if (source) {
      scanDrizzle(source, file, localSymbols(source, facts.declarations, facts.declarationByFile.get(file.path) ?? new Map()), catalogIndex, usage, unresolved);
      for (const item of sqlTexts(source, file.text)) scanSql(file.text, item, file, catalogIndex, usage, unresolved);
    } else {
      const withoutComments = file.text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*(?:#|--)\s.*$/gm, '');
      scanSql(file.text, { text: withoutComments, offset: 0, dynamic: /\$\{|\+\s*[A-Za-z_]/.test(withoutComments) }, file, catalogIndex, usage, unresolved);
    }
  }
  usage.sort((a, b) => compareBytes(a.relation, b.relation) || compareBytes(a.file, b.file) || a.line - b.line || compareBytes(a.operation, b.operation));
  unresolved.sort((a, b) => compareBytes(a.file, b.file) || a.line - b.line || compareBytes(a.kind, b.kind));
  const helpers = files.flatMap((file) => helperFacts(file, usage, unresolved)).sort((a, b) => compareBytes(a.file, b.file));
  unresolved.sort((a, b) => compareBytes(a.file, b.file) || a.line - b.line || compareBytes(a.kind, b.kind));
  return {
    schema_version: CONFIG.scannerVersion,
    source_ref: population.sourceRef,
    population: {
      included_count: population.included.length,
      excluded_count: population.excluded.length,
      included_tuple_sha256: population.includedTupleSha256,
      included_path_sha256: population.includedPathSha256,
      excluded_path_sha256: population.excludedPathSha256,
      included: population.included,
      excluded: population.excluded,
    },
    usage,
    unresolved,
    helpers,
    zero_hit_wording: `none found by scanner at ${population.sourceRef}`,
  };
}
