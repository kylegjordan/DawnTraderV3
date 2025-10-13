/**
 * Chat Logging Middleware - Phase 6.3
 * 
 * Captures and stores all user-Walter conversations as structured data
 * for contextual learning and query recall.
 */

import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage';

export interface ChatLogEntry {
  chat_id: string;
  chat_name: string;
  timestamp: string;
  user_id: string;
  message_type: 'user' | 'walter' | 'system';
  content: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ChatSummary {
  chat_id: string;
  chat_name: string;
  message_count: number;
  start_time: string;
  end_time: string;
  key_insights: string[];
  action_items: string[];
  user_preferences: string[];
  summary_text: string;
}

export interface ChatIndexEntry {
  chat_id: string;
  chat_name: string;
  user_id: string;
  message_count: number;
  last_updated: string;
  created_at: string;
  status: 'active' | 'archived';
  tags: string[];
}

class ChatLoggingMiddleware {
  private logsDir = path.join(process.cwd(), 'logs', 'chats');
  private summariesDir = path.join(process.cwd(), 'logs', 'chat_summaries');
  private indexPath = path.join(process.cwd(), 'logs', 'chat_index.json');

  constructor() {
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.logsDir, { recursive: true });
      await fs.mkdir(this.summariesDir, { recursive: true });
    } catch (error) {
      console.error('[ChatLogging] Error creating directories:', error);
    }
  }

  /**
   * Get daily log file path
   */
  private getDailyLogPath(date: Date = new Date()): string {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logsDir, `chat_log_${dateStr}.json`);
  }

  /**
   * Log a chat message
   */
  async logMessage(entry: ChatLogEntry): Promise<void> {
    try {
      const logPath = this.getDailyLogPath();
      let logs: ChatLogEntry[] = [];

      // Read existing logs
      try {
        const content = await fs.readFile(logPath, 'utf-8');
        logs = JSON.parse(content);
      } catch (error) {
        // File doesn't exist yet, start fresh
        logs = [];
      }

      // Append new entry
      logs.push(entry);

      // Write back
      await fs.writeFile(logPath, JSON.stringify(logs, null, 2));

      // Update chat index
      await this.updateChatIndex(entry);

      console.log(`[ChatLogging] Logged ${entry.message_type} message to ${path.basename(logPath)}`);
    } catch (error) {
      console.error('[ChatLogging] Error logging message:', error);
    }
  }

  /**
   * Update chat index with latest message info
   */
  private async updateChatIndex(entry: ChatLogEntry): Promise<void> {
    try {
      let index: { chats: ChatIndexEntry[] } = { chats: [] };

      // Read existing index
      try {
        const content = await fs.readFile(this.indexPath, 'utf-8');
        index = JSON.parse(content);
      } catch (error) {
        // Index doesn't exist, create it
        index = { chats: [] };
      }

      // Find or create chat entry
      let chatEntry = index.chats.find(c => c.chat_id === entry.chat_id);

      if (chatEntry) {
        // Update existing entry
        chatEntry.last_updated = entry.timestamp;
        chatEntry.message_count += 1;
        if (entry.tags) {
          chatEntry.tags = [...new Set([...chatEntry.tags, ...entry.tags])];
        }
      } else {
        // Create new entry
        chatEntry = {
          chat_id: entry.chat_id,
          chat_name: entry.chat_name,
          user_id: entry.user_id,
          message_count: 1,
          last_updated: entry.timestamp,
          created_at: entry.timestamp,
          status: 'active',
          tags: entry.tags || []
        };
        index.chats.push(chatEntry);
      }

      // Write back
      await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
    } catch (error) {
      console.error('[ChatLogging] Error updating chat index:', error);
    }
  }

  /**
   * Update chat name in index
   */
  async renameChatInIndex(chatId: string, oldName: string, newName: string, userId: string): Promise<void> {
    try {
      let index: { chats: ChatIndexEntry[] } = { chats: [] };

      // Read existing index
      const content = await fs.readFile(this.indexPath, 'utf-8');
      index = JSON.parse(content);

      // Find chat entry
      const chatEntry = index.chats.find(c => c.chat_id === chatId);

      if (chatEntry) {
        chatEntry.chat_name = newName;
        chatEntry.last_updated = new Date().toISOString();

        // Write back
        await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));

        // Log rename event
        await this.logMessage({
          chat_id: chatId,
          chat_name: newName,
          timestamp: new Date().toISOString(),
          user_id: userId,
          message_type: 'system',
          content: `Chat renamed from "${oldName}" to "${newName}"`,
          tags: ['rename'],
          metadata: { old_name: oldName, new_name: newName }
        });

        console.log(`[ChatLogging] Renamed chat ${chatId} from "${oldName}" to "${newName}"`);
      }
    } catch (error) {
      console.error('[ChatLogging] Error renaming chat:', error);
    }
  }

  /**
   * Generate and save chat summary
   */
  async saveChatSummary(summary: ChatSummary): Promise<void> {
    try {
      const summaryPath = path.join(this.summariesDir, `summary_${summary.chat_id}.json`);
      await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

      // Update index to mark as archived
      const content = await fs.readFile(this.indexPath, 'utf-8');
      const index: { chats: ChatIndexEntry[] } = JSON.parse(content);

      const chatEntry = index.chats.find(c => c.chat_id === summary.chat_id);
      if (chatEntry) {
        chatEntry.status = 'archived';
        chatEntry.last_updated = summary.end_time;
        await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
      }

      console.log(`[ChatLogging] Saved summary for chat ${summary.chat_id}`);
    } catch (error) {
      console.error('[ChatLogging] Error saving summary:', error);
    }
  }

  /**
   * Get all messages for a chat from file logs
   */
  async getChatMessages(chatId: string, limit?: number): Promise<ChatLogEntry[]> {
    try {
      const messages: ChatLogEntry[] = [];
      const logFiles = await fs.readdir(this.logsDir);

      // Read all log files in reverse chronological order
      for (const file of logFiles.sort().reverse()) {
        if (file.startsWith('chat_log_') && file.endsWith('.json')) {
          const content = await fs.readFile(path.join(this.logsDir, file), 'utf-8');
          const logs: ChatLogEntry[] = JSON.parse(content);
          
          // Filter for this chat
          const chatLogs = logs.filter(l => l.chat_id === chatId);
          messages.push(...chatLogs);

          if (limit && messages.length >= limit) {
            break;
          }
        }
      }

      // Sort by timestamp (newest first)
      messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return limit ? messages.slice(0, limit) : messages;
    } catch (error) {
      console.error('[ChatLogging] Error getting chat messages:', error);
      return [];
    }
  }

  /**
   * Get chat summary if it exists
   */
  async getChatSummary(chatId: string): Promise<ChatSummary | null> {
    try {
      const summaryPath = path.join(this.summariesDir, `summary_${chatId}.json`);
      const content = await fs.readFile(summaryPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // Summary doesn't exist
      return null;
    }
  }

  /**
   * Search chats by name or tags
   */
  async searchChats(userId: string, query: string): Promise<ChatIndexEntry[]> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      const index: { chats: ChatIndexEntry[] } = JSON.parse(content);

      const lowerQuery = query.toLowerCase();

      return index.chats.filter(chat => 
        chat.user_id === userId && (
          chat.chat_name.toLowerCase().includes(lowerQuery) ||
          chat.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        )
      );
    } catch (error) {
      console.error('[ChatLogging] Error searching chats:', error);
      return [];
    }
  }

  /**
   * Get all chats for a user
   */
  async getUserChats(userId: string, status?: 'active' | 'archived'): Promise<ChatIndexEntry[]> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      const index: { chats: ChatIndexEntry[] } = JSON.parse(content);

      let chats = index.chats.filter(c => c.user_id === userId);
      
      if (status) {
        chats = chats.filter(c => c.status === status);
      }

      // Sort by last updated (newest first)
      chats.sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime());

      return chats;
    } catch (error) {
      console.error('[ChatLogging] Error getting user chats:', error);
      return [];
    }
  }
}

// Export singleton instance
export const chatLogging = new ChatLoggingMiddleware();
