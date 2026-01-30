import { KeywordDetector } from './KeywordDetector';
import { SYSTEM_LOCK_CONFIGS } from '../../constants/clinical';
import { AssessmentProfile, SystemCategory } from '../../types/triage';

export class SystemLockDetector extends KeywordDetector {
  protected getKeywords(): Record<string, number> {
    const allKeywords: Record<string, number> = {};
    for (const config of SYSTEM_LOCK_CONFIGS) {
      for (const keyword of config.keywords) {
        // Map system category to its escalation level score
        // critical = 3, complex = 2, simple = 1
        const score = config.escalationCategory === 'critical' ? 3 : 2;
        allKeywords[keyword] = score;
      }
    }
    return allKeywords;
  }

  /**
   * Analyzes text and returns the highest system category detected
   */
  public detectSystemLock(text: string): {
    escalationCategory: 'complex' | 'critical' | null;
    affectedSystems: SystemCategory[];
  } {
    const result = this.detect(text, true);

    if (result.matchedKeywords.length === 0) {
      return { escalationCategory: null, affectedSystems: [] };
    }

    const detectedSystems = new Set<SystemCategory>();
    let maxEscalation: 'complex' | 'critical' | null = null;

    for (const keyword of result.matchedKeywords) {
      const config = SYSTEM_LOCK_CONFIGS.find((c) =>
        c.keywords.some((k) => k.toLowerCase() === keyword.toLowerCase()),
      );

      if (config) {
        detectedSystems.add(config.system);
        if (config.escalationCategory === 'critical') {
          maxEscalation = 'critical';
        } else if (maxEscalation !== 'critical' && config.escalationCategory === 'complex') {
          maxEscalation = 'complex';
        }
      }
    }

    return {
      escalationCategory: maxEscalation,
      affectedSystems: Array.from(detectedSystems),
    };
  }

  /**
   * Applies overrides to the assessment profile based on detected system locks
   */
  public static applySystemOverrides(
    profile: AssessmentProfile,
    conversationText: string,
  ): AssessmentProfile {
    const detector = new SystemLockDetector();
    const { escalationCategory, affectedSystems } = detector.detectSystemLock(conversationText);

    if (escalationCategory) {
      const currentCategory = profile.symptom_category || 'simple';

      // Category Hierarchy: simple < complex < critical
      const hierarchy = { simple: 0, complex: 1, critical: 2 };

      if (hierarchy[escalationCategory] > hierarchy[currentCategory]) {
        console.log(
          `[SystemLock] Overriding category: ${currentCategory} -> ${escalationCategory} (Systems: ${affectedSystems.join(', ')})`,
        );
        profile.symptom_category = escalationCategory;

        // Also force is_complex_case if we've escalated
        if (escalationCategory === 'complex' || escalationCategory === 'critical') {
          profile.is_complex_case = true;
        }
      }
    }

    if (affectedSystems.length > 0) {
      profile.affected_systems = affectedSystems;
    }

    return profile;
  }
}
