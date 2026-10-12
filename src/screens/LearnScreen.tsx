import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Button } from "../components/Button";
import { Confetti } from "../components/Confetti";
import { FlipCard } from "../components/FlipCard";
import { PressableScale } from "../components/PressableScale";
import {
  getSessionWords,
  getWordsStats,
  markWordAsReview,
  resetProgressOnly,
  Word,
  WordsStats,
} from "../db/database";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { Theme } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import { confirmResetProgress, showErrorAlert } from "../utils/alerts";
import { getPlanNoteText, getSessionPlan } from "../utils/sessionPlan";

// Паддинг дорожки-переключателя источника слов (он же — отступ ползунка)
const TRACK_PADDING = 4;

// Диапазон высоты, за который прозрачность примечания доходит до 1
const NOTE_OPACITY_RANGE = 16;

// Экран завершения: диаметр бейджа, число групп появления
// (бейдж, заголовок, текст, кнопки) и интервал обновления счётчика (~30/с)
const BADGE_SIZE = 88;
const COMPLETION_GROUP_COUNT = 4;
const COUNT_UPDATE_INTERVAL_MS = 33;

// Крупные цифры (счётчик степпера, полоса статистики) растут с системным
// размером шрифта не больше чем в 1.2 раза — иначе ломают раскладку
const BIG_DIGITS_MAX_FONT_SCALE = 1.2;

