import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Alert,
  Platform,
  UIManager,
  Keyboard,
  Animated,
  BackHandler,
  Dimensions,
  Modal,
  ScrollView,
} from 'react-native';
import { ActivityIndicator, useTheme, Chip, MD3Theme } from 'react-native-paper';
import { Text } from '../components/common/Text';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import NetInfo from '@react-native-community/netinfo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RootStackScreenProps } from '../types/navigation';
import { RootState } from '../store';
import { geminiClient } from '../api/geminiClient';
import {
  selectFullName,
  selectProfileDob,
} from '../store/profileSlice';
import { selectAllMedications } from '../store/medicationSlice';
import { detectEmergency, type EmergencyDetectionResult } from '../services/emergencyDetector';
import { detectMentalHealthCrisis } from '../services/mentalHealthDetector';
import {
  setHighRisk,
  updateAssessmentState,
  clearAssessmentState,
  AssessmentTurnMeta,
} from '../store/navigationSlice';
import { TriageEngine } from '../services/triageEngine';
import { TriageArbiter } from '../services/triageArbiter';
import {
  TriageFlow,
  AssessmentQuestion,
  AssessmentProfile,
  GroupedOption,
  QuestionSlotGoal,
  TriageSnapshot,
} from '../types/triage';
import {
  ClinicalSlots,
  calculateAgeFromDob,
  computeUnresolvedSlotGoals,
  createClinicalSlotParser,
  reconcileClinicalProfileWithSlots,
  detectProfileChanges,
  formatProfileForAI,
} from '../utils/clinicalUtils';
import {
  calculateTriageScore,
  parseAndValidateLLMResponse,
  normalizeBooleanResponse,
} from '../utils/aiUtils';
import { StandardHeader } from '../components/common/StandardHeader';
import { Button } from '../components/common/Button';
import {
  InputCard,
  TypingIndicator,
  InputCardRef,
  ProgressBar,
  MultiSelectChecklist,
  ScreenSafeArea,
} from '../components/common';
import { ChecklistOption, GroupedChecklistOption } from '../components/common/MultiSelectChecklist';
import { DYNAMIC_CLARIFIER_PROMPT_TEMPLATE } from '../constants/prompts';
import {
  formatEmpatheticResponse,
  derivePrimarySymptom,
} from '../utils/empatheticResponses';
import { theme as appTheme } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Check if we're on Android and the method exists, AND if we're NOT on the New Architecture (Fabric)
// Under the New Architecture, LayoutAnimation is handled differently and this call is a no-op or can cause warnings.
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental &&
  !(global as Record<string, unknown>).nativeFabricUIManager
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const triageFlow = require('../../assets/triage-flow.json') as TriageFlow;

type ScreenRouteProp = RootStackScreenProps<'SymptomAssessment'>['route'];
type NavigationProp = RootStackScreenProps<'SymptomAssessment'>['navigation'];

interface Message {
  id: string;
  text: string;
  sender: 'assistant' | 'user' | 'ai';
  isOffline?: boolean;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

const SYSTEM_TRANSITION_REASON_SOURCES = new Set([
  'arbiter-expansion-notice',
  'arbiter-reset',
  'escalation-pivot',
  'arbiter-finalize-safety',
  'finalizing',
  'finalize-assessment',
]);

const composeAssistantMessage = ({
  id,
  body,
  header,
  reason,
  reasonSource,
  nextAction,
  inlineAck,
  profile,
  primarySymptom,
  timestamp,
  extra = {},
}: {
  id: string;
  body: string;
  header?: string;
  reason?: string;
  reasonSource?: string;
  nextAction?: string;
  inlineAck?: string;
  profile?: AssessmentProfile;
  primarySymptom?: string;
  timestamp: number;
  extra?: Partial<Omit<Message, 'id' | 'sender' | 'text' | 'timestamp'>>;
}): Message => {
  const { metadata: extraMetadata, ...extraRest } = extra;
  const isSystemTransition = Boolean(
    reasonSource && SYSTEM_TRANSITION_REASON_SOURCES.has(reasonSource),
  );

  // Explicitly move nextAction to metadata to ensure it is never rendered in text
  // while preserving it for internal tracking/debugging.
  const safeMetadata = {
    ...(extraMetadata || {}),
    nextAction,
    reason,
    reasonSource,
    isSystemTransition,
  };

  const formatted = formatEmpatheticResponse({
    header,
    body,
    reason,
    reasonSource,
    inlineAck,
    profile,
    primarySymptom,
    tone: 'neutral',
    // nextAction, // OMITTED to prevent display in user-facing text
    metadata: safeMetadata,
  });

  // When isSystemTransition is true, we strictly prohibit user-visible content.
  // The message body is limited to an empty string to ensure nothing is rendered or spoken.
  const displayText = isSystemTransition ? '' : formatted.text || '';
  const messageMetadata = {
    ...(formatted.metadata || {}),
    isSystemTransition,
  };
  return {
    id,
    sender: 'assistant',
    timestamp,
    ...extraRest,
    text: displayText,
    metadata: messageMetadata,
  };
};

type AssessmentStage = 'intake' | 'follow_up' | 'review' | 'generating';
type AssessmentMode = 'forMe' | 'forSomeoneElse';

const isNoneOption = (text: string) => {
  const lower = text.toLowerCase();
  return (
    lower === 'none' ||
    lower === 'none of the above' ||
    lower === 'none of these' ||
    lower === 'none of these apply'
  );
};

const parseRedFlags = (text: string): { id: string; label: string }[] => {
  // 1. Try to find a list after a colon
  let content = text;
  const colonIndex = text.indexOf(':');
  if (colonIndex !== -1) {
    content = text.substring(colonIndex + 1);
  } else {
    // 2. Try to find a list after specific keywords if no colon
    const keywords = ['including', 'like', 'such as', 'following', 'these:'];
    for (const kw of keywords) {
      const idx = text.toLowerCase().indexOf(kw);
      if (idx !== -1) {
        content = text.substring(idx + kw.length);
        break;
      }
    }
  }

  // Clean up content (remove trailing question mark)
  content = content.replace(/\?$/, '');

  // Split by comma or "or"
  // "A, B, or C" -> ["A", "B", "C"]
  const rawItems = content
    .split(/,| or /)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Deduplicate and format
  const uniqueItems = Array.from(new Set(rawItems));

  return uniqueItems.map((item) => ({
    id: item, // Use label as ID for simplicity here
    label: item.charAt(0).toUpperCase() + item.slice(1),
  }));
};

const formatSelectionAnswer = (question: AssessmentQuestion, selections: string[]) => {
  // 1. Handle "None"
  const labels = selections.filter((i) => !isNoneOption(i));
  if (labels.length === 0) {
    return "No, I don't have any of those.";
  }

  const joined = labels.join(', ');

  // 2. Context-aware formatting based on ID
  switch (question.id) {
    case 'age':
      return `I am ${joined} years old.`;
    case 'duration':
      return `It has been happening for ${joined}.`;
    case 'severity':
      return `It is ${joined}.`;
    case 'red_flags':
      // Red flags explicitly implies symptoms
      return `I'm experiencing ${joined}.`;
    default: {
      // 3. Fallback based on question text content
      const lowerText = question.text.toLowerCase();
      if (lowerText.includes('symptom') || lowerText.includes('experiencing')) {
        return `I'm experiencing ${joined}.`;
      }
      return joined;
    }
  }
};

const buildBridgeText = (_lastUserText: string, nextQuestionText: string) => nextQuestionText;

const escapeForRegex = (value: string) => value.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
const OUT_OF_SCOPE_INDICATORS = [
  'talk to a human',
  'talk to a doctor',
  'contact support',
  'change topic',
  'off topic',
  'something else',
  'another question',
  'billing',
  'weather',
  'joke',
  'news',
  'random',
  'tell me a story',
  'what can you do',
  'who are you',
  'help me',
  'need help',
  'just testing',
  'not sure what to say',
];
const OUT_OF_SCOPE_PATTERN = new RegExp(
  `\\b(?:${OUT_OF_SCOPE_INDICATORS.map(escapeForRegex).join('|')})\\b`,
  'i',
);
const OUT_OF_SCOPE_REMINDER_THRESHOLD = 2;

const MIN_TURNS_SIMPLE = 4;
const MIN_TURNS_COMPLEX = 7;
const CATEGORY_RANKING: Record<string, number> = {
  simple: 1,
  complex: 2,
  critical: 3,
};
const CORE_SLOT_ORDER: (keyof AssessmentProfile)[] = ['duration', 'severity', 'progression'];

const replaceTemplatePlaceholders = (template: string, values: Record<string, string>): string => {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  }
  return result;
};

interface ClarifierPromptContext {
  resolvedTag: string;
  initialSymptom: string;
  symptomContext: string;
  arbiterReason: string;
  missingSlotsText: string;
  coreSlotsText: string;
  flagsText: string;
  recentResponses: string;
  triageScoreText: string;
  currentTurn: number;
  categoryLabel: string;
  establishedFacts: string;
}

const buildClarifierPrompt = (context: ClarifierPromptContext) =>
  replaceTemplatePlaceholders(DYNAMIC_CLARIFIER_PROMPT_TEMPLATE, {
    resolvedTag: context.resolvedTag,
    initialSymptom: context.initialSymptom,
    symptomContext: context.symptomContext,
    arbiterReason: context.arbiterReason,
    missingSlots: context.missingSlotsText,
    coreSlots: context.coreSlotsText,
    flagsText: context.flagsText,
    recentResponses: context.recentResponses,
    triageScore: context.triageScoreText,
    establishedFacts: context.establishedFacts,
    currentTurn: context.currentTurn.toString(),
    minTurnsSimple: MIN_TURNS_SIMPLE.toString(),
    minTurnsComplex: MIN_TURNS_COMPLEX.toString(),
    categoryLabel: context.categoryLabel,
  });

const sanitizeClarifierQuestion = (raw: Record<string, unknown>): AssessmentQuestion => {
  const normalizedType =
    raw?.type === 'single-select' || raw?.type === 'multi-select' ? (raw.type as 'single-select' | 'multi-select') : 'text';
  const tierValue = Number(raw?.tier);
  const tier = [1, 2, 3].includes(tierValue) ? tierValue : 3;

  return {
    id: String(raw?.id ?? ''),
    text: typeof raw?.text === 'string' ? raw.text.trim() : '',
    type: normalizedType,
    options: Array.isArray(raw?.options) ? raw.options : [],
    tier,
    is_red_flag: Boolean(raw?.is_red_flag),
  };
};

const sortClarifierQuestions = (questions: AssessmentQuestion[]) =>
  [...questions].sort((a, b) => {
    const aFlagPriority = a.is_red_flag ? 0 : 1;
    const bFlagPriority = b.is_red_flag ? 0 : 1;
    if (aFlagPriority !== bFlagPriority) {
      return aFlagPriority - bFlagPriority;
    }
    const aTier = typeof a.tier === 'number' ? a.tier : 3;
    const bTier = typeof b.tier === 'number' ? b.tier : 3;
    return aTier - bTier;
  });

