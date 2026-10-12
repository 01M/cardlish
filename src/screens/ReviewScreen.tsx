import { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
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
import { Button } from "../components/Button";
import { FlipCard } from "../components/FlipCard";
import { PressableScale } from "../components/PressableScale";
import { Theme } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import { confirmResetProgress, showErrorAlert } from "../utils/alerts";
import { mergeReviewQueue, ReviewQueue } from "../utils/reviewQueue";

export const ReviewScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [queue, setQueue] = useState<ReviewQueue<Word>>({
    words: [],
    index: 0,
  });
  const { words: reviewWords, index: currentIndex } = queue;
  const [isFlipped, setIsFlipped] = useState(false);
  // Счётчик продвижений очереди: входит в key карточки, чтобы она
  // пересоздавалась лицевой стороной, даже если то же слово показано подряд
  const [advanceCount, setAdvanceCount] = useState(0);

  const loadWords = useCallback(async () => {
    try {
      const words = await getReviewWords();
      // Порядок и позиция сохраняются; карточка всегда открывается лицевой стороной
      setQueue((prev) => mergeReviewQueue(prev, words));
      setIsFlipped(false);
      setAdvanceCount((prev) => prev + 1);
    } catch {
      showErrorAlert();
    }
  }, []);

  // Сверяем очередь с базой при каждом переходе на экран
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

    try {
      // Переводим слово в статус 'learned'
      const currentWord = reviewWords[currentIndex];
      await markWordAsLearned(currentWord.id);

      // Удаляем выученное слово из текущего локального списка
      const updated = reviewWords.filter((_, idx) => idx !== currentIndex);
      setQueue({
        words: updated,
        index: currentIndex >= updated.length ? 0 : currentIndex,
      });
      setIsFlipped(false);
      setAdvanceCount((prev) => prev + 1);
    } catch {
      showErrorAlert();
    }
  };

  const nextCard = () => {
    setQueue({
      words: reviewWords,
      index: currentIndex + 1 < reviewWords.length ? currentIndex + 1 : 0,
    });
    setIsFlipped(false);
    setAdvanceCount((prev) => prev + 1);
  };

  const handleResetProgress = () => {
    confirmResetProgress(async () => {
      try {
        await resetProgressOnly();
        await loadWords();
      } catch {
        showErrorAlert();
      }
    });
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
          <Button
            label="Учить новые слова"
            onPress={() => router.push("/")}
            style={styles.emptyButtonGap}
          />
          <Button
            label="Сбросить прогресс"
            variant="secondary"
            onPress={handleResetProgress}
            style={styles.secondaryButtonGap}
          />
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
          <FlipCard
            key={`${currentWord.id}-${advanceCount}`}
            word={currentWord}
            onFlipChange={setIsFlipped}
          />
        </View>

        {/* Кнопки ответа */}
        <View style={styles.actionsContainer}>
          {isFlipped ? (
            <View style={styles.buttonRow}>
              <PressableScale
                style={[styles.actionBtn, styles.forgotBtn]}
                onPress={handleForgot}
              >
                <Text style={styles.forgotBtnText}>Не вспомнил</Text>
              </PressableScale>

              <PressableScale
                style={[styles.actionBtn, styles.rememberedBtn]}
                onPress={handleRemembered}
              >
                <Text style={styles.rememberedBtnText}>Вспомнил</Text>
              </PressableScale>
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
    color: theme.textMuted,
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
  emptyButtonGap: {
    marginTop: 22,
  },
  secondaryButtonGap: {
    marginTop: 10,
  },
});
