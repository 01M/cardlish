import { useMemo } from "react";
import { StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import { PressableScale } from "./PressableScale";
import { Theme } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

type ButtonVariant = "primary" | "secondary" | "ink" | "danger";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  // Только расположение (отступы, alignSelf) — вид задаёт variant
  style?: StyleProp<ViewStyle>;
};

// Основная кнопка во всю ширину: отклик сжатием (PressableScale), роль
// "button" по умолчанию; выключенная — полупрозрачная
export const Button = ({
  label,
  onPress,
  variant = "primary",
  disabled,
  style,
}: ButtonProps) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <PressableScale
      style={[styles.base, styles[variant], disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
    </PressableScale>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  base: {
    alignSelf: "stretch",
    minHeight: 54,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: theme.orangeAccent },
  secondary: {
    borderWidth: 1,
    borderColor: theme.secondaryButtonBorder,
  },
  ink: { backgroundColor: theme.buttonInk },
  danger: {
    backgroundColor: theme.dangerBackground,
    borderWidth: 1,
    borderColor: theme.dangerBorder,
  },
  disabled: { opacity: 0.6 },
  label: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  primaryLabel: { color: theme.textOnAccent },
  secondaryLabel: { color: theme.textButtonSecondary },
  inkLabel: { color: theme.textOnButtonInk },
  dangerLabel: { color: theme.dangerText },
});
