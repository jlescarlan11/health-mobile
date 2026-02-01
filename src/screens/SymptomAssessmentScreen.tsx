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
import { geminiClient, TriageContractError } from '../api/geminiClient';
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
import {
  TriageFlow,
  AssessmentQuestion,
  AssessmentProfile,
  GroupedOption,
  TriageSnapshot,
  TriageAssessmentRequest,
  TriageAssessmentResponse,
  ChatHistoryItem,
} from '../types/triage';
import {
  ClinicalSlots,
  calculateAgeFromDob,
  computeUnresolvedSlotGoals,
  createClinicalSlotParser,
  reconcileClinicalProfileWithSlots,
  formatProfileForAI,
} from '../utils/clinicalUtils';
import { StandardHeader } from '../components/common/StandardHeader';
import { Button } from '../components/common/Button';
import {
  InputCard,
  TypingIndicator,
  InputCardRef,
  ProgressBar,
  MultiSelectChecklist,
  ScreenSafeArea,
  SignInRequired,
  LoadingScreen,
} from '../components/common';
import { ChecklistOption, GroupedChecklistOption } from '../components/common/MultiSelectChecklist';
import {
  formatEmpatheticResponse,
  derivePrimarySymptom,
} from '../utils/empatheticResponses';
import { theme as appTheme } from '../theme';
import { useAuthStatus } from '../hooks';

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

const mapMessageToHistoryRole = (message: Message): ChatHistoryItem['role'] => {
  if (message.sender === 'user') {
    return 'user';
  }

  if (message.metadata?.isSystemTransition === true) {
    return 'system';
  }

  return 'assistant';
};

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

