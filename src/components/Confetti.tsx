import { useEffect, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useTheme } from "../theme/useTheme";

const PARTICLE_COUNT = 28;

type ConfettiProps = {
  // Вертикальная точка старта частиц (координата внутри родителя)
  originY: number;
};

type Particle = {
  progress: Animated.Value;
  colorIndex: number;
  isCircle: boolean;
  width: number;
  height: number;
  startX: number;
  driftX: number;
  fallRatio: number;
  rotation: number;
  duration: number;
  delay: number;
};

const randomBetween = (min: number, max: number) =>
  min + Math.random() * (max - min);

// 1. Случайные параметры частиц: создаются один раз на монтирование
const createParticles = (): Particle[] =>
  Array.from({ length: PARTICLE_COUNT }, () => {
    const isCircle = Math.random() < 0.4;
    const size = isCircle ? randomBetween(5, 8) : randomBetween(6, 9);
    return {
      progress: new Animated.Value(0),
      colorIndex: Math.floor(Math.random() * 4),
      isCircle,
      width: size,
      height: isCircle ? size : size * randomBetween(1.4, 1.9),
      startX: randomBetween(-24, 24),
      driftX: randomBetween(-150, 150),
      fallRatio: randomBetween(0.55, 0.85),
      rotation: randomBetween(-540, 540),
      duration: randomBetween(1400, 2200),
      delay: randomBetween(0, 160),
    };
  });

// 2. Конфетти: частицы вылетают из точки над бейджем и падают с разбросом.
// Только transform и opacity на нативном драйвере; проигрывается один раз
export const Confetti = ({ originY }: ConfettiProps) => {
  const theme = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [particles] = useState(createParticles);
  const colors = [
    theme.orangeAccent,
    theme.amberAccent,
    theme.greenAccent,
    theme.linkBlue,
  ];

  useEffect(() => {
    const animation = Animated.parallel(
      particles.map((particle) =>
        Animated.timing(particle.progress, {
          toValue: 1,
          duration: particle.duration,
          delay: particle.delay,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    );
    animation.start();
    return () => animation.stop();
  }, [particles]);

  return (
    <View
      style={styles.overlay}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {particles.map((particle, index) => {
        const fall = windowHeight * particle.fallRatio;
        // Падение ускоряется, боковой разлёт быстрый в начале и затухает
        const translateY = particle.progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, fall * 0.35, fall],
        });
        const translateX = particle.progress.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [
            particle.startX,
            particle.startX + particle.driftX * 0.6,
            particle.startX + particle.driftX,
          ],
        });
        const rotate = particle.progress.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", `${particle.rotation}deg`],
        });
        const opacity = particle.progress.interpolate({
          inputRange: [0, 0.05, 0.75, 1],
          outputRange: [0, 1, 1, 0],
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.particle,
              {
                top: originY,
                width: particle.width,
                height: particle.height,
                marginLeft: -particle.width / 2,
                borderRadius: particle.isCircle ? particle.width / 2 : 1.5,
                backgroundColor: colors[particle.colorIndex],
                opacity,
                transform: [{ translateX }, { translateY }, { rotate }],
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
  },
  particle: {
    position: "absolute",
    left: "50%",
  },
});
