import React, { useEffect, useState } from "react";
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
import { addCustomWord, updateCustomWord, Word } from "../db/database";

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
      Alert.alert("Ошибка", "Не удалось сохранить слово.");
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
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>
            {word ? "Редактировать" : "Добавить слово"}
          </Text>

          <Text style={styles.label}>Слово *</Text>
          <TextInput
            style={styles.input}
            value={term}
            onChangeText={setTerm}
            placeholder="apple"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Перевод *</Text>
          <TextInput
            style={styles.input}
            value={translation}
            onChangeText={setTranslation}
            placeholder="яблоко"
          />

          <Text style={styles.label}>Транскрипция</Text>
          <TextInput
            style={styles.input}
            value={transcription}
            onChangeText={setTranscription}
            placeholder="[ˈæpl]"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Пример употребления</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={example}
            onChangeText={setExample}
            placeholder="I eat an apple every morning."
            multiline
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>Сохранить</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Отмена</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#FAFAFA" },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  saveButton: {
    backgroundColor: "#4F46E5",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  cancelButton: { alignItems: "center", paddingVertical: 14 },
  cancelButtonText: { color: "#6B7280", fontWeight: "600", fontSize: 15 },
});
