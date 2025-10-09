import { db } from "../db";
import { conversationSummaries, aiConversations } from "@shared/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Message {
  id?: string;
  role: string;
  content: string;
  timestamp?: string | Date;
}

interface SummaryResult {
  summaryText: string;
  keyDecisions: string[];
  actionItems: string[];
  userPreferences: Record<string, any>;
}

class ConversationSummarizationService {
  private readonly MESSAGE_THRESHOLD = 20; // Start summarizing after 20 messages
  private readonly SUMMARY_WINDOW = 5; // Summarize every 5 new messages
  private readonly MAX_SUMMARY_TOKENS = 200; // Target token limit for summaries

  async shouldSummarize(conversationId: string): Promise<boolean> {
    const conversation = await db.query.aiConversations.findFirst({
      where: eq(aiConversations.id, conversationId),
    });

    if (!conversation || !conversation.messages) {
      return false;
    }

    const messages = conversation.messages as Message[];
    const messageCount = messages.length;

    // Check if we've passed the threshold
    if (messageCount < this.MESSAGE_THRESHOLD) {
      return false;
    }

    // Get the last summary to see how many messages have been added since
    const lastSummary = await db.query.conversationSummaries.findFirst({
      where: eq(conversationSummaries.conversationId, conversationId),
      orderBy: [desc(conversationSummaries.createdAt)],
    });

    if (!lastSummary) {
      // No summaries yet, and we're past threshold
      return true;
    }

    // Check if we've added SUMMARY_WINDOW messages since last summary
    const lastSummaryEndIndex = messages.findIndex(
      (m) => m.id === lastSummary.endMessageId
    );
    
    if (lastSummaryEndIndex === -1) {
      // Can't find the last summary's end message, trigger new summary
      return true;
    }

    const messagesSinceLastSummary = messageCount - lastSummaryEndIndex - 1;
    return messagesSinceLastSummary >= this.SUMMARY_WINDOW;
  }

  async generateSummary(
    conversationId: string,
    startIndex: number,
    endIndex: number
  ): Promise<SummaryResult> {
    const conversation = await db.query.aiConversations.findFirst({
      where: eq(aiConversations.id, conversationId),
    });

    if (!conversation || !conversation.messages) {
      throw new Error("Conversation not found");
    }

    const messages = conversation.messages as Message[];
    const messagesToSummarize = messages.slice(startIndex, endIndex + 1);

    // Build prompt for GPT to create a concise summary
    const prompt = `You are summarizing a conversation between a user and an AI trading assistant. Create a concise summary (≤200 tokens) that captures:
1. Key decisions made
2. Action items or tasks identified
3. User preferences expressed

Conversation to summarize (${messagesToSummarize.length} messages):
${messagesToSummarize.map((m, i) => `${i + 1}. [${m.role}]: ${m.content}`).join('\n')}

Provide your response as JSON with this structure:
{
  "summaryText": "Brief narrative summary of the conversation",
  "keyDecisions": ["decision 1", "decision 2"],
  "actionItems": ["item 1", "item 2"],
  "userPreferences": {"preference_key": "preference_value"}
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a conversation summarization assistant. Respond only with valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: this.MAX_SUMMARY_TOKENS + 100, // Allow buffer for JSON structure
        temperature: 0.3, // Lower temperature for consistent summaries
        response_format: { type: "json_object" },
      });

      const summaryData = JSON.parse(
        response.choices[0].message.content || "{}"
      );

      return {
        summaryText: summaryData.summaryText || "No summary generated",
        keyDecisions: summaryData.keyDecisions || [],
        actionItems: summaryData.actionItems || [],
        userPreferences: summaryData.userPreferences || {},
      };
    } catch (error) {
      console.error("[ConversationSummarization] Error generating summary:", error);
      
      // Fallback: Create basic summary without GPT
      return {
        summaryText: `Conversation segment covering ${messagesToSummarize.length} messages`,
        keyDecisions: [],
        actionItems: [],
        userPreferences: {},
      };
    }
  }

  async createSummary(conversationId: string): Promise<void> {
    const conversation = await db.query.aiConversations.findFirst({
      where: eq(aiConversations.id, conversationId),
    });

    if (!conversation || !conversation.messages) {
      throw new Error("Conversation not found");
    }

    const messages = conversation.messages as Message[];

    // Find the last summary to determine where to start
    const lastSummary = await db.query.conversationSummaries.findFirst({
      where: eq(conversationSummaries.conversationId, conversationId),
      orderBy: [desc(conversationSummaries.createdAt)],
    });

    let startIndex = 0;
    if (lastSummary && lastSummary.endMessageId) {
      const lastEndIndex = messages.findIndex(
        (m) => m.id === lastSummary.endMessageId
      );
      if (lastEndIndex !== -1) {
        startIndex = lastEndIndex + 1;
      }
    }

    // Determine end index (leave SUMMARY_WINDOW recent messages unsummarized)
    // We want to keep the last SUMMARY_WINDOW messages fresh, so summarize up to that point
    const endIndex = messages.length - this.SUMMARY_WINDOW - 1;

    // Guard against invalid indices
    if (endIndex < startIndex || endIndex < 0) {
      console.log("[ConversationSummarization] Not enough new messages to summarize");
      return;
    }

    // Generate the summary using GPT
    const summaryResult = await this.generateSummary(
      conversationId,
      startIndex,
      endIndex
    );

    // Extract participant roles
    const participantRoles = [
      ...new Set(messages.slice(startIndex, endIndex + 1).map((m) => m.role)),
    ];

    // Get timestamps
    const startMessage = messages[startIndex];
    const endMessage = messages[endIndex];

    const startTimestamp = startMessage.timestamp
      ? new Date(startMessage.timestamp)
      : new Date();
    const endTimestamp = endMessage.timestamp
      ? new Date(endMessage.timestamp)
      : new Date();

    // Insert summary into database
    await db.insert(conversationSummaries).values({
      conversationId,
      userId: conversation.userId,
      startMessageId: startMessage.id || null,
      endMessageId: endMessage.id || null,
      startTimestamp,
      endTimestamp,
      messageCount: endIndex - startIndex + 1,
      summaryText: summaryResult.summaryText,
      participantRoles,
      keyDecisions: summaryResult.keyDecisions,
      actionItems: summaryResult.actionItems,
      userPreferences: summaryResult.userPreferences,
    });

    console.log(
      `[ConversationSummarization] Created summary for conversation ${conversationId}: ${endIndex - startIndex + 1} messages summarized`
    );

    // Log to AI transparency log
    await this.logToTransparency(conversationId, conversation.userId, endIndex - startIndex + 1);
  }

  private async logToTransparency(
    conversationId: string,
    userId: string,
    messageCount: number
  ): Promise<void> {
    try {
      const { aiTransparencyLog } = await import("@shared/schema");
      
      await db.insert(aiTransparencyLog).values({
        userId,
        taskName: "summarization",
        details: {
          conversationId,
          messageCount,
          action: "created_summary",
        },
        status: "success",
      });
    } catch (error) {
      console.error("[ConversationSummarization] Error logging to transparency:", error);
    }
  }

  async getSummaries(conversationId: string): Promise<any[]> {
    return await db.query.conversationSummaries.findMany({
      where: eq(conversationSummaries.conversationId, conversationId),
      orderBy: [conversationSummaries.createdAt],
    });
  }

  async checkAndSummarize(conversationId: string): Promise<void> {
    const shouldSummarize = await this.shouldSummarize(conversationId);
    
    if (shouldSummarize) {
      await this.createSummary(conversationId);
    }
  }
}

export const conversationSummarizationService = new ConversationSummarizationService();
