import { storage } from '../storage';
import { InsertWalterMemory } from '@shared/schema';

export interface MemoryFilter {
  userId: string;
  type?: 'observation' | 'decision' | 'result' | 'goal' | 'lesson';
  minImportance?: number; // Filter by minimum importance (1-5)
  limit?: number;
  chatId?: string; // Filter by specific chat
}

export interface MemoryStats {
  totalMemories: number;
  byType: Record<string, number>;
  byImportance: Record<number, number>;
  avgImportance: number;
}

/**
 * Store a new memory for Walter
 */
export async function createMemory(
  userId: string,
  type: 'observation' | 'decision' | 'result' | 'goal' | 'lesson',
  content: string,
  importance: number = 3,
  metadata?: Record<string, any>,
  chatId?: string
): Promise<void> {
  // Validate importance range
  if (importance < 1 || importance > 5) {
    throw new Error('Importance must be between 1 and 5');
  }

  const memory: InsertWalterMemory = {
    userId,
    type,
    content,
    importance,
    metadata: metadata || {},
    chatId: chatId || undefined,
  };

  await storage.createWalterMemory(memory);
  console.log(`💭 Walter memory created: [${type}] importance=${importance}`);
  
  // Dashboard notification for high-importance memories (Phase 5.5 Task 8)
  if (importance >= 4) {
    const AlertsService = (await import('./alerts-service')).default;
    const user = await storage.getUser(userId);
    const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';
    
    await AlertsService.createAlert({
      userId,
      mode,
      alertType: 'walter_memory',
      severity: importance === 5 ? 'warning' : 'info',
      message: `New ${importance === 5 ? 'critical' : 'important'} memory stored: ${content.substring(0, 80)}${content.length > 80 ? '...' : ''}`,
      metadata: { type, importance, chatId }
    }).catch(err => console.error('[Walter Memory] Alert creation failed:', err));
  }
  
  // Enforce memory limit (Phase 5.5 Task 7)
  await enforceMemoryLimit(userId);
}

/**
 * Retrieve memories based on filters
 */
export async function getMemories(filter: MemoryFilter) {
  const memories = await storage.getWalterMemories(filter.userId);

  // Apply filters
  let filtered = memories;

  if (filter.type) {
    filtered = filtered.filter((m) => m.type === filter.type);
  }

  if (filter.minImportance !== undefined) {
    filtered = filtered.filter((m) => m.importance >= filter.minImportance!);
  }

  if (filter.chatId) {
    filtered = filtered.filter((m) => m.chatId === filter.chatId);
  }

  // Sort by importance (desc) then timestamp (desc)
  filtered.sort((a, b) => {
    if (b.importance !== a.importance) {
      return b.importance - a.importance;
    }
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeB - timeA;
  });

  // Apply limit
  if (filter.limit) {
    filtered = filtered.slice(0, filter.limit);
  }

  return filtered;
}

/**
 * Get high-importance memories for AI context injection
 */
export async function getHighImportanceMemories(userId: string, limit: number = 10) {
  return getMemories({
    userId,
    minImportance: 4, // Only importance 4 and 5
    limit,
  });
}

/**
 * Get memories by type
 */
export async function getMemoriesByType(
  userId: string,
  type: 'observation' | 'decision' | 'result' | 'goal' | 'lesson',
  limit?: number
) {
  return getMemories({
    userId,
    type,
    limit,
  });
}

/**
 * Get memory statistics for user
 */
export async function getMemoryStats(userId: string): Promise<MemoryStats> {
  const memories = await storage.getWalterMemories(userId);

  const byType: Record<string, number> = {};
  const byImportance: Record<number, number> = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
  let totalImportance = 0;

  memories.forEach((m) => {
    byType[m.type] = (byType[m.type] || 0) + 1;
    byImportance[m.importance] = (byImportance[m.importance] || 0) + 1;
    totalImportance += m.importance;
  });

  return {
    totalMemories: memories.length,
    byType,
    byImportance,
    avgImportance: memories.length > 0 ? totalImportance / memories.length : 0,
  };
}

/**
 * Create memory context section for AI prompts
 */
export async function createMemoryPromptSection(userId: string, limit: number = 10): Promise<string> {
  const memories = await getHighImportanceMemories(userId, limit);

  if (memories.length === 0) {
    return '';
  }

  const memoryText = memories.map((m) => {
    const date = m.timestamp ? new Date(m.timestamp).toLocaleDateString() : 'Unknown';
    return `[${m.type.toUpperCase()}] (${date}, importance: ${m.importance}/5): ${m.content}`;
  }).join('\n');

  return `
=== WALTER'S PERSISTENT MEMORY ===
The following are important lessons and observations from past sessions:

${memoryText}

Use these memories to inform your recommendations and maintain consistency with past decisions.
===================================

`;
}

/**
 * Extract and store a lesson from trade results
 */
export async function extractTradeLesson(
  userId: string,
  tradeId: string,
  outcome: 'win' | 'loss',
  profitLoss: number,
  strategyName: string,
  symbol: string,
  notes?: string
): Promise<void> {
  let content = '';
  let importance = 3; // Default

  if (outcome === 'win' && profitLoss > 100) {
    content = `Successful ${strategyName} trade on ${symbol} yielding $${profitLoss.toFixed(2)}. ${notes || ''}`;
    importance = 4; // High importance for big wins
  } else if (outcome === 'loss' && profitLoss < -100) {
    content = `Loss of $${Math.abs(profitLoss).toFixed(2)} on ${strategyName} trade (${symbol}). ${notes || ''}`;
    importance = 5; // Critical importance for significant losses
  } else {
    content = `Trade on ${symbol} using ${strategyName}: ${outcome} of $${profitLoss.toFixed(2)}. ${notes || ''}`;
    importance = 3;
  }

  await createMemory(userId, 'result', content, importance, {
    tradeId,
    outcome,
    profitLoss,
    strategyName,
    symbol,
  });
}