const SymptomAssessmentScreen = () => {
  const route = useRoute<ScreenRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch();
  const savedState = useSelector((state: RootState) => state.navigation.assessmentState);
  const profile = useSelector((state: RootState) => state.profile);
  const medications = useSelector(selectAllMedications);
  const clinicalContext = useMemo(
    () => formatProfileForAI(profile, medications),
    [profile, medications],
  );
  const fullName = useSelector(selectFullName);
  const profileDob = useSelector(selectProfileDob);
  const theme = useTheme() as MD3Theme & { spacing: Record<string, number> };
  const spacing = theme.spacing ?? appTheme.spacing;
  const chatBottomPadding = spacing.lg * 2;
  const flatListRef = useRef<FlatList>(null);
  const inputCardRef = useRef<InputCardRef>(null);
  const hasShownClarificationHeader = useRef(false);
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const keyboardScrollRaf = useRef<number | null>(null);
  const { initialSymptom } = route.params || { initialSymptom: '' };
  const trimmedInitialSymptom = (initialSymptom || '').trim();
  const defaultPrimarySymptom = derivePrimarySymptom(initialSymptom);
  const hasInitialSymptom = trimmedInitialSymptom.length > 0;
  const safetySymptomReference = hasInitialSymptom
    ? `"${trimmedInitialSymptom}"`
    : 'the symptoms you shared earlier';
  const safetyShortLabel = hasInitialSymptom ? 'those symptoms' : 'your current concern';
  const slotParserRef = useRef(createClinicalSlotParser());
  const hydrateInitialSlots = (): ClinicalSlots => {
    const parser = slotParserRef.current;
    parser.reset();
    const historicalMessages = savedState?.sessionBuffer || savedState?.messages || [];
    historicalMessages.forEach((msg) => {
      if (msg.sender === 'user') {
        parser.parseTurn(msg.text);
      }
    });
    return parser.getSlots();
  };

  // Core State
  const [messages, setMessages] = useState<Message[]>(savedState?.messages || []);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>(savedState?.questions || []);
  const [fullPlan, setFullPlan] = useState<AssessmentQuestion[]>(savedState?.fullPlan || []);
  const syncQuestionQueue = useCallback(
    (nextQuestions: AssessmentQuestion[]) => {
      setQuestions(nextQuestions);
      setFullPlan(nextQuestions);
    },
    [setQuestions, setFullPlan],
  );
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(
    savedState?.currentQuestionIndex || 0,
  );
  const [answers, setAnswers] = useState<Record<string, string>>(savedState?.answers || {}); // Map question ID -> User Answer
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedRedFlags, setSelectedRedFlags] = useState<string[]>([]);
  const [expansionCount, setExpansionCount] = useState(savedState?.expansionCount || 0);
  const [readiness, setReadiness] = useState(savedState?.readiness || 0.0); // 0.0 to 1.0
  const [triageSnapshot, setTriageSnapshot] = useState<TriageSnapshot | null>(
    savedState?.triageSnapshot ?? null,
  );
  const [assessmentStage, setAssessmentStage] = useState<AssessmentStage>(
    (savedState?.assessmentStage as AssessmentStage) || 'intake',
  );
  const [hasAdvancedBeyondIntake, setHasAdvancedBeyondIntake] = useState(
    savedState
      ? savedState.currentQuestionIndex > 0 || Object.keys(savedState.answers || {}).length > 0
      : false,
  );
  const [symptomCategory, setSymptomCategory] = useState<'simple' | 'complex' | 'critical' | null>(
    (savedState?.symptomCategory as 'simple' | 'complex' | 'critical' | null) || null,
  );
  const [previousProfile, setPreviousProfile] = useState<AssessmentProfile | undefined>(
    savedState?.previousProfile,
  );
  const [clarificationCount, setClarificationCount] = useState(savedState?.clarificationCount || 0);
  const [showRedFlagsChecklist, setShowRedFlagsChecklist] = useState(false);
  const [isClarifyingDenial, setIsClarifyingDenial] = useState(false);
  const [isRecentResolved, setIsRecentResolved] = useState(savedState?.isRecentResolved || false);
  const [resolvedKeyword, setResolvedKeyword] = useState<string | null>(
    savedState?.resolvedKeyword || null,
  );
  const [sessionBuffer, setSessionBuffer] = useState<Message[]>(
    savedState?.sessionBuffer || savedState?.messages || [],
  );
  const [outOfScopeBuffer, setOutOfScopeBuffer] = useState<string[]>(
    savedState?.outOfScopeBuffer || [],
  );
  const getHistoryContext = useCallback(() => {
    const contextParts = sessionBuffer.map((msg) => msg.text).filter(Boolean);
    return contextParts.join('. ');
  }, [sessionBuffer]);
  const [incrementalSlots, setIncrementalSlots] = useState<ClinicalSlots>(
    savedState?.incrementalSlots || hydrateInitialSlots,
  );
  const [deniedSymptoms, setDeniedSymptoms] = useState<string[]>(savedState?.deniedSymptoms || []);
  const [coveredSymptoms, setCoveredSymptoms] = useState<string[]>(
    savedState?.coveredSymptoms || [],
  );
  const [isQueueSuspended, setIsQueueSuspended] = useState(savedState?.isQueueSuspended || false);
  const [currentTurnMeta, setCurrentTurnMeta] = useState<AssessmentTurnMeta | null>(
    savedState?.currentTurnMeta ?? null,
  );
  const [pendingCorrection, setPendingCorrection] = useState<string | null>(
    savedState?.pendingCorrection ?? null,
  );

  // Offline
  const [isOfflineMode, setIsOfflineMode] = useState(savedState?.isOfflineMode || false);
  const [currentOfflineNodeId, setCurrentOfflineNodeId] = useState<string | null>(
    savedState?.currentOfflineNodeId || null,
  );

  const [suppressedKeywords, setSuppressedKeywords] = useState<string[]>(
    savedState?.suppressedKeywords || [],
  );
  const [pendingRedFlag, setPendingRedFlag] = useState<string | null>(
    savedState?.pendingRedFlag || null,
  );
  const [isGuestMode, setIsGuestMode] = useState(savedState?.isGuestMode || false);
  const [isModeModalVisible, setIsModeModalVisible] = useState(!savedState);

  // Ref sync to prevent closure staleness in setTimeout callbacks
  const isRecentResolvedRef = useRef(isRecentResolved);
  const resolvedKeywordRef = useRef(resolvedKeyword);
  useEffect(() => {
    isRecentResolvedRef.current = isRecentResolved;
    resolvedKeywordRef.current = resolvedKeyword;
  }, [isRecentResolved, resolvedKeyword]);

  const MAX_EXPANSIONS = 1;
  const MAX_CLARIFICATIONS = 2;

  // Cleanup temporal state on unmount or restart
  useEffect(() => {
    return () => {
      setIsRecentResolved(false);
      setResolvedKeyword(null);
    };
  }, []);

  // Emergency Verification State
  const [isVerifyingEmergency, setIsVerifyingEmergency] = useState(
    savedState?.isVerifyingEmergency || false,
  );
  const isVerifyingEmergencyRef = useRef(isVerifyingEmergency);
  useEffect(() => {
    isVerifyingEmergencyRef.current = isVerifyingEmergency;
  }, [isVerifyingEmergency]);

  const pendingRedFlagRef = useRef<string | null>(pendingRedFlag);
  useEffect(() => {
    pendingRedFlagRef.current = pendingRedFlag;
  }, [pendingRedFlag]);

  const [emergencyVerificationData, setEmergencyVerificationData] = useState<{
    keyword: string;
    answer: string;
    currentQ: AssessmentQuestion;
    safetyCheck: EmergencyDetectionResult;
  } | null>(savedState?.emergencyVerificationData || null);

  // UI Interactions
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  
  // Processing Lock (Ref for immediate synchronous blocking)
  const processingRef = useRef(false);
  const isFinalizingRef = useRef(false);
  
  const TYPING_INDICATOR_TIMEOUT_MS = 20000;
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTypingTimeout = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);
  const handleTypingTimeout = useCallback(() => {
    cancelTypingTimeout();
    console.warn(
      '[Assessment] Typing indicator timeout reached; clearing stuck transition/streaming state.',
    );
    setProcessing(false);
    processingRef.current = false;
    setStreamingText(null);
    setIsTyping(false);
  }, [cancelTypingTimeout, setProcessing, setStreamingText, setIsTyping]);
  const setTypingState = useCallback(
    (value: boolean) => {
      cancelTypingTimeout();
      if (value) {
        typingTimeoutRef.current = setTimeout(handleTypingTimeout, TYPING_INDICATOR_TIMEOUT_MS);
      }
      setIsTyping(value);
    },
    [cancelTypingTimeout, handleTypingTimeout, setIsTyping],
  );
  const resetSessionScopedState = useCallback(
    (newMessages: Message[]) => {
      slotParserRef.current.reset();
      const clearedSlots = slotParserRef.current.getSlots();
      cancelTypingTimeout();

      setMessages(newMessages);
      setSessionBuffer(newMessages);
      setOutOfScopeBuffer([]);
      setAnswers({});
      syncQuestionQueue([]);
      setCurrentQuestionIndex(0);
      setExpansionCount(0);
      setReadiness(0);
      setTriageSnapshot(null);
      setAssessmentStage('intake');
      setHasAdvancedBeyondIntake(false);
      setSymptomCategory(null);
      setPreviousProfile(undefined);
      setClarificationCount(0);
      setSelectedRedFlags([]);
      setShowRedFlagsChecklist(false);
      setIsClarifyingDenial(false);
      setIsRecentResolved(false);
      setResolvedKeyword(null);
      setIncrementalSlots(clearedSlots);
      setDeniedSymptoms([]);
      setCoveredSymptoms([]);
      setIsQueueSuspended(false);
      setCurrentTurnMeta(null);
      setPendingCorrection(null);
      setSuppressedKeywords([]);
      setPendingRedFlag(null);
      setIsVerifyingEmergency(false);
      setEmergencyVerificationData(null);
      setIsOfflineMode(false);
      setCurrentOfflineNodeId(null);
      setLoading(false);
      setProcessing(false);
      processingRef.current = false;
      setTypingState(false);
      setStreamingText(null);
      setInputText('');
    },
    [cancelTypingTimeout, setTypingState, syncQuestionQueue],
  );
  useEffect(() => {
    return () => cancelTypingTimeout();
  }, [cancelTypingTimeout]);

  interface SafetyGuardParams {
    text: string;
    sender: 'user' | 'assistant';
    question?: AssessmentQuestion;
    questionId?: string;
    extraHistory?: string;
  }

  interface EmergencyGuardResult {
    safetyCheck: EmergencyDetectionResult;
    triggered: boolean;
  }

  const runEmergencyGuard = useCallback(
    (params: SafetyGuardParams): EmergencyGuardResult | null => {
      const trimmedText = params.text?.trim();
      if (!trimmedText || isOfflineMode) return null;

      const historyParts: string[] = [];
      const baseHistory = getHistoryContext();
      if (baseHistory) historyParts.push(baseHistory);
      if (params.extraHistory) {
        historyParts.push(params.extraHistory);
      } else {
        historyParts.push(trimmedText);
      }
      const historyContext = historyParts.join('. ');

      const questionId =
        params.question?.id ||
        params.questionId ||
        questions[currentQuestionIndex]?.id ||
        'streaming_safety_scan';

      const safetyCheck = detectEmergency(trimmedText, {
        isUserInput: params.sender === 'user',
        historyContext,
        questionId,
      });

      const activeKeywords =
        (safetyCheck.matchedKeywords || []).filter((keyword) => {
          if (!keyword) return false;
          if (suppressedKeywords.includes(keyword)) return false;
          const pending = pendingRedFlagRef.current;
          if (pending && pending === keyword) return false;
          return true;
        }) || [];

      const triggered = activeKeywords.length > 0;

      if (triggered) {
        const keyword = activeKeywords[0];
        console.log(
          `[Assessment] POTENTIAL EMERGENCY DETECTED: ${activeKeywords.join(', ')}. Triggering verification.`,
        );
        const targetQuestion =
          params.question ||
          questions[currentQuestionIndex] ||
          ({
            id: 'conversation-default',
            text: 'Current assessment turn',
          } as AssessmentQuestion);

        setPendingRedFlag(keyword);
        setIsVerifyingEmergency(true);
        setEmergencyVerificationData({
          keyword,
          answer: trimmedText,
          currentQ: targetQuestion,
          safetyCheck,
        });
      }

      return { safetyCheck, triggered };
    },
    [getHistoryContext, isOfflineMode, questions, currentQuestionIndex, suppressedKeywords],
  );

  const appendMessagesToConversation = useCallback(
    (newMessages: Message[]) => {
      if (newMessages.length === 0) return;

      for (const msg of newMessages) {
        if ((msg.sender === 'user' || msg.sender === 'assistant') && msg.text) {
          const guardResult = runEmergencyGuard({
            text: msg.text,
            sender: msg.sender,
            questionId: (msg.metadata?.currentTurnMeta as AssessmentTurnMeta)?.questionId,
            extraHistory: msg.text,
          });

          if (guardResult?.triggered && msg.sender === 'assistant') {
            setTypingState(false);
            setStreamingText(null);
            setProcessing(false);
          }
        }
      }

      setMessages((prev) => [...prev, ...newMessages]);
      setSessionBuffer((prev) => [...prev, ...newMessages]);
    },
    [runEmergencyGuard, setTypingState],
  );

  const appendMessageToConversation = useCallback(
    (message: Message) => appendMessagesToConversation([message]),
    [appendMessagesToConversation],
  );

  const replaceMessagesDisplay = useCallback(
    (newMessages: Message[]) => {
      resetSessionScopedState(newMessages);
    },
    [resetSessionScopedState],
  );

  const handleOutOfScopeFallback = (answer: string, question: AssessmentQuestion) => {
    const trimmed = answer.trim();
    if (!question || !trimmed) return false;

    const nextBuffer = [...outOfScopeBuffer, trimmed];
    const shouldRemind = nextBuffer.length >= OUT_OF_SCOPE_REMINDER_THRESHOLD;
    setOutOfScopeBuffer(shouldRemind ? [] : nextBuffer);

    const questionLabel = question.text ? `"${question.text}"` : 'this question';
    const fallbackText = shouldRemind
      ? `Please return to ${questionLabel} so we can keep the assessment on track.`
      : `Please answer ${questionLabel} to continue the assessment.`;

    const fallbackTimestamp = Date.now();
    console.log(
      `[Assessment] Out-of-scope fallback triggered (reminder=${shouldRemind}). Current buffer size: ${nextBuffer.length}.`,
    );

    appendMessagesToConversation([
      composeAssistantMessage({
        id: `out-of-scope-${fallbackTimestamp}`,
        body: fallbackText,
        reason: 'Your answer drifted away from the current question.',
        reasonSource: 'out-of-scope',
        nextAction: `Please answer ${questionLabel} so I can continue the assessment.`,
        timestamp: fallbackTimestamp,
      }),
    ]);

    setTypingState(false);
    setProcessing(false);
    return true;
  };

  const annotateQuestionsWithSlotMetadata = useCallback(
    (
      questionList: AssessmentQuestion[],
      profile?: AssessmentProfile,
      answersOverride?: Record<string, string>,
      slotSnapshot?: ClinicalSlots,
    ) => {
      const slotSource = slotSnapshot ?? incrementalSlots;
      const slotGoals = computeUnresolvedSlotGoals(profile, slotSource, answersOverride ?? answers);
      return questionList.map((question) => ({
        ...question,
        metadata: {
          ...(question.metadata || {}),
          slotGoals,
        },
      }));
    },
    [incrementalSlots, answers],
  );

  const deriveIntentTag = useCallback((question?: AssessmentQuestion, clarifying?: boolean) => {
    if (clarifying) return 'clarification';
    if (question?.id === 'red_flags') return 'red_flag';
    if (question?.type === 'multi-select') return 'multi_select';
    if (question?.type === 'single-select') return 'single_select';
    if (question?.type === 'number') return 'numeric';
    return 'text';
  }, []);

  // Sync state to Redux for persistence
  useEffect(() => {
    if (loading) return;
    dispatch(
      updateAssessmentState({
        messages,
        questions,
        fullPlan,
        currentQuestionIndex,
        answers,
        expansionCount,
        readiness,
        assessmentStage,
        symptomCategory,
        previousProfile,
        clarificationCount,
        suppressedKeywords,
        isRecentResolved,
        resolvedKeyword,
        initialSymptom,
        isOfflineMode,
        currentOfflineNodeId,
        isVerifyingEmergency,
        pendingRedFlag,
        emergencyVerificationData,
        sessionBuffer,
        outOfScopeBuffer,
        currentTurnMeta,
        pendingCorrection,
        triageSnapshot,
        incrementalSlots,
        deniedSymptoms,
        coveredSymptoms,
        isQueueSuspended,
        isGuestMode,
      }),
    );
  }, [
    messages,
    questions,
    fullPlan,
    currentQuestionIndex,
    answers,
    expansionCount,
    readiness,
    assessmentStage,
    symptomCategory,
    previousProfile,
    clarificationCount,
    suppressedKeywords,
    isRecentResolved,
    resolvedKeyword,
    initialSymptom,
    isOfflineMode,
    currentOfflineNodeId,
    isVerifyingEmergency,
    pendingRedFlag,
    emergencyVerificationData,
    sessionBuffer,
    outOfScopeBuffer,
    currentTurnMeta,
    pendingCorrection,
    triageSnapshot,
    incrementalSlots,
    deniedSymptoms,
    coveredSymptoms,
    isQueueSuspended,
    isGuestMode,
    dispatch,
    loading,
  ]);

  // Reset checklist when question changes
  useEffect(() => {
    setSelectedRedFlags([]);
    setShowRedFlagsChecklist(false);
  }, [currentQuestionIndex]);

  useEffect(() => {
    if (hasAdvancedBeyondIntake) return;
    const hasUserProgress =
      currentQuestionIndex > 0 ||
      Object.keys(answers).length > 0 ||
      messages.some((msg) => msg.sender === 'user');
    if (hasUserProgress) {
      setHasAdvancedBeyondIntake(true);
      if (assessmentStage === 'intake' && !isOfflineMode) {
        setAssessmentStage('follow_up');
      }
    }
  }, [
    answers,
    assessmentStage,
    currentQuestionIndex,
    hasAdvancedBeyondIntake,
    isOfflineMode,
    messages,
  ]);

  /**
   * Log conversation step for debugging
   */
  const logConversationStep = (
    step: number,
    question: string,
    userAnswer: string,
    emergencyCheck: EmergencyDetectionResult,
  ) => {
    console.log(`\n╔═══ CONVERSATION STEP ${step} ═══╗`);
    console.log(`║ Q: ${question}`);
    console.log(`║ A: ${userAnswer}`);
    console.log(`║ Emergency: ${emergencyCheck.isEmergency} (score: ${emergencyCheck.score})`);
    if (emergencyCheck.matchedKeywords?.length > 0) {
      console.log(`║ Keywords: ${emergencyCheck.matchedKeywords.join(', ')}`);
    }
    console.log(`╚${'═'.repeat(30)}╝\n`);
  };

  useEffect(() => {
    const scheduleScrollToEnd = (animated: boolean) => {
      if (keyboardScrollRaf.current !== null) {
        cancelAnimationFrame(keyboardScrollRaf.current);
      }
      keyboardScrollRaf.current = requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated });
      });
      // Additional backup scroll to ensure layout has settled
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated });
      }, 200);
    };

    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        Animated.timing(keyboardHeight, {
          toValue: e.endCoordinates.height,
          duration: e.duration || 250,
          useNativeDriver: false,
        }).start(() => {
          scheduleScrollToEnd(true);
        });
        scheduleScrollToEnd(true);
      },
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        Animated.timing(keyboardHeight, {
          toValue: 0,
          duration: e.duration || 250,
          useNativeDriver: false,
        }).start(() => {
          scheduleScrollToEnd(true);
        });
        scheduleScrollToEnd(true);
      },
    );

    const keyboardWillChangeFrame =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardWillChangeFrame', (e) => {
            const nextHeight = Math.max(0, SCREEN_HEIGHT - e.endCoordinates.screenY);
            keyboardHeight.setValue(nextHeight);
            scheduleScrollToEnd(false);
          })
        : null;

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
      if (keyboardWillChangeFrame) {
        keyboardWillChangeFrame.remove();
      }
      if (keyboardScrollRaf.current !== null) {
        cancelAnimationFrame(keyboardScrollRaf.current);
      }
    };
  }, [keyboardHeight]);

  // --- AUTO-SCROLL LOGIC ---
  useEffect(() => {
    const scrollTimer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 150); // Slightly longer delay to allow layout to settle
    return () => clearTimeout(scrollTimer);
  }, [messages, isTyping, isVerifyingEmergency, questions, currentQuestionIndex, assessmentStage]);

  const initializeAssessment = async (
    mode: AssessmentMode,
    isGuest: boolean,
    patientContext?: string | null,
    patientName?: string | null,
  ) => {
    // 0. Reset state for a fresh assessment
    resetSessionScopedState([]);

    // 1. Initial Emergency Check (Locally)
    const emergencyCheck = detectEmergency(initialSymptom || '', { isUserInput: true });
    const mentalHealthCheck = detectMentalHealthCrisis(initialSymptom || '');

    if (emergencyCheck.isEmergency || mentalHealthCheck.isCrisis) {
      console.log(
        '[Assessment] IMMEDIATE ESCALATION - Emergency/Crisis detected in initial symptom',
      );
      if (!isGuest) {
        dispatch(setHighRisk(true));
      }
      navigation.replace('Recommendation', {
        assessmentData: { symptoms: initialSymptom || '', answers: [] },
        guestMode: isGuest,
      });
      return;
    }

    const derivedAgeValue = !isGuest ? calculateAgeFromDob(profileDob) : null;
    const derivedAgeString = derivedAgeValue !== null ? derivedAgeValue.toString() : null;
    const trimmedPatientContext = patientContext?.trim() || '';
    const contextAlreadyHasAge =
      trimmedPatientContext.length > 0 ? /\bage\s*:/i.test(trimmedPatientContext) : false;
    let patientContextWithAge = trimmedPatientContext;

    if (!isGuest && derivedAgeString && !contextAlreadyHasAge) {
      const ageSegment = `Age: ${derivedAgeString}`;
      patientContextWithAge = trimmedPatientContext
        ? `${ageSegment}. ${trimmedPatientContext}`
        : ageSegment;
    }

    const planContext =
      !isGuest && patientContextWithAge.trim() ? patientContextWithAge.trim() : undefined;

    // 2. Fetch Questions (Call #1)
    try {
      setLoading(true);
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) throw new Error('NETWORK_ERROR');

      const { questions: plan, intro } = await geminiClient.generateAssessmentPlan(
        initialSymptom || '',
        planContext,
        patientName,
      );
      // --- NEW: Dynamic Question Pruning ---
      // Use deterministic slot extraction to identify if Tier 1 questions are already answered
      const initialSlotResult = slotParserRef.current.parseTurn(initialSymptom || '');
      let slots = initialSlotResult.aggregated;

      if (!slots.age && derivedAgeString) {
        const derivedSlotResult = slotParserRef.current.parseTurn(`Age ${derivedAgeString}`);
        slots = derivedSlotResult.aggregated;
      }

      setIncrementalSlots(slots);
      const initialAnswers: Record<string, string> = {};

      const prunedPlan = plan.filter((q) => {
        // SAFETY: Never prune red-flag questions or Tier 2/3 context questions
        if (q.id === 'red_flags' || !['basics', 'age', 'duration', 'severity'].includes(q.id))
          return true;

        // Check for Tier 1 questions
        if (q.id === 'basics') {
          if (slots.age && slots.duration) {
            console.log(
              `[Assessment] Pruning basics. Found Age: ${slots.age}, Duration: ${slots.duration}`,
            );
            initialAnswers[q.id] = `${slots.age}, for ${slots.duration}`;
            return false;
          }
        } else if (q.id === 'age') {
          if (slots.age) {
            console.log(`[Assessment] Pruning age. Found: ${slots.age}`);
            initialAnswers[q.id] = slots.age;
            return false;
          }
        } else if (q.id === 'duration') {
          if (slots.duration) {
            console.log(`[Assessment] Pruning duration. Found: ${slots.duration}`);
            initialAnswers[q.id] = slots.duration;
            return false;
          }
        } else if (q.id === 'severity') {
          if (slots.severity) {
            console.log(`[Assessment] Pruning severity. Found: ${slots.severity}`);
            initialAnswers[q.id] = slots.severity;
            return false;
          }
        }
        return true;
      });

      const annotatedPlan = annotateQuestionsWithSlotMetadata(
        prunedPlan,
        undefined,
        undefined,
        slots,
      );
      syncQuestionQueue(annotatedPlan);
      setAnswers(initialAnswers); // Preserve answers for pruned questions for the final report

      // Add Intro & First Question
      const firstQ = prunedPlan[0];
      const fallbackIntro = firstQ?.text?.trim();
      const introText =
        intro?.trim() ||
        fallbackIntro ||
        'Thank you for sharing. Please tell me a bit more about how you are feeling.';

      const introMsg = composeAssistantMessage({
        id: 'intro',
        body: introText,
        reason: 'Starting the assessment conversation.',
        reasonSource: 'intro',
        nextAction: 'Please answer the first question whenever you are ready.',
        timestamp: Date.now(),
      });

      setMessages([introMsg]);
      setSessionBuffer([introMsg]);

      setLoading(false);
    } catch (err: unknown) {
      console.error('Initialization Error:', err);
      if (err instanceof Error && err.message === 'NETWORK_ERROR') {
        startOfflineTriage();
      } else {
        setLoading(false);
      }
    }
  };

  const handleModeSelection = (mode: AssessmentMode) => {
    const isGuest = mode === 'forSomeoneElse';
    setIsGuestMode(isGuest);
    setIsModeModalVisible(false);

    if (isGuest) {
      initializeAssessment(mode, true, null, null);
    } else {
      initializeAssessment(mode, false, clinicalContext, fullName);
    }
  };

  // --- INTERACTION LOGIC ---

  const handleNext = async (answerOverride?: string, skipEmergencyCheck = false) => {
    const answer = answerOverride || inputText;
    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer || processingRef.current) return;

    const consumePendingCorrection = () => {
      const correction = pendingCorrection;
      if (correction) {
        setPendingCorrection(null);
      }
      return correction || undefined;
    };

    if (isClarifyingDenial) setIsClarifyingDenial(false);

    const currentQ = questions[currentQuestionIndex];
    console.log(
      `[DEBUG_TEST] currentQ: ${currentQ?.text}, questions.length: ${questions.length}, index: ${currentQuestionIndex}, isOffline: ${isOfflineMode}`,
    );
    let slotSnapshot: ClinicalSlots | undefined;
    if (!currentQ && !isOfflineMode) {
      if (currentQuestionIndex === 0 && questions.length === 0) {
        console.log('[Assessment] Processing initial intake without plan.');
      } else {
        console.log('[DEBUG_TEST] Aborting: No currentQ and not offline.');
        return;
      }
    }

    setProcessing(true);
    processingRef.current = true;
    let keepLockForAsyncOp = false;

    try {
      if (!skipEmergencyCheck) {
        setInputText('');
      }

      // 1. Append User Message
      let nextHistory = messages;
      let profile: AssessmentProfile | undefined = previousProfile;
      let primarySymptomForProfile: string | undefined =
        derivePrimarySymptom(initialSymptom, profile?.summary) ?? defaultPrimarySymptom;

      if (!skipEmergencyCheck) {
        const turnMeta: AssessmentTurnMeta = {
          questionId: currentQ?.id || 'free_text',
          timestamp: Date.now(),
          intentTag: deriveIntentTag(currentQ, isClarifyingDenial),
        };
        const userMsg: Message = {
          id: `user-${turnMeta.timestamp}`,
          text: answer,
          sender: 'user',
          isOffline: isOfflineMode,
          timestamp: turnMeta.timestamp,
          metadata: { currentTurnMeta: turnMeta },
        };
        setCurrentTurnMeta(turnMeta);
        appendMessageToConversation(userMsg);
        const parsedSlots = slotParserRef.current.parseTurn(answer);
        slotSnapshot = parsedSlots.aggregated;
        setIncrementalSlots(parsedSlots.aggregated);
        nextHistory = [...messages, userMsg];
      }
      setTypingState(true);

      let guardResult: EmergencyGuardResult | null = null;
      if (!isOfflineMode && !skipEmergencyCheck) {
        guardResult = runEmergencyGuard({
          text: answer,
          sender: 'user',
          question: currentQ,
          questionId: currentQ?.id || 'initial_intake',
          extraHistory: answer,
        });

        if (guardResult) {
          logConversationStep(
            currentQuestionIndex,
            currentQ?.text || 'Initial Symptom Description',
            answer,
            guardResult.safetyCheck,
          );
        }

        if (guardResult?.triggered) {
          setProcessing(false);
          processingRef.current = false;
          setTypingState(false);
          return;
        }
      }

      const shouldRedirectForOutOfScope =
        !isOfflineMode &&
        !skipEmergencyCheck &&
        guardResult &&
        !guardResult.triggered &&
        (guardResult.safetyCheck?.matchedKeywords?.length || 0) === 0 &&
        OUT_OF_SCOPE_PATTERN.test(trimmedAnswer);

      if (shouldRedirectForOutOfScope && currentQ && handleOutOfScopeFallback(answer, currentQ)) {
        processingRef.current = false;
        return;
      }

      // 3. Store Answer
      if (!isOfflineMode) {
        let newAnswers = answers;
        if (currentQ) {
          newAnswers = { ...answers, [currentQ.id]: answer };
          setAnswers(newAnswers);
          console.log(
            `[DEBUG_INSTRUMENTATION] Recorded answer for question '${currentQ.id}': "${answer.substring(0, 50)}${answer.length > 50 ? '...' : ''}"`,
          );
        }
        setOutOfScopeBuffer([]);

        // 4. Progress or Finish
        let nextIdx = currentQuestionIndex + (currentQ ? 1 : 0);
        let activeQuestions = questions;

        // --- NEW: Symptom Coverage Tracking & Question Skipping ---
        const isDenial = normalizeBooleanResponse(answer) === false;
        const currentDenied: string[] = [];
        const currentCovered: string[] = [];

        if (currentQ) {
          // Extract symptoms from the current question text/options
          const optionsText = currentQ.options
            ? (typeof currentQ.options[0] === 'string'
                ? (currentQ.options as string[])
                : (currentQ.options as GroupedOption[]).flatMap((g) => g.items))
            : [];
          const questionTokens = [...optionsText, currentQ.text]
            .join(' ')
            .toLowerCase()
            .split(/[,?.\s]+/)
            .filter((s) => s.length > 3);

          if (isDenial) {
            currentDenied.push(...questionTokens);
            setDeniedSymptoms((prev) => Array.from(new Set([...prev, ...questionTokens])));
          }
          currentCovered.push(...questionTokens);
          setCoveredSymptoms((prev) => Array.from(new Set([...prev, ...questionTokens])));
        }

        // Skip logic: find the next uncovered question
        while (nextIdx < activeQuestions.length) {
          const nextQ = activeQuestions[nextIdx];
          const nextQOptions = nextQ.options
            ? (typeof nextQ.options[0] === 'string'
                ? (nextQ.options as string[])
                : (nextQ.options as GroupedOption[]).flatMap((g) => g.items))
            : [];
          const nextQTokens = [...nextQOptions, nextQ.text]
            .join(' ')
            .toLowerCase()
            .split(/[,?.\s]+/)
            .filter((s) => s.length > 3);

          const isAlreadyCovered =
            nextQTokens.length > 0 &&
            nextQTokens.every((token) => deniedSymptoms.includes(token) || currentDenied.includes(token));

          if (isAlreadyCovered) {
            console.log(`[Assessment] Skipping already covered question: ${nextQ.id}`);
            nextIdx++;
          } else {
            break;
          }
        }

        let effectiveIsAtEnd = nextIdx >= activeQuestions.length;

      // --- NEW: Unified Triage Arbiter Gate ---
      // The Arbiter now has authority over whether we continue or stop.
      // We check this starting at Turn 0 (every turn) to allow for early interventions.
      if (nextIdx >= 0 || effectiveIsAtEnd) {
        console.log(`[Assessment] Turn ${nextIdx} reached. Consulting Arbiter...`);
        try {
          const historyItems = nextHistory.map((m) => ({
            role: m.sender as any,
            text: m.text,
          }));
          const triageHistoryText = historyItems
            .map((item) => `${item.role.toUpperCase()}: ${item.text}`)
            .join('\n');
          const extractedProfile = await geminiClient.extractClinicalProfile(historyItems, {
            currentProfileSummary: previousProfile?.summary,
            previousProfile: previousProfile ?? undefined,
          });

          // Reconcile and Detect Changes
          profile = reconcileClinicalProfileWithSlots(
            extractedProfile,
            slotSnapshot ?? incrementalSlots,
          );
          primarySymptomForProfile = derivePrimarySymptom(initialSymptom, profile.summary);

          // --- Mid-Stream Category Escalation Detection ---
          // Triggers when clinical extraction elevates the acuity level during an active session.
          const oldCat = symptomCategory;
          const newCat = profile.symptom_category;
          if (oldCat && newCat && oldCat !== newCat) {
            const oldRank = CATEGORY_RANKING[oldCat] || 0;
            const newRank = CATEGORY_RANKING[newCat] || 0;

            if (newRank > oldRank) {
              console.log(
                `[Assessment] Mid-stream escalation detected: ${oldCat} -> ${newCat} (Turn ${nextIdx})`,
              );
              // --- DYNAMIC FLOW ARCHITECTURE: RE-PLANNING ---
              // If the category escalated (e.g. simple -> critical) and we are not at the end,
              // we must pivot the assessment to focus on the new, higher-risk profile.
              if (!effectiveIsAtEnd) {
                console.log(
                  `[Assessment] Triggering Refinement Plan due to escalation (${oldCat} -> ${newCat})`,
                );
                try {
                  // 1. Generate refined plan (Next 3 critical questions)
                  const remainingCount = 3;
                  const refinedQuestions = await geminiClient.refineAssessmentPlan(
                    profile,
                    remainingCount,
                  );

                  if (refinedQuestions.length > 0) {
                    // 2. Inject Pivot Message
                    const pivotTimestamp = Date.now();
                    appendMessagesToConversation([
                      composeAssistantMessage({
                        id: `pivot-${pivotTimestamp}`,
                        body: '',
                        reason: `Symptom escalation: ${oldCat} -> ${newCat}`,
                        reasonSource: 'escalation-pivot',
                        nextAction: 'Refining assessment plan.',
                        inlineAck: consumePendingCorrection(),
                        profile,
                        primarySymptom: primarySymptomForProfile ?? defaultPrimarySymptom,
                        timestamp: pivotTimestamp,
                      }),
                    ]);

                    // 3. Update Question Queue
                    // Keep history (0 to nextIdx), replace future questions with refined plan
                    const keptQuestions = activeQuestions.slice(0, nextIdx);
                    const newQueue = [...keptQuestions, ...refinedQuestions];

                    const annotatedNewQueue = annotateQuestionsWithSlotMetadata(
                      newQueue,
                      profile,
                      newAnswers,
                      slotSnapshot,
                    );

                    syncQuestionQueue(annotatedNewQueue);
                    activeQuestions = annotatedNewQueue;
                    effectiveIsAtEnd = nextIdx >= activeQuestions.length; // Re-evaluate termination condition

                    console.log(
                      `[Assessment] Plan refined. New queue length: ${activeQuestions.length}`,
                    );
                  }
                } catch (refineErr) {
                  console.error('[Assessment] Failed to refine plan:', refineErr);
                  // Fallback: Continue with existing plan
                }
              }
            }
          }

          const changes = detectProfileChanges(previousProfile, profile);

          if (changes.length > 0) {
            console.log(`[Assessment] Detected ${changes.length} corrections.`);
            // System-style narration removed per user request.
            // Data is updated silently.
          }

          // --- DYNAMIC PLAN PRUNING ---
          // Filter out future questions if their slots (Age, Duration, Severity, Progression)
          // have been populated by the latest AI extraction.
          // let activeQuestions = questions; // Removed to preserve updates from escalation block
          const slotsToCheck = ['age', 'duration', 'severity', 'progression'];
          const populatedSlots = slotsToCheck.filter(
            (slot) => profile && profile[slot as keyof AssessmentProfile],
          );

          if (populatedSlots.length > 0) {
            const historyPart = activeQuestions.slice(0, nextIdx);
            const futurePart = activeQuestions.slice(nextIdx);

            const prunedFuture = futurePart.filter((q) => {
              if (populatedSlots.includes(q.id)) {
                console.log(
                  `[Assessment] Pruning redundant question '${q.id}' - Slot populated via extraction`,
                );
                return false;
              }
              return true;
            });

            if (prunedFuture.length !== futurePart.length) {
              const newQuestionList = [...historyPart, ...prunedFuture];
              const annotatedList = annotateQuestionsWithSlotMetadata(
                newQuestionList,
                profile,
                newAnswers,
                slotSnapshot,
              );
              syncQuestionQueue(annotatedList);
              activeQuestions = annotatedList;
            }
          }

          console.log(
            `[DEBUG_NEXT_LOGIC] nextIdx: ${nextIdx}, activeQuestions.length: ${activeQuestions.length}`,
          );
          effectiveIsAtEnd = nextIdx >= activeQuestions.length;

          // Update Readiness Visualization
          if (profile.triage_readiness_score !== undefined) {
            setReadiness(profile.triage_readiness_score);
          }

          if (profile.symptom_category) {
            setSymptomCategory(profile.symptom_category);
          }

          const unresolvedSlotGoals = computeUnresolvedSlotGoals(
            profile,
            slotSnapshot ?? incrementalSlots,
            newAnswers,
          );
          const missingCoreSlotGoals = CORE_SLOT_ORDER.map((slotId) => {
            if (!profile) return undefined;
            return unresolvedSlotGoals.find((goal) => goal.slotId === slotId);
          }).filter((goal): goal is QuestionSlotGoal => Boolean(goal));

          const triageScoreResult = calculateTriageScore({
            ...profile,
            symptom_text: triageHistoryText,
          });

          setTriageSnapshot({
            score: triageScoreResult.score,
            escalatedCategory: triageScoreResult.escalated_category,
            readiness: profile.triage_readiness_score ?? triageScoreResult.score,
            unresolvedSlots: unresolvedSlotGoals,
            missingCoreSlots: missingCoreSlotGoals,
          });

          // --- CONTRADICTION LOCK (Deterministic Guardrail) ---
          const isAmbiguous = profile.ambiguity_detected === true;
          const hasFriction = profile.clinical_friction_detected === true;

          // Explicitly check for remaining Tier 3 questions in the active plan
          const remainingTier3 = activeQuestions.slice(nextIdx).filter((q) => q.tier === 3);
          const hasUnattemptedTier3 = remainingTier3.length > 0;

          if (isAmbiguous || hasFriction || hasUnattemptedTier3) {
            console.warn(
              `[GUARDRAIL] CONTRADICTION LOCK ACTIVATED: Ambiguity=${isAmbiguous}, Friction=${hasFriction}, UnattemptedTier3=${hasUnattemptedTier3}`,
            );
          }

          // --- TURN FLOOR LOCK (Deterministic Category Floor) ---
          const isComplexCategory =
            profile.symptom_category === 'complex' ||
            profile.symptom_category === 'critical' ||
            profile.is_complex_case ||
            profile.is_vulnerable;
          const minTurnsRequired = isComplexCategory ? MIN_TURNS_COMPLEX : MIN_TURNS_SIMPLE;
          const isBelowFloor = nextIdx < minTurnsRequired;

          if (isBelowFloor) {
            console.warn(
              `[GUARDRAIL] TURN FLOOR LOCK ACTIVATED: Category=${isComplexCategory ? 'Complex' : 'Simple'}, Turns=${nextIdx}, Required=${minTurnsRequired}`,
            );
          }

          const effectiveReadiness =
            isAmbiguous || hasFriction || isBelowFloor ? 0 : profile.triage_readiness_score || 0;

          const arbiterResult = TriageArbiter.evaluateAssessmentState(
            historyItems,
            profile,
            nextIdx,
            activeQuestions.length,
            activeQuestions.slice(nextIdx),
            previousProfile,
            clarificationCount,
          );

          setPreviousProfile(profile);

          console.log(
            `[Assessment] Arbiter Signal: ${arbiterResult.signal}. Reason: ${arbiterResult.reason}`,
          );
          console.log(
            `[Assessment] Effective Readiness: ${effectiveReadiness} (Ambiguity: ${isAmbiguous}, Friction: ${hasFriction}, BelowFloor: ${isBelowFloor}, Saturation: ${arbiterResult.saturation_count}, Clarifications: ${clarificationCount})`,
          );

          // Handle Clarification Signal (Force Clarification for Hedging/Ambiguous Denial)
          if (arbiterResult.signal === 'REQUIRE_CLARIFICATION' && !arbiterResult.needs_reset) {
            console.log(
              `[Assessment] Arbiter requesting clarification. Count: ${clarificationCount + 1}/${MAX_CLARIFICATIONS}`,
            );

            // Extract the hedged symptom from friction details if possible
            // Format: [System] Hedging detected in: fieldName ("detectedPhrase")
            const hedgingMatch = profile.clinical_friction_details?.match(
              /Hedging detected in: ([^ ]+) \("(.*)"\)/,
            );
            const hedgedField = hedgingMatch ? hedgingMatch[1] : 'symptoms you mentioned';

            setIsClarifyingDenial(true);
            setClarificationCount((prev) => prev + 1);
            setTypingState(false);

            const clarificationText =
              clarificationCount === 0
                ? `Confirm whether "${hedgedField}" is present right now so we can resolve it.`
                : `This detail is still unclear: is "${hedgedField}" happening right now?`;

            {
              const clarificationTimestamp = Date.now();
              appendMessagesToConversation([
                composeAssistantMessage({
                  id: `system-clarify-${clarificationTimestamp}`,
                  body: clarificationText,
                  reason: arbiterResult.reason,
                  reasonSource: 'arbiter-clarification',
                  nextAction: 'Confirm this detail to continue the assessment.',
                  inlineAck: consumePendingCorrection(),
                  timestamp: clarificationTimestamp,
                }),
              ]);
            }
            setProcessing(false);
            processingRef.current = false;
            return;
          }

          // HARD STOP: Contradiction Lock and Turn Floor Lock prevent termination regardless of readiness.
          // EXCEPTION: Clinical Saturation overrides the turn floor if stability is proven.


          const canTerminate = arbiterResult.signal === 'TERMINATE';

          // --- CLARIFICATION FEEDBACK (User Guidance) ---
          let clarificationHeader = '';

          if (canTerminate) {
            console.log('[Assessment] Arbiter approved termination. Finalizing.');
            setTypingState(false);
            setAssessmentStage('review');
            const profileWithReason = {
              ...profile,
              termination_reason: arbiterResult.reason,
            };
            const terminationTimestamp = Date.now();
                appendMessagesToConversation([
                  composeAssistantMessage({
                    id: 'early-exit',
                    body: 'I have collected all the necessary information. Please wait a moment while I prepare your personalized care recommendations.',
                    header: clarificationHeader,
                    reason: arbiterResult.reason,
                    reasonSource: 'arbiter-termination',
                    nextAction: 'Finalizing your recommendation now.',
                    inlineAck: consumePendingCorrection(),
                    profile: profileWithReason,
                    primarySymptom: primarySymptomForProfile ?? defaultPrimarySymptom,
                    timestamp: terminationTimestamp,
                  }),
                ]);
            keepLockForAsyncOp = true;
            setTimeout(() => finalizeAssessment(newAnswers, nextHistory, profileWithReason), 2000);
            // Note: processingRef logic handled in finalizeAssessment/catch or implicit navigation
            return;
          }

          // Handle Priority Signals
          if (
            arbiterResult.signal === 'PRIORITIZE_RED_FLAGS' ||
            arbiterResult.signal === 'RESOLVE_AMBIGUITY'
          ) {
            console.log(
              `[Assessment] Reordering queue based on Arbiter signal: ${arbiterResult.signal}`,
            );
            const remaining = activeQuestions.slice(nextIdx);
            const priority = remaining.filter((q) => {
              if (arbiterResult.signal === 'PRIORITIZE_RED_FLAGS') return q.is_red_flag;
              if (arbiterResult.signal === 'RESOLVE_AMBIGUITY') return q.tier === 3;
              return false;
            });
            const nonPriority = remaining.filter((q) => {
              if (arbiterResult.signal === 'PRIORITIZE_RED_FLAGS') return !q.is_red_flag;
              if (arbiterResult.signal === 'RESOLVE_AMBIGUITY') return q.tier !== 3;
              return true;
            });

            const reordered = [...activeQuestions.slice(0, nextIdx), ...priority, ...nonPriority];
            const annotatedReordered = annotateQuestionsWithSlotMetadata(
              reordered,
              profile,
              newAnswers,
              slotSnapshot,
            );
            syncQuestionQueue(annotatedReordered);
            activeQuestions = annotatedReordered;
          } else if (arbiterResult.signal === 'DRILL_DOWN') {
            console.log('[Assessment] DRILL_DOWN signal received. Generating immediate follow-up.');

            // Construct context for the drill down
            const drillDownContext = `
Arbiter Reason: ${arbiterResult.reason}
Friction Details: ${profile.clinical_friction_details || 'None'}
Recent User Answer: ${trimmedAnswer}
            `.trim();

            setTypingState(true);
            try {
              const drillDownQuestion = await geminiClient.generateImmediateFollowUp(
                profile,
                drillDownContext,
              );

              // Ensure uniqueness of ID
              drillDownQuestion.id = `drill-down-${Date.now()}`;

              // Inject at nextIdx (next question)
              const updatedQuestions = [
                ...activeQuestions.slice(0, nextIdx),
                drillDownQuestion,
                ...activeQuestions.slice(nextIdx),
              ];

              const annotatedQuestions = annotateQuestionsWithSlotMetadata(
                updatedQuestions,
                profile,
                newAnswers,
                slotSnapshot,
              );

              syncQuestionQueue(annotatedQuestions);
              activeQuestions = annotatedQuestions;

              // Set suspended state so we know to bridge back later
              setIsQueueSuspended(true);

              // Display the drill-down question immediately
              {
                const drillTimestamp = Date.now();
                appendMessagesToConversation([
                  composeAssistantMessage({
                    id: `drill-down-msg-${drillTimestamp}`,
                    header: clarificationHeader,
                    body: drillDownQuestion.text,
                    reason: arbiterResult.reason,
                    reasonSource: 'arbiter-drill-down',
                    nextAction: 'Please answer this specific question.',
                    inlineAck: consumePendingCorrection(),
                    profile,
                    primarySymptom: primarySymptomForProfile ?? defaultPrimarySymptom,
                    timestamp: drillTimestamp,
                  }),
                ]);
              }

              setCurrentQuestionIndex(nextIdx);
              setTypingState(false);
              return;
            } catch (err) {
              console.error('[Assessment] Failed to generate drill-down question:', err);
              // Fallback to reordering if generation fails
              const remaining = activeQuestions.slice(nextIdx);
              const priority = remaining.filter((q) => q.tier === 3);
              const nonPriority = remaining.filter((q) => q.tier !== 3);
              const reordered = [...activeQuestions.slice(0, nextIdx), ...priority, ...nonPriority];
              const annotatedReordered = annotateQuestionsWithSlotMetadata(
                reordered,
                profile,
                newAnswers,
                slotSnapshot,
              );
              syncQuestionQueue(annotatedReordered);
              activeQuestions = annotatedReordered;
            }
          }

          // Recalculate end state as questions list may have changed
          effectiveIsAtEnd = nextIdx >= activeQuestions.length;

          // Instrumentation Logs
          const currentExpansion = expansionCount;

          console.log(
            `[DEBUG_INSTRUMENTATION] Turn: ${nextIdx}, Queue Length: ${activeQuestions.length}, ` +
              `Readiness: ${profile.triage_readiness_score?.toFixed(2) || '0.00'}, ` +
              `Effective Readiness: ${effectiveReadiness.toFixed(2)}, ` +
              `Category: ${profile.symptom_category || 'unknown'} (${isComplexCategory ? 'Complex' : 'Simple'}), ` +
              `IsAtEnd: ${effectiveIsAtEnd}, CanTerminate: ${canTerminate}, ` +
              `Expansion: ${currentExpansion}/${MAX_EXPANSIONS}`,
          );

          // Handle Progress Reset / False Positive Safeguard
          if (arbiterResult.needs_reset) {
            console.log(
              '[Assessment] Resetting progress indicators due to false positive completeness check',
            );
            {
              const resetTimestamp = Date.now();
              appendMessagesToConversation([
                composeAssistantMessage({
                  id: `system-reset-${resetTimestamp}`,
                  body: '',
                  reason: arbiterResult.reason,
                  reasonSource: 'arbiter-reset',
                  nextAction: 'Please help me review those details so I can keep you safe.',
                  inlineAck: consumePendingCorrection(),
                  profile,
                  primarySymptom: primarySymptomForProfile ?? defaultPrimarySymptom,
                  timestamp: resetTimestamp,
                }),
              ]);
            }
          }

          // SAFETY GATE: If plan is exhausted but we are NOT ready to terminate (due to ambiguity or score)
          // we MUST generate additional resolution questions instead of terminating.
          if (effectiveIsAtEnd && !canTerminate && currentExpansion < MAX_EXPANSIONS) {
            console.log(
              `[Assessment] Plan exhausted but safety criteria not met. Expansion ${currentExpansion + 1}/${MAX_EXPANSIONS}. Fetching more questions.`,
            );

            // Inject clarifying feedback to build trust during expansion
            {
              const expansionTimestamp = Date.now();
              appendMessagesToConversation([
                composeAssistantMessage({
                  id: `expansion-notice-${expansionTimestamp}`,
                  body: '',
                  reason: arbiterResult.reason,
                  reasonSource: 'arbiter-expansion-notice',
                  nextAction: 'Please answer the next question so I can finish the assessment.',
                  inlineAck: consumePendingCorrection(),
                  profile,
                  primarySymptom: primarySymptomForProfile ?? defaultPrimarySymptom,
                  timestamp: expansionTimestamp,
                }),
              ]);
            }
            hasShownClarificationHeader.current = true; // Avoid double headers
            clarificationHeader = ''; // Clear for the next question bubble to avoid redundancy

            setTypingState(true);

            const resolvedTag = isRecentResolvedRef.current
              ? `[RECENT_RESOLVED: ${resolvedKeywordRef.current}]`
              : '';
            console.log(
              `[DEBUG_EXPANSION] resolvedTag: "${resolvedTag}", Ref: ${isRecentResolvedRef.current}, Keyword: ${resolvedKeywordRef.current}`,
            );

            const unresolvedSlotsText =
              unresolvedSlotGoals.length > 0
                ? unresolvedSlotGoals.map((goal) => goal.label).join(', ')
                : 'none identified';

            const missingCoreSlotsText =
              missingCoreSlotGoals.length > 0
                ? missingCoreSlotGoals.map((goal) => goal.label).join(', ')
                : 'none identified';

            const recentUserResponses = nextHistory
              .filter((msg) => msg.sender === 'user')
              .slice(-2)
              .map((msg) => msg.text.trim())
              .filter(Boolean);
            const recentResponsesText =
              recentUserResponses.length > 0 ? recentUserResponses.join(' | ') : 'none yet';

            const flagDetails: string[] = [];
            if (profile.ambiguity_detected) flagDetails.push('Ambiguity detected');
            if (profile.clinical_friction_detected) {
              flagDetails.push(
                profile.clinical_friction_details
                  ? `Clinical friction (${profile.clinical_friction_details})`
                  : 'Clinical friction detected',
              );
            }
            if (profile.red_flags_resolved === false) flagDetails.push('Red flags unresolved');
            if (profile.is_recent_resolved) flagDetails.push('Recent issue marked as resolved');
            const flagsText = flagDetails.length > 0 ? flagDetails.join('; ') : 'none flagged';

            const symptomContext = trimmedInitialSymptom || 'the symptoms you reported earlier';
            const establishedFacts = JSON.stringify(profile, null, 2);
            const clarifierPrompt = buildClarifierPrompt({
              resolvedTag,
              initialSymptom: trimmedInitialSymptom || safetySymptomReference,
              symptomContext,
              arbiterReason: arbiterResult.reason || 'No arbiter reason provided.',
              missingSlotsText: unresolvedSlotsText,
              coreSlotsText: missingCoreSlotsText,
              flagsText: flagsText,
              recentResponses: recentResponsesText,
              triageScoreText:
                profile.triage_readiness_score !== undefined
                  ? profile.triage_readiness_score.toFixed(2)
                  : 'unknown',
              currentTurn: nextIdx,
              categoryLabel: isComplexCategory ? 'complex/critical/vulnerable' : 'simple',
              establishedFacts,
            });

            try {
              let accumulatedResponse = '';
              const stream = geminiClient.streamGeminiResponse(clarifierPrompt);
              for await (const chunk of stream) {
                accumulatedResponse += chunk;
              }

              if (accumulatedResponse) {
                if (isVerifyingEmergencyRef.current) {
                  console.warn(
                    '[Assessment] Emergency verification triggered during expansion. Aborting question update.',
                  );
                  setStreamingText(null);
                  setTypingState(false);
                  setProcessing(false);
                  processingRef.current = false;
                  return;
                }

                try {
                  const parsed = parseAndValidateLLMResponse<any>(accumulatedResponse);
                  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
                  const sanitized = rawQuestions.map(sanitizeClarifierQuestion);
                  const sorted = sortClarifierQuestions(sanitized);
                  const newQuestions = sorted
                    .filter((q) => q.text)
                    .map((q, i) => ({
                      ...q,
                      id: q.id || `extra-${nextIdx}-${currentExpansion}-${i}`,
                    }));

                  if (newQuestions.length > 0) {
                    const updatedQuestions = [...activeQuestions, ...newQuestions];
                    const annotatedQuestions = annotateQuestionsWithSlotMetadata(
                      updatedQuestions,
                      profile,
                      newAnswers,
                      slotSnapshot,
                    );
                    const nextQ = annotatedQuestions[nextIdx];

                    console.log(
                      `[Assessment] Expansion successful. Added ${newQuestions.length} questions. Displaying next: ${nextQ.text.substring(0, 30)}...`,
                    );

                    // Commit finalized message
                    {
                      const extraTimestamp = Date.now();
                      appendMessagesToConversation([
                        composeAssistantMessage({
                          id: `ai-extra-${nextIdx}-${currentExpansion}`,
                          header: clarificationHeader,
                          body: nextQ.text,
                          reason: arbiterResult.reason,
                          reasonSource: 'arbiter-expansion',
                          nextAction:
                            'Please answer this follow-up so I can provide the most complete guidance.',
                          inlineAck: consumePendingCorrection(),
                          profile,
                          primarySymptom: primarySymptomForProfile ?? defaultPrimarySymptom,
                          timestamp: extraTimestamp,
                        }),
                      ]);
                    }

                    syncQuestionQueue(annotatedQuestions);
                    activeQuestions = annotatedQuestions;
                    setExpansionCount(currentExpansion + 1);
                    setCurrentQuestionIndex(nextIdx);

                    setStreamingText(null);
                    setTypingState(false);
                    setProcessing(false);
                    processingRef.current = false;
                    return; // EXIT EARLY: New question presented
                  }
                } catch {
                  console.warn(
                    '[Assessment] Expansion response did not contain valid JSON:',
                    accumulatedResponse,
                  );
                }
              }
              setStreamingText(null);
            } catch (err) {
              console.error('[Assessment] Failed to fetch expansion questions:', err);
              setStreamingText(null);
            }
          }

          // FINALIZATION GUARD: If we reached here, expansion either wasn't possible or failed to find questions.
          // We recalculate effectiveIsAtEnd in case activeQuestions was updated.
          effectiveIsAtEnd = nextIdx >= activeQuestions.length;

          if (effectiveIsAtEnd && !canTerminate) {
            console.log(
              `[Assessment] Finalizing with conservative fallback. Reason: Plan exhausted and safety criteria not met (Effective Readiness: ${effectiveReadiness.toFixed(2)}).`,
            );
            setTypingState(false);
            setAssessmentStage('review');
            const profileWithReason = {
              ...profile,
              termination_reason: 'PLAN_EXHAUSTED_SAFETY_FAIL',
            };
            const finalizeSafetyTimestamp = Date.now();
            appendMessagesToConversation([
              composeAssistantMessage({
                id: 'finalizing-safety-fallback',
                header: clarificationHeader,
                body: '',
                reason: arbiterResult.reason,
                reasonSource: 'arbiter-finalize-safety',
                nextAction: 'Please wait while I prepare the recommendation for you.',
                inlineAck: consumePendingCorrection(),
                timestamp: finalizeSafetyTimestamp,
                profile: profileWithReason,
                primarySymptom: primarySymptomForProfile ?? defaultPrimarySymptom,
              }),
            ]);
            keepLockForAsyncOp = true;
            setTimeout(() => finalizeAssessment(newAnswers, nextHistory, profileWithReason), 1000);
            return;
          }

          // If we are continuing within the planned questions after Turn 4 check
          if (!effectiveIsAtEnd) {
            const nextQ = activeQuestions[nextIdx];
            const readinessScore = profile.triage_readiness_score || 0;
            const lastUserText =
              historyItems
                .slice()
                .reverse()
                .find((item) => item.role === 'user')?.text || '';
            const buildAdaptiveBridgeText = async (questionText: string, lastUserText: string) => {
              try {
                const response = await geminiClient.generateBridgeMessage({
                  lastUserAnswer: lastUserText,
                  nextQuestion: questionText,
                });
                return response.trim();
              } catch (error) {
                console.warn('[Assessment] Bridge prompt failed; falling back to local text.', error);
                return buildBridgeText(lastUserText, questionText);
              }
            };

            // CHECK FOR RESUMPTION BRIDGE
            if (isQueueSuspended) {
              console.log('[Assessment] Resuming queue after drill-down. Applying bridge.');
              setIsQueueSuspended(false); // Reset flag

              setTypingState(true);
              const bridgeText = await buildAdaptiveBridgeText(nextQ.text, lastUserText);
              {
                const resumeTimestamp = Date.now();
                appendMessagesToConversation([
                  composeAssistantMessage({
                    id: `ai-resume-${nextIdx}`,
                    header: clarificationHeader,
                    body: bridgeText,
                    reason: 'Resuming assessment plan after drill-down.',
                    reasonSource: 'arbiter-resume',
                    nextAction: 'Please answer this to continue.',
                    inlineAck: consumePendingCorrection(),
                    profile,
                    primarySymptom: primarySymptomForProfile ?? defaultPrimarySymptom,
                    timestamp: resumeTimestamp,
                  }),
                ]);
              }
              setCurrentQuestionIndex(nextIdx);
              setTypingState(false);
              return;
            }

            if (readinessScore > 0.4) {
              console.log(
                `[Assessment] Readiness > 0.4 (${readinessScore}). Generating an adaptive bridge message.`,
              );
              setTypingState(true);
              const bridgeText = await buildAdaptiveBridgeText(nextQ.text, lastUserText);
              {
                const bridgeTimestamp = Date.now();
                appendMessagesToConversation([
                  composeAssistantMessage({
                    id: `ai-${nextIdx}-bridged`,
                    header: clarificationHeader,
                    body: bridgeText,
                    reason: arbiterResult.reason,
                    reasonSource: 'arbiter-bridge',
                    nextAction: 'Please answer this prompt so I can continue the assessment.',
                    inlineAck: consumePendingCorrection(),
                    profile,
                    primarySymptom: primarySymptomForProfile ?? defaultPrimarySymptom,
                    timestamp: bridgeTimestamp,
                  }),
                ]);
              }
              setCurrentQuestionIndex(nextIdx);
              setTypingState(false);
              return;
            }

            // Default behavior if readiness <= 0.4
            setTypingState(true);
            keepLockForAsyncOp = true;
            const inlineAck = consumePendingCorrection();
            setTimeout(() => {
              const defaultTimestamp = Date.now();
              appendMessagesToConversation([
                composeAssistantMessage({
                  id: `ai-${nextIdx}`,
                  header: clarificationHeader,
                  body: nextQ.text,
                  reason: arbiterResult.reason,
                  reasonSource: 'arbiter-default-question',
                  nextAction:
                    'Please answer this question so I can better understand your symptoms.',
                  inlineAck,
                  timestamp: defaultTimestamp,
                  profile,
                  primarySymptom: primarySymptomForProfile ?? defaultPrimarySymptom,
                }),
              ]);
              setCurrentQuestionIndex(nextIdx);
              setTypingState(false);
              setProcessing(false);
              processingRef.current = false;
            }, 600);
            return;
          }
        } catch (_e) {
          console.warn(
            '[Assessment] Arbiter consultation or follow-up failed, continuing planned path...',
            _e,
          );
        }
      }

      if (!effectiveIsAtEnd) {
        // Next Question (Fallback if Arbiter check fails or is skipped)
        setTypingState(true);
        keepLockForAsyncOp = true;
        const inlineAck = consumePendingCorrection();
        setTimeout(() => {
          const nextQ = activeQuestions[nextIdx];
          {
            const defaultTimestamp = Date.now();
            appendMessagesToConversation([
              composeAssistantMessage({
                id: `ai-${nextIdx}`,
                body: nextQ.text,
                reason: 'Continuing the planned question path.',
                reasonSource: 'planner-fallback',
                nextAction: 'Please answer this so I can continue the assessment.',
                inlineAck,
                timestamp: defaultTimestamp,
                profile,
                primarySymptom: primarySymptomForProfile ?? defaultPrimarySymptom,
              }),
            ]);
          }
          setCurrentQuestionIndex(nextIdx);
          setTypingState(false);
          setProcessing(false);
          processingRef.current = false;
        }, 600);
      } else {
        // EXHAUSTED QUESTIONS -> Finalize
        setTypingState(false);
        setAssessmentStage('review');
        {
          const finalizingTimestamp = Date.now();
          appendMessagesToConversation([
            composeAssistantMessage({
              id: 'finalizing',
              body: '',
              reason: 'Assessment complete and ready for final review.',
              reasonSource: 'finalizing',
              nextAction: 'Please wait while I synthesize the recommendation for you.',
              inlineAck: consumePendingCorrection(),
              timestamp: finalizingTimestamp,
            }),
          ]);
        }
        keepLockForAsyncOp = true;
        setTimeout(() => {
          finalizeAssessment(newAnswers, nextHistory);
        }, 1500);
      }
    } else {
      // Offline Flow Handling
      keepLockForAsyncOp = true;
      handleOfflineLogic(answer);
    }
  } catch (error) {
          console.error('[Assessment] Unexpected error in handleNext:', error);
        } finally {
          if (!keepLockForAsyncOp) {
            setProcessing(false);
            processingRef.current = false;
            setTypingState(false);
          }
        }
      };
  const handleEmergencyVerification = (status: 'emergency' | 'recent' | 'denied') => {
    if (!emergencyVerificationData) return;

    const { keyword, answer, currentQ, safetyCheck } = emergencyVerificationData;

    if (status === 'emergency') {
      /**
       * PATHWAY: CURRENT EMERGENCY
       * User confirms a high-risk symptom (e.g. chest pain) is happening NOW.
       * Action: Immediate escalation to 911/Emergency recommendation, bypassing assessment.
       */
      console.log(`[Assessment] EMERGENCY CONFIRMED: ${keyword}. Escalating.`);
      if (!isGuestMode) {
        dispatch(setHighRisk(true));
      }
      navigation.replace('Recommendation', {
        assessmentData: {
          symptoms: initialSymptom || '',
          affectedSystems: safetyCheck.affectedSystems,
          answers: [
            ...Object.entries(answers).map(([k, v]) => ({ question: k, answer: v })),
            { question: currentQ.text, answer },
          ],
          extractedProfile: {
            age: null,
            duration: null,
            severity: null,
            progression: null,
            red_flag_denials: null,
            uncertainty_accepted: false,
            summary: `Emergency confirmed: ${keyword}. Keywords: ${safetyCheck.matchedKeywords.join(', ')}`,
          },
        },
        guestMode: isGuestMode,
      });
      setPendingRedFlag(null);
    } else {
      if (status === 'recent') {
        /**
         * PATHWAY: RECENTLY RESOLVED (TRANSIENT)
         * User reports a high-risk symptom occurred but has since stopped (e.g. TIA, Angina).
         * Logic: We MUST NOT skip assessment. Instead, we flag the state for the final
         * recommendation engine to enforce a "Hospital Floor" safety protocol while
         * continuing to gather context about the episode's duration and progression.
         */
        console.log(`[Assessment] RECENTLY RESOLVED: ${keyword}. Flagging and continuing.`);
        setIsRecentResolved(true);
        setResolvedKeyword(keyword);
        // Force Ref update for immediate closure access
        isRecentResolvedRef.current = true;
        resolvedKeywordRef.current = keyword;
      } else {
        /**
         * PATHWAY: NON-EMERGENCY
         * User denies the high-risk symptom entirely (e.g. "I have no chest pain").
         * Logic: Suppress the keyword to prevent re-triggering and resume standard flow.
         */
        console.log(
          `[Assessment] EMERGENCY DENIED: ${keyword}. Resuming flow and suppressing keyword.`,
        );
      }

      setSuppressedKeywords((prev) => [...prev, keyword]);
      setPendingRedFlag(null);
      setIsVerifyingEmergency(false);
      setEmergencyVerificationData(null);

      // Resume the flow by calling handleNext with the same answer but skipping emergency check
      // Use a small delay to ensure state updates (setIsVerifyingEmergency) are processed
      setTimeout(() => handleNext(answer, true), 100);
    }
  };

  const finalizeAssessment = async (
    finalAnswers: Record<string, string>,
    currentHistory: Message[],
    preExtractedProfile?: AssessmentProfile,
  ) => {
    if (isFinalizingRef.current) {
      console.log('[Assessment] Already finalizing. Ignoring duplicate call.');
      return;
    }
    isFinalizingRef.current = true;
    console.log('[Assessment] Finalizing... Extracting Slots.');
    setAssessmentStage('generating');

    try {
      const extractedProfile =
        preExtractedProfile ||
        (await geminiClient.extractClinicalProfile(
          currentHistory.map((m) => ({
            role: m.sender as any,
            text: m.text,
          })),
          {
            currentProfileSummary: previousProfile?.summary,
          },
        ));

      const profile = reconcileClinicalProfileWithSlots(extractedProfile, incrementalSlots);

      console.log('\n╔═══ FINAL PROFILE EXTRACTION ═══╗');
      console.log(JSON.stringify(profile, null, 2));
      console.log(`╚${'═'.repeat(32)}╝\n`);

      // Format for Recommendation Screen
      const formattedAnswers = fullPlan.map((q) => ({
        question: q.text,
        answer: finalAnswers[q.id] || 'Not answered',
      }));

      // Final transition message
      {
        const finalizeTimestamp = Date.now();
        appendMessagesToConversation([
          composeAssistantMessage({
            id: `finalize-${finalizeTimestamp}`,
            body: '',
            reason: 'Assessment complete and ready for handover.',
            reasonSource: 'finalize-assessment',
            nextAction: 'Please stay tuned while I prepare the recommendation for you.',
            timestamp: finalizeTimestamp,
            profile,
            primarySymptom: derivePrimarySymptom(initialSymptom, profile.summary) ?? defaultPrimarySymptom,
          }),
        ]);
      }

      const resolvedFlag = isRecentResolved || profile.is_recent_resolved === true;
      const resolvedKeywordFinal = resolvedKeyword || profile.resolved_keyword;

      setTimeout(() => {
        dispatch(clearAssessmentState());
        navigation.replace('Recommendation', {
          assessmentData: {
            symptoms: initialSymptom || '',
            answers: formattedAnswers,
            extractedProfile: {
              ...profile,
              is_recent_resolved: resolvedFlag,
              resolved_keyword: resolvedKeywordFinal || undefined,
            },
          },
          isRecentResolved: resolvedFlag,
          resolvedKeyword: resolvedKeywordFinal || undefined,
          guestMode: isGuestMode,
        });
      }, 1500);
    } catch {
      Alert.alert('Error', 'Could not process results. Please try again.');
      isFinalizingRef.current = false;
      setProcessing(false);
      setTypingState(false);
    }
  };
  // --- OFFLINE LOGIC ---
  const startOfflineTriage = () => {
    const startNode = TriageEngine.getStartNode(triageFlow);
    const introTimestamp = Date.now();
    replaceMessagesDisplay([
      composeAssistantMessage({
        id: 'offline-intro',
        body: "I'm having trouble connecting to the AI. I've switched to Offline Emergency Check.",
        reason: 'Falling back to offline triage.',
        reasonSource: 'offline-intro',
        nextAction: 'Please answer the offline questions while the AI reconnects.',
        timestamp: introTimestamp,
        extra: { isOffline: true },
      }),
      composeAssistantMessage({
        id: startNode.id,
        body: startNode.text || '',
        reason: 'Offline triage question',
        reasonSource: 'offline-node',
        nextAction: 'Please respond so we can continue the offline flow.',
        timestamp: introTimestamp + 1,
        extra: { isOffline: true },
      }),
    ]);
    setIsOfflineMode(true);
    setCurrentOfflineNodeId(startNode.id);
    setLoading(false);
  };

  const handleOfflineLogic = (answer: string) => {
    if (!currentOfflineNodeId) return;

    setTypingState(true);
    setTimeout(() => {
      const result = TriageEngine.processStep(triageFlow, currentOfflineNodeId, answer);
      if (result.isOutcome) {
        setTypingState(false);
        setProcessing(false);
        processingRef.current = false;
        navigation.replace('Recommendation', {
          assessmentData: {
            symptoms: initialSymptom || '',
            answers: [
              {
                question: 'Offline Triage',
                answer: result.node.recommendation?.reasoning || 'Completed',
              },
            ],
            offlineRecommendation: result.node.recommendation,
          },
          guestMode: isGuestMode,
        });
      } else {
        const nextNode = result.node;
        appendMessagesToConversation([
          composeAssistantMessage({
            id: nextNode.id,
            body: nextNode.text || '',
            reason: 'Offline triage question generated.',
            reasonSource: 'offline-triage',
            nextAction: 'Please answer this offline question so we can move forward.',
            timestamp: Date.now(),
            extra: { isOffline: true },
          }),
        ]);
        setCurrentOfflineNodeId(nextNode.id);
        setTypingState(false);
        setProcessing(false);
        processingRef.current = false;
      }
    }, 500);
  };

  // --- UTILS ---
  const handleBack = useCallback(() => {
    if (isModeModalVisible) {
      return;
    }
    if (messages.length <= 1) {
      router.back();
      return;
    }

    Alert.alert(
      'Exit Assessment?',
      'You can exit and resume this assessment later, or restart it from the beginning.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart',
          style: 'destructive',
          onPress: () => {
            dispatch(clearAssessmentState());
            router.back();
          },
        },
        {
          text: 'Exit & Save',
          onPress: () => router.back(),
        },
      ],
    );
  }, [messages, dispatch, isModeModalVisible]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleBack();
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [handleBack]),
  );

  const visibleMessages = useMemo(
    () => messages.filter((msg) => !msg.metadata?.isSystemTransition),
    [messages],
  );

  // --- RENDER ---
  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isAssistant = item.sender === 'assistant';
      return (
        <View
          style={[styles.messageWrapper, isAssistant ? styles.assistantWrapper : styles.userWrapper]}
        >
          {isAssistant && (
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: theme.colors.primaryContainer,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={item.isOffline ? 'shield-check' : 'robot'}
                size={18}
                color={theme.colors.primary}
              />
            </View>
          )}
          <View
            style={[
              styles.bubble,
              isAssistant ? styles.assistantBubble : styles.userBubble,
              { backgroundColor: isAssistant ? theme.colors.surface : theme.colors.primary },
            ]}
          >
            <Text
              style={[
                styles.messageText,
                { color: isAssistant ? theme.colors.onSurface : theme.colors.onPrimary },
              ]}
            >
              {item.text}
            </Text>
          </View>
        </View>
      );
    },
    [theme],
  );

  const renderModeSelectionModal = () => {
    if (!isModeModalVisible) return null;
    return (
      <Modal
        visible={isModeModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={styles.modeModalOverlay}>
          <View style={[styles.modeModalContent, { backgroundColor: theme.colors.surface }]}>
            <Text
              variant="titleLarge"
              style={{ marginBottom: 8, color: theme.colors.onSurface, fontWeight: '700' }}
            >
              Who is this assessment for?
            </Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
              Choose the option that best fits whether you are sharing symptoms for yourself or
              someone else.
            </Text>
            <View style={{ width: '100%', marginTop: 24, gap: 12 }}>
              <Button
                variant="primary"
                onPress={() => handleModeSelection('forMe')}
                title="For Me"
                style={{ width: '100%' }}
                accessibilityLabel="Select assessment for me"
              />
              <Button
                variant="outline"
                onPress={() => handleModeSelection('forSomeoneElse')}
                title="For Someone Else"
                style={{ width: '100%' }}
                accessibilityLabel="Select assessment for someone else"
              />
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  if (isModeModalVisible) {
    return (
      <ScreenSafeArea
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['left', 'right', 'bottom']}
      >
        <StandardHeader title="Assessment" showBackButton onBackPress={handleBack} />
        {renderModeSelectionModal()}
      </ScreenSafeArea>
    );
  }

  if (loading) {
    return (
      <ScreenSafeArea
        style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}
        edges={['top', 'left', 'right', 'bottom']}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 16 }}>Preparing your assessment...</Text>
      </ScreenSafeArea>
    );
  }

  // Determine current options if offline
  const currentQuestion = questions[currentQuestionIndex];
  const offlineOptions =
    isOfflineMode && currentOfflineNodeId ? triageFlow.nodes[currentOfflineNodeId]?.options : null;

  const totalQuestions = Math.max(questions.length, 1);
  const answeredCount = Math.min(currentQuestionIndex, totalQuestions);
  const questionProgress = totalQuestions > 0 ? answeredCount / totalQuestions : 0;

  const assessmentProgress = (() => {
    if (isOfflineMode) {
      return {
        value: 0.5,
        label: 'Emergency Check',
        color: theme.colors.primary,
      };
    }

    switch (assessmentStage) {
      case 'generating':
        return {
          value: 1,
          label: 'Generating recommendation...',
          color: '#2196F3',
        };
      case 'review':
        return {
          value: Math.max(questionProgress, 0.85),
          label: 'Reviewing your responses...',
          color: theme.colors.primary,
        };
      case 'follow_up':
        return {
          value: Math.max(questionProgress, 0.35),
          label: 'Follow-up questions...',
          color: theme.colors.primary,
        };
      case 'intake':
      default:
        return {
          value: Math.max(questionProgress, 0.1),
          label: 'Gathering initial symptoms...',
          color: theme.colors.primary,
        };
    }
  })();

  // Determine if current question has a "None" option and if it's mandatory
  const currentOptions =
    currentQuestion?.options || (currentQuestion ? parseRedFlags(currentQuestion.text) : []);
  const hasNoneOptionInCurrent = currentOptions.some((opt: unknown) => {
    if (typeof opt === 'string') return isNoneOption(opt);
    if (opt && typeof opt === 'object') {
      if ('label' in opt) return isNoneOption((opt as { label: string }).label);
      if ('items' in opt) {
        return (opt as { items: unknown[] }).items.some((i: unknown) =>
          isNoneOption(typeof i === 'string' ? i : (i as { id?: string; label?: string }).id || (i as { id?: string; label?: string }).label || ''),
        );
      }
    }
    return false;
  });

  const isMandatory = currentQuestion
    ? currentQuestion.text.toLowerCase().includes('drink') ||
      currentQuestion.text.toLowerCase().includes('frequently') ||
      currentQuestion.text.toLowerCase().includes('how often') ||
      currentQuestion.text.toLowerCase().includes('how many')
    : false;

  const showNoneButton = hasNoneOptionInCurrent && !isMandatory && selectedRedFlags.length === 0;

  console.log(`[DEBUG_RENDER] isVerifyingEmergency: ${isVerifyingEmergency}`);

  const renderListFooter = () => (
    <>
      {/* Streaming Message Bubble */}
      {streamingText && (
        <View style={[styles.messageWrapper, styles.assistantWrapper]}>
          <View style={[styles.avatar, { backgroundColor: theme.colors.primaryContainer }]}>
            <MaterialCommunityIcons name="robot" size={18} color={theme.colors.primary} />
          </View>
          <View
            style={[
              styles.bubble,
              styles.assistantBubble,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text style={[styles.messageText, { color: theme.colors.onSurface }]}>
              {streamingText}
            </Text>
          </View>
        </View>
      )}
      {isTyping && !streamingText && (
        <View style={[styles.messageWrapper, styles.assistantWrapper]}>
          <View style={[styles.avatar, { backgroundColor: theme.colors.primaryContainer }]}>
            <MaterialCommunityIcons name="robot" size={18} color={theme.colors.primary} />
          </View>
          <View
            style={[
              styles.bubble,
              styles.assistantBubble,
              { backgroundColor: theme.colors.surface, padding: 12 },
            ]}
          >
            <TypingIndicator />
          </View>
        </View>
      )}
      {isVerifyingEmergency && emergencyVerificationData && (
        <View style={[styles.messageWrapper, styles.assistantWrapper]}>
          <View style={[styles.avatar, { backgroundColor: theme.colors.errorContainer }]}>
            <MaterialCommunityIcons name="alert" size={18} color={theme.colors.error} />
          </View>
          <View
            style={[
              styles.bubble,
              styles.assistantBubble,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.error,
                borderWidth: 0.5,
              },
            ]}
          >
            <Text style={[styles.messageText, { color: theme.colors.onSurface }]}>
              I noticed you mentioned{' '}
              <Text style={{ fontWeight: 'bold' }}>{emergencyVerificationData.keyword}</Text>. To
              be safe, is this happening to you right now, or are you describing a past
              event/concern?
            </Text>
          </View>
        </View>
      )}
    </>
  );

  return (
    <ScreenSafeArea
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['left', 'right', 'bottom']}
    >
      <StandardHeader title="Assessment" showBackButton onBackPress={handleBack} />

      {isGuestMode && (
        <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 }}>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.5 }}
          >
            Guest mode is active. No personal profile data is included while you describe someone
            else&apos;s symptoms.
          </Text>
        </View>
      )}

      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <ProgressBar
          progress={assessmentProgress.value}
          label={assessmentProgress.label}
          color={assessmentProgress.color}
        />
      </View>

      <FlatList
        ref={flatListRef}
        data={visibleMessages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        style={styles.messagesContainer}
        contentContainerStyle={{ padding: 16, paddingBottom: chatBottomPadding }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListFooterComponent={renderListFooter}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <Animated.View
        style={[
          styles.inputSection,
          {
            marginBottom: keyboardHeight,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        {isVerifyingEmergency ? (
          <View testID="emergency-verification-buttons" style={{ gap: 8 }}>
            <Button
              variant="primary"
              onPress={() => handleEmergencyVerification('emergency')}
              title="Yes, happening right now"
              buttonColor={theme.colors.error}
              textColor="white"
              style={{ width: '100%' }}
              accessibilityLabel="Yes, happening right now"
              accessibilityHint="Escalates to immediate emergency recommendation"
            />
            <Button
              variant="outline"
              onPress={() => handleEmergencyVerification('recent')}
              title="Happened recently but has stopped"
              style={{ width: '100%' }}
              accessibilityLabel="Happened recently but has stopped"
              accessibilityHint="Continues assessment but flags the symptom as high priority"
            />
            <Button
              variant="outline"
              onPress={() => handleEmergencyVerification('denied')}
              title="No, not experiencing this"
              style={{ width: '100%' }}
              accessibilityLabel="No, not experiencing this"
              accessibilityHint="Continues standard assessment"
            />
          </View>
        ) : isClarifyingDenial ? (
          <View style={{ gap: 8 }}>
            <Button
              variant="primary"
              onPress={() => handleNext('Yes, I am sure')}
              title="Yes, I am sure"
              style={{ width: '100%' }}
            />
            <Button
              variant="outline"
              onPress={() => handleNext('No, let me re-check')}
              title="No, let me re-check"
              style={{ width: '100%' }}
            />
          </View>
        ) : !isOfflineMode &&
          currentQuestion?.id === 'red_flags' &&
          symptomCategory === 'simple' &&
          !showRedFlagsChecklist &&
          !isClarifyingDenial ? (
          <View style={{ paddingBottom: 8, gap: 8 }}>
            <Text
              style={{
                paddingHorizontal: 16,
                marginBottom: 8,
                letterSpacing: 1.5,
                fontWeight: '700',
                fontSize: 12,
                color: theme.colors.onSurfaceVariant,
              }}
            >
              SYMPTOM VERIFICATION
            </Text>
            <Text style={{ paddingHorizontal: 16, marginBottom: 8, color: theme.colors.onSurface }}>
              {`To ensure I have a complete picture of your health right now, are you experiencing any other severe symptoms like difficulty breathing or chest pain, or is it still limited to ${safetyShortLabel}?`}
            </Text>
            <Button
              variant="primary"
              onPress={() => setShowRedFlagsChecklist(true)}
              title="Yes, I have other symptoms"
              style={{ width: '100%' }}
            />
            <Button
              variant="outline"
              onPress={() => handleNext(formatSelectionAnswer(currentQuestion, []))}
              title={`No, just ${safetyShortLabel}`}
              style={{ width: '100%' }}
            />
            <Button
              variant="outline"
              onPress={() => setShowRedFlagsChecklist(true)}
              title="I'm not sure / Maybe"
              style={{ width: '100%' }}
            />
          </View>
        ) : !isOfflineMode && currentQuestion && currentQuestion.type === 'multi-select' ? (
          <View style={{ paddingBottom: 8 }}>
            <Text
              variant="titleSmall"
              style={{
                marginBottom: 8,
                paddingHorizontal: 16,
                letterSpacing: 1.5,
                fontWeight: '700',
                fontSize: 12,
                color: theme.colors.onSurfaceVariant,
              }}
            >
              SELECT ALL THAT APPLY
            </Text>
            <View style={{ maxHeight: SCREEN_HEIGHT / 3 }}>
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                <MultiSelectChecklist
                  options={(() => {
                    const mapped = (
                      currentQuestion.options
                        ? currentQuestion.options.map((opt) => {
                            if (typeof opt === 'string') return { id: opt, label: opt };
                            return {
                              category: (opt as GroupedOption).category,
                              items: (opt as GroupedOption).items.map((i) => ({ id: i, label: i })),
                            };
                          })
                        : parseRedFlags(currentQuestion.text)
                    );

                    if (hasNoneOptionInCurrent && !isMandatory) {
                      return mapped
                        .map((opt) => {
                          if ('id' in opt) return isNoneOption((opt as ChecklistOption).id) ? null : opt;
                          return {
                            ...opt,
                            items: (opt as GroupedChecklistOption).items.filter((i) => !isNoneOption(i.id)),
                          };
                        })
                        .filter((opt) => {
                          if (!opt) return false;
                          if ('items' in opt) return (opt as GroupedChecklistOption).items.length > 0;
                          return true;
                        }) as ChecklistOption[] | GroupedChecklistOption[];
                    }
                    return mapped as ChecklistOption[] | GroupedChecklistOption[];
                  })()}
                  selectedIds={selectedRedFlags}
                  singleSelection={false}
                  onSelectionChange={(ids) => {
                    // Mutual exclusivity for "None" in Multi-Select
                    const lastAdded = ids.find((id) => !selectedRedFlags.includes(id));
                    if (lastAdded && isNoneOption(lastAdded)) {
                      setSelectedRedFlags([lastAdded]);
                    } else if (ids.length > 1 && ids.some((id) => isNoneOption(id))) {
                      setSelectedRedFlags(ids.filter((id) => !isNoneOption(id)));
                    } else {
                      setSelectedRedFlags(ids);
                    }
                  }}
                />
              </ScrollView>
            </View>
            <View style={{ marginTop: 8, gap: 8 }}>
              {showNoneButton ? (
                <Button
                  testID="button-none"
                  variant="outline"
                  onPress={() => {
                    handleNext(formatSelectionAnswer(currentQuestion, []));
                  }}
                  title="None of the above"
                  style={{ width: '100%' }}
                  disabled={processing}
                  accessibilityLabel="None of the above"
                  accessibilityRole="button"
                />
              ) : (
                <Button
                  testID="button-confirm"
                  variant="primary"
                  onPress={() => {
                    handleNext(formatSelectionAnswer(currentQuestion, selectedRedFlags));
                  }}
                  title="Confirm"
                  style={{ width: '100%' }}
                  disabled={processing || selectedRedFlags.length === 0}
                  accessibilityLabel="Confirm selection"
                  accessibilityRole="button"
                />
              )}
            </View>
          </View>
        ) : (
          <>
            {/* Suggestions / Offline Chips */}
            {(() => {
              const shouldShowChips =
                offlineOptions ||
                (!isOfflineMode &&
                  currentQuestion?.options &&
                  currentQuestion.options.length > 0 &&
                  currentQuestion.type !== 'text' &&
                  currentQuestion.type !== 'number');

              if (!shouldShowChips) return null;

              return (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
                >
                  {offlineOptions
                    ? offlineOptions.map((opt) => (
                        <Chip
                          key={opt.label}
                          onPress={() => handleNext(opt.label)}
                          disabled={processing}
                          style={{ backgroundColor: theme.colors.primaryContainer }}
                          textStyle={{ color: theme.colors.primary }}
                        >
                          {opt.label}
                        </Chip>
                      ))
                    : currentQuestion!.options!.map((opt, idx) => {
                        if (typeof opt === 'string') {
                          return (
                            <Chip
                              key={idx}
                              onPress={() => handleNext(opt)}
                              disabled={processing}
                              style={{ marginRight: 8, backgroundColor: theme.colors.primaryContainer }}
                              textStyle={{ color: theme.colors.primary }}
                            >
                              {opt}
                            </Chip>
                          );
                        }
                        return null;
                      })}
                </ScrollView>
              );
            })()}

            <InputCard
              ref={inputCardRef}
              value={inputText}
              onChangeText={setInputText}
              onSubmit={() => handleNext()}
              label={isOfflineMode ? 'Select an option above' : 'Type your answer...'}
              keyboardType={currentQuestion?.type === 'number' ? 'numeric' : 'default'}
              disabled={processing || (isOfflineMode && !!offlineOptions)}
            />
          </>
        )}
      </Animated.View>
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messagesContainer: { flex: 1 },
  messageWrapper: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
  assistantWrapper: { justifyContent: 'flex-start' },
  userWrapper: { justifyContent: 'flex-end' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  bubble: { maxWidth: '85%', padding: 10, borderRadius: 16, elevation: 1 },
  assistantBubble: { borderBottomLeftRadius: 4 },
  userBubble: { borderBottomRightRadius: 4 },
  messageText: { fontSize: 16, lineHeight: 22 },
  inputSection: {
    padding: 12,
  },
  modeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modeModalContent: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 18,
    padding: 24,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});

export default SymptomAssessmentScreen;
