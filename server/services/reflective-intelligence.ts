// server/services/reflective-intelligence.ts
// Phase 9.4: Reflective Intelligence Layer
// Self-reflective analysis, meta-reasoning, and decision quality auditing

import { db } from '../db';
import { sql, desc, eq, and } from 'drizzle-orm';
import { contextBridge } from './context-bridge';
import { nanoid } from 'nanoid';

/**
 * Reflection depth levels
 */
type ReflectionDepth = 'surface' | 'analytical' | 'deep' | 'meta';

/**
 * Quality rating levels
 */
type QualityRating = 'poor' | 'fair' | 'good' | 'excellent';

interface ReflectionInput {
  triggerSource: string;
  depth: ReflectionDepth;
  subjectArea: string;
  contextData?: Record<string, any>;
}

interface ReflectionLog {
  id: string;
  userId: string | null;
  triggerSource: string;
  reflectionDepth: ReflectionDepth;
  subjectArea: string;
  analysisText: string;
  insights: Record<string, any> | null;
  questionsRaised: string[] | null;
  improvementSuggestions: string[] | null;
  confidenceScore: string | null;
  metadata: unknown;
  createdAt: Date;
}

interface DecisionAuditInput {
  decisionId: string;
  decisionType: string;
  initialReasoning: string;
  outcomeObserved?: string;
  qualityRating: QualityRating;
  accuracyScore?: number;
}

interface DecisionQualityAudit {
  id: string;
  decisionId: string;
  userId: string | null;
  decisionType: string;
  initialReasoning: string | null;
  outcomeObserved: string | null;
  qualityRating: QualityRating;
  accuracyScore: string | null;
  biasDetected: string[] | null;
  lessonsLearned: string | null;
  alternativeApproaches: string[] | null;
  wouldRepeat: boolean | null;
  metadata: unknown;
  createdAt: Date;
  evaluatedAt: Date | null;
}

/**
 * Reflective Intelligence Service
 * Enables self-reflection, meta-reasoning, and decision quality analysis
 */
class ReflectiveIntelligenceService {
  /**
   * Perform reflective analysis
   */
  async reflect(
    userId: string,
    input: ReflectionInput,
    mode?: 'live' | 'paper'
  ): Promise<ReflectionLog> {
    const reflectionId = `reflection_${nanoid(12)}`;

    // Analyze based on depth level
    const analysis = this.performAnalysis(input);

    const [created] = await db.execute(sql`
      INSERT INTO reflection_log (
        id, user_id, trigger_source, reflection_depth, subject_area,
        analysis_text, insights, questions_raised, improvement_suggestions, 
        confidence_score, metadata
      ) VALUES (
        ${reflectionId},
        ${userId},
        ${input.triggerSource},
        ${input.depth}::reflection_depth,
        ${input.subjectArea},
        ${analysis.text},
        ${JSON.stringify(analysis.insights)}::jsonb,
        ${JSON.stringify(analysis.questions)}::text[],
        ${JSON.stringify(analysis.suggestions)}::text[],
        ${analysis.confidence},
        ${JSON.stringify({ mode, contextData: input.contextData })}::jsonb
      )
      RETURNING *
    `);

    // Broadcast via Context Bridge
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

    return created.rows[0] as ReflectionLog;
  }

  /**
   * Perform analysis based on reflection depth
   */
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

  /**
   * Audit decision quality post-execution
   */
  async auditDecision(
    userId: string,
    input: DecisionAuditInput,
    mode?: 'live' | 'paper'
  ): Promise<DecisionQualityAudit> {
    const auditId = `audit_${nanoid(12)}`;

    // Analyze decision quality
    const analysis = this.analyzeDecisionQuality(input);

    const [created] = await db.execute(sql`
      INSERT INTO decision_quality_audit (
        id, decision_id, user_id, decision_type, initial_reasoning,
        outcome_observed, quality_rating, accuracy_score, bias_detected,
        lessons_learned, alternative_approaches, would_repeat, metadata
      ) VALUES (
        ${auditId},
        ${input.decisionId},
        ${userId},
        ${input.decisionType},
        ${input.initialReasoning},
        ${input.outcomeObserved || null},
        ${input.qualityRating}::quality_rating,
        ${input.accuracyScore || null},
        ${JSON.stringify(analysis.biases)}::text[],
        ${analysis.lessons},
        ${JSON.stringify(analysis.alternatives)}::text[],
        ${analysis.wouldRepeat},
        ${JSON.stringify({ mode })}::jsonb
      )
      RETURNING *
    `);

    // Broadcast via Context Bridge
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

    return created.rows[0] as DecisionQualityAudit;
  }

  /**
   * Analyze decision quality and extract lessons
   */
  private analyzeDecisionQuality(input: DecisionAuditInput): {
    biases: string[];
    lessons: string;
    alternatives: string[];
    wouldRepeat: boolean;
  } {
    const { qualityRating, accuracyScore, outcomeObserved } = input;

    // Detect potential biases based on quality
    const biases: string[] = [];
    if (qualityRating === 'poor' || (accuracyScore && accuracyScore < 0.5)) {
      biases.push('confirmation_bias', 'availability_heuristic');
    }

    // Generate lessons
    let lessons = '';
    if (qualityRating === 'poor' || qualityRating === 'fair') {
      lessons = `Decision quality was ${qualityRating}. Need to improve reasoning process and consider more alternatives.`;
    } else {
      lessons = `Decision quality was ${qualityRating}. Continue applying this reasoning approach.`;
    }

    if (outcomeObserved) {
      lessons += ` Observed outcome: ${outcomeObserved}`;
    }

    // Suggest alternatives
    const alternatives: string[] = [
      'Consider multiple perspectives',
      'Seek disconfirming evidence',
      'Use structured decision frameworks',
    ];

    // Determine if would repeat
    const wouldRepeat =
      qualityRating === 'good' || qualityRating === 'excellent';

    return { biases, lessons, alternatives, wouldRepeat };
  }

  /**
   * Get recent reflections
   */
  async getReflections(
    userId: string,
    limit = 20
  ): Promise<ReflectionLog[]> {
    const result = await db.execute(sql`
      SELECT * FROM reflection_log
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    return result.rows as ReflectionLog[];
  }

  /**
   * Get decision audits
   */
  async getDecisionAudits(
    userId: string,
    limit = 20
  ): Promise<DecisionQualityAudit[]> {
    const result = await db.execute(sql`
      SELECT * FROM decision_quality_audit
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    return result.rows as DecisionQualityAudit[];
  }

  /**
   * Trigger deep reflection on recent activities
   */
  async triggerDeepReflection(userId: string, mode?: 'live' | 'paper') {
    // Perform deep reflection on recent decisions
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

  /**
   * Trigger meta-reflection on reasoning quality
   */
  async triggerMetaReflection(userId: string, mode?: 'live' | 'paper') {
    // Perform meta-reflection on our own reasoning
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
