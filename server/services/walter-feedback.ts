/**
 * Walter Feedback Recognition Service
 * Phase 6.2 - PART 3: Learning & Feedback Integration
 * 
 * Detects user feedback, classifies sentiment, and logs for continuous improvement
 */

import { storage } from '../storage';

export type FeedbackSentiment = 'positive' | 'negative' | 'neutral' | 'correction';

export interface FeedbackDetection {
  hasFeedback: boolean;
  sentiment: FeedbackSentiment;
  confidence: number; // 0-1
  patterns: string[];
  correction?: string; // If user is correcting something
  userPreference?: string; // If user expresses a preference
}

/**
 * Detect feedback in user message
 */
export function detectFeedback(userMessage: string, previousAssistantMessage?: string): FeedbackDetection {
  const msg = userMessage.toLowerCase();
  const patterns: string[] = [];
  
  // Positive feedback patterns
  const positivePatterns = [
    /^(yes|yeah|yep|correct|right|exactly|perfect|great|excellent|good|nice|awesome|helpful)/i,
    /that's (right|correct|perfect|good|great|helpful)/i,
    /makes sense|understand|got it|i see/i,
    /good (job|work|explanation|answer)/i,
    /thank you|thanks|appreciate/i,
    /helpful|useful|clear/i,
    /love (it|this)/i
  ];
  
  // Negative feedback patterns
  const negativePatterns = [
    /^no,?\s/i, // "No," at start
    /^not (really|quite|exactly)/i,
    /that's (wrong|incorrect|not right)/i,
    /doesn't (help|work|make sense)/i,
    /(too|very) (long|short|complex|simple|technical)/i,
    /confusing|unclear|didn't understand/i,
    /not what i (meant|asked|wanted)/i
  ];
  
  // Correction patterns (user is correcting Walter)
  const correctionPatterns = [
    /no,?\s*(i meant|i said|i asked|i wanted|actually)/i,
    /what i (meant|said|asked) was/i,
    /to clarify|let me clarify/i,
    /correction:|actually,/i,
    /not.*i'm talking about/i
  ];
  
  // Preference expression patterns
  const preferencePatterns = [
    /i prefer|i'd rather|i like/i,
    /can you.*instead|could you.*instead/i,
    /(more|less) (detailed|technical|simple)/i,
    /shorter|longer|briefer/i
  ];
  
  // Check for corrections first (highest priority)
  const correctionMatch = correctionPatterns.find(p => p.test(msg));
  if (correctionMatch) {
    patterns.push(correctionMatch.toString());
    
    // Try to extract what they meant
    const clarificationMatch = msg.match(/(i meant|i said|i wanted|actually|to clarify[,:]?)\s*(.+)/i);
    const correction = clarificationMatch ? clarificationMatch[2].trim() : undefined;
    
    return {
      hasFeedback: true,
      sentiment: 'correction',
      confidence: 0.9,
      patterns,
      correction
    };
  }
  
  // Check for preferences
  const preferenceMatch = preferencePatterns.find(p => p.test(msg));
  if (preferenceMatch) {
    patterns.push(preferenceMatch.toString());
    
    // Extract preference
    const prefMatch = msg.match(/(i prefer|i'd rather|i like|more|less|shorter|longer)\s+(.+)/i);
    const userPreference = prefMatch ? prefMatch[0].trim() : undefined;
    
    return {
      hasFeedback: true,
      sentiment: 'neutral',
      confidence: 0.75,
      patterns,
      userPreference
    };
  }
  
  // Check for positive feedback
  const positiveMatch = positivePatterns.find(p => p.test(msg));
  if (positiveMatch) {
    patterns.push(positiveMatch.toString());
    return {
      hasFeedback: true,
      sentiment: 'positive',
      confidence: 0.85,
      patterns
    };
  }
  
  // Check for negative feedback
  const negativeMatch = negativePatterns.find(p => p.test(msg));
  if (negativeMatch) {
    patterns.push(negativeMatch.toString());
    return {
      hasFeedback: true,
      sentiment: 'negative',
      confidence: 0.8,
      patterns
    };
  }
  
  // No feedback detected
  return {
    hasFeedback: false,
    sentiment: 'neutral',
    confidence: 0,
    patterns: []
  };
}

/**
 * Log feedback to transparency table for analysis
 */
export async function logFeedback(
  userId: string,
  chatId: string,
  feedback: FeedbackDetection,
  userMessage: string,
  assistantMessage?: string
): Promise<void> {
  if (!feedback.hasFeedback) {
    return; // Don't log if no feedback detected
  }
  
  try {
    await storage.createTransparencyLog({
      userId,
      category: 'walter_feedback',
      action: `feedback_${feedback.sentiment}`,
      details: {
        chatId,
        sentiment: feedback.sentiment,
        confidence: feedback.confidence,
        patterns: feedback.patterns,
        userMessage: userMessage.substring(0, 200), // Truncate for storage
        assistantMessage: assistantMessage?.substring(0, 200),
        correction: feedback.correction,
        userPreference: feedback.userPreference,
        timestamp: new Date().toISOString()
      },
      impact: feedback.sentiment === 'positive' ? 'beneficial' : 
              feedback.sentiment === 'negative' ? 'concerning' :
              feedback.sentiment === 'correction' ? 'action_required' : 'neutral'
    });
    
    console.log(`[WalterFeedback] Logged ${feedback.sentiment} feedback (confidence: ${feedback.confidence})`);
  } catch (error) {
    console.error('[WalterFeedback] Error logging feedback:', error);
  }
}

/**
 * Build feedback acknowledgment for prompt
 */
export function buildFeedbackAcknowledgment(feedback: FeedbackDetection): string {
  if (!feedback.hasFeedback) {
    return '';
  }
  
  let acknowledgment = '\n--- USER FEEDBACK DETECTED ---\n';
  
  switch (feedback.sentiment) {
    case 'positive':
      acknowledgment += `The user is expressing POSITIVE feedback.\n`;
      acknowledgment += `• Acknowledge their feedback warmly\n`;
      acknowledgment += `• Continue with the same approach\n`;
      acknowledgment += `• Example: "Glad that helped!" or "Happy to clarify!"\n`;
      break;
      
    case 'negative':
      acknowledgment += `The user is expressing NEGATIVE feedback.\n`;
      acknowledgment += `• Acknowledge the issue empathetically\n`;
      acknowledgment += `• Apologize if appropriate\n`;
      acknowledgment += `• Adjust your approach (simpler/more detail/different angle)\n`;
      acknowledgment += `• Example: "I apologize for the confusion. Let me explain differently..."\n`;
      break;
      
    case 'correction':
      acknowledgment += `The user is CORRECTING something.\n`;
      if (feedback.correction) {
        acknowledgment += `• They meant: "${feedback.correction}"\n`;
      }
      acknowledgment += `• Acknowledge the correction immediately\n`;
      acknowledgment += `• Adjust your understanding and re-answer correctly\n`;
      acknowledgment += `• Example: "Ah, I misunderstood - you meant [X]. Let me address that..."\n`;
      break;
      
    case 'neutral':
      if (feedback.userPreference) {
        acknowledgment += `The user is expressing a PREFERENCE.\n`;
        acknowledgment += `• Preference: ${feedback.userPreference}\n`;
        acknowledgment += `• Acknowledge and adapt immediately\n`;
        acknowledgment += `• Remember this preference for future responses\n`;
      }
      break;
  }
  
  acknowledgment += '---\n';
  return acknowledgment;
}

/**
 * Analyze feedback trends for user
 */
export async function analyzeFeedbackTrends(userId: string, days: number = 7): Promise<{
  totalFeedback: number;
  positiveCount: number;
  negativeCount: number;
  correctionCount: number;
  commonPreferences: string[];
  insights: string[];
}> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    // Get all feedback logs
    const logs = await storage.getTransparencyLogs(userId, {
      category: 'walter_feedback',
      startDate: since
    });
    
    const positiveCount = logs.filter(l => l.action === 'feedback_positive').length;
    const negativeCount = logs.filter(l => l.action === 'feedback_negative').length;
    const correctionCount = logs.filter(l => l.action === 'feedback_correction').length;
    
    // Extract common preferences
    const preferences = logs
      .filter(l => l.details && (l.details as any).userPreference)
      .map(l => (l.details as any).userPreference);
    
    const commonPreferences = [...new Set(preferences)]; // Unique preferences
    
    // Generate insights
    const insights: string[] = [];
    const totalFeedback = positiveCount + negativeCount + correctionCount;
    
    if (totalFeedback === 0) {
      insights.push('No feedback data available yet');
    } else {
      const positiveRate = (positiveCount / totalFeedback) * 100;
      const correctionRate = (correctionCount / totalFeedback) * 100;
      
      if (positiveRate > 70) {
        insights.push('User is highly satisfied with responses (70%+ positive)');
      } else if (positiveRate < 30) {
        insights.push('User satisfaction is low (<30% positive) - adjust approach');
      }
      
      if (correctionRate > 20) {
        insights.push('High correction rate (>20%) - improve understanding of user intent');
      }
      
      if (commonPreferences.length > 0) {
        insights.push(`User preferences detected: ${commonPreferences.join(', ')}`);
      }
    }
    
    return {
      totalFeedback,
      positiveCount,
      negativeCount,
      correctionCount,
      commonPreferences,
      insights
    };
  } catch (error) {
    console.error('[WalterFeedback] Error analyzing trends:', error);
    return {
      totalFeedback: 0,
      positiveCount: 0,
      negativeCount: 0,
      correctionCount: 0,
      commonPreferences: [],
      insights: ['Error analyzing feedback']
    };
  }
}
