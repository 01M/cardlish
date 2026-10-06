import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  Animated,
  TouchableOpacity,
} from "react-native";
import { Word } from "../db/database";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";

interface FlipCardProps {
  word: Word;
  onFlipChange?: (isFlipped: boolean) => void;
}

export const FlipCard: React.FC<FlipCardProps> = ({ word, onFlipChange }) => {
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

  useEffect(() => {
    setIsFlipped(false);
    animatedValue.setValue(0);
    if (onFlipChange) onFlipChange(false);
  }, [animatedValue, onFlipChange, word]);

  const flipCard = () => {
    void Haptics.selectionAsync().catch(() => {});
    const nextState = !isFlipped;
    setIsFlipped(nextState);
    if (onFlipChange) onFlipChange(nextState);

    Animated.timing(animatedValue, {
      toValue: nextState ? 180 : 0,
      duration: 400,
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
            <Text style={styles.speakIcon}>🔊</Text>
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
            <Text style={styles.speakIcon}>🔊</Text>
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

const styles = StyleSheet.create({
  cardContainer: {
    width: "100%",
    height: 370,
    marginVertical: 16,
  },
  card: {
    width: "100%",
    height: "100%",
    backgroundColor: "#FFFDF8",
    borderRadius: 28,
    padding: 28,
    justifyContent: "center",
    alignItems: "center",
    backfaceVisibility: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 7,
    borderWidth: 1,
    borderColor: "#E8E3D7",
  },
  cardBack: {
    position: "absolute",
    top: 0,
  },
  badge: {
    position: "absolute",
    top: 22,
    left: 22,
    backgroundColor: "#FCE7C2",
    color: "#B45309",
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
    backgroundColor: "#DDF4E8",
    color: "#087443",
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
    backgroundColor: "#FFF4E6",
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
    backgroundColor: "#E8F5E9",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  speakIcon: {
    fontSize: 18,
  },
  term: {
    fontSize: 32,
    fontWeight: "800",
    color: "#17202A",
    letterSpacing: 0,
    textAlign: "center",
  },
  hint: {
    position: "absolute",
    bottom: 25,
    fontSize: 13,
    color: "#7A858D",
  },
  translation: {
    fontSize: 28,
    fontWeight: "700",
    color: "#087443",
    textAlign: "center",
  },
  transcription: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 12,
    fontStyle: "italic",
  },
  exampleContainer: {
    marginTop: 25,
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: "#F1F7F2",
    borderRadius: 16,
    width: "100%",
  },
  exampleLabel: {
    fontSize: 11,
    color: "#6E8376",
    textTransform: "uppercase",
    fontWeight: "700",
    marginBottom: 4,
  },
  exampleText: {
    fontSize: 14,
    color: "#31443A",
    fontStyle: "italic",
    lineHeight: 20,
  },
});