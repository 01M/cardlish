import React, { useEffect, useState, useMemo } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addCustomWord, updateCustomWord, Word } from "../db/database";
import { Theme } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import { showErrorAlert } from "../utils/alerts";

// Полноэкранная модалка рисуется под статус-баром: заголовок начинается
// сразу под верхним безопасным отступом (на iPhone с Dynamic Island это
// ~59–62, как прежние 60), но не ближе 24 к краю, если отступ нулевой
const MIN_TOP_PADDING = 24;

interface WordFormModalProps {
  visible: boolean;
  word: Word | null;
  onClose: () => void;
  onSaved: () => void;
}

export const WordFormModal = ({
  visible,
  word,
  onClose,
  onSaved,
}: WordFormModalProps) => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [term, setTerm] = useState("");
  const [translation, setTranslation] = useState("");
  const [transcription, setTranscription] = useState("");
  const [example, setExample] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTerm(word?.term ?? "");
    setTranslation(word?.translation ?? "");
    setTranscription(word?.transcription ?? "");
    setExample(word?.example ?? "");
  }, [visible, word]);

  const handleSave = async () => {
    const trimmedTerm = term.trim();
    const trimmedTranslation = translation.trim();

    if (!trimmedTerm || !trimmedTranslation) {
      Alert.alert("Заполните поля", "Слово и перевод обязательны.");
      return;
    }

    setSaving(true);
    try {
      const extra = {
        transcription: transcription.trim() || undefined,
        example: example.trim() || undefined,
      };

      if (word) {
        await updateCustomWord(
          word.id,
          trimmedTerm,
          trimmedTranslation,
          extra.transcription,
          extra.example,
        );
      } else {
        await addCustomWord(
          trimmedTerm,
          trimmedTranslation,
          extra.transcription,
          extra.example,
        );
      }
      onSaved();
      onClose();
    } catch (e) {
      console.error("Ошибка сохранения слова:", e);
      showErrorAlert("Не удалось сохранить слово. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: Math.max(insets.top, MIN_TOP_PADDING) },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>
            {word ? "Редактировать" : "Добавить слово"}
          </Text>

          <Text style={styles.label}>Слово *</Text>
          <TextInput
            style={styles.input}
            value={term}
            accessibilityLabel="Слово"
            onChangeText={setTerm}
            placeholder="apple"
            placeholderTextColor={theme.placeholder}
            keyboardAppearance={theme.keyboardAppearance}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Перевод *</Text>
          <TextInput
            style={styles.input}
            value={translation}
            accessibilityLabel="Перевод"
            onChangeText={setTranslation}
            placeholder="яблоко"
            placeholderTextColor={theme.placeholder}
            keyboardAppearance={theme.keyboardAppearance}
          />

          <Text style={styles.label}>Транскрипция</Text>
          <TextInput
            style={styles.input}
            value={transcription}
            accessibilityLabel="Транскрипция"
            onChangeText={setTranscription}
            placeholder="[ˈæpl]"
            placeholderTextColor={theme.placeholder}
            keyboardAppearance={theme.keyboardAppearance}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Пример употребления</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={example}
            accessibilityLabel="Пример употребления"
            onChangeText={setExample}
            placeholder="I eat an apple every morning."
            placeholderTextColor={theme.placeholder}
            keyboardAppearance={theme.keyboardAppearance}
            multiline
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
          >
            <Text style={styles.saveButtonText}>Сохранить</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.cancelButtonText}>Отмена</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.backdrop },
  content: { padding: 24, paddingBottom: 40 },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.textEmphasis,
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.textMutedAlt,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: theme.inputBackground,
    borderWidth: 1,
    borderColor: theme.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.textEmphasis,
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  saveButton: {
    backgroundColor: theme.indigoAccent,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    color: theme.textOnAccent,
    fontSize: 16,
    fontWeight: "700",
  },
  cancelButton: { alignItems: "center", paddingVertical: 14 },
  cancelButtonText: {
    color: theme.textMutedAlt,
    fontWeight: "600",
    fontSize: 15,
  },
});
