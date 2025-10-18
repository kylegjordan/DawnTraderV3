/**
 * Phase 9.6: Collaboration Manager
 * 
 * Manages cross-domain collaborative reasoning sessions between agents.
 * Handles session creation, message logging, and consensus tracking.
 */

import { db } from '../db';
import { 
  collaborationSessions,
  collaborationMessages,
  InsertCollaborationSession,
  InsertCollaborationMessage,
  CollaborationSession,
  CollaborationMessage
} from '@shared/schema';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface CollaborationSessionConfig {
  topic: string;
  participants: string[]; // Agent IDs
  userId?: string;
  contextSnapshot?: any;
}

export interface CollaborationMessageInput {
  sessionId: string;
  agentId: string;
  role: 'coordinator' | 'analyst' | 'executor' | 'reviewer' | 'observer';
  content: string;
  contributionType?: string;
  confidenceLevel?: number;
  supportingData?: any;
  replyTo?: string;
}

class CollaborationManager {
  /**
   * Start a new collaboration session
   */
  async startSession(config: CollaborationSessionConfig): Promise<CollaborationSession> {
    try {
      const sessionId = `collab_${nanoid(12)}`;
      
      console.log(`[CollaborationManager] 🚀 Starting session: ${sessionId}, topic: "${config.topic}"`);
      console.log(`[CollaborationManager] Participants: [${config.participants.join(', ')}]`);

      const sessionData: InsertCollaborationSession = {
        sessionId,
        userId: config.userId,
        topic: config.topic,
        participants: config.participants,
        consensusState: 'forming',
        consensusScore: null,
        resolutionOutcome: null,
        contextSnapshot: config.contextSnapshot || null,
        metadata: {},
        startedAt: new Date(),
        endedAt: null,
      };

      const [session] = await db.insert(collaborationSessions)
        .values(sessionData)
        .returning();

      console.log(`[CollaborationManager] ✅ Session ${sessionId} created with ${config.participants.length} participants`);
      
      return session;
    } catch (error: any) {
      console.error('[CollaborationManager] Failed to start session:', error);
      throw error;
    }
  }

  /**
   * Add a message to a collaboration session
   */
  async addMessage(input: CollaborationMessageInput): Promise<CollaborationMessage> {
    try {
      const messageId = `msg_${nanoid(12)}`;
      
      console.log(`[CollaborationManager] 💬 ${input.agentId} [${input.role}]: ${input.content.substring(0, 80)}...`);

      const messageData: InsertCollaborationMessage = {
        messageId,
        sessionId: input.sessionId,
        agentId: input.agentId,
        role: input.role,
        content: input.content,
        contributionType: input.contributionType || null,
        confidenceLevel: input.confidenceLevel ?? null,
        supportingData: input.supportingData || null,
        replyTo: input.replyTo || null,
        metadata: {},
        timestamp: new Date(),
      };

      const [message] = await db.insert(collaborationMessages)
        .values(messageData)
        .returning();

      return message;
    } catch (error: any) {
      console.error('[CollaborationManager] Failed to add message:', error);
      throw error;
    }
  }

  /**
   * Update session consensus state
   */
  async updateSessionState(
    sessionId: string,
    consensusState: 'forming' | 'discussing' | 'evaluating' | 'agreed' | 'disagreed' | 'overridden',
    consensusScore?: number
  ): Promise<void> {
    try {
      console.log(`[CollaborationManager] 📊 Updating session ${sessionId}: ${consensusState} (score: ${consensusScore?.toFixed(2) || 'N/A'})`);

      await db.update(collaborationSessions)
        .set({ 
          consensusState, 
          consensusScore: consensusScore ?? null 
        })
        .where(eq(collaborationSessions.sessionId, sessionId));
    } catch (error: any) {
      console.error('[CollaborationManager] Failed to update session state:', error);
      throw error;
    }
  }

  /**
   * End a collaboration session
   */
  async endSession(sessionId: string, resolutionOutcome?: string): Promise<void> {
    try {
      console.log(`[CollaborationManager] 🏁 Ending session ${sessionId}`);

      await db.update(collaborationSessions)
        .set({ 
          endedAt: new Date(),
          resolutionOutcome: resolutionOutcome || null
        })
        .where(eq(collaborationSessions.sessionId, sessionId));

      console.log(`[CollaborationManager] ✅ Session ${sessionId} ended`);
    } catch (error: any) {
      console.error('[CollaborationManager] Failed to end session:', error);
      throw error;
    }
  }

  /**
   * Get active sessions
   */
  async getActiveSessions(userId?: string): Promise<CollaborationSession[]> {
    try {
      const conditions = [isNull(collaborationSessions.endedAt)];
      if (userId) {
        conditions.push(eq(collaborationSessions.userId, userId));
      }

      const sessions = await db.select()
        .from(collaborationSessions)
        .where(and(...conditions))
        .orderBy(desc(collaborationSessions.startedAt))
        .limit(50);

      return sessions;
    } catch (error: any) {
      console.error('[CollaborationManager] Failed to fetch active sessions:', error);
      return [];
    }
  }

  /**
   * Get session messages
   */
  async getSessionMessages(sessionId: string): Promise<CollaborationMessage[]> {
    try {
      const messages = await db.select()
        .from(collaborationMessages)
        .where(eq(collaborationMessages.sessionId, sessionId))
        .orderBy(collaborationMessages.timestamp);

      return messages;
    } catch (error: any) {
      console.error('[CollaborationManager] Failed to fetch session messages:', error);
      return [];
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<CollaborationSession | null> {
    try {
      const [session] = await db.select()
        .from(collaborationSessions)
        .where(eq(collaborationSessions.sessionId, sessionId))
        .limit(1);

      return session || null;
    } catch (error: any) {
      console.error('[CollaborationManager] Failed to fetch session:', error);
      return null;
    }
  }

  /**
   * Archive old sessions (for maintenance)
   */
  async archiveOldSessions(daysOld: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // Just count for now - actual archival would move to separate table
      const result = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM collaboration_sessions
        WHERE ended_at IS NOT NULL
        AND ended_at < ${cutoffDate.toISOString()}
      `);

      const count = (result as any)[0]?.count || 0;
      console.log(`[CollaborationManager] 🗄️ Found ${count} sessions older than ${daysOld} days`);
      
      return count;
    } catch (error: any) {
      console.error('[CollaborationManager] Failed to archive old sessions:', error);
      return 0;
    }
  }

  /**
   * Get collaboration statistics
   */
  async getCollaborationStats(): Promise<{
    activeSessions: number;
    totalSessions: number;
    averageConsensusScore: number;
    completedSessions: number;
  }> {
    try {
      const [stats] = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE ended_at IS NULL) as active_sessions,
          COUNT(*) as total_sessions,
          AVG(consensus_score) FILTER (WHERE consensus_score IS NOT NULL) as avg_consensus,
          COUNT(*) FILTER (WHERE ended_at IS NOT NULL) as completed_sessions
        FROM collaboration_sessions
      `) as any;

      return {
        activeSessions: parseInt(stats.active_sessions || '0'),
        totalSessions: parseInt(stats.total_sessions || '0'),
        averageConsensusScore: parseFloat(stats.avg_consensus || '0'),
        completedSessions: parseInt(stats.completed_sessions || '0'),
      };
    } catch (error: any) {
      console.error('[CollaborationManager] Failed to fetch stats:', error);
      return {
        activeSessions: 0,
        totalSessions: 0,
        averageConsensusScore: 0,
        completedSessions: 0,
      };
    }
  }
}

// Singleton instance
export const collaborationManager = new CollaborationManager();
