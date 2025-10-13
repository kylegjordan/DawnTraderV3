/**
 * Walter Adaptive Heuristics Service
 * Phase 6.2 - PART 3: Learning user preferences over time
 * 
 * Tracks and learns user preferences:
 * - Response length (short, medium, detailed)
 * - Detail level (technical vs simple)
 * - Communication style (formal vs casual)
 * - Format preferences (bullet points vs paragraphs)
 */

import { storage } from '../storage';
import { analyzeFeedbackTrends } from './walter-feedback';

export interface UserPreferences {
  responseLength: 'short' | 'medium' | 'detailed' | null;
  detailLevel: 'simple' | 'balanced' | 'technical' | null;
  communicationStyle: 'formal' | 'balanced' | 'casual' | null;
  formatPreference: 'bullets' | 'paragraphs' | 'mixed' | null;
  confidenceLevel: number; // 0-1, how confident we are in these preferences
  lastUpdated: Date;
}

/**
 * Infer user preferences from feedback history
 */
export async function inferUserPreferences(userId: string): Promise<UserPreferences> {
  try {
    // Get feedback trends from last 30 days
    const trends = await analyzeFeedbackTrends(userId, 30);
    
    const preferences: UserPreferences = {
      responseLength: null,
      detailLevel: null,
      communicationStyle: null,
      formatPreference: null,
      confidenceLevel: 0,
      lastUpdated: new Date()
    };
    
    if (trends.totalFeedback < 3) {
      // Not enough data, return defaults
      return preferences;
    }
    
    // Analyze common preferences
    const prefs = trends.commonPreferences;
    
    // Detect response length preference
    const lengthPrefs = prefs.filter(p => 
      /shorter|brief|concise|quick/i.test(p) || 
      /longer|detailed|thorough|more detail/i.test(p)
    );
    
    if (lengthPrefs.length > 0) {
      const latest = lengthPrefs[lengthPrefs.length - 1].toLowerCase();
      if (/shorter|brief|concise|quick/i.test(latest)) {
        preferences.responseLength = 'short';
      } else if (/longer|detailed|thorough|more detail/i.test(latest)) {
        preferences.responseLength = 'detailed';
      }
    }
    
    // Detect detail level preference
    const detailPrefs = prefs.filter(p => 
      /simple|basic|easy|layman/i.test(p) || 
      /technical|advanced|expert|specific/i.test(p)
    );
    
    if (detailPrefs.length > 0) {
      const latest = detailPrefs[detailPrefs.length - 1].toLowerCase();
      if (/simple|basic|easy|layman/i.test(latest)) {
        preferences.detailLevel = 'simple';
      } else if (/technical|advanced|expert|specific/i.test(latest)) {
        preferences.detailLevel = 'technical';
      }
    }
    
    // Detect communication style
    const stylePrefs = prefs.filter(p => 
      /formal|professional|business/i.test(p) || 
      /casual|friendly|relaxed/i.test(p)
    );
    
    if (stylePrefs.length > 0) {
      const latest = stylePrefs[stylePrefs.length - 1].toLowerCase();
      if (/formal|professional|business/i.test(latest)) {
        preferences.communicationStyle = 'formal';
      } else if (/casual|friendly|relaxed/i.test(latest)) {
        preferences.communicationStyle = 'casual';
      }
    }
    
    // Detect format preference
    const formatPrefs = prefs.filter(p => 
      /bullet|list|points/i.test(p) || 
      /paragraph|prose|flowing/i.test(p)
    );
    
    if (formatPrefs.length > 0) {
      const latest = formatPrefs[formatPrefs.length - 1].toLowerCase();
      if (/bullet|list|points/i.test(latest)) {
        preferences.formatPreference = 'bullets';
      } else if (/paragraph|prose|flowing/i.test(latest)) {
        preferences.formatPreference = 'paragraphs';
      }
    }
    
    // Calculate confidence based on feedback count and positive rate
    const positiveRate = trends.positiveCount / trends.totalFeedback;
    const dataConfidence = Math.min(trends.totalFeedback / 10, 1); // Max at 10 feedbacks
    const satisfactionBonus = positiveRate > 0.6 ? 0.2 : 0; // Bonus if user is satisfied
    
    preferences.confidenceLevel = Math.min(dataConfidence + satisfactionBonus, 1);
    
    return preferences;
  } catch (error) {
    console.error('[WalterHeuristics] Error inferring preferences:', error);
    return {
      responseLength: null,
      detailLevel: null,
      communicationStyle: null,
      formatPreference: null,
      confidenceLevel: 0,
      lastUpdated: new Date()
    };
  }
}

