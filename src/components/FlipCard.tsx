import React, { useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  Animated,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Word } from "../db/database";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Theme } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

const FLIP_MS = 400;

interface FlipCardProps {
  word: Word;
  onFlipChange?: (isFlipped: boolean) => void;
}

export const FlipCard: React.FC<FlipCardProps> = ({ word, onFlipChange }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [isFlipped, setIsFlipped] = useState(false);
  const animatedValue = useRef(new Animated.Value(0)).current;
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
      duration: FLIP_MS,
      useNativeDriver: true,
    }).start();
  };

  const frontInterpolate = animatedValue.interpolate({
    inputRange: [0, 180],
    outputRange: ["0deg", "180deg"],
    extrapolate: "clamp",
  });

  const backInterpolate = animatedValue.interpolate({
    inputRange: [0, 180],
    outputRange: ["180deg", "360deg"],
    extrapolate: "clamp",
  });

  const frontAnimatedStyle = {
    transform: [{ perspective: 1200 }, { rotateY: frontInterpolate }],
  };

  const backAnimatedStyle = {
    transform: [{ perspective: 1200 }, { rotateY: backInterpolate }],
  };

  return (
    <TouchableWithoutFeedback onPress={handleCardPress}>
      <View style={styles.cardContainer}>
        <Animated.View
          style={[styles.card, frontAnimatedStyle]}
          pointerEvents={isFlipped ? "none" : "auto"}
        >
          <Text style={styles.badge}>СЛОВО</Text>
          <TouchableOpacity
            style={styles.speakButton}
            onPress={speakWord}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="volume-high"
              size={20}
              style={styles.speakIcon}
            />
          </TouchableOpacity>
          <Text style={styles.term}>{word.term}</Text>
          {word.transcription && (
            <Text style={styles.transcription}>{word.transcription}</Text>
          )}
          <Text style={styles.hint}>Нажмите, чтобы открыть перевод</Text>
        </Animated.View>

        <Animated.View
          style={[styles.card, styles.cardBack, backAnimatedStyle]}
          pointerEvents={isFlipped ? "auto" : "none"}
        >
          <Text style={styles.badgeBack}>ПЕРЕВОД</Text>
          <TouchableOpacity
            style={styles.speakButtonBack}
            onPress={speakWord}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="volume-high"
              size={20}
              style={styles.speakIconBack}
            />
          </TouchableOpacity>
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
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  cardContainer: {
    width: "100%",
    height: 370,
    marginVertical: 16,
  },
  card: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.surface,
    borderRadius: 28,
    padding: 28,
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
