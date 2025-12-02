// server/services/reflective-intelligence.ts
// Phase 9.4: Reflective Intelligence Layer
// Self-reflective analysis, meta-reasoning, and decision quality auditing
// [Phase 8.8.3-H9] Refactored to use typed Drizzle queries

import { db } from '../db';
import { desc, eq } from 'drizzle-orm';
import { reflectionLog, decisionQualityAudit } from '@shared/schema';
import { contextBridge } from './context-bridge';
import { nanoid } from 'nanoid';

type ReflectionDepth = 'surface' | 'analytical' | 'deep' | 'meta';
type QualityRating = 'poor' | 'fair' | 'good' | 'excellent';

interface ReflectionInput {
  triggerSource: string;
  depth: ReflectionDepth;
  subjectArea: string;
  contextData?: Record<string, any>;
}

interface DecisionAuditInput {
  decisionId: string;
  decisionType: string;
  initialReasoning: string;
  outcomeObserved?: string;
  qualityRating: QualityRating;
  accuracyScore?: number;
}

class ReflectiveIntelligenceService {
  async reflect(
    userId: string,
    input: ReflectionInput,
    mode?: 'live' | 'paper'
  ) {
    const reflectionId = `reflection_${nanoid(12)}`;
    const analysis = this.performAnalysis(input);

    const [created] = await db.insert(reflectionLog).values({
      id: reflectionId,
      userId,
      triggerSource: input.triggerSource,
      reflectionDepth: input.depth,
      subjectArea: input.subjectArea,
      analysisText: analysis.text,
      insights: analysis.insights,
      questionsRaised: analysis.questions,
      improvementSuggestions: analysis.suggestions,
      confidenceScore: analysis.confidence,
      metadata: { mode, contextData: input.contextData },
    }).returning();

    await contextBridge.broadcast({
      type: 'state_update',
      userId,
      mode,
      payload: {
        source: 'reflective_intelligence',
        action: 'reflection_completed',
        reflectionId,
        depth: input.depth,
        subjectArea: input.subjectArea,
      },
    });

    return created;
  }

  private performAnalysis(input: ReflectionInput): {
    text: string;
    insights: Record<string, any>;
    questions: string[];
    suggestions: string[];
    confidence: number;
  } {
    const { depth, subjectArea, contextData } = input;

    switch (depth) {
      case 'surface':
        return {
          text: `Surface-level reflection on ${subjectArea}: Basic observation and pattern recognition.`,
          insights: { level: 'surface', patterns: [] },
          questions: [`What patterns emerge in ${subjectArea}?`],
          suggestions: ['Continue monitoring for deeper patterns'],
          confidence: 0.6,
        };

      case 'analytical':
        return {
          text: `Analytical reflection on ${subjectArea}: Detailed examination of causes, effects, and relationships.`,
          insights: {
            level: 'analytical',
            causalFactors: contextData?.factors || [],
            relationships: contextData?.relationships || [],
          },
          questions: [
            `What are the root causes affecting ${subjectArea}?`,
            'How do these factors interact?',
          ],
          suggestions: [
            'Investigate causal relationships further',
            'Test hypotheses with simulations',
          ],
          confidence: 0.75,
        };

      case 'deep':
        return {
          text: `Deep reflection on ${subjectArea}: Comprehensive analysis including second-order effects and systemic implications.`,
          insights: {
            level: 'deep',
            systemicImpacts: contextData?.impacts || [],
            secondOrderEffects: contextData?.effects || [],
            emergentProperties: contextData?.emergent || [],
          },
          questions: [
            `What are the systemic implications for ${subjectArea}?`,
            'What emergent behaviors might arise?',
            'What are we not seeing?',
          ],
          suggestions: [
            'Model system dynamics',
            'Consider long-term consequences',
            'Explore alternative perspectives',
          ],
          confidence: 0.85,
        };

      case 'meta':
        return {
          text: `Meta-reflection on ${subjectArea}: Analysis of the analysis itself - examining our reasoning process, biases, and assumptions.`,
          insights: {
            level: 'meta',
            reasoningQuality: contextData?.reasoningQuality || 'moderate',
            biasesIdentified: contextData?.biases || [],
            assumptionsUncovered: contextData?.assumptions || [],
            confidenceCalibration: contextData?.calibration || 'uncertain',
          },
          questions: [
            `How sound is our reasoning about ${subjectArea}?`,
            'What biases might be affecting our analysis?',
            'What assumptions are we making?',
            'How well-calibrated is our confidence?',
          ],
          suggestions: [
            'Challenge core assumptions',
            'Seek disconfirming evidence',
            'Apply different reasoning frameworks',
            'Calibrate confidence levels',
          ],
          confidence: 0.9,
        };

      default:
        return {
          text: `Basic reflection on ${subjectArea}`,
          insights: {},
          questions: [],
          suggestions: [],
          confidence: 0.5,
        };
    }
  }

