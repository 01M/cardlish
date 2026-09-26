import React, { useCallback, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlipCard } from "../components/FlipCard";
import {
  getSessionWords,
  getWordsStats,
  markWordAsReview,
  resetProgressOnly,
  Word,
} from "../db/database";

export const LearnScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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

  const handleNextWord = async () => {
    if (!sessionWords || isProcessing) return;

    setIsProcessing(true);
    try {
      // Переводим пройденное слово в 'review'
      const currentWord = sessionWords[currentIndex];
      await markWordAsReview(currentWord.id);

      if (currentIndex + 1 < sessionWords.length) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        // Сессия завершена
        setSessionWords(null);
        setCurrentIndex(0);
        const data = await getWordsStats();
        setStats(data);
        setShowCompletion(true);
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
          paddingBottom: Math.max(insets.bottom + 24, 40),
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
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[
            styles.toggleBtn,
            source === "custom" && styles.toggleBtnActive,
          ]}
          onPress={() => setSource("custom")}
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
          style={[
            styles.toggleBtn,
            source === "dictionary" && styles.toggleBtnActive,
          ]}
          onPress={() => setSource("dictionary")}
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
      <View style={styles.counterRow}>
        <TouchableOpacity
          style={styles.counterBtn}
          onPress={() => setSessionSize(Math.max(5, sessionSize - 5))}
        >
          <Text style={styles.counterBtnText}>-</Text>
        </TouchableOpacity>

        <Text style={styles.counterValue}>{sessionSize}</Text>

        <TouchableOpacity
          style={styles.counterBtn}
          onPress={() => setSessionSize(sessionSize + 5)}
        >
          <Text style={styles.counterBtnText}>+</Text>
        </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7F2",
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  sessionContainer: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: "#F7F7F2",
    justifyContent: "space-between",
  },
  cardWrapper: {
    flex: 1,
    justifyContent: "center",
    marginVertical: 16,
  },
  eyebrow: {
    color: "#B45309",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 7,
  },
  title: { fontSize: 32, fontWeight: "900", color: "#17202A" },
  subtitle: {
    color: "#68737D",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
    marginBottom: 22,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 15,
  },
  statsRow: {
    backgroundColor: "#17202A",
    borderRadius: 20,
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 12,
    marginBottom: 5,
  },
  statItem: { alignItems: "center", flex: 1 },
  statValue: { color: "#FFFFFF", fontSize: 24, fontWeight: "900" },
  statLabel: {
    color: "#B9C2C8",
    fontSize: 11,
    marginTop: 4,
    fontWeight: "600",
  },
  statDivider: { width: 1, height: 34, backgroundColor: "#3B4852" },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#E6E7E1",
    borderRadius: 15,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
  },
  toggleBtnActive: { backgroundColor: "#D97706" },
  toggleText: { fontWeight: "600", color: "#4B5563", fontSize: 14 },
  toggleTextActive: { color: "#FFFFFF" },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
  },
  counterBtn: {
    width: 52,
    height: 52,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E4E1D8",
  },
  counterBtnText: { fontSize: 24, fontWeight: "bold", color: "#111827" },
  counterValue: {
    fontSize: 28,
    fontWeight: "800",
    marginHorizontal: 30,
    color: "#111827",
  },
  infoCard: {
    backgroundColor: "#FFFDF8",
    padding: 18,
    borderRadius: 20,
    marginVertical: 20,
    borderWidth: 1,
    borderColor: "#E8E3D7",
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  infoTitle: { color: "#17202A", fontSize: 15, fontWeight: "800" },
  infoCount: { color: "#B45309", fontSize: 12, fontWeight: "800" },
  infoText: { fontSize: 15, color: "#374151", marginBottom: 6 },
  infoSubText: { fontSize: 13, color: "#9CA3AF", marginTop: 4 },
  bold: { fontWeight: "700", color: "#111827" },
  warningText: {
    fontSize: 13,
    color: "#D97706",
    marginVertical: 6,
    lineHeight: 18,
  },
  startButton: {
    backgroundColor: "#D97706",
    minHeight: 54,
    width: "100%",
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  startButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressPill: {
    backgroundColor: "#17202A",
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  progressText: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E8E7E0",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    fontSize: 25,
    lineHeight: 27,
    fontWeight: "400",
    color: "#4B5563",
  },
  nextButton: {
    backgroundColor: "#17202A",
    minHeight: 54,
    width: "100%",
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  nextButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F7F7F2",
  },
  emptyIcon: { fontSize: 54, color: "#059669", marginBottom: 16 },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#9CA3AF",
    minHeight: 52,
    width: "100%",
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  secondaryButtonText: { color: "#374151", fontSize: 16, fontWeight: "700" },
});