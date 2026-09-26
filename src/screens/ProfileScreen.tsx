import React, { useCallback, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getAllWords,
  getReminderEnabled,
  getWordsStats,
  resetDatabase,
  resetProgressOnly,
  setReminderEnabled,
} from "../db/database";
import {
  disableDailyReminder,
  enableDailyReminder,
  getDailyReminderTime,
} from "../services/notifications";

export const ProfileScreen = () => {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState({
    newCustom: 0,
    newDict: 0,
    totalNew: 0,
    review: 0,
    learned: 0,
  });
  const [totalCount, setTotalCount] = useState(0);
  const [reminderEnabled, setReminderEnabledState] = useState(false);

  const loadProfileData = async () => {
    const currentStats = await getWordsStats();
    const allWords = await getAllWords();
    const isReminderEnabled = await getReminderEnabled();
    setStats(currentStats);
    setTotalCount(allWords.length);
    setReminderEnabledState(isReminderEnabled);
  };

  useFocusEffect(
    useCallback(() => {
      loadProfileData();
    }, []),
  );

  const learnedPercentage =
    totalCount > 0 ? Math.round((stats.learned / totalCount) * 100) : 0;

  const handleResetProgress = () => {
    Alert.alert(
      "Сброс прогресса",
      'Вы уверены, что хотите перевести все слова обратно в статус "Новые"?',
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Сбросить",
          style: "destructive",
          onPress: async () => {
            await resetProgressOnly();
            await loadProfileData();
          },
        },
      ],
    );
  };

  const handleFullReset = () => {
    Alert.alert(
      "Полный сброс базы",
      "Это удалит все ваши добавленные слова и вернёт встроенный словарь.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить всё",
          style: "destructive",
          onPress: async () => {
            await resetDatabase();
            await loadProfileData();
          },
        },
      ],
    );
  };

  const handleReminderToggle = async (enabled: boolean) => {
    if (enabled) {
      const scheduled = await enableDailyReminder();
      if (!scheduled) {
        Alert.alert(
          "Напоминания отключены",
          "Разрешите уведомления в настройках устройства, чтобы включить напоминания.",
        );
        return;
      }
    } else {
      await disableDailyReminder();
    }

    await setReminderEnabled(enabled);
    setReminderEnabledState(enabled);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top + 12, 24),
          paddingBottom: Math.max(insets.bottom + 24, 40),
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>ВАШ ПРОГРЕСС</Text>
      <Text style={styles.title}>Профиль</Text>

      <View style={styles.progressCard}>
        <Text style={styles.progressTitle}>ОБЩИЙ ПРОГРЕСС</Text>
        <Text style={styles.progressPercent}>{learnedPercentage}%</Text>
        <Text style={styles.progressSub}>выучено из всех слов в базе</Text>
        <View style={styles.progressBarBg}>
          <View
            style={[styles.progressBarFill, { width: `${learnedPercentage}%` }]}
          />
        </View>
      </View>

      <Text style={styles.sectionLabel}>СТАТИСТИКА СЛОВ</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: "#087443" }]}>
            {stats.learned}
          </Text>
          <Text style={styles.statLabel}>Выучено</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: "#B45309" }]}>
            {stats.review}
          </Text>
          <Text style={styles.statLabel}>На повторе</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: "#2563EB" }]}>
            {stats.totalNew}
          </Text>
          <Text style={styles.statLabel}>Новые</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: "#17202A" }]}>
            {totalCount}
          </Text>
          <Text style={styles.statLabel}>Всего в базе</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>НАПОМИНАНИЯ</Text>
      <View style={styles.reminderRow}>
        <View style={styles.reminderText}>
          <Text style={styles.reminderTitle}>Ежедневные напоминания</Text>
          <Text style={styles.reminderSubtitle}>
            Каждый день в {getDailyReminderTime()}
          </Text>
        </View>
        <Switch
          value={reminderEnabled}
          onValueChange={handleReminderToggle}
          trackColor={{ false: "#D1D5DB", true: "#A7F3D0" }}
          thumbColor={reminderEnabled ? "#087443" : "#F9FAFB"}
        />
      </View>

      <Text style={styles.sectionLabel}>УПРАВЛЕНИЕ ДАННЫМИ</Text>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={handleResetProgress}
      >
        <Text style={styles.actionButtonText}>Сбросить прогресс изучения</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.actionButton, styles.dangerButton]}
        onPress={handleFullReset}
      >
        <Text style={styles.dangerButtonText}>Сбросить всё до начала</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F2" },
  content: { paddingHorizontal: 24 },
  eyebrow: {
    color: "#087443",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#17202A",
    marginBottom: 22,
  },
  progressCard: {
    backgroundColor: "#17202A",
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
  },
  progressTitle: {
    fontSize: 11,
    color: "#AEB9C0",
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  progressPercent: {
    fontSize: 52,
    fontWeight: "900",
    color: "#FFFFFF",
    marginVertical: 4,
  },
  progressSub: { fontSize: 13, color: "#C7D0D5", marginBottom: 16 },
  progressBarBg: {
    height: 9,
    backgroundColor: "#3B4852",
    borderRadius: 5,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#56B77D",
    borderRadius: 5,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#68737D",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 28,
  },
  statBox: {
    width: "48%",
    backgroundColor: "#FFFDF8",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E8E3D7",
  },
  statValue: { fontSize: 24, fontWeight: "900", marginBottom: 4 },
  statLabel: { fontSize: 13, color: "#68737D", fontWeight: "600" },
  reminderRow: {
    backgroundColor: "#FFFDF8",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8E3D7",
    padding: 16,
    marginBottom: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reminderText: { flex: 1, paddingRight: 16 },
  reminderTitle: { color: "#17202A", fontWeight: "800", fontSize: 15 },
  reminderSubtitle: { color: "#68737D", fontSize: 13, marginTop: 4 },
  actionButton: {
    backgroundColor: "#FFFDF8",
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8E3D7",
    marginBottom: 12,
  },
  actionButtonText: { color: "#3F4A50", fontWeight: "700", fontSize: 14 },
  dangerButton: { borderColor: "#F4B4AE", backgroundColor: "#FFF1F0" },
  dangerButtonText: { color: "#B42318", fontWeight: "700", fontSize: 14 },
});