import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getReviewWords,
  markWordAsLearned,
  resetProgressOnly,
  Word,
} from "../db/database";
import { FlipCard } from "../components/FlipCard";

export const ReviewScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reviewWords, setReviewWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const loadWords = useCallback(async () => {
    const words = await getReviewWords();
    setReviewWords(words);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, []);

  // Загружаем актуальные слова на повторение при каждом переходе на экран
  useFocusEffect(
    useCallback(() => {
      loadWords();
    }, [loadWords]),
  );

  const handleForgot = () => {
    // Слово остаётся в статусе 'review'. Переходим к следующему
    nextCard();
  };

  const handleRemembered = async () => {
    if (reviewWords.length === 0) return;

    // Переводим слово в статус 'learned'
    const currentWord = reviewWords[currentIndex];
    await markWordAsLearned(currentWord.id);

    // Удаляем выученное слово из текущего локального списка
    const updated = reviewWords.filter((_, idx) => idx !== currentIndex);
    setReviewWords(updated);

    if (currentIndex >= updated.length) {
      setCurrentIndex(0);
    }
    setIsFlipped(false);
  };

  const nextCard = () => {
    if (currentIndex + 1 < reviewWords.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setCurrentIndex(0);
    }
    setIsFlipped(false);
  };

  const handleResetProgress = async () => {
    await resetProgressOnly();
    await loadWords();
  };

  // ЕСЛИ СЛОВ НА ПОВТОРЕНИЕ НЕТ
  if (reviewWords.length === 0) {
    return (
      <View
        style={[
          styles.emptyContainer,
          {
            paddingTop: Math.max(insets.top + 16, 24),
            paddingBottom: 24,
          },
        ]}
      >
        <Text style={styles.emptyIcon}>🎉</Text>
        <Text style={styles.emptyTitle}>Всё повторено!</Text>
        <Text style={styles.emptySubText}>
          На данный момент нет слов, требующих повторения. Изучите новые слова
          во вкладке «Учить».
        </Text>
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={handleResetProgress}
        >
          <Text style={styles.emptyButtonText}>Сбросить прогресс</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/")}
        >
          <Text style={styles.secondaryButtonText}>Учить новые слова</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentWord = reviewWords[currentIndex];

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top + 10, 20),
          paddingBottom: 16,
        },
      ]}
    >
      {/* Шапка с прогрессом */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ЦИКЛ ПОВТОРЕНИЯ</Text>
          <Text style={styles.title}>Повторение</Text>
        </View>
        <View style={styles.badgeCount}>
          <Text style={styles.badgeText}>
            {currentIndex + 1} из {reviewWords.length}
          </Text>
        </View>
      </View>

      {/* Интерактивная карточка */}
      <View style={styles.cardContainer}>
        <FlipCard word={currentWord} onFlipChange={setIsFlipped} />
      </View>

      {/* Кнопки ответа */}
      <View style={styles.actionsContainer}>
        {isFlipped ? (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.forgotBtn]}
              onPress={handleForgot}
              activeOpacity={0.8}
            >
              <Text style={styles.forgotBtnText}>Не вспомнил</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.rememberedBtn]}
              onPress={handleRemembered}
              activeOpacity={0.8}
            >
              <Text style={styles.rememberedBtnText}>Вспомнил</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.flipHintText}>
            Переверните карточку, чтобы оценить свой ответ
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: "#F7F7F2",
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: {
    color: "#087443",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: { fontSize: 32, fontWeight: "900", color: "#17202A" },
  badgeCount: {
    backgroundColor: "#17202A",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
  },
  badgeText: { fontSize: 12, fontWeight: "800", color: "#FFFFFF" },
  cardContainer: {
    flex: 1,
    justifyContent: "center",
    marginVertical: 12,
  },
  actionsContainer: {
    marginBottom: 8,
    minHeight: 54,
    justifyContent: "center",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  forgotBtn: {
    backgroundColor: "#FFF1F0",
    borderWidth: 1,
    borderColor: "#F4B4AE",
  },
  forgotBtnText: { color: "#B42318", fontWeight: "800", fontSize: 14 },
  rememberedBtn: {
    backgroundColor: "#DDF4E8",
    borderWidth: 1,
    borderColor: "#8CCDA7",
  },
  rememberedBtnText: { color: "#087443", fontWeight: "800", fontSize: 14 },
  flipHintText: {
    textAlign: "center",
    color: "#7A858D",
    fontSize: 14,
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F7F7F2",
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#17202A",
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 15,
    color: "#68737D",
    textAlign: "center",
    lineHeight: 22,
  },
  emptyButton: {
    backgroundColor: "#D97706",
    minHeight: 54,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 22,
  },
  emptyButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#A7AAA3",
    minHeight: 54,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 10,
  },
  secondaryButtonText: { color: "#3F4A50", fontSize: 15, fontWeight: "800" },
});