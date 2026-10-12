import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Haptics from "expo-haptics";
import {
  Alert,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getReminderEnabled,
  getThemePreference,
  getWordsStats,
  resetDatabase,
  resetProgressOnly,
  setReminderEnabled,
  setThemePreference,
  WordsStats,
} from "../db/database";
import { PressableScale } from "../components/PressableScale";
import { useReduceMotion } from "../hooks/useReduceMotion";
import {
  disableDailyReminder,
  enableDailyReminder,
  getDailyReminderTime,
  isDailyReminderActive,
} from "../services/notifications";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Theme } from "../theme/tokens";
import {
  applyThemePreference,
  useColorSchemeName,
  useTheme,
} from "../theme/useTheme";
import type { ThemePreference } from "../theme/useTheme";
import { confirmResetProgress, showErrorAlert } from "../utils/alerts";

// Крупные цифры (процент прогресса, значения статистики) растут с системным
// размером шрифта не больше чем в 1.2 раза — иначе ломают раскладку
const BIG_DIGITS_MAX_FONT_SCALE = 1.2;

export const ProfileScreen = () => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const scheme = useColorSchemeName();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [stats, setStats] = useState<WordsStats>({
    newCustom: 0,
    newDict: 0,
    totalNew: 0,
    review: 0,
    learned: 0,
  });
  const [totalCount, setTotalCount] = useState(0);
  const [reminderEnabled, setReminderEnabledState] = useState(false);
  const [themePreference, setThemePreferenceState] =
    useState<ThemePreference>("system");

  // Первая загрузка: до её завершения контент прозрачен, затем плавно
  // появляется; прогресс-бар анимируется только при изменении после загрузки
  const [isLoaded, setIsLoaded] = useState(false);
  const reduceMotion = useReduceMotion();
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const progressBarWidth = useRef(new Animated.Value(0)).current;
  const hasLoadedOnce = useRef(false);
  const prevLearnedPercentage = useRef<number | null>(null);

  const loadProfileData = async () => {
    try {
      const [currentStats, isReminderEnabled, storedThemePreference] =
        await Promise.all([
          getWordsStats(),
          getReminderEnabled(),
          getThemePreference(),
        ]);
      setStats(currentStats);
      setTotalCount(currentStats.totalNew + currentStats.review + currentStats.learned);
      setReminderEnabledState(isReminderEnabled);
      setThemePreferenceState(storedThemePreference);
    } catch {
      showErrorAlert();
    } finally {
      // Контент показываем и при ошибке, чтобы экран не оставался прозрачным
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        setIsLoaded(true);
      }
    }
  };

  // Флаг напоминаний мог разойтись с системой: разрешение отозвано в
  // настройках устройства или уведомление больше не запланировано. Тогда
  // выключаем его — без запроса разрешения, планирования и алерта
  const syncReminderWithSystem = async () => {
    try {
      if (!(await getReminderEnabled())) return;
      if (await isDailyReminderActive()) return;
      await disableDailyReminder();
      await setReminderEnabled(false);
    } catch (error) {
      console.error("Failed to sync reminder state:", error);
    }
  };

  // Сначала сверяем напоминания, чтобы переключатель сразу показал
  // актуальное состояние из базы
  useFocusEffect(
    useCallback(() => {
      void syncReminderWithSystem().then(loadProfileData);
    }, []),
  );

  const learnedPercentage =
    totalCount > 0 ? Math.round((stats.learned / totalCount) * 100) : 0;

  // Появление контента: один раз после первой загрузки (180 мс); при
  // включённой настройке «уменьшить движение» — без анимации
  useEffect(() => {
    if (!isLoaded) return;
    if (reduceMotion) {
      contentOpacity.setValue(1);
      return;
    }
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [isLoaded, reduceMotion, contentOpacity]);

  // Заполнение прогресс-бара: сразу при первой загрузке, дальше — только
  // при изменении процента (width — layout-свойство, useNativeDriver: false)
  useEffect(() => {
    if (prevLearnedPercentage.current === null) {
      prevLearnedPercentage.current = learnedPercentage;
      progressBarWidth.setValue(learnedPercentage);
      return;
    }
    if (prevLearnedPercentage.current === learnedPercentage) return;
    prevLearnedPercentage.current = learnedPercentage;
    if (reduceMotion) {
      progressBarWidth.setValue(learnedPercentage);
      return;
    }
    Animated.timing(progressBarWidth, {
      toValue: learnedPercentage,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [learnedPercentage, reduceMotion, progressBarWidth]);

  const progressBarPercent = progressBarWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  const handleResetProgress = () => {
    confirmResetProgress(async () => {
      try {
        await resetProgressOnly();
        await loadProfileData();
      } catch {
        showErrorAlert();
      }
    });
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
            try {
              await resetDatabase();
              await loadProfileData();
            } catch {
              showErrorAlert();
            }
          },
        },
      ],
    );
  };

  const handleReminderToggle = async (enabled: boolean) => {
    void Haptics.selectionAsync().catch(() => {});
    try {
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
    } catch {
      showErrorAlert();
    }
  };

  const handleThemePreferenceChange = (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    applyThemePreference(pref);
    void setThemePreference(pref).catch(() => {
      showErrorAlert();
    });
    void Haptics.selectionAsync().catch(() => {});
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop:
            Platform.OS === "ios" ? 12 : Math.max(insets.top + 12, 24),
          paddingBottom: 16,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View
        style={[styles.contentInner, { opacity: contentOpacity }]}
      >
      <Text style={styles.eyebrow}>ВАШ ПРОГРЕСС</Text>
      <Text style={styles.title}>Профиль</Text>

      <View style={styles.progressCard}>
        <Text style={styles.progressTitle}>ОБЩИЙ ПРОГРЕСС</Text>
        <Text
          style={styles.progressPercent}
          maxFontSizeMultiplier={BIG_DIGITS_MAX_FONT_SCALE}
        >
          {learnedPercentage}%
        </Text>
        <Text style={styles.progressSub}>выучено из всех слов в базе</Text>
        <View style={styles.progressBarBg}>
          <Animated.View
            style={[styles.progressBarFill, { width: progressBarPercent }]}
          />
        </View>
      </View>

      <Text style={styles.sectionLabel}>СТАТИСТИКА СЛОВ</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text
            style={[styles.statValue, { color: theme.statGreen }]}
            maxFontSizeMultiplier={BIG_DIGITS_MAX_FONT_SCALE}
          >
            {stats.learned}
          </Text>
          <Text style={styles.statLabel}>Выучено</Text>
        </View>
        <View style={styles.statBox}>
          <Text
            style={[styles.statValue, { color: theme.amberAccent }]}
            maxFontSizeMultiplier={BIG_DIGITS_MAX_FONT_SCALE}
          >
            {stats.review}
          </Text>
          <Text style={styles.statLabel}>На повторе</Text>
        </View>
        <View style={styles.statBox}>
          <Text
            style={[styles.statValue, { color: theme.statBlue }]}
            maxFontSizeMultiplier={BIG_DIGITS_MAX_FONT_SCALE}
          >
            {stats.totalNew}
          </Text>
          <Text style={styles.statLabel}>Новые</Text>
        </View>
        <View style={styles.statBox}>
          <Text
            style={[styles.statValue, { color: theme.statInk }]}
            maxFontSizeMultiplier={BIG_DIGITS_MAX_FONT_SCALE}
          >
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
          accessibilityLabel="Ежедневные напоминания"
          value={reminderEnabled}
          onValueChange={handleReminderToggle}
          trackColor={{
            false: theme.switchTrackFalse,
            true: theme.switchTrackTrue,
          }}
          thumbColor={reminderEnabled ? theme.switchThumbOn : theme.switchThumbOff}
        />
      </View>

      <Text style={styles.sectionLabel}>ОФОРМЛЕНИЕ</Text>
      <View style={styles.themeRow}>
        <SegmentedControl
          values={["Системная", "Светлая", "Тёмная"]}
          selectedIndex={
            themePreference === "system" ? 0 : themePreference === "light" ? 1 : 2
          }
          onChange={(event) => {
            const index = event.nativeEvent.selectedSegmentIndex;
            handleThemePreferenceChange(
              index === 0 ? "system" : index === 1 ? "light" : "dark",
            );
          }}
          appearance={scheme}
          style={styles.themeControl}
        />
      </View>

      <Text style={styles.sectionLabel}>УПРАВЛЕНИЕ ДАННЫМИ</Text>
      <PressableScale
        style={styles.actionButton}
        onPress={handleResetProgress}
      >
        <Text style={styles.actionButtonText}>Сбросить прогресс изучения</Text>
      </PressableScale>
      <PressableScale
        style={[styles.actionButton, styles.dangerButton]}
        onPress={handleFullReset}
      >
        <Text style={styles.dangerButtonText}>Сбросить всё до начала</Text>
      </PressableScale>
      </Animated.View>
    </ScrollView>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.pageBackground },
  content: { paddingHorizontal: 24 },
  contentInner: { flex: 1 },
  eyebrow: {
    color: theme.greenAccent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: theme.textPrimary,
    marginBottom: 22,
  },
  progressCard: {
    backgroundColor: theme.inkCardBackground,
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
  },
  progressTitle: {
    fontSize: 11,
    color: theme.inkCardLabel,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  progressPercent: {
    fontSize: 52,
    fontWeight: "900",
    color: theme.inkCardText,
    marginVertical: 4,
  },
  progressSub: {
    fontSize: 13,
    color: theme.inkCardSubtextSoft,
    marginBottom: 16,
  },
  progressBarBg: {
    height: 9,
    backgroundColor: theme.inkCardDivider,
    borderRadius: 5,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: theme.progressBarFill,
    borderRadius: 5,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.textMuted,
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
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  statValue: { fontSize: 24, fontWeight: "900", marginBottom: 4 },
  statLabel: {
    fontSize: 13,
    color: theme.textMuted,
    fontWeight: "600",
  },
  reminderRow: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    marginBottom: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reminderText: { flex: 1, paddingRight: 16 },
  reminderTitle: {
    color: theme.textPrimary,
    fontWeight: "800",
    fontSize: 15,
  },
  reminderSubtitle: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  themeRow: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    marginBottom: 28,
  },
  themeControl: { width: "100%" },
  actionButton: {
    backgroundColor: theme.surface,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 12,
  },
  actionButtonText: {
    color: theme.textButtonSecondary,
    fontWeight: "700",
    fontSize: 14,
  },
  dangerButton: {
    borderColor: theme.dangerBorder,
    backgroundColor: theme.dangerBackground,
  },
  dangerButtonText: {
    color: theme.dangerText,
    fontWeight: "700",
    fontSize: 14,
  },
});