/**
 * Build adaptive guidance for prompt injection
 */
export function buildAdaptiveGuidance(preferences: UserPreferences): string {
  if (preferences.confidenceLevel < 0.3) {
    return ''; // Not confident enough, use defaults
  }
  
  let guidance = '\n--- LEARNED USER PREFERENCES ---\n';
  guidance += `(Confidence: ${Math.round(preferences.confidenceLevel * 100)}%)\n\n`;
  
  if (preferences.responseLength) {
    switch (preferences.responseLength) {
      case 'short':
        guidance += '• Response Length: User prefers SHORT, concise answers (2-3 sentences max)\n';
        break;
      case 'medium':
        guidance += '• Response Length: User prefers MEDIUM-length answers (balanced detail)\n';
        break;
      case 'detailed':
        guidance += '• Response Length: User prefers DETAILED, thorough answers (full explanations)\n';
        break;
    }
  }
  
  if (preferences.detailLevel) {
    switch (preferences.detailLevel) {
      case 'simple':
        guidance += '• Detail Level: User prefers SIMPLE explanations (avoid jargon, use analogies)\n';
        break;
      case 'balanced':
        guidance += '• Detail Level: User prefers BALANCED explanations (some technical, but accessible)\n';
        break;
      case 'technical':
        guidance += '• Detail Level: User prefers TECHNICAL explanations (use industry terms, be specific)\n';
        break;
    }
  }
  
  if (preferences.communicationStyle) {
    switch (preferences.communicationStyle) {
      case 'formal':
        guidance += '• Communication Style: User prefers FORMAL tone (professional, business-like)\n';
        break;
      case 'balanced':
        guidance += '• Communication Style: User prefers BALANCED tone (friendly but professional)\n';
        break;
      case 'casual':
        guidance += '• Communication Style: User prefers CASUAL tone (friendly, conversational)\n';
        break;
    }
  }
  
  if (preferences.formatPreference) {
    switch (preferences.formatPreference) {
      case 'bullets':
        guidance += '• Format: User prefers BULLET POINTS (structured, scannable)\n';
        break;
      case 'paragraphs':
        guidance += '• Format: User prefers PARAGRAPHS (flowing prose)\n';
        break;
      case 'mixed':
        guidance += '• Format: User prefers MIXED format (bullets + paragraphs)\n';
        break;
    }
  }
  
  guidance += '\nADAPT your response to match these learned preferences.\n';
  guidance += '---\n';
  
  return guidance;
}

/**
 * Update user preferences based on explicit statement
 */
export async function updatePreferencesFromStatement(
  userId: string,
  preference: string
): Promise<void> {
  try {
    // Parse the preference statement and log it
    await storage.createTransparencyLog({
      userId,
      taskName: 'walter_preference_update',
      success: true,
      resultSummary: `User expressed preference: ${preference.substring(0, 100)}`,
      notes: JSON.stringify({
        preference,
        timestamp: new Date().toISOString()
      })
    });
    
    console.log('[WalterHeuristics] Updated preference:', preference);
  } catch (error) {
    console.error('[WalterHeuristics] Error updating preference:', error);
  }
}

/**
 * Get summary of user's learned preferences
 */
export async function getPreferencesSummary(userId: string): Promise<string> {
  const prefs = await inferUserPreferences(userId);
  
  if (prefs.confidenceLevel < 0.3) {
    return 'No strong preferences detected yet. Continue learning from user interactions.';
  }
  
  const parts: string[] = [];
  
  if (prefs.responseLength) {
    parts.push(`Response length: ${prefs.responseLength}`);
  }
  if (prefs.detailLevel) {
    parts.push(`Detail level: ${prefs.detailLevel}`);
  }
  if (prefs.communicationStyle) {
    parts.push(`Communication: ${prefs.communicationStyle}`);
  }
  if (prefs.formatPreference) {
    parts.push(`Format: ${prefs.formatPreference}`);
  }
  
  const confidence = Math.round(prefs.confidenceLevel * 100);
  return `Learned preferences (${confidence}% confident): ${parts.join(', ')}`;
}