  async auditDecision(
    userId: string,
    input: DecisionAuditInput,
    mode?: 'live' | 'paper'
  ) {
    const auditId = `audit_${nanoid(12)}`;
    const analysis = this.analyzeDecisionQuality(input);

    const [created] = await db.insert(decisionQualityAudit).values({
      id: auditId,
      decisionId: input.decisionId,
      userId,
      decisionType: input.decisionType,
      initialReasoning: input.initialReasoning,
      outcomeObserved: input.outcomeObserved || null,
      qualityRating: input.qualityRating,
      accuracyScore: input.accuracyScore || null,
      biasDetected: analysis.biases,
      lessonsLearned: analysis.lessons,
      alternativeApproaches: analysis.alternatives,
      wouldRepeat: analysis.wouldRepeat,
      metadata: { mode },
    }).returning();

    await contextBridge.broadcast({
      type: 'state_update',
      userId,
      mode,
      payload: {
        source: 'reflective_intelligence',
        action: 'decision_audited',
        auditId,
        decisionId: input.decisionId,
        qualityRating: input.qualityRating,
      },
    });

    return created;
  }

  private analyzeDecisionQuality(input: DecisionAuditInput): {
    biases: string[];
    lessons: string;
    alternatives: string[];
    wouldRepeat: boolean;
  } {
    const { qualityRating, accuracyScore, outcomeObserved } = input;

    const biases: string[] = [];
    if (qualityRating === 'poor' || (accuracyScore && accuracyScore < 0.5)) {
      biases.push('confirmation_bias', 'availability_heuristic');
    }

    let lessons = '';
    if (qualityRating === 'poor' || qualityRating === 'fair') {
      lessons = `Decision quality was ${qualityRating}. Need to improve reasoning process and consider more alternatives.`;
    } else {
      lessons = `Decision quality was ${qualityRating}. Continue applying this reasoning approach.`;
    }

    if (outcomeObserved) {
      lessons += ` Observed outcome: ${outcomeObserved}`;
    }

    const alternatives: string[] = [
      'Consider multiple perspectives',
      'Seek disconfirming evidence',
      'Use structured decision frameworks',
    ];

    const wouldRepeat =
      qualityRating === 'good' || qualityRating === 'excellent';

    return { biases, lessons, alternatives, wouldRepeat };
  }

  async getReflections(userId: string, limit = 20) {
    return db.select()
      .from(reflectionLog)
      .where(eq(reflectionLog.userId, userId))
      .orderBy(desc(reflectionLog.createdAt))
      .limit(limit);
  }

  async getDecisionAudits(userId: string, limit = 20) {
    return db.select()
      .from(decisionQualityAudit)
      .where(eq(decisionQualityAudit.userId, userId))
      .orderBy(desc(decisionQualityAudit.createdAt))
      .limit(limit);
  }

  async triggerDeepReflection(userId: string, mode?: 'live' | 'paper') {
    return await this.reflect(
      userId,
      {
        triggerSource: 'scheduled_deep_reflection',
        depth: 'deep',
        subjectArea: 'recent_trading_decisions',
        contextData: {
          impacts: ['portfolio_performance', 'risk_exposure'],
          effects: ['market_adaptation', 'strategy_evolution'],
          emergent: ['pattern_recognition_improvement'],
        },
      },
      mode
    );
  }

  async triggerMetaReflection(userId: string, mode?: 'live' | 'paper') {
    return await this.reflect(
      userId,
      {
        triggerSource: 'scheduled_meta_reflection',
        depth: 'meta',
        subjectArea: 'decision_making_quality',
        contextData: {
          reasoningQuality: 'moderate',
          biases: ['recency_bias', 'overconfidence'],
          assumptions: ['market_rationality', 'pattern_persistence'],
          calibration: 'needs_improvement',
        },
      },
      mode
    );
  }
}

export const reflectiveIntelligence = new ReflectiveIntelligenceService();
