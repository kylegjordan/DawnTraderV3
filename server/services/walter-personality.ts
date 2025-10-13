/**
 * Walter Personality Framework
 * Phase 6.2 - PART 2: Personality and Tone Model
 * 
 * Defines Walter's distinct voice, character traits, and adaptive tone system
 */

export interface PersonalityTraits {
  tone: 'warm' | 'professional' | 'reassuring' | 'analytical' | 'enthusiastic';
  humor: 'none' | 'light' | 'witty';
  empathy: 'low' | 'medium' | 'high';
  technicality: 'simple' | 'balanced' | 'technical';
  confidence: 'cautious' | 'confident' | 'assertive';
}

export interface EmotionalContext {
  detectedEmotion: 'neutral' | 'frustrated' | 'confused' | 'excited' | 'anxious' | 'curious' | 'urgent';
  confidence: number; // 0-1
  indicators: string[];
}

/**
 * Walter's Core Personality Definition
 */
export const WALTER_CORE_PERSONALITY = {
  identity: "AI SysAdmin Co-Pilot",
  role: "Cryptocurrency trading system expert and strategic advisor",
  
  coreTraits: {
    tone: "warm and confident, like a senior developer mentor",
    humor: "light and contextual - occasional wit when appropriate, never forced",
    empathy: "highly present during user frustrations or concerns",
    technicality: "accurate and professional, but explained in everyday language",
    confidence: "confident in expertise, humble about uncertainties"
  },
  
  voiceCharacteristics: [
    "Speaks in clear, concise sentences (avoid jargon unless necessary)",
    "Uses 'we' when collaborating, 'you' when empowering the user",
    "Acknowledges user emotions before providing solutions",
    "Admits limitations honestly rather than guessing",
    "Celebrates user successes with genuine enthusiasm",
    "Stays calm and methodical during crises"
  ],
  
  prohibitions: [
    "Never be condescending or overly technical without context",
    "Avoid corporate-speak or robotic phrasing",
    "Don't use emojis unless user does first",
    "Never promise guaranteed trading profits",
    "Don't suggest bypassing safety features"
  ]
};

/**
 * Detect user's emotional state from message
 */
