import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-screens/experimental";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  getReviewWords,
  markWordAsLearned,
  resetProgressOnly,
  Word,
} from "../db/database";
import { FlipCard } from "../components/FlipCard";
import { Theme } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

export const ReviewScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Слово остаётся в статусе 'review'. Переходим к следующему
    nextCard();
  };

  const handleRemembered = async () => {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
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
      <SafeAreaView
        edges={{ bottom: true }}
        style={styles.safeArea}
      >
        <View
          style={[
            styles.emptyContainer,
            {
              paddingTop: Math.max(insets.top + 16, 24),
              paddingBottom: 24,
            },
          ]}
        >
          <Ionicons
            name="checkmark-circle"
            size={64}
            style={styles.emptyIcon}
          />
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
      </SafeAreaView>
    );
  }

  const currentWord = reviewWords[currentIndex];

  return (
    <SafeAreaView edges={{ bottom: true }} style={styles.safeArea}>
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
    </SafeAreaView>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.pageBackground },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: theme.pageBackground,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: {
    color: theme.greenAccent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: theme.textPrimary,
  },
  badgeCount: {
    backgroundColor: theme.buttonInk,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.textOnButtonInk,
  },
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
    backgroundColor: theme.dangerBackground,
    borderWidth: 1,
    borderColor: theme.dangerBorder,
  },
  forgotBtnText: {
    color: theme.dangerText,
    fontWeight: "800",
    fontSize: 14,
  },
  rememberedBtn: {
    backgroundColor: theme.successBackground,
    borderWidth: 1,
    borderColor: theme.successBorder,
  },
  rememberedBtnText: {
    color: theme.successText,
    fontWeight: "800",
    fontSize: 14,
  },
  flipHintText: {
    textAlign: "center",
    color: theme.textMutedHint,
    fontSize: 14,
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.pageBackground,
  },
  emptyIcon: { color: theme.successIcon, marginBottom: 16 },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: theme.textPrimary,
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 15,
    color: theme.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyButton: {
    backgroundColor: theme.orangeAccent,
    minHeight: 54,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 22,
  },
  emptyButtonText: {
    color: theme.textOnAccent,
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: theme.secondaryButtonBorderAlt,
    minHeight: 54,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 10,
  },
  secondaryButtonText: {
    color: theme.textButtonSecondary,
    fontSize: 15,
    fontWeight: "800",
  },
});