const SymptomAssessmentContent = () => {
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
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const keyboardScrollRaf = useRef<number | null>(null);
  const { initialSymptom } = route.params || { initialSymptom: '' };
  const trimmedInitialSymptom = (initialSymptom || '').trim();
  const defaultPrimarySymptom = derivePrimarySymptom(initialSymptom);
  const hasInitialSymptom = trimmedInitialSymptom.length > 0;
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
      if (!trimmedText) return null;

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
    [getHistoryContext, questions, currentQuestionIndex, suppressedKeywords],
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

  const handleOutOfScopeFallback = useCallback(
    (answer: string, question: AssessmentQuestion) => {
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
    },
    [outOfScopeBuffer, appendMessagesToConversation, setTypingState, setProcessing],
  );

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
  const logConversationStep = useCallback(
    (
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
    },
    [],
  );

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

    const handleNext = useCallback(
      async (answerOverride?: string, skipEmergencyCheck = false, messagesOverride?: Message[]) => {
        const answer = answerOverride || inputText;
        const trimmedAnswer = answer.trim();
        if (!trimmedAnswer || processingRef.current) return;
  
        if (isClarifyingDenial) setIsClarifyingDenial(false);
  
        const currentQ = questions[currentQuestionIndex];
        console.log(
          `[DEBUG_TEST] currentQ: ${currentQ?.text}, questions.length: ${questions.length}, index: ${currentQuestionIndex}, isOffline: ${isOfflineMode}`,
        );
  
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
          let nextHistory = messagesOverride || messages;
  
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
            setIncrementalSlots(parsedSlots.aggregated);
            nextHistory = [...nextHistory, userMsg];
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
            }
            setOutOfScopeBuffer([]);
  
            let nextIdx = currentQuestionIndex + (currentQ ? 1 : 0);
  
            // --- BACKEND-DRIVEN TRIAGE ORCHESTRATION ---
            console.log(`[Assessment] Turn ${nextIdx}. Calling Backend Orchestrator...`);
  
            try {
              const triageRequest: TriageAssessmentRequest = {
                history: nextHistory.map((m) => ({
                  role: mapMessageToHistoryRole(m),
                  text: m.text,
                })),
                profile: previousProfile,
                currentTurn: nextIdx,
                totalPlannedQuestions: fullPlan.length,
                remainingQuestions: fullPlan.slice(nextIdx),
                previousProfile,
                clarificationAttempts: clarificationCount,
                patientContext: clinicalContext,
                initialSymptom,
                fullName,
              };
  
              const response: TriageAssessmentResponse = await geminiClient.triageAssess(triageRequest);
              const { controlSignal, aiResponse, updatedProfile, metadata } = response;
  
              console.log(`[Assessment] Backend Signal: ${controlSignal}. Reason: ${metadata?.reason}`);
  
              // Update clinical profile and readiness from backend
              setPreviousProfile(updatedProfile);
              if (updatedProfile.triage_readiness_score !== undefined) {
                setReadiness(updatedProfile.triage_readiness_score);
              }
              if (updatedProfile.symptom_category) {
                setSymptomCategory(updatedProfile.symptom_category);
              }
  
              const primarySymptomForProfile = derivePrimarySymptom(
                initialSymptom,
                updatedProfile.summary,
              );
  
              if (controlSignal === 'TERMINATE') {
                setTypingState(false);
                setAssessmentStage('review');
  
                const terminationTimestamp = Date.now();
                appendMessagesToConversation([
                  composeAssistantMessage({
                    id: `terminate-${terminationTimestamp}`,
                    body:
                      aiResponse.text ||
                      'I have collected all the necessary information. Preparing your recommendation...',
                    reason: metadata?.reason || 'Assessment complete',
                    reasonSource: 'arbiter-termination',
                    nextAction: 'Finalizing your recommendation now.',
                    profile: updatedProfile,
                    primarySymptom: primarySymptomForProfile ?? defaultPrimarySymptom,
                    timestamp: terminationTimestamp,
                  }),
                ]);
  
                keepLockForAsyncOp = true;
                setTimeout(
                  () => finalizeAssessment(newAnswers, nextHistory, updatedProfile, aiResponse.assessment),
                  1500,
                );
                return;
              }
  
              // Handle Continue or other intermediate signals
              setTypingState(true);
              const nextTimestamp = Date.now();
  
              // If the backend provided a specific next question, we can update our plan if it's different
              if (aiResponse.question && aiResponse.question.id !== fullPlan[nextIdx]?.id) {
                console.log(`[Assessment] Backend injected/refined question: ${aiResponse.question.id}`);
                const updatedPlan = [
                  ...fullPlan.slice(0, nextIdx),
                  aiResponse.question,
                  ...fullPlan.slice(nextIdx),
                ];
                syncQuestionQueue(updatedPlan);
              }
  
              appendMessagesToConversation([
                composeAssistantMessage({
                  id: `ai-${nextIdx}-${nextTimestamp}`,
                  body: aiResponse.text,
                  reason: metadata?.reason,
                  reasonSource: `arbiter-${controlSignal.toLowerCase()}`,
                  nextAction: 'Please answer to continue the assessment.',
                  profile: updatedProfile,
                  primarySymptom: primarySymptomForProfile ?? defaultPrimarySymptom,
                  timestamp: nextTimestamp,
                }),
              ]);
  
              setCurrentQuestionIndex(nextIdx);
              setTypingState(false);
              setProcessing(false);
              processingRef.current = false;
  
              if (metadata?.needs_reset) {
                console.log('[Assessment] Backend requested progress reset');
              }
  
              return;
            } catch (err) {
              console.error('[Assessment] Backend orchestration failed:', err);
  
              let errorMessage = 'I encountered an error while processing your response.';
              let errorType = 'UNKNOWN';
  
              if (err instanceof TriageContractError) {
                errorType = err.code;
                if (err.code === 'VERSION_MISMATCH') {
                  errorMessage =
                    'The assessment service has been updated. Please update your app to continue.';
                } else if (err.code === 'VALIDATION_ERROR') {
                  errorMessage = 'There was a problem communicating with the assessment service.';
                } else if (err.code === 'SERVER_ERROR') {
                  errorMessage =
                    'The assessment service encountered an internal error. Please try again shortly.';
                } else if (err.code === 'NETWORK_ERROR') {
                  errorMessage = 'I am having trouble connecting. Please check your internet.';
                }
              }
  
              const errorTimestamp = Date.now();
              appendMessagesToConversation([
                {
                  id: `error-${errorTimestamp}`,
                  text: errorMessage,
                  sender: 'assistant',
                  timestamp: errorTimestamp,
                  metadata: {
                    isError: true,
                    retryAnswer: answer,
                    errorType,
                  },
                },
              ]);
  
              setProcessing(false);
              processingRef.current = false;
              setTypingState(false);
              return;
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
      },
      [
        inputText,
        isClarifyingDenial,
        questions,
        currentQuestionIndex,
        isOfflineMode,
        messages,
        deriveIntentTag,
        runEmergencyGuard,
        logConversationStep,
        handleOutOfScopeFallback,
        answers,
        previousProfile,
        fullPlan,
        clarificationCount,
        clinicalContext,
        initialSymptom,
        fullName,
        syncQuestionQueue,
        defaultPrimarySymptom,
        appendMessagesToConversation,
        finalizeAssessment,
        handleOfflineLogic,
        setProcessing,
        setTypingState,
        appendMessageToConversation,
      ],
    );  const handleEmergencyVerification = (status: 'emergency' | 'recent' | 'denied') => {
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

  const finalizeAssessment = useCallback(
    async (
      finalAnswers: Record<string, string>,
      currentHistory: Message[],
      preExtractedProfile?: AssessmentProfile,
      precomputedAssessment?: any,
    ) => {
      if (isFinalizingRef.current) {
        console.log('[Assessment] Already finalizing. Ignoring duplicate call.');
        return;
      }
      isFinalizingRef.current = true;
      console.log('[Assessment] Finalizing... Extracting Slots.');
      setAssessmentStage('generating');

      try {
        let profile: AssessmentProfile;
        if (preExtractedProfile) {
          profile = reconcileClinicalProfileWithSlots(preExtractedProfile, incrementalSlots);
        } else {
          const extractedProfile = await geminiClient.extractClinicalProfile(
            currentHistory.map((m) => ({
              role: m.sender === 'user' ? 'user' : 'assistant',
              text: m.text,
            })),
            {
              currentProfileSummary: previousProfile?.summary,
            },
          );
          profile = reconcileClinicalProfileWithSlots(extractedProfile, incrementalSlots);
        }

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
              primarySymptom:
                derivePrimarySymptom(initialSymptom, profile.summary) ?? defaultPrimarySymptom,
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
              ...(precomputedAssessment ? { precomputedAssessment } : {}),
            },
            isRecentResolved: resolvedFlag,
            resolvedKeyword: resolvedKeywordFinal || undefined,
            guestMode: isGuestMode,
          });
        }, 1500);
      } catch (err) {
        console.error('[Assessment] Finalization failed:', err);
        Alert.alert('Error', 'Could not process results. Please try again.');
        isFinalizingRef.current = false;
        setProcessing(false);
        setTypingState(false);
      }
    },
    [
      incrementalSlots,
      previousProfile,
      fullPlan,
      appendMessagesToConversation,
      initialSymptom,
      defaultPrimarySymptom,
      isRecentResolved,
      resolvedKeyword,
      dispatch,
      navigation,
      isGuestMode,
      setProcessing,
      setTypingState,
    ],
  );
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

  const handleOfflineLogic = useCallback(
    (answer: string) => {
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
    },
    [
      currentOfflineNodeId,
      setTypingState,
      setProcessing,
      navigation,
      initialSymptom,
      isGuestMode,
      appendMessagesToConversation,
    ],
  );

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

  const handleRetry = useCallback(
    (errorMsg: Message) => {
      const retryAnswer = errorMsg.metadata?.retryAnswer as string;
      if (retryAnswer) {
        // Remove the error message from the conversation to keep it clean
        const filteredMessages = messages.filter((m) => m.id !== errorMsg.id);
        setMessages(filteredMessages);
        setSessionBuffer(filteredMessages);

        // Retry the turn, skipping the optimistic append since the user message is already there
        // Pass the filteredMessages to avoid stale closure issues in handleNext
        handleNext(retryAnswer, true, filteredMessages);
      }
    },
    [handleNext, messages, setMessages, setSessionBuffer],
  );

  const visibleMessages = useMemo(
    () => messages.filter((msg) => !msg.metadata?.isSystemTransition),
    [messages],
  );

  // --- RENDER ---
  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isAssistant = item.sender === 'assistant';
      const isError = item.metadata?.isError;

      return (
        <View
          style={[
            styles.messageWrapper,
            isAssistant ? styles.assistantWrapper : styles.userWrapper,
          ]}
        >
          {isAssistant && (
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: isError
                    ? theme.colors.errorContainer
                    : theme.colors.primaryContainer,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={isError ? 'alert-circle' : item.isOffline ? 'shield-check' : 'robot'}
                size={18}
                color={isError ? theme.colors.error : theme.colors.primary}
              />
            </View>
          )}
          <View
            style={[
              styles.bubble,
              isAssistant ? styles.assistantBubble : styles.userBubble,
              {
                backgroundColor: isAssistant ? theme.colors.surface : theme.colors.primary,
                borderColor: isError ? theme.colors.error : 'transparent',
                borderWidth: isError ? 1 : 0,
              },
            ]}
          >
            <Text
              style={[
                styles.messageText,
                {
                  color: isAssistant
                    ? isError
                      ? theme.colors.error
                      : theme.colors.onSurface
                    : theme.colors.onPrimary,
                },
              ]}
            >
              {item.text}
            </Text>
            {isError && (
              <Button
                variant="outline"
                onPress={() => handleRetry(item)}
                title="Retry"
                size="small"
                style={{ marginTop: 8, borderColor: theme.colors.error }}
                textColor={theme.colors.error}
              />
            )}
          </View>
        </View>
      );
    },
    [theme, handleRetry],
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
              {
                backgroundColor: theme.colors.surface,
                padding: 12,
                flexDirection: 'row',
                alignItems: 'center',
              },
            ]}
          >
            <TypingIndicator dotMargin={3} />
            <Text
              style={{
                marginLeft: 8,
                color: theme.colors.onSurfaceVariant,
                fontSize: 14,
                fontStyle: 'italic',
              }}
            >
              Thinking...
            </Text>
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
  gatingWrapper: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
});
const SymptomAssessmentScreen = () => {
  const { isSignedIn, isSessionLoaded } = useAuthStatus();
  const theme = useTheme() as MD3Theme & { spacing: Record<string, number> };
  const navigation = useNavigation<NavigationProp>();

  if (!isSessionLoaded) {
    return (
      <ScreenSafeArea
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['left', 'right', 'bottom']}
      >
        <StandardHeader title="Assessment" showBackButton onBackPress={() => navigation.goBack()} />
        <View style={styles.gatingWrapper}>
          <LoadingScreen />
        </View>
      </ScreenSafeArea>
    );
  }

  if (!isSignedIn) {
    return (
      <ScreenSafeArea
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['left', 'right', 'bottom']}
      >
        <StandardHeader title="Assessment" showBackButton onBackPress={() => navigation.goBack()} />
        <View style={styles.gatingWrapper}>
          <SignInRequired
            title="Sign in to continue"
            description="Symptom assessments require an account to save progress and your clinical history."
          />
        </View>
      </ScreenSafeArea>
    );
  }

  return <SymptomAssessmentContent />;
};

export default SymptomAssessmentScreen;
