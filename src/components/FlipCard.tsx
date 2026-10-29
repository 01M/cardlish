import React, { useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  Animated,
  TouchableOpacity,
  Platform,
  ScrollView,
  ScrollViewInstance,
} from "react-native";
import { Word } from "../db/database";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { Theme } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

const FLIP_MS = 400;
// При "уменьшить движение" вместо 3D-поворота — короткая смена прозрачности
const CROSSFADE_MS = 200;

// Высота карточки фиксирована: обе стороны лежат друг на друге и должны
// совпадать по размеру во время поворота. Длинный текст оборота
// прокручивается внутри области между рядом бейджа (сверху) и симметричным
// отступом снизу, поэтому обычный контент остаётся точно по центру.
// Верх области: CARD_PADDING + BACK_SCROLL_INSET = 70 — ниже кнопки
// озвучки (top 22 + высота 40) с зазором 8
const CARD_HEIGHT = 370;
const CARD_PADDING = 28;
const BACK_SCROLL_INSET = 42;

// Лицевая сторона не прокручивается: длинный термин ужимается по размеру
const TERM_MAX_LINES = 3;
const TERM_MIN_FONT_SCALE = 0.6;

// Видимый текст стороны уже входит в подпись кнопки-карточки — скрываем
// его от VoiceOver (iOS) и TalkBack (Android), чтобы не читался дважды
const HIDDEN_FROM_A11Y = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

// Двойное касание в VoiceOver/TalkBack приходит как действие "activate"
const ACTIVATE_ACTIONS = [{ name: "activate" as const }];

interface FlipCardProps {
  word: Word;
  onFlipChange?: (isFlipped: boolean) => void;
}

