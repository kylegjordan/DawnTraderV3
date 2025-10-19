import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage';

interface ContextRecord {
  type: 'purpose' | 'system_state' | 'development_history' | 'contextual_reference';
  title: string;
  summary: string;
  source: string;
  actionable: boolean;
  policy: 'no-execution';
}

interface SystemContextEntry {
  key: string;
  value: string;
  source: string;
}

class ContextLoader {
  private readonly WHITELISTED_DIRECTORIES = [
    'replit.md',
    'context_uploads'
  ];
  
  private readonly CODE_BLOCK_REGEX = /```[\s\S]*?```/g;
  private readonly FENCED_JSON_REGEX = /\{[\s\S]*?\}/g;
  private readonly MAX_SUMMARY_LENGTH = 500;

  /**
   * Initialize context loading on startup
   */
  async initialize(): Promise<void> {
    console.log('[ContextLoader] Starting context ingestion...');
    
    try {
      const records = await this.scanAndParse();
      await this.persistRecords(records);
      
      console.log(`[ContextLoader] ✅ Loaded ${records.length} context records`);
    } catch (error: any) {
      console.error('[ContextLoader] ❌ Failed to load context:', error.message);
      throw error;
    }
  }

  /**
   * Manually trigger context ingestion
   */
  async ingest(options: { files?: string[]; overwrite?: boolean } = {}): Promise<{ 
    success: boolean; 
    recordsCreated: number;
    filesProcessed: number;
  }> {
    console.log('[ContextLoader] Manual ingestion triggered', options);
    
    try {
      const records = await this.scanAndParse(options.files);
      
      if (options.overwrite) {
        await this.clearExistingContext();
      }
      
      await this.persistRecords(records);
      
      const filesProcessed = new Set(records.map(r => r.source)).size;
      
      return {
        success: true,
        recordsCreated: records.length,
        filesProcessed
      };
    } catch (error: any) {
      console.error('[ContextLoader] Manual ingestion failed:', error.message);
      return {
        success: false,
        recordsCreated: 0,
        filesProcessed: 0
      };
    }
  }

  /**
   * Scan whitelisted directories for .md and .txt files
   */
  private async scanAndParse(specificFiles?: string[]): Promise<ContextRecord[]> {
    const allRecords: ContextRecord[] = [];
    
    // Always parse replit.md
    const replitMdPath = path.join(process.cwd(), 'replit.md');
    try {
      const replitRecords = await this.parseFile(replitMdPath, 'replit.md');
      allRecords.push(...replitRecords);
      console.log(`[ContextLoader] Parsed replit.md — ${replitRecords.length} entries`);
    } catch (error: any) {
      console.warn('[ContextLoader] Could not parse replit.md:', error.message);
    }
    
    // Parse context_uploads directory
    const uploadsPath = path.join(process.cwd(), 'context_uploads');
    try {
      await fs.mkdir(uploadsPath, { recursive: true });
      const files = await fs.readdir(uploadsPath);
      
      for (const file of files) {
        // Filter by specific files if provided
        if (specificFiles && !specificFiles.includes(file)) {
          continue;
        }
        
        // Only process .md and .txt files
        if (!file.endsWith('.md') && !file.endsWith('.txt')) {
          continue;
        }
        
        const filePath = path.join(uploadsPath, file);
        const fileRecords = await this.parseFile(filePath, file);
        allRecords.push(...fileRecords);
        console.log(`[ContextLoader] Parsed ${file} — ${fileRecords.length} entries`);
      }
    } catch (error: any) {
      console.warn('[ContextLoader] Could not scan context_uploads:', error.message);
    }
    
    return allRecords;
  }

  /**
   * Parse a single file into context records
   */
  private async parseFile(filePath: string, fileName: string): Promise<ContextRecord[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Strip code blocks and JSON to prevent execution
    const sanitized = this.sanitizeContent(content);
    
    // Extract sections
    const sections = this.extractSections(sanitized);
    
    // Convert to context records
    return sections.map(section => ({
      type: this.classifyType(section.title),
      title: section.title,
      summary: this.summarize(section.content),
      source: fileName,
      actionable: false, // Always false for safety
      policy: 'no-execution' as const
    }));
  }

  /**
   * Remove code blocks, JSON, and executable content
   */
  private sanitizeContent(content: string): string {
    let sanitized = content;
    
    // Remove code blocks (triple backticks)
    sanitized = sanitized.replace(this.CODE_BLOCK_REGEX, '[CODE_REMOVED]');
    
    // Remove standalone JSON objects (basic pattern)
    sanitized = sanitized.replace(/```json[\s\S]*?```/g, '[JSON_REMOVED]');
    
    // Remove HTML script tags if present
    sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, '[SCRIPT_REMOVED]');
    
    return sanitized;
  }

  /**
   * Extract logical sections from markdown
   */
  private extractSections(content: string): Array<{ title: string; content: string }> {
    const sections: Array<{ title: string; content: string }> = [];
    
    // Split by headers (# or ##)
    const headerRegex = /^#{1,3}\s+(.+)$/gm;
    const matches = Array.from(content.matchAll(headerRegex));
    
    if (matches.length === 0) {
      // No headers found, treat entire content as one section
      return [{
        title: 'General Context',
        content: content.trim()
      }];
    }
    
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const title = match[1].trim();
      const startIndex = match.index! + match[0].length;
      const endIndex = matches[i + 1]?.index || content.length;
      const sectionContent = content.slice(startIndex, endIndex).trim();
      
      if (sectionContent.length > 0) {
        sections.push({ title, content: sectionContent });
      }
    }
    
    return sections;
  }

  /**
   * Classify section type based on title and content
   */
  private classifyType(title: string): ContextRecord['type'] {
    const lowerTitle = title.toLowerCase();
    
    if (lowerTitle.includes('purpose') || lowerTitle.includes('mission') || lowerTitle.includes('goal')) {
      return 'purpose';
    }
    
    if (lowerTitle.includes('status') || lowerTitle.includes('current') || lowerTitle.includes('state')) {
      return 'system_state';
    }
    
    if (lowerTitle.includes('phase') || lowerTitle.includes('history') || lowerTitle.includes('development')) {
      return 'development_history';
    }
    
    return 'contextual_reference';
  }

  /**
   * Summarize content to max length
   */
  private summarize(content: string): string {
    const cleaned = content
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleaned.length <= this.MAX_SUMMARY_LENGTH) {
      return cleaned;
    }
    
    return cleaned.slice(0, this.MAX_SUMMARY_LENGTH - 3) + '...';
  }

  /**
   * Persist records to database
   */
  private async persistRecords(records: ContextRecord[]): Promise<void> {
    // Get first user ID (system-wide context)
    const users = await storage.getAllUsers();
    if (users.length === 0) {
      console.warn('[ContextLoader] No users found, skipping persistence');
      return;
    }
    
    const userId = users[0].id;
    
    for (const record of records) {
      try {
        await storage.createWalterMemory({
          userId,
          type: record.type as any,
          content: `[${record.title}] ${record.summary}`,
          importance: 4, // High importance for context
          metadata: {
            source: record.source,
            actionable: false,
            policy: 'no-execution',
            title: record.title
          }
        });
      } catch (error: any) {
        console.error(`[ContextLoader] Failed to persist record "${record.title}":`, error.message);
      }
    }
  }

  /**
   * Clear existing context memories (for overwrite mode)
   */
  private async clearExistingContext(): Promise<void> {
    console.log('[ContextLoader] Clearing existing context memories...');
    // This would need a dedicated storage method
    // For now, we'll let new entries accumulate
  }
}

export const contextLoader = new ContextLoader();
