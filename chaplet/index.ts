import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

const BRIDGE_PATH = path.join(process.cwd(), 'bridge');

function readBridgeFile(relativePath: string): string | null {
  try {
    const fullPath = path.join(BRIDGE_PATH, relativePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function listDirectory(relativePath: string): string[] {
  try {
    const fullPath = path.join(BRIDGE_PATH, relativePath);
    if (!fs.existsSync(fullPath)) return [];
    return fs.readdirSync(fullPath);
  } catch {
    return [];
  }
}

router.get('/context/grounding', (_req, res) => {
  const config = readBridgeFile('bridge.config.json');
  const sessionBootstrap = readBridgeFile('runtime/session-bootstrap.md');
  const assistantRules = readBridgeFile('runtime/assistant-rules.md');
  
  res.json({
    status: 'ok',
    mode: 'read-only',
    bridge_config: config ? JSON.parse(config) : null,
    session_bootstrap: sessionBootstrap,
    assistant_rules: assistantRules,
    timestamp: new Date().toISOString()
  });
});

router.get('/context/canonical', (_req, res) => {
  const canonicalFiles = listDirectory('canonical');
  const referenceFiles = listDirectory('reference');
  const decisionFiles = listDirectory('decisions');
  const directiveFiles = listDirectory('directives');
  const runtimeFiles = listDirectory('runtime');
  const sessionFiles = listDirectory('sessions');
  const phaseFiles = listDirectory('phases');
  
  res.json({
    status: 'ok',
    mode: 'read-only',
    bridge_structure: {
      canonical: canonicalFiles,
      reference: referenceFiles,
      decisions: decisionFiles,
      directives: directiveFiles,
      runtime: runtimeFiles,
      sessions: sessionFiles,
      phases: phaseFiles
    },
    timestamp: new Date().toISOString()
  });
});

router.get('/context/file/:folder/:filename', (req, res) => {
  const { folder, filename } = req.params;
  const allowedFolders = ['canonical', 'reference', 'decisions', 'directives', 'runtime', 'sessions', 'phases'];
  
  if (!allowedFolders.includes(folder)) {
    return res.status(400).json({ error: 'Invalid folder' });
  }
  
  const content = readBridgeFile(`${folder}/${filename}`);
  if (!content) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.json({
    status: 'ok',
    mode: 'read-only',
    folder,
    filename,
    content,
    timestamp: new Date().toISOString()
  });
});

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'chaplet',
    mode: 'read-only',
    bridge_path: BRIDGE_PATH,
    bridge_exists: fs.existsSync(BRIDGE_PATH),
    timestamp: new Date().toISOString()
  });
});

export default router;
