import { ReactNode, useEffect, useRef } from "react";
import { Animated, StyleProp, ViewStyle } from "react-native";
import { useReduceMotion } from "../hooks/useReduceMotion";

const FADE_IN_MS = 180;

type FadeInViewProps = {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

// Плавное появление (прозрачность 0 → 1) один раз — при монтировании.
// При «уменьшить движение» контент виден сразу; если настройку включили
// посреди появления, оно обрывается на финальном состоянии
export const FadeInView = ({ style, children }: FadeInViewProps) => {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, opacity]);

  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
};
