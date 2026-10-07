import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { withAlpha } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

/**
 * Короткая градиентная «шторка» у верхнего края списка под фиксированной шапкой.
 * Плавно скрывает карточки, срезающиеся жёсткой линией при прокрутке.
 */
export default function ListTopFade({ height = 14 }: { height?: number }) {
  const theme = useTheme();

  const colors = useMemo(
    () =>
      [
        withAlpha(theme.pageBackground, 1),
        withAlpha(theme.pageBackground, 0.85),
        withAlpha(theme.pageBackground, 0),
      ] as [string, string, string],
    [theme],
  );

  return (
    <LinearGradient
      colors={colors}
      locations={[0, 0.55, 1]}
      pointerEvents="none"
      style={[styles.fade, { height }]}
    />
  );
}

const styles = StyleSheet.create({
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "100%",
  },
});
