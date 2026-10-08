import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  LayoutChangeEvent,
  Pressable,
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
import { FlipCard } from "../components/FlipCard";
import {
  getSessionWords,
  getWordsStats,
  markWordAsReview,
  resetProgressOnly,
  Word,
} from "../db/database";
import { Theme } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

// Общая геометрия дорожек-переключателей (источник слов / размер сессии):
// TRACK_PADDING — паддинг обеих дорожек, TRACK_INNER_HEIGHT — высота
// внутренней части (кнопка 12+12 вертикального паддинга + строка текста),
// используется до первого onLayout дорожки-переключателя
const TRACK_PADDING = 4;
const TRACK_INNER_HEIGHT = 44;

export const LearnScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [source, setSource] = useState<"custom" | "dictionary">("custom");
  const [sessionSize, setSessionSize] = useState<number>(10);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setStats] = useState({
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

  useFocusEffect(
    useCallback(() => {
      async function loadStats() {
        const data = await getWordsStats();
        setStats(data);
      }
      loadStats();
    }, []),
  );

  const missingCustomCount =
    source === "custom" && stats.newCustom < sessionSize
      ? sessionSize - stats.newCustom
      : 0;

  const handleStart = async () => {
    const words = await getSessionWords(source, sessionSize);
    if (words.length === 0) {
      setShowCompletion(true);
      return;
    }
    setShowCompletion(false);
    setSessionWords(words);
    setCurrentIndex(0);
  };

  const handleResetProgress = async () => {
    await resetProgressOnly();
    const data = await getWordsStats();
    setStats(data);
  };

  const handleSourceChange = (nextSource: "custom" | "dictionary") => {
    setSource(nextSource);
    void Haptics.selectionAsync().catch(() => {});
  };

  // 5. ПЕРЕКЛЮЧАТЕЛЬ ИСТОЧНИКА: скользящий "ползунок" между позициями
  // (геометрия трека переиспользуется степпером размера сессии ниже)
  const [trackSize, setTrackSize] = useState({ width: 0, height: 0 });
  const thumbWidth =
    trackSize.width > 0 ? (trackSize.width - 2 * TRACK_PADDING) / 2 : 0;
  const selectedIndex = source === "custom" ? 0 : 1;
  const thumbTranslateX = useRef(new Animated.Value(0)).current;
  const hasLaidOut = useRef(false);
  // Одна на экран проверка "уменьшить движение" — ей пользуются и
  // переключатель источника, и степпер, и его кнопки
  const [reduceMotion, setReduceMotion] = useState(false);

  // Укладка трека: запоминаем ширину (ползунок) и высоту (степпер),
  // ползунок ставим сразу, без анимации
  const handleTrackLayout = (event: LayoutChangeEvent) => {
    setTrackSize({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
  };

  useEffect(() => {
    if (trackSize.width === 0) return;
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
  }, [trackSize.width, thumbWidth, selectedIndex, thumbTranslateX, reduceMotion]);

  useEffect(() => {
    // Ослабленная анимация по системной настройке — ставим позицию без пружины
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
  }, []);

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
        // Сессия завершена
        setSessionWords(null);
        setCurrentIndex(0);
        const data = await getWordsStats();
        setStats(data);
        setShowCompletion(true);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
    } finally {
      setIsProcessing(false);
    }
  };

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
          >
            <Text style={styles.closeBtn}>×</Text>
          </TouchableOpacity>
        </View>

        {/* 3D Карточка */}
        <View style={styles.cardWrapper}>
          <FlipCard word={currentWord} />
        </View>

        {/* Кнопка "Далее" */}
        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNextWord}
          disabled={isProcessing}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>Далее</Text>
        </TouchableOpacity>
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
        <Text style={styles.emptyIcon}>✓</Text>
        <Text style={styles.emptyTitle}>Сессия завершена</Text>
        <Text style={styles.emptyText}>
          Слова отправлены на повторение. Можно закрепить их прямо сейчас или
          продолжить обучение.
        </Text>
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => router.push("/review")}
        >
          <Text style={styles.startButtonText}>Перейти к повторению</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setShowCompletion(false)}
        >
          <Text style={styles.secondaryButtonText}>Продолжить обучение</Text>
        </TouchableOpacity>
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
        <Text style={styles.emptyIcon}>✓</Text>
        <Text style={styles.emptyTitle}>Новые слова закончились</Text>
        <Text style={styles.emptyText}>
          Можно сбросить прогресс и начать обучение заново или добавить
          собственные слова.
        </Text>
        <TouchableOpacity
          style={styles.startButton}
          onPress={handleResetProgress}
        >
          <Text style={styles.startButtonText}>Сбросить прогресс</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/words")}
        >
          <Text style={styles.secondaryButtonText}>Добавить слова</Text>
        </TouchableOpacity>
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
          <Text style={styles.statValue}>{stats.totalNew}</Text>
          <Text style={styles.statLabel}>Новые</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.review}</Text>
          <Text style={styles.statLabel}>Повторить</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.learned}</Text>
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
        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={() => handleSourceChange("custom")}
        >
          <Text
            style={[
              styles.toggleText,
              source === "custom" && styles.toggleTextActive,
            ]}
          >
            Свои слова
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={() => handleSourceChange("dictionary")}
        >
          <Text
            style={[
              styles.toggleText,
              source === "dictionary" && styles.toggleTextActive,
            ]}
          >
            Словарь
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Слов за сессию</Text>
      <View
        style={[
          styles.counterRow,
          trackSize.height > 0 && { height: trackSize.height },
        ]}
      >
        <StepperButton
          onPress={decreaseSessionSize}
          disabled={sessionSize <= 5}
          accessibilityLabel="Меньше слов"
          icon="remove"
          reduceMotion={reduceMotion}
          styles={styles}
        />
        <View style={styles.counterValueWrap}>
          <Animated.Text
            style={[
              styles.counterValue,
              { transform: [{ scale: numberScale }] },
            ]}
          >
            {sessionSize}
          </Animated.Text>
        </View>
        <StepperButton
          onPress={increaseSessionSize}
          disabled={sessionSize >= 50}
          accessibilityLabel="Больше слов"
          icon="add"
          reduceMotion={reduceMotion}
          styles={styles}
        />
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <Text style={styles.infoTitle}>План на сессию</Text>
          <Text style={styles.infoCount}>{sessionSize} слов</Text>
        </View>
        <Text style={styles.infoText}>
          Доступно новых слов: <Text style={styles.bold}>{stats.totalNew}</Text>
        </Text>
        {missingCustomCount > 0 && (
          <Text style={styles.warningText}>
            💡 Своих слов не хватает ({stats.newCustom}), добавим{" "}
            {missingCustomCount} из словаря
          </Text>
        )}
        <Text style={styles.infoSubText}>
          На повторении ждет: {stats.review}
        </Text>
      </View>

      <TouchableOpacity style={styles.startButton} onPress={handleStart}>
        <Text style={styles.startButtonText}>Начать сессию</Text>
      </TouchableOpacity>
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
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.secondaryControlBackground,
    borderRadius: 15,
    padding: TRACK_PADDING,
    minHeight: TRACK_INNER_HEIGHT + 2 * TRACK_PADDING,
  },
  counterBtn: {
    width: 56,
    height: TRACK_INNER_HEIGHT,
    backgroundColor: theme.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  stepperPressArea: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "center",
    alignItems: "center",
  },
  counterBtnIcon: {
    color: theme.textEmphasis,
  },
  counterValueWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: {
    fontSize: 30,
    fontWeight: "800",
    color: theme.textEmphasis,
    fontVariant: ["tabular-nums"],
  },
  infoCard: {
    backgroundColor: theme.surface,
    padding: 18,
    borderRadius: 20,
    marginVertical: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  infoTitle: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  infoCount: {
    color: theme.statAmber,
    fontSize: 12,
    fontWeight: "800",
  },
  infoText: {
    fontSize: 15,
    color: theme.textSecondary,
    marginBottom: 6,
  },
  infoSubText: {
    fontSize: 13,
    color: theme.textMutedSoft,
    marginTop: 4,
  },
  bold: { fontWeight: "700", color: theme.textEmphasis },
  warningText: {
    fontSize: 13,
    color: theme.orangeAccent,
    marginVertical: 6,
    lineHeight: 18,
  },
  startButton: {
    backgroundColor: theme.orangeAccent,
    minHeight: 54,
    width: "100%",
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  startButtonText: {
    color: theme.textOnAccent,
    fontSize: 16,
    fontWeight: "700",
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
  closeBtn: {
    fontSize: 25,
    lineHeight: 27,
    fontWeight: "400",
    color: theme.textTertiary,
  },
  nextButton: {
    backgroundColor: theme.buttonInk,
    minHeight: 54,
    width: "100%",
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  nextButtonText: {
    color: theme.textOnButtonInk,
    fontSize: 16,
    fontWeight: "700",
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.pageBackground,
  },
  emptyIcon: {
    fontSize: 54,
    color: theme.successIcon,
    marginBottom: 16,
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
  secondaryButton: {
    borderWidth: 1,
    borderColor: theme.secondaryButtonBorder,
    minHeight: 52,
    width: "100%",
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  secondaryButtonText: {
    color: theme.textSecondary,
    fontSize: 16,
    fontWeight: "700",
  },
});

type StepperButtonProps = {
  onPress: () => void;
  disabled: boolean;
  accessibilityLabel: string;
  icon: "remove" | "add";
  reduceMotion: boolean;
  styles: ReturnType<typeof createStyles>;
};

// 7. КНОПКА СТЕППЕРА: нажатие сжимает её до 0.92, отпускание возвращает
// пружиной; при системной настройке "уменьшить движение" анимации нет
const StepperButton = ({
  onPress,
  disabled,
  accessibilityLabel,
  icon,
  reduceMotion,
  styles,
}: StepperButtonProps) => {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) => {
    if (reduceMotion) {
      scale.setValue(toValue);
      return;
    }
    Animated.spring(scale, {
      toValue,
      speed: 18,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.counterBtn,
        {
          transform: [{ scale }],
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => animateTo(0.92)}
        onPressOut={() => animateTo(1)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        style={styles.stepperPressArea}
      >
        <Ionicons name={icon} size={22} style={styles.counterBtnIcon} />
      </Pressable>
    </Animated.View>
  );
};