export const LearnScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [source, setSource] = useState<"custom" | "dictionary">("custom");
  const [sessionSize, setSessionSize] = useState<number>(10);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setStats] = useState<WordsStats>({
    newCustom: 0,
    newDict: 0,
    totalNew: 0,
    review: 0,
    learned: 0,
  });

  // Состояния сессии
  const [sessionWords, setSessionWords] = useState<Word[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);

  // Размер последней сессии держим в ref: к экрану завершения sessionWords
  // уже сброшен в null
  const lastSessionLengthRef = useRef(0);
  if (sessionWords) {
    lastSessionLengthRef.current = sessionWords.length;
  }

  // До первой загрузки (успешной или нет) показываем только фон; экран
  // ошибки — лишь если статистика ещё ни разу не загрузилась
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const hasStatsRef = useRef(false);

  const loadStats = useCallback(async () => {
    try {
      const data = await getWordsStats();
      hasStatsRef.current = true;
      setStats(data);
      setLoadFailed(false);
      setIsLoaded(true);
    } catch {
      if (!hasStatsRef.current) {
        setLoadFailed(true);
      }
      setIsLoaded(true);
      showErrorAlert();
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats]),
  );

  // 7. СОСТАВ СЕССИИ: план считается так же, как getSessionWords загружает
  // слова (см. getSessionPlan)
  const {
    own: plannedOwn,
    dictionary: plannedDict,
    total: plannedTotal,
    ownShare,
    isOwnShort: isNoteVisible,
  } = getSessionPlan(source, sessionSize, stats);

  // Одна на экран подписка на "уменьшить движение" — ей пользуются и
  // переключатель источника, и степпер, и его кнопки, и примечание в плане
  const reduceMotion = useReduceMotion();

  // 8. ПРИМЕЧАНИЕ В КАРТОЧКЕ ПЛАНА: своя анимация высоты и прозрачности
  // (системная анимация раскладки надёжно работает только на iOS; высота +
  // interpolated opacity работают одинаково на обеих платформах). Текст
  // выводим синхронно в рендере (useMemo) и держим последний непустой в ref,
  // чтобы контент был полным уже на первом замере и не исчезал при сворачивании
  const noteText = useMemo(
    () =>
      getPlanNoteText(
        { isOwnShort: isNoteVisible, dictionary: plannedDict },
        stats.newCustom,
      ),
    [isNoteVisible, plannedDict, stats.newCustom],
  );
  const lastNoteTextRef = useRef("");
  if (noteText) {
    lastNoteTextRef.current = noteText;
  }
  const noteContentText = noteText || lastNoteTextRef.current;

  const [noteContentHeight, setNoteContentHeight] = useState(0);
  const noteHeight = useRef(new Animated.Value(0)).current;
  const noteOpacity = noteHeight.interpolate({
    inputRange: [0, NOTE_OPACITY_RANGE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const isFirstNoteRender = useRef(true);

  useEffect(() => {
    const targetHeight = isNoteVisible ? noteContentHeight : 0;
    // Без анимации — только если примечание видно сразу при монтировании
    // (до первого замера) и при «уменьшить движение»; появление после
    // скрытого состояния раскрывается от 0 до замеренной высоты
    if (reduceMotion || (isFirstNoteRender.current && isNoteVisible)) {
      noteHeight.setValue(targetHeight);
    } else {
      Animated.timing(noteHeight, {
        toValue: targetHeight,
        duration: 220,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }).start();
    }
    if (!isNoteVisible || noteContentHeight > 0) {
      isFirstNoteRender.current = false;
    }
  }, [isNoteVisible, noteContentHeight, noteHeight, reduceMotion]);

  const handleNoteLayout = (event: LayoutChangeEvent) => {
    // Скрытое примечание не меряем: строка с паддингом и иконкой имеет
    // ненулевую высоту даже без текста, и такой замер был бы устаревшим
    if (!isNoteVisible) return;
    const height = event.nativeEvent.layout.height;
    if (height > 0) {
      setNoteContentHeight(height);
    }
  };

  const handleStart = async () => {
    lastSessionLengthRef.current = 0;
    try {
      const words = await getSessionWords(source, sessionSize);
      if (words.length === 0) {
        setShowCompletion(true);
        return;
      }
      setShowCompletion(false);
      setSessionWords(words);
      setCurrentIndex(0);
    } catch {
      showErrorAlert();
    }
  };

  const handleResetProgress = () => {
    confirmResetProgress(async () => {
      try {
        await resetProgressOnly();
        const data = await getWordsStats();
        setStats(data);
      } catch {
        showErrorAlert();
      }
    });
  };

  const handleSourceChange = (nextSource: "custom" | "dictionary") => {
    setSource(nextSource);
    void Haptics.selectionAsync().catch(() => {});
  };

  // 5. ПЕРЕКЛЮЧАТЕЛЬ ИСТОЧНИКА: скользящий "ползунок" между позициями
  const [trackWidth, setTrackWidth] = useState<number>(0);
  const thumbWidth =
    trackWidth > 0 ? (trackWidth - 2 * TRACK_PADDING) / 2 : 0;
  const selectedIndex = source === "custom" ? 0 : 1;
  const thumbTranslateX = useRef(new Animated.Value(0)).current;
  const hasLaidOut = useRef(false);

  // Укладка трека: измеряем ширину для ползунка; ползунок ставим сразу,
  // без анимации
  const handleTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  useEffect(() => {
    if (trackWidth === 0) return;
    const targetX = selectedIndex * thumbWidth;
    if (!hasLaidOut.current || reduceMotion) {
      thumbTranslateX.setValue(targetX);
    } else {
      Animated.spring(thumbTranslateX, {
        toValue: targetX,
        speed: 18,
        bounciness: 4,
        useNativeDriver: true,
      }).start();
    }
    hasLaidOut.current = true;
  }, [trackWidth, thumbWidth, selectedIndex, thumbTranslateX, reduceMotion]);

  // 6. СТЕППЕР РАЗМЕРА СЕССИИ: пульс числа при изменении (не на первом рендере)
  const numberScale = useRef(new Animated.Value(1)).current;
  const prevSessionSize = useRef<number | null>(null);
  useEffect(() => {
    if (prevSessionSize.current === null) {
      prevSessionSize.current = sessionSize;
      return;
    }
    if (prevSessionSize.current === sessionSize) return;
    prevSessionSize.current = sessionSize;
    if (reduceMotion) return;
    Animated.sequence([
      Animated.timing(numberScale, {
        toValue: 1.15,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(numberScale, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [sessionSize, numberScale, reduceMotion]);

  // Полоса состава: ширина оранжевого сегмента анимируется (width —
  // layout-свойство, поэтому useNativeDriver: false)
  const ownShareWidth = useRef(new Animated.Value(0)).current;
  const hasBarLaidOut = useRef(false);
  useEffect(() => {
    if (plannedTotal === 0) return;
    const target = ownShare * 100;
    if (!hasBarLaidOut.current || reduceMotion) {
      ownShareWidth.setValue(target);
    } else {
      Animated.timing(ownShareWidth, {
        toValue: target,
        duration: 220,
        useNativeDriver: false,
      }).start();
    }
    hasBarLaidOut.current = true;
  }, [ownShare, plannedTotal, ownShareWidth, reduceMotion]);
  const ownSharePercent = ownShareWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  const decreaseSessionSize = () => {
    const nextSize = Math.max(5, sessionSize - 5);
    if (nextSize === sessionSize) return;
    setSessionSize(nextSize);
    void Haptics.selectionAsync().catch(() => {});
  };

  const increaseSessionSize = () => {
    const nextSize = Math.min(50, sessionSize + 5);
    if (nextSize === sessionSize) return;
    setSessionSize(nextSize);
    void Haptics.selectionAsync().catch(() => {});
  };

  const handleNextWord = async () => {
    if (!sessionWords || isProcessing) return;

    setIsProcessing(true);
    try {
      // Переводим пройденное слово в 'review'
      const currentWord = sessionWords[currentIndex];
      await markWordAsReview(currentWord.id);

      if (currentIndex + 1 < sessionWords.length) {
        setCurrentIndex((prev) => prev + 1);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } else {
        // Сессия завершена. Статистику грузим до смены экрана, чтобы переход
        // сессия -> завершение прошёл одним рендером (без кадра с настройкой)
        const data = await getWordsStats();
        setStats(data);
        setShowCompletion(true);
        setSessionWords(null);
        setCurrentIndex(0);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
    } catch {
      // Ошибка до смены экрана: карточка остаётся на месте
      showErrorAlert();
    } finally {
      setIsProcessing(false);
    }
  };

  // 0. ЭКРАН: ДАННЫЕ ЕЩЁ НЕ ЗАГРУЖЕНЫ ИЛИ ПЕРВАЯ ЗАГРУЗКА НЕ УДАЛАСЬ
  if (!isLoaded) {
    return <View style={styles.container} />;
  }

  if (loadFailed) {
    return (
      <View
        style={[
          styles.emptyContainer,
          {
            paddingTop: Math.max(insets.top + 20, 32),
            paddingBottom: Math.max(insets.bottom + 20, 32),
          },
        ]}
      >
        <Ionicons
          name="alert-circle-outline"
          size={48}
          style={styles.errorIcon}
        />
        <Text style={styles.emptyTitle}>Не удалось загрузить данные</Text>
        <Button
          label="Повторить"
          onPress={loadStats}
          style={styles.retryButtonGap}
        />
      </View>
    );
  }

  // 1. ЭКРАН: АКТИВНАЯ СЕССИЯ ИЗУЧЕНИЯ КАРТОЧЕК
  if (sessionWords && sessionWords.length > 0) {
    const currentWord = sessionWords[currentIndex];

    return (
      <View
        style={[
          styles.sessionContainer,
          {
            paddingTop: Math.max(insets.top + 10, 24),
            paddingBottom: Math.max(insets.bottom + 12, 24),
          },
        ]}
      >
        {/* Верхняя панель: прогресс и кнопка закрытия */}
        <View style={styles.sessionHeader}>
          <View style={styles.progressPill}>
            <Text style={styles.progressText}>
              {currentIndex + 1} / {sessionWords.length}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setSessionWords(null)}
            activeOpacity={0.7}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Закрыть сессию"
          >
            <Ionicons name="close" size={22} style={styles.closeIcon} />
          </TouchableOpacity>
        </View>

        {/* 3D Карточка */}
        <View style={styles.cardWrapper}>
          <FlipCard key={currentWord.id} word={currentWord} />
        </View>

        {/* Кнопка "Далее" */}
        <Button
          label="Далее"
          variant="ink"
          onPress={handleNextWord}
          style={styles.nextButtonGap}
        />
      </View>
    );
  }

  // 2. ЭКРАН: СЕССИЯ ЗАВЕРШЕНА
  if (showCompletion) {
    return (
      <View
        style={[
          styles.emptyContainer,
          {
            paddingTop: Math.max(insets.top + 20, 32),
            paddingBottom: Math.max(insets.bottom + 20, 32),
          },
        ]}
      >
        <SessionComplete
          wordCount={lastSessionLengthRef.current}
          reduceMotion={reduceMotion}
          styles={styles}
          onReview={() => router.push("/review")}
          onContinue={() => setShowCompletion(false)}
        />
      </View>
    );
  }

  // 3. ЭКРАН: СЛОВА ЗАКОНЧИЛИСЬ
  if (stats.totalNew === 0) {
    return (
      <View
        style={[
          styles.emptyContainer,
          {
            paddingTop: Math.max(insets.top + 20, 32),
            paddingBottom: Math.max(insets.bottom + 20, 32),
          },
        ]}
      >
        <Ionicons
          name="checkmark-circle"
          size={64}
          style={styles.emptyIcon}
        />
        <Text style={styles.emptyTitle}>Новые слова закончились</Text>
        <Text style={styles.emptyText}>
          Можно сбросить прогресс и начать обучение заново или добавить
          собственные слова.
        </Text>
        <Button
          label="Добавить слова"
          onPress={() => router.push("/words")}
          style={styles.buttonGap}
        />
        <Button
          label="Сбросить прогресс"
          variant="secondary"
          onPress={handleResetProgress}
          style={styles.buttonGap}
        />
      </View>
    );
  }

  // 4. ЭКРАН: НАСТРОЙКА СЕССИИ (ГЛАВНЫЙ)
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: Math.max(insets.top + 12, 24),
          paddingBottom: 16,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>ЕЖЕДНЕВНАЯ ПРАКТИКА</Text>
      <Text style={styles.title}>Учить слова</Text>
      <Text style={styles.subtitle}>
        Короткая сессия сегодня лучше длинного перерыва.
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text
            style={styles.statValue}
            maxFontSizeMultiplier={BIG_DIGITS_MAX_FONT_SCALE}
          >
            {stats.totalNew}
          </Text>
          <Text style={styles.statLabel}>Новые</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text
            style={styles.statValue}
            maxFontSizeMultiplier={BIG_DIGITS_MAX_FONT_SCALE}
          >
            {stats.review}
          </Text>
          <Text style={styles.statLabel}>Повторить</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text
            style={styles.statValue}
            maxFontSizeMultiplier={BIG_DIGITS_MAX_FONT_SCALE}
          >
            {stats.learned}
          </Text>
          <Text style={styles.statLabel}>Выучено</Text>
        </View>
      </View>

      <Text style={styles.label}>Источник слов</Text>
      <View style={styles.toggleRow} onLayout={handleTrackLayout}>
        {thumbWidth > 0 && (
          <Animated.View
            style={[
              styles.toggleThumb,
              {
                width: thumbWidth,
                transform: [{ translateX: thumbTranslateX }],
              },
            ]}
            pointerEvents="none"
          />
        )}
        <PressableScale
          style={styles.toggleBtn}
          onPress={() => handleSourceChange("custom")}
          pressedScale={0.98}
          accessibilityState={{ selected: source === "custom" }}
        >
          <Text
            style={[
              styles.toggleText,
              source === "custom" && styles.toggleTextActive,
            ]}
          >
            Свои слова
          </Text>
        </PressableScale>

        <PressableScale
          style={styles.toggleBtn}
          onPress={() => handleSourceChange("dictionary")}
          pressedScale={0.98}
          accessibilityState={{ selected: source === "dictionary" }}
        >
          <Text
            style={[
              styles.toggleText,
              source === "dictionary" && styles.toggleTextActive,
            ]}
          >
            Словарь
          </Text>
        </PressableScale>
      </View>

      <View style={styles.planCard}>
        <Text style={styles.planCardLabel}>Слов за сессию</Text>
        <View style={styles.planStepperRow}>
          <StepperButton
            onPress={decreaseSessionSize}
            disabled={sessionSize <= 5}
            accessibilityLabel="Уменьшить количество"
            icon="remove"
            styles={styles}
          />
          <View style={styles.counterValueWrap}>
            <Animated.Text
              style={[
                styles.counterValue,
                { transform: [{ scale: numberScale }] },
              ]}
              maxFontSizeMultiplier={BIG_DIGITS_MAX_FONT_SCALE}
            >
              {sessionSize}
            </Animated.Text>
            <Text style={styles.counterUnit}>слов</Text>
          </View>
          <StepperButton
            onPress={increaseSessionSize}
            disabled={sessionSize >= 50}
            accessibilityLabel="Увеличить количество"
            icon="add"
            styles={styles}
          />
        </View>

        <View style={styles.planDivider} />
        <View style={styles.planHeaderRow}>
          <Text style={styles.planTitle}>План на сессию</Text>
          <Text style={styles.planAvailable}>
            Новых доступно: {stats.totalNew}
          </Text>
        </View>

        <View
          style={[
            styles.planBar,
            plannedTotal === 0 && styles.planBarEmpty,
          ]}
          accessibilityLabel={`Свои слова ${plannedOwn}, из словаря ${plannedDict}`}
        >
          {plannedTotal > 0 && (
            <Animated.View
              style={[
                styles.planBarSegment,
                { width: ownSharePercent },
              ]}
            />
          )}
        </View>

        <View style={styles.planLegendRow}>
          <View style={styles.planLegendItem}>
            <View
              style={[styles.planDot, styles.planDotOwn]}
            />
            <Text style={styles.planLegendText}>Свои {plannedOwn}</Text>
          </View>
          <View style={styles.planLegendItem}>
            <View
              style={[styles.planDot, styles.planDotDict]}
            />
            <Text style={styles.planLegendText}>
              Из словаря {plannedDict}
            </Text>
          </View>
          <Text style={styles.planReviewText}>
            Повтор: {stats.review}
          </Text>
        </View>

        <Animated.View
          style={[styles.planNoteWrap, { height: noteHeight, opacity: noteOpacity }]}
          accessibilityElementsHidden={!isNoteVisible}
          importantForAccessibility={
            !isNoteVisible ? "no-hide-descendants" : "auto"
          }
        >
          {/* key по видимости: при появлении строка монтируется заново,
              и onLayout гарантированно даёт свежий замер */}
          <View
            key={isNoteVisible ? "visible" : "hidden"}
            style={styles.planNoteRow}
            onLayout={handleNoteLayout}
          >
            <Ionicons
              name="information-circle-outline"
              size={16}
              style={styles.planNoteIcon}
            />
            <Text style={styles.planNoteText}>{noteContentText}</Text>
          </View>
        </Animated.View>
      </View>

      <Button
        label="Начать сессию"
        onPress={handleStart}
        style={styles.buttonGap}
      />
    </ScrollView>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.pageBackground,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  sessionContainer: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: theme.pageBackground,
    justifyContent: "space-between",
  },
  cardWrapper: {
    flex: 1,
    justifyContent: "center",
    marginVertical: 16,
  },
  eyebrow: {
    color: theme.amberAccent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 7,
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: theme.textPrimary,
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
    marginBottom: 22,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.textMutedAlt,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 15,
  },
  statsRow: {
    backgroundColor: theme.inkCardBackground,
    borderRadius: 20,
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 12,
    marginBottom: 5,
  },
  statItem: { alignItems: "center", flex: 1 },
  statValue: {
    color: theme.inkCardText,
    fontSize: 24,
    fontWeight: "900",
  },
  statLabel: {
    color: theme.inkCardSubtext,
    fontSize: 11,
    marginTop: 4,
    fontWeight: "600",
  },
  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: theme.inkCardDivider,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: theme.secondaryControlBackground,
    borderRadius: 15,
    padding: TRACK_PADDING,
  },
  toggleThumb: {
    position: "absolute",
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    borderRadius: 10,
    backgroundColor: theme.orangeAccent,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
  },
  toggleText: {
    fontWeight: "600",
    color: theme.textTertiary,
    fontSize: 14,
  },
  toggleTextActive: { color: theme.textOnAccent },
  counterBtn: {
    width: 48,
    height: 48,
    backgroundColor: theme.surfaceElevated,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    justifyContent: "center",
    alignItems: "center",
  },
  counterBtnIcon: {
    color: theme.textEmphasis,
  },
  planCard: {
    backgroundColor: theme.surface,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: 15,
  },
  planCardLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.textMutedAlt,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  planStepperRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  counterValueWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: {
    fontSize: 44,
    fontWeight: "800",
    color: theme.textEmphasis,
    fontVariant: ["tabular-nums"],
    lineHeight: 48,
  },
  counterUnit: {
    fontSize: 12,
    color: theme.textMuted,
  },
  planDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.border,
    marginVertical: 12,
  },
  planHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  planTitle: {
    color: theme.textEmphasis,
    fontSize: 15,
    fontWeight: "600",
  },
  planAvailable: {
    fontSize: 12,
    color: theme.textMuted,
  },
  planBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: theme.linkBlue,
  },
  planBarEmpty: {
    backgroundColor: theme.borderSubtle,
  },
  planBarSegment: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.orangeAccent,
  },
  planLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    flexWrap: "wrap",
    columnGap: 14,
    rowGap: 4,
  },
  planLegendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  planDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  planDotOwn: { backgroundColor: theme.orangeAccent },
  planDotDict: { backgroundColor: theme.linkBlue },
  planLegendText: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  planReviewText: {
    fontSize: 12,
    color: theme.textMuted,
    marginLeft: "auto",
  },
  planNoteWrap: {
    overflow: "hidden",
  },
  planNoteRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    // Отступ сверху — паддингом, а не marginTop: onLayout не включает
    // margin в высоту, и обёртка получалась ниже контента (текст обрезался)
    paddingTop: 10,
    columnGap: 6,
  },
  planNoteIcon: {
    color: theme.amberAccent,
  },
  planNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: theme.amberAccent,
  },
  buttonGap: {
    marginTop: 10,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressPill: {
    backgroundColor: theme.buttonInk,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  progressText: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.textOnButtonInk,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.secondaryControlBackgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: {
    color: theme.textTertiary,
  },
  nextButtonGap: {
    marginBottom: 10,
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.pageBackground,
  },
  emptyIcon: {
    color: theme.successIcon,
    marginBottom: 16,
  },
  errorIcon: {
    color: theme.textMuted,
    marginBottom: 16,
  },
  retryButtonGap: {
    marginTop: 24,
  },
  completionContent: {
    width: "100%",
    alignItems: "center",
  },
  completionGroup: {
    width: "100%",
    alignItems: "center",
  },
  badgeWrap: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    marginBottom: 20,
  },
  badgePulse: {
    ...StyleSheet.absoluteFill,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: 2,
    borderColor: theme.successBorder,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: theme.successBackground,
    borderWidth: 2,
    borderColor: theme.successBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeIcon: {
    color: theme.successText,
  },
  completionCount: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    marginTop: 6,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.textEmphasis,
    textAlign: "center",
  },
  emptyText: {
    color: theme.textMutedAlt,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 20,
  },
});