export const FlipCard: React.FC<FlipCardProps> = ({ word, onFlipChange }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const reduceMotion = useReduceMotion();
  const [isFlipped, setIsFlipped] = useState(false);
  const animatedValue = useRef(new Animated.Value(0)).current;
  const backScrollRef = useRef<ScrollViewInstance>(null);
  const isSpeaking = useRef(false);

  const speakWord = () => {
    isSpeaking.current = true;
    setTimeout(() => {
      isSpeaking.current = false;
    }, 50);

    Speech.speak(word.term, {
      language: "en-US",
      pitch: 1.0,
      rate: 0.8,
    });
  };

  const handleCardPress = () => {
    if (!isSpeaking.current) {
      flipCard();
    }
  };

  const flipCard = () => {
    void Haptics.selectionAsync().catch(() => {});
    const nextState = !isFlipped;
    setIsFlipped(nextState);
    if (onFlipChange) onFlipChange(nextState);

    Animated.timing(animatedValue, {
      toValue: nextState ? 180 : 0,
      duration: reduceMotion ? CROSSFADE_MS : FLIP_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Если оборот не влез и прокручивается — коротко показываем индикатор
      if (finished && nextState) backScrollRef.current?.flashScrollIndicators();
    });
  };

  // Одно значение 0..180 управляет и поворотом, и прозрачностью: настройку
  // можно переключить в любой момент, сторона останется той же
  const frontAnimatedStyle = reduceMotion
    ? {
        opacity: animatedValue.interpolate({
          inputRange: [0, 180],
          outputRange: [1, 0],
          extrapolate: "clamp",
        }),
      }
    : {
        transform: [
          { perspective: 1200 },
          {
            rotateY: animatedValue.interpolate({
              inputRange: [0, 180],
              outputRange: ["0deg", "180deg"],
              extrapolate: "clamp",
            }),
          },
        ],
      };

  const backAnimatedStyle = reduceMotion
    ? {
        opacity: animatedValue.interpolate({
          inputRange: [0, 180],
          outputRange: [0, 1],
          extrapolate: "clamp",
        }),
      }
    : {
        transform: [
          { perspective: 1200 },
          {
            rotateY: animatedValue.interpolate({
              inputRange: [0, 180],
              outputRange: ["180deg", "360deg"],
              extrapolate: "clamp",
            }),
          },
        ],
      };

  // Скринридер видит только открытую сторону; её текст озвучивается одной
  // невидимой кнопкой во всю карточку, кнопка озвучки остаётся отдельной
  const frontLabel = `Слово: ${word.term}. Нажмите, чтобы открыть перевод`;
  const backLabel = word.example
    ? `Перевод: ${word.translation}. Пример: ${word.example}. Нажмите, чтобы вернуться`
    : `Перевод: ${word.translation}. Нажмите, чтобы вернуться`;

  return (
    <TouchableWithoutFeedback
      onPress={handleCardPress}
      accessible={false}
      focusable={false}
    >
      <View style={styles.cardContainer}>
        <Animated.View
          style={[styles.card, frontAnimatedStyle]}
          pointerEvents={isFlipped ? "none" : "auto"}
          accessibilityElementsHidden={isFlipped}
          importantForAccessibility={isFlipped ? "no-hide-descendants" : "auto"}
        >
          <View
            style={StyleSheet.absoluteFill}
            accessible
            accessibilityRole="button"
            accessibilityLabel={frontLabel}
            accessibilityActions={ACTIVATE_ACTIONS}
            onAccessibilityAction={handleCardPress}
          />
          <Text style={styles.badge} {...HIDDEN_FROM_A11Y}>
            СЛОВО
          </Text>
          <TouchableOpacity
            style={styles.speakButton}
            onPress={speakWord}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Произнести слово"
          >
            <Ionicons
              name="volume-high"
              size={20}
              style={styles.speakIcon}
            />
          </TouchableOpacity>
          {/* Длинный термин уменьшается (до 0.6 от 32) и занимает до трёх
              строк; короткий выглядит как раньше. Полный текст — в подписи */}
          <Text
            style={styles.term}
            numberOfLines={TERM_MAX_LINES}
            adjustsFontSizeToFit
            minimumFontScale={TERM_MIN_FONT_SCALE}
            {...HIDDEN_FROM_A11Y}
          >
            {word.term}
          </Text>
          {word.transcription && (
            <Text style={styles.transcription} {...HIDDEN_FROM_A11Y}>
              {word.transcription}
            </Text>
          )}
          <Text style={styles.hint} {...HIDDEN_FROM_A11Y}>
            Нажмите, чтобы открыть перевод
          </Text>
        </Animated.View>

        <Animated.View
          style={[styles.card, styles.cardBack, backAnimatedStyle]}
          pointerEvents={isFlipped ? "auto" : "none"}
          accessibilityElementsHidden={!isFlipped}
          importantForAccessibility={isFlipped ? "auto" : "no-hide-descendants"}
        >
          <View
            style={StyleSheet.absoluteFill}
            accessible
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            accessibilityActions={ACTIVATE_ACTIONS}
            onAccessibilityAction={handleCardPress}
          />
          <Text style={styles.badgeBack} {...HIDDEN_FROM_A11Y}>
            ПЕРЕВОД
          </Text>
          <TouchableOpacity
            style={styles.speakButtonBack}
            onPress={speakWord}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Произнести слово"
          >
            <Ionicons
              name="volume-high"
              size={20}
              style={styles.speakIconBack}
            />
          </TouchableOpacity>
          {/* Короткий текст: область по размеру контента и по центру, как
              раньше; длинный — упирается в отступы и прокручивается. Касание
              без сдвига по-прежнему переворачивает карточку */}
          <ScrollView
            ref={backScrollRef}
            style={styles.backScroll}
            contentContainerStyle={styles.backScrollContent}
            alwaysBounceVertical={false}
            {...HIDDEN_FROM_A11Y}
          >
            <Text style={styles.translation}>{word.translation}</Text>

            {word.example && (
              <View style={styles.exampleContainer}>
                <Text style={styles.exampleLabel}>Пример:</Text>
                <Text style={styles.exampleText}>
                  {'"'}
                  {word.example}
                  {'"'}
                </Text>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  cardContainer: {
    width: "100%",
    height: CARD_HEIGHT,
    marginVertical: 16,
  },
  card: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.surface,
    borderRadius: 28,
    padding: CARD_PADDING,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: theme.shadowColor,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 18,
      },
    }),
    backfaceVisibility: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardBack: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // flexGrow 0 — высота по контенту, flexShrink 1 — не выше доступной
  // области; симметричный отступ держит прокрутку ниже ряда бейджа
  backScroll: {
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 1,
    marginVertical: BACK_SCROLL_INSET,
  },
  backScrollContent: {
    alignItems: "center",
  },
  badge: {
    position: "absolute",
    top: 22,
    left: 22,
    backgroundColor: theme.badgeAmberBackground,
    color: theme.badgeAmberText,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeBack: {
    position: "absolute",
    top: 22,
    left: 22,
    backgroundColor: theme.successBackground,
    color: theme.successText,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  speakButton: {
    position: "absolute",
    top: 22,
    right: 22,
    backgroundColor: theme.badgeAmberBackground,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  speakButtonBack: {
    position: "absolute",
    top: 22,
    right: 22,
    backgroundColor: theme.successBackground,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  speakIcon: {
    color: theme.badgeAmberText,
  },
  speakIconBack: {
    color: theme.successText,
  },
  term: {
    fontSize: 32,
    fontWeight: "800",
    color: theme.textPrimary,
    letterSpacing: 0,
    textAlign: "center",
  },
  hint: {
    position: "absolute",
    bottom: 25,
    fontSize: 13,
    color: theme.textMuted,
  },
  translation: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.greenAccent,
    textAlign: "center",
  },
  transcription: {
    fontSize: 16,
    color: theme.textMutedAlt,
    marginTop: 12,
    fontStyle: "italic",
  },
  exampleContainer: {
    marginTop: 25,
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: theme.exampleBackground,
    borderRadius: 16,
    width: "100%",
  },
  exampleLabel: {
    fontSize: 11,
    color: theme.exampleLabel,
    textTransform: "uppercase",
    fontWeight: "700",
    marginBottom: 4,
  },
  exampleText: {
    fontSize: 14,
    color: theme.exampleText,
    fontStyle: "italic",
    lineHeight: 20,
  },
});