/**
 * Store a decision made by Walter or user
 */
export async function storeDecision(
  userId: string,
  decision: string,
  importance: number,
  metadata?: Record<string, any>,
  chatId?: string
): Promise<void> {
  await createMemory(userId, 'decision', decision, importance, metadata, chatId);
}

/**
 * Store an observation about market or system behavior
 */
export async function storeObservation(
  userId: string,
  observation: string,
  importance: number,
  metadata?: Record<string, any>
): Promise<void> {
  await createMemory(userId, 'observation', observation, importance, metadata);
}

/**
 * Delete memories older than specified days with low importance
 */
export async function pruneOldMemories(
  userId: string,
  olderThanDays: number = 90,
  maxImportance: number = 2
): Promise<number> {
  const memories = await storage.getWalterMemories(userId);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  let deletedCount = 0;

  for (const memory of memories) {
    const memoryDate = memory.timestamp ? new Date(memory.timestamp) : new Date();
    if (
      memoryDate < cutoffDate &&
      memory.importance <= maxImportance
    ) {
      await storage.deleteWalterMemory(memory.id);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    console.log(`🧹 Pruned ${deletedCount} old low-importance memories for user ${userId}`);
  }

  return deletedCount;
}

/**
 * Display post-ingestion confirmation summary (Phase 6.3)
 * Shows total memories retained and provides learning progress visibility
 */
export async function displayIngestionSummary(userId: string, sessionLabel?: string): Promise<void> {
  const stats = await getMemoryStats(userId);
  const label = sessionLabel || 'Learning session';
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ ${label} complete`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📊 Total retained memories: ${stats.totalMemories}`);
  console.log(`📈 Average importance: ${stats.avgImportance.toFixed(2)}/5`);
  console.log(`\n📚 Memory breakdown by type:`);
  
  Object.entries(stats.byType).forEach(([type, count]) => {
    const emoji = type === 'lesson' ? '📖' : type === 'observation' ? '👁️' : 
                  type === 'decision' ? '🎯' : type === 'result' ? '📊' : '🎯';
    console.log(`   ${emoji} ${type}: ${count}`);
  });
  
  console.log(`\n⭐ Memory distribution by importance:`);
  Object.entries(stats.byImportance)
    .filter(([_, count]) => count > 0)
    .forEach(([importance, count]) => {
      const stars = '★'.repeat(parseInt(importance));
      console.log(`   ${stars} (${importance}): ${count} memories`);
    });
  
  console.log(`${'='.repeat(70)}\n`);
}

/**
 * Enforce memory limit for user (Phase 5.5 Task 7, Enhanced Phase 6.3)
 * Smart aging: Deletes oldest, least important memories when limit is exceeded
 * Prioritizes keeping recent and high-importance memories
 */
async function enforceMemoryLimit(userId: string): Promise<void> {
  // Phase 41F-L.E2E-PURGE: Use default memory limit (settings fetch disabled)
  // Default: 1,500 memories (Phase 6.3)
  const memoryLimit = 1500;
  
  // Get all memories for user
  const memories = await storage.getWalterMemories(userId);
  
  // Check if limit exceeded
  if (memories.length <= memoryLimit) {
    return;
  }
  
  // Calculate how many to delete
  const toDelete = memories.length - memoryLimit;
  
  // SMART AGING (Phase 6.3): Calculate aging score for each memory
  // Score = (importance * 20) + (age_factor * 10)
  // Higher score = keep, Lower score = delete
  const now = Date.now();
  const MAX_AGE_DAYS = 365; // 1 year reference
  
  const scoredMemories = memories.map((memory) => {
    const age = memory.timestamp 
      ? (now - new Date(memory.timestamp).getTime()) / (1000 * 60 * 60 * 24) 
      : MAX_AGE_DAYS;
    
    // Newer memories get higher age factor (0-10)
    const ageFactor = Math.max(0, 10 - (age / MAX_AGE_DAYS * 10));
    
    // Importance contributes more weight than age
    const score = (memory.importance * 20) + (ageFactor * 10);
    
    return { memory, score, age };
  });
  
  // Sort by score (ASC) - lowest scores get deleted first
  scoredMemories.sort((a, b) => a.score - b.score);
  
  // Delete lowest-scored memories
  const toDeleteMemories = scoredMemories.slice(0, toDelete);
  
  for (const item of toDeleteMemories) {
    await storage.deleteWalterMemory(item.memory.id);
  }
  
  console.log(`🧠 Smart aging activated: removed ${toDelete} lower-priority memories (limit: ${memoryLimit})`);
  console.log(`   Retained: ${memories.length - toDelete} memories (prioritized by importance and recency)`);
  
  // Dashboard notification for memory limit enforcement (Phase 5.5 Task 8)
  const AlertsService = (await import('./alerts-service')).default;
  const user = await storage.getUser(userId);
  const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';
  
  await AlertsService.createAlert({
    userId,
    mode,
    alertType: 'walter_memory_limit',
    severity: 'info',
    message: `Smart aging activated: ${toDelete} lower-priority memories pruned to maintain ${memoryLimit} memory limit.`,
    metadata: { deleted: toDelete, limit: memoryLimit, retained: memories.length - toDelete }
  }).catch(err => console.error('[Walter Memory] Limit alert creation failed:', err));
}
