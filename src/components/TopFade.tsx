import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { withAlpha } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

/**
 * Градиентная «шторка» у верхнего края экрана (под системным статус-баром).
 * Плавно затемняет контент, скользящий под часы/иконки при edge-to-edge.
 */
export default function TopFade() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

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
      style={[styles.fade, { height: insets.top + 6 }]}
    />
  );
}

const styles = StyleSheet.create({
  fade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});
