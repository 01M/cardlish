import { useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "./Button";
import { Theme } from "../theme/tokens";
import { useColorSchemeName, useTheme } from "../theme/useTheme";

type TimePickerModalProps = {
  title: string;
  initialValue: Date;
  onConfirm: (value: Date) => void;
  onCancel: () => void;
};

// Выбор времени (часы и минуты, 24 часа). Показывается, пока смонтирован:
// родитель убирает его в onConfirm/onCancel. Android — системный диалог
// Material 3; iOS — колесо в нижней панели с «Готово» и «Отмена»
export const TimePickerModal = ({
  title,
  initialValue,
  onConfirm,
  onCancel,
}: TimePickerModalProps) => {
  const theme = useTheme();
  const scheme = useColorSchemeName();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [draft, setDraft] = useState(initialValue);

  if (Platform.OS === "android") {
    return (
      <DateTimePicker
        mode="time"
        presentation="dialog"
        is24Hour
        value={initialValue}
        accentColor={theme.orangeAccent}
        positiveButton={{ label: "Готово" }}
        negativeButton={{ label: "Отмена" }}
        onValueChange={(_, date) => onConfirm(date)}
        onDismiss={onCancel}
      />
    );
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Затемнение: касание закрывает без изменений; для диктора есть «Отмена» */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessible={false}
          importantForAccessibility="no"
        />
        <View
          style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}
          accessibilityViewIsModal
        >
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <DateTimePicker
            mode="time"
            display="spinner"
            value={draft}
            locale="ru_RU"
            themeVariant={scheme}
            accentColor={theme.amberAccent}
            onValueChange={(_, date) => setDraft(date)}
            style={styles.picker}
          />
          <Button label="Готово" onPress={() => onConfirm(draft)} />
          <Button
            label="Отмена"
            variant="secondary"
            onPress={onCancel}
            style={styles.cancelGap}
          />
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: theme.scrim,
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 20,
      paddingHorizontal: 16,
    },
    title: {
      color: theme.textPrimary,
      fontSize: 17,
      fontWeight: "800",
      textAlign: "center",
    },
    picker: { marginVertical: 8 },
    cancelGap: { marginTop: 12 },
  });
