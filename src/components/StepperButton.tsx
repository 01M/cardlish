import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "./PressableScale";
import { Theme } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

type StepperButtonProps = {
  onPress: () => void;
  disabled: boolean;
  accessibilityLabel: string;
  icon: "remove" | "add";
};

// Круглая кнопка степпера (− / +), 48 pt: нажатие сжимает её до 0.92
// (PressableScale), у границы диапазона — выключена и полупрозрачна.
// Степперы: размер сессии в «Учить», цель на день в «Профиле»
export const StepperButton = ({
  onPress,
  disabled,
  accessibilityLabel,
  icon,
}: StepperButtonProps) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      pressedScale={0.92}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[styles.button, { opacity: disabled ? 0.35 : 1 }]}
    >
      <Ionicons name={icon} size={22} style={styles.icon} />
    </PressableScale>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    button: {
      width: 48,
      height: 48,
      backgroundColor: theme.surfaceElevated,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
      justifyContent: "center",
      alignItems: "center",
    },
    icon: {
      color: theme.textEmphasis,
    },
  });
