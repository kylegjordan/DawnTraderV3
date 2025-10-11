import OpenAI from "openai";
import { storage } from '../storage';
import { createMemory } from './walter-memory';
import { estimateMessagesTokens, calculateCost } from '../utils/token-counter';

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || ""
});

/**
 * Summarize a chat session when it exceeds threshold
 */
export async function summarizeChatSession(chatId: string, userId: string): Promise<void> {
  try {
    console.log(`📝 Summarizing chat session ${chatId}...`);
    
    // Get the last 50 messages for summarization
    const messages = await storage.getWalterChatLogs(chatId, 50);
    
    if (messages.length < 10) {
      console.log('Chat too short to summarize, skipping');
      return;
    }
    
    // Build conversation text
    const conversationText = messages.map(m => 
      `${m.role}: ${m.content}`
    ).join('\n\n');
    
    const systemPrompt = `You are summarizing a conversation between a user and Walter, their AI trading assistant. 
    
Create a concise summary that:
1. Captures key discussion topics
2. Notes any important decisions or action items
3. Highlights valuable insights or lessons learned
4. Maintains chronological flow

Keep the summary under 200 words.`;

    const userPrompt = `Summarize this conversation:\n\n${conversationText}`;
    
    const inputTokens = estimateMessagesTokens([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 300,
    });
    
    const summary = response.choices[0].message.content || '';
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = calculateCost(inputTokens, outputTokens, 'gpt-4o-mini');
    
    console.log(`💰 Summarization cost: $${cost.toFixed(4)}`);
    
    // Get current chat
    const chat = await storage.getWalterChatById(chatId);
    if (!chat) {
      console.error('Chat not found');
      return;
    }
    
    // Store summary in chat metadata
    const updatedMetadata = {
      ...(chat.metadata as any || {}),
      summaries: [
        ...((chat.metadata as any)?.summaries || []),
        {
          messageCount: chat.messageCount, // Store actual chat message count, not slice length
          summary,
          timestamp: new Date().toISOString(),
          tokenCost: cost,
        }
      ]
    };
    
    await storage.updateWalterChat(chatId, {
      metadata: updatedMetadata,
    });
    
    console.log(`✅ Chat ${chatId} summarized successfully`);
    
    // Dashboard notification for summarization (Phase 5.5 Task 8)
    const AlertsService = (await import('./alerts-service')).default;
    const user = await storage.getUserById(userId);
    const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';
    
    await AlertsService.createAlert({
      userId,
      mode,
      alertType: 'walter_chat_summary',
      severity: 'info',
      message: `Chat session summarized for efficiency (${messages.length} messages condensed).`,
      metadata: { chatId, messageCount: messages.length }
    }).catch(err => console.error('[Walter Lifecycle] Summary alert failed:', err));
  } catch (error) {
    console.error('Error summarizing chat:', error);
  }
}

/**
 * Extract important memories from a chat session
 */
export async function extractChatMemories(chatId: string, userId: string): Promise<number> {
  try {
    console.log(`🧠 Extracting memories from chat ${chatId}...`);
    
    // Get all messages from this chat
    const messages = await storage.getWalterChatLogs(chatId, 10000); // Get all messages
    
    if (messages.length < 5) {
      console.log('Chat too short to extract memories, skipping');
      return 0;
    }
    
    // Build conversation text
    const conversationText = messages.map(m => 
      `${m.role}: ${m.content}`
    ).join('\n\n');
    
    const systemPrompt = `You are analyzing a conversation between a user and Walter, their AI trading assistant.

Extract important insights, lessons, or decisions that should be remembered for future sessions.

For each memory:
- type: "observation" (market insights), "decision" (user choices), "lesson" (learned experiences), or "goal" (objectives)
- content: The actual insight/lesson/decision (max 200 chars)
- importance: 1-5 (1=minor, 3=moderate, 5=critical)

Return a JSON object: {"memories": [{"type": "lesson", "content": "...", "importance": 4}, ...]}

Only extract truly valuable information. Maximum 5 memories per chat.`;

    const userPrompt = `Extract memories from this conversation:\n\n${conversationText}`;
    
    const inputTokens = estimateMessagesTokens([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: "json_object" },
    });
    
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = calculateCost(inputTokens, outputTokens, 'gpt-4o-mini');
    
    console.log(`💰 Memory extraction cost: $${cost.toFixed(4)}`);
    
    const result = JSON.parse(response.choices[0].message.content || '{"memories":[]}');
    const memories = result.memories || [];
    
    // Create memory entries
    let createdCount = 0;
    for (const mem of memories) {
      if (mem.type && mem.content && mem.importance) {
        await createMemory(
          userId,
          mem.type,
          mem.content,
          mem.importance,
          { source: 'chat', chatId },
          chatId
        );
        createdCount++;
      }
    }
    
    console.log(`✅ Extracted ${createdCount} memories from chat ${chatId}`);
    
    // Dashboard notification for memory extraction (Phase 5.5 Task 8)
    if (createdCount > 0) {
      const AlertsService = (await import('./alerts-service')).default;
      const user = await storage.getUserById(userId);
      const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';
      
      await AlertsService.createAlert({
        userId,
        mode,
        alertType: 'walter_memory_extraction',
        severity: 'info',
        message: `${createdCount} valuable memories extracted from archived chat session.`,
        metadata: { chatId, memoryCount: createdCount }
      }).catch(err => console.error('[Walter Lifecycle] Extraction alert failed:', err));
    }
    
    return createdCount;
  } catch (error) {
    console.error('Error extracting chat memories:', error);
    return 0;
  }
}

/**
 * Automatically manage chat lifecycle (summarize + extract memories)
 */
export async function manageChatLifecycle(chatId: string, userId: string): Promise<void> {
  const chat = await storage.getWalterChatById(chatId);
  if (!chat) return;
  
  // If chat has 50+ messages and hasn't been summarized recently
  if (chat.messageCount >= 50) {
    const lastSummary = (chat.metadata as any)?.summaries?.[(chat.metadata as any)?.summaries?.length - 1];
    const messagesSinceLastSummary = lastSummary ? chat.messageCount - lastSummary.messageCount : chat.messageCount;
    
    // Summarize every 50 messages
    if (messagesSinceLastSummary >= 50) {
      await summarizeChatSession(chatId, userId);
    }
  }
  
  // Extract memories when chat is archived
  if (chat.status === 'archived') {
    const hasExtractedMemories = (chat.metadata as any)?.memoriesExtracted;
    if (!hasExtractedMemories) {
      const memoryCount = await extractChatMemories(chatId, userId);
      
      // Mark as extracted
      await storage.updateWalterChat(chatId, {
        metadata: {
          ...(chat.metadata as any || {}),
          memoriesExtracted: true,
          memoryCount,
        }
      });
    }
  }
}
