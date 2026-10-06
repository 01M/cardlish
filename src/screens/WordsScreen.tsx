import React, { useCallback, useState, useMemo } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteCustomWord, getCustomWords, Word } from "../db/database";
import { WordFormModal } from "../components/WordFormModal";

type Filter = Word["status"] | "all";

const filters: { label: string; value: Filter }[] = [
  { label: "Все", value: "all" },
  { label: "Новые", value: "new" },
  { label: "Повтор", value: "review" },
  { label: "Выучено", value: "learned" },
];

export const WordsScreen = () => {
  const insets = useSafeAreaInsets();
  const [words, setWords] = useState<Word[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [formVisible, setFormVisible] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);

  const loadWords = useCallback(async () => {
    try {
      setWords(await getCustomWords(filter));
    } catch (error) {
      console.error("Ошибка загрузки слов:", error);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      loadWords();
    }, [loadWords]),
  );

  // Фильтрация списка по поисковому запросу
  const filteredWords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return words;

    return words.filter((item) => {
      const matchTerm = item.term.toLowerCase().includes(query);
      const matchTranslation = item.translation.toLowerCase().includes(query);
      const matchTranscription = item.transcription
        ? item.transcription.toLowerCase().includes(query)
        : false;

      return matchTerm || matchTranslation || matchTranscription;
    });
  }, [words, searchQuery]);

  const openAddForm = () => {
    setEditingWord(null);
    setFormVisible(true);
  };

  const openEditForm = (word: Word) => {
    setEditingWord(word);
    setFormVisible(true);
  };

  const handleDelete = (word: Word) => {
    Alert.alert(
      "Удалить слово?",
      `Слово «${word.term}» будет удалено без возможности восстановления.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => {
            await deleteCustomWord(word.id);
            await loadWords();
          },
        },
      ],
    );
  };

  const getStatusLabel = (status: Word["status"]) => {
    if (status === "new") return "Новое";
    if (status === "review") return "Повтор";
    return "Выучено";
  };

  const renderWord = ({ item }: { item: Word }) => (
    <View style={styles.wordCard}>
      <View style={styles.wordContent}>
        <Text style={styles.term}>{item.term}</Text>
        <Text style={styles.translation}>{item.translation}</Text>
        {item.transcription ? (
          <Text style={styles.transcription}>{item.transcription}</Text>
        ) : null}
        <Text style={styles.status}>{getStatusLabel(item.status)}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => openEditForm(item)}>
          <Text style={styles.editAction}>Изменить</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item)}>
          <Text style={styles.deleteAction}>Удалить</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top + 12, 24),
        },
      ]}
    >
      {/* Шапка экрана */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ЛИЧНАЯ БИБЛИОТЕКА</Text>
          <Text style={styles.title}>Мои слова</Text>
          <Text style={styles.subtitle}>Только слова, добавленные вами</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openAddForm}>
          <Text style={styles.addButtonText}>+ Добавить</Text>
        </TouchableOpacity>
      </View>

      {/* Поле поиска */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск по слову или переводу..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            style={styles.clearSearchButton}
            onPress={() => setSearchQuery("")}
          >
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Фильтры */}
      <View style={styles.filterRow}>
        {filters.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[
              styles.filterButton,
              filter === item.value && styles.filterButtonActive,
            ]}
            onPress={() => setFilter(item.value)}
          >
            <Text
              style={[
                styles.filterText,
                filter === item.value && styles.filterTextActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Список слов */}
      <FlatList
        data={filteredWords}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderWord}
        contentContainerStyle={[
          filteredWords.length === 0 ? styles.emptyList : styles.list,
          { paddingBottom: 16 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          searchQuery.length > 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Ничего не найдено</Text>
              <Text style={styles.emptyText}>
                По запросу «{searchQuery}» совпадений не обнаружено.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Слов пока нет</Text>
              <Text style={styles.emptyText}>
                Добавьте собственные слова, чтобы учить их в приложении.
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={openAddForm}
              >
                <Text style={styles.emptyButtonText}>Добавить слово</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      <WordFormModal
        visible={formVisible}
        word={editingWord}
        onClose={() => setFormVisible(false)}
        onSaved={loadWords}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: "#F7F7F2",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  eyebrow: {
    color: "#B45309",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: { fontSize: 32, fontWeight: "900", color: "#17202A" },
  subtitle: { color: "#68737D", fontSize: 13, marginTop: 5 },
  addButton: {
    backgroundColor: "#D97706",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addButtonText: { color: "#FFFFFF", fontWeight: "700" },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFDF8",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8E3D7",
    paddingHorizontal: 14,
    marginBottom: 12,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#17202A",
  },
  clearSearchButton: {
    padding: 4,
  },
  clearSearchText: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "700",
  },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  filterButton: {
    backgroundColor: "#E6E7E1",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterButtonActive: { backgroundColor: "#17202A" },
  filterText: { color: "#4B5563", fontSize: 12, fontWeight: "600" },
  filterTextActive: { color: "#FFFFFF" },
  list: { paddingBottom: 24 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  wordCard: {
    backgroundColor: "#FFFDF8",
    padding: 16,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E8E3D7",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  wordContent: { flex: 1, paddingRight: 10 },
  term: { fontSize: 18, fontWeight: "800", color: "#17202A" },
  translation: { fontSize: 16, color: "#374151", marginTop: 2 },
  transcription: { fontSize: 14, color: "#6B7280", marginTop: 2 },
  status: { fontSize: 12, color: "#B45309", marginTop: 8, fontWeight: "700" },
  actions: { justifyContent: "center", alignItems: "flex-end", gap: 10 },
  editAction: { color: "#2563EB", fontWeight: "600", fontSize: 12 },
  deleteAction: { color: "#DC2626", fontWeight: "600", fontSize: 12 },
  emptyState: { alignItems: "center", padding: 24 },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: "#111827" },
  emptyText: {
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 21,
    marginTop: 8,
  },
  emptyButton: {
    backgroundColor: "#D97706",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginTop: 18,
  },
  emptyButtonText: { color: "#FFFFFF", fontWeight: "700" },
});