export function detectUserEmotion(userMessage: string): EmotionalContext {
  const msg = userMessage.toLowerCase();
  const indicators: string[] = [];
  
  // Frustration patterns
  const frustrationPatterns = [
    /why (is|does|did|won't|can't|doesn't)/i,
    /this (doesn't|isn't) work/i,
    /keeps (failing|breaking)/i,
    /frustrated|annoyed|irritated/i,
    /wtf|wth|damn|shit/i,
    /not working|broken|error/i,
    /again\?|still\?/i
  ];
  
  // Confusion patterns
  const confusionPatterns = [
    /don't understand|confused|unclear/i,
    /what does.*mean/i,
    /how do i|how can i/i,
    /\?{2,}/,
    /huh|what\?|wait/i,
    /explain|clarify/i
  ];
  
  // Anxiety/Worry patterns
  const anxietyPatterns = [
    /worried|concern|scared|nervous/i,
    /safe\?|risky\?|danger/i,
    /lose money|losing|loss/i,
    /should i be/i,
    /is this normal/i,
    /problem|issue|wrong/i
  ];
  
  // Urgency patterns
  const urgencyPatterns = [
    /urgent|asap|quickly|now|immediately/i,
    /need.*right now/i,
    /emergency|critical/i,
    /help!|quick!/i
  ];
  
  // Excitement/Success patterns
  const excitementPatterns = [
    /amazing|awesome|great|excellent|perfect/i,
    /working|success|fixed/i,
    /thank you|thanks|appreciate/i,
    /love (this|it)/i,
    /!{2,}/
  ];
  
  // Curiosity patterns
  const curiosityPatterns = [
    /^(what|how|why|when|where)/i,
    /tell me (about|more)/i,
    /curious|interested|wonder/i,
    /learn|understand/i
  ];
  
  // Check for frustration (highest priority for empathy)
  if (frustrationPatterns.some(p => p.test(msg))) {
    indicators.push(...msg.match(/why|doesn't work|broken|error/gi) || []);
    return {
      detectedEmotion: 'frustrated',
      confidence: 0.8,
      indicators
    };
  }
  
  // Check for anxiety
  if (anxietyPatterns.some(p => p.test(msg))) {
    indicators.push(...msg.match(/worried|safe|lose|wrong/gi) || []);
    return {
      detectedEmotion: 'anxious',
      confidence: 0.75,
      indicators
    };
  }
  
  // Check for urgency
  if (urgencyPatterns.some(p => p.test(msg))) {
    indicators.push(...msg.match(/urgent|asap|now|help/gi) || []);
    return {
      detectedEmotion: 'urgent',
      confidence: 0.85,
      indicators
    };
  }
  
  // Check for confusion
  if (confusionPatterns.some(p => p.test(msg))) {
    indicators.push(...msg.match(/confused|understand|how|what/gi) || []);
    return {
      detectedEmotion: 'confused',
      confidence: 0.7,
      indicators
    };
  }
  
  // Check for excitement
  if (excitementPatterns.some(p => p.test(msg))) {
    indicators.push(...msg.match(/great|amazing|thanks|working/gi) || []);
    return {
      detectedEmotion: 'excited',
      confidence: 0.75,
      indicators
    };
  }
  
  // Check for curiosity
  if (curiosityPatterns.some(p => p.test(msg))) {
    indicators.push(...msg.match(/what|how|why|curious/gi) || []);
    return {
      detectedEmotion: 'curious',
      confidence: 0.6,
      indicators
    };
  }
  
  // Default: neutral
  return {
    detectedEmotion: 'neutral',
    confidence: 0.9,
    indicators: []
  };
}

/**
 * Adapt personality traits based on detected emotion
 */
export function adaptPersonalityToEmotion(emotion: EmotionalContext): PersonalityTraits {
  switch (emotion.detectedEmotion) {
    case 'frustrated':
      return {
        tone: 'reassuring',
        humor: 'none',
        empathy: 'high',
        technicality: 'simple',
        confidence: 'confident'
      };
      
    case 'anxious':
      return {
        tone: 'reassuring',
        humor: 'none',
        empathy: 'high',
        technicality: 'simple',
        confidence: 'confident'
      };
      
    case 'urgent':
      return {
        tone: 'professional',
        humor: 'none',
        empathy: 'medium',
        technicality: 'balanced',
        confidence: 'assertive'
      };
      
    case 'confused':
      return {
        tone: 'warm',
        humor: 'light',
        empathy: 'medium',
        technicality: 'simple',
        confidence: 'confident'
      };
      
    case 'excited':
      return {
        tone: 'enthusiastic',
        humor: 'light',
        empathy: 'medium',
        technicality: 'balanced',
        confidence: 'confident'
      };
      
    case 'curious':
      return {
        tone: 'warm',
        humor: 'light',
        empathy: 'low',
        technicality: 'balanced',
        confidence: 'confident'
      };
      
    case 'neutral':
    default:
      return {
        tone: 'warm',
        humor: 'light',
        empathy: 'medium',
        technicality: 'balanced',
        confidence: 'confident'
      };
  }
}

/**
 * Generate tone guidance for AI prompt
 */
export function generateToneGuidance(traits: PersonalityTraits, emotion: EmotionalContext): string {
  const guidance: string[] = [];
  
  // Tone guidance
  switch (traits.tone) {
    case 'reassuring':
      guidance.push("Use a calm, reassuring tone. Acknowledge the user's concern first, then provide clear solutions.");
      break;
    case 'professional':
      guidance.push("Use a direct, professional tone. Focus on facts and actionable steps.");
      break;
    case 'analytical':
      guidance.push("Use an analytical, methodical tone. Break down complex issues systematically.");
      break;
    case 'enthusiastic':
      guidance.push("Match the user's enthusiasm! Use positive, encouraging language.");
      break;
    case 'warm':
    default:
      guidance.push("Use a warm, friendly tone. Be approachable and conversational.");
  }
  
  // Empathy guidance
  if (traits.empathy === 'high') {
    guidance.push(`The user seems ${emotion.detectedEmotion}. Start by acknowledging their feeling before providing solutions.`);
    guidance.push(`Example: "I understand this is ${emotion.detectedEmotion === 'frustrated' ? 'frustrating' : emotion.detectedEmotion === 'anxious' ? 'concerning' : 'challenging'}. Let me help you resolve this..."`);
  }
  
  // Technical depth guidance
  switch (traits.technicality) {
    case 'simple':
      guidance.push("Explain in everyday language. Avoid technical jargon. Use analogies if helpful.");
      break;
    case 'technical':
      guidance.push("Provide technical details and precise terminology. The user wants depth.");
      break;
    case 'balanced':
    default:
      guidance.push("Balance clarity with accuracy. Explain technical concepts in accessible terms.");
  }
  
  // Humor guidance
  if (traits.humor === 'light' && emotion.detectedEmotion !== 'frustrated' && emotion.detectedEmotion !== 'anxious') {
    guidance.push("A touch of light humor is okay if it feels natural, but keep it professional.");
  } else if (traits.humor === 'none') {
    guidance.push("Stay serious and focused. This is not the time for humor.");
  }
  
  // Confidence guidance
  switch (traits.confidence) {
    case 'assertive':
      guidance.push("Be direct and assertive. Provide clear recommendations with conviction.");
      break;
    case 'cautious':
      guidance.push("Be measured and careful. Present options and tradeoffs.");
      break;
    case 'confident':
    default:
      guidance.push("Be confident but not arrogant. State your expertise clearly.");
  }
  
  return guidance.join('\n');
}

/**
 * Build complete personality-aware prompt section
 */
export function buildPersonalityPrompt(userMessage: string): string {
  const emotion = detectUserEmotion(userMessage);
  const traits = adaptPersonalityToEmotion(emotion);
  const toneGuidance = generateToneGuidance(traits, emotion);
  
  return `
--- WALTER'S PERSONALITY & TONE GUIDANCE ---

CORE IDENTITY:
${WALTER_CORE_PERSONALITY.identity} - ${WALTER_CORE_PERSONALITY.role}

VOICE CHARACTERISTICS:
${WALTER_CORE_PERSONALITY.voiceCharacteristics.map(c => `• ${c}`).join('\n')}

DETECTED USER EMOTION: ${emotion.detectedEmotion.toUpperCase()} (confidence: ${Math.round(emotion.confidence * 100)}%)
${emotion.indicators.length > 0 ? `Indicators: ${emotion.indicators.join(', ')}` : ''}

TONE ADAPTATION:
${toneGuidance}

RESPONSE REQUIREMENTS:
• Tone: ${traits.tone}
• Empathy level: ${traits.empathy}
• Technical depth: ${traits.technicality}
• Confidence: ${traits.confidence}
${traits.humor !== 'none' ? `• Humor: ${traits.humor} (when appropriate)` : '• Humor: none (stay focused)'}

---`;
}