type StepperButtonProps = {
  onPress: () => void;
  disabled: boolean;
  accessibilityLabel: string;
  icon: "remove" | "add";
  styles: ReturnType<typeof createStyles>;
};

// 7. КНОПКА СТЕППЕРА: нажатие сжимает её до 0.92 (PressableScale)
const StepperButton = ({
  onPress,
  disabled,
  accessibilityLabel,
  icon,
  styles,
}: StepperButtonProps) => (
  <PressableScale
    onPress={onPress}
    disabled={disabled}
    pressedScale={0.92}
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }}
    style={[styles.counterBtn, { opacity: disabled ? 0.35 : 1 }]}
  >
    <Ionicons name={icon} size={22} style={styles.counterBtnIcon} />
  </PressableScale>
);

type SessionCompleteProps = {
  wordCount: number;
  reduceMotion: boolean;
  styles: ReturnType<typeof createStyles>;
  onReview: () => void;
  onContinue: () => void;
};

// 8. ЭКРАН ЗАВЕРШЕНИЯ: группы появляются с подъёмом по очереди, бейдж
// «выпрыгивает» пружиной с одним пульсом кольца, над ним — конфетти,
// счётчик слов набирается от 0. Монтируется заново при каждом показе, поэтому
// анимации проигрываются каждый раз; при "уменьшить движение" — всё сразу.
// Если настройку включили посреди появления, оно обрывается на финальном
// состоянии и больше не проигрывается (в том числе после её выключения)
const SessionComplete = ({
  wordCount,
  reduceMotion,
  styles,
  onReview,
  onContinue,
}: SessionCompleteProps) => {
  const [isStatic, setIsStatic] = useState(reduceMotion);
  const [groups] = useState(() =>
    Array.from(
      { length: COMPLETION_GROUP_COUNT },
      () => new Animated.Value(reduceMotion ? 1 : 0),
    ),
  );
  const [badgeScale] = useState(
    () => new Animated.Value(reduceMotion ? 1 : 0.6),
  );
  const [pulse] = useState(() => new Animated.Value(0));
  const [countValue] = useState(() => new Animated.Value(0));
  const [displayCount, setDisplayCount] = useState(
    reduceMotion ? wordCount : 0,
  );
  const [confettiOriginY, setConfettiOriginY] = useState<number | null>(null);
  // Пустая сессия: без счётчика, пульса кольца и конфетти
  const hasWords = wordCount > 0;

  const groupStyles = useMemo(
    () =>
      groups.map((value) => ({
        opacity: value,
        transform: [
          {
            translateY: value.interpolate({
              inputRange: [0, 1],
              outputRange: [16, 0],
            }),
          },
        ],
      })),
    [groups],
  );
  const pulseStyle = useMemo(
    () => ({
      opacity: pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.4, 0],
      }),
      transform: [
        {
          scale: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.5],
          }),
        },
      ],
    }),
    [pulse],
  );

  useEffect(() => {
    if (isStatic) return;
    if (reduceMotion) {
      // Очистка прошлого запуска уже остановила анимации — ставим финал
      groups.forEach((value) => value.setValue(1));
      badgeScale.setValue(1);
      setDisplayCount(wordCount);
      setIsStatic(true);
      return;
    }

    const entrance = Animated.parallel([
      Animated.stagger(
        80,
        groups.map((value) =>
          Animated.timing(value, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ),
      ),
      Animated.sequence([
        Animated.delay(120),
        Animated.parallel([
          Animated.spring(badgeScale, {
            toValue: 1,
            friction: 5,
            tension: 120,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);

    // Счётчик живёт в JS (значение читает слушатель), поэтому без нативного
    // драйвера; состояние обновляем не чаще ~30 раз в секунду
    let lastUpdate = 0;
    const listenerId = countValue.addListener(({ value }) => {
      const now = Date.now();
      if (now - lastUpdate < COUNT_UPDATE_INTERVAL_MS) return;
      lastUpdate = now;
      setDisplayCount(Math.round(value));
    });
    const countUp = Animated.timing(countValue, {
      toValue: wordCount,
      duration: 700,
      delay: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    entrance.start();
    countUp.start(({ finished }) => {
      if (finished) setDisplayCount(wordCount);
    });
    return () => {
      entrance.stop();
      countUp.stop();
      countValue.removeListener(listenerId);
    };
  }, [isStatic, reduceMotion, wordCount, groups, badgeScale, pulse, countValue]);

  // Точка старта конфетти — верх блока (над бейджем); замеряем один раз
  const handleContentLayout = (event: LayoutChangeEvent) => {
    const { y } = event.nativeEvent.layout;
    setConfettiOriginY((prev) => prev ?? y);
  };

  return (
    <>
      <View style={styles.completionContent} onLayout={handleContentLayout}>
        <Animated.View style={[styles.badgeWrap, groupStyles[0]]}>
          {!isStatic && hasWords && (
            <Animated.View style={[styles.badgePulse, pulseStyle]} />
          )}
          <Animated.View
            style={[styles.badge, { transform: [{ scale: badgeScale }] }]}
          >
            <Ionicons name="checkmark" size={44} style={styles.badgeIcon} />
          </Animated.View>
        </Animated.View>
        <Animated.View style={[styles.completionGroup, groupStyles[1]]}>
          <Text style={styles.emptyTitle}>Сессия завершена</Text>
          {hasWords && (
            <Text style={styles.completionCount}>
              Слов в сессии: {displayCount}
            </Text>
          )}
        </Animated.View>
        <Animated.View style={[styles.completionGroup, groupStyles[2]]}>
          <Text style={styles.emptyText}>
            Слова отправлены на повторение. Можно закрепить их прямо сейчас
            или продолжить обучение.
          </Text>
        </Animated.View>
        <Animated.View style={[styles.completionGroup, groupStyles[3]]}>
          <Button
            label="Перейти к повторению"
            onPress={onReview}
            style={styles.buttonGap}
          />
          <Button
            label="Продолжить обучение"
            variant="secondary"
            onPress={onContinue}
            style={styles.buttonGap}
          />
        </Animated.View>
      </View>
      {!isStatic && hasWords && confettiOriginY !== null && (
        <Confetti originY={confettiOriginY} />
      )}
    </>
  );
};
