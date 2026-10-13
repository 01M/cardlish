import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  Alert,
  Animated,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getDailyGoal,
  getReminderEnabled,
  getReminderTimes,
  getThemePreference,
  getWordsStats,
  resetDatabase,
  resetProgressOnly,
  setDailyGoal,
  setReminderEnabled,
  setReminderTimes,
  setThemePreference,
  WordsStats,
} from "../db/database";
import { Button } from "../components/Button";
import { FadeInView } from "../components/FadeInView";
import { PressableScale } from "../components/PressableScale";
import { StepperButton } from "../components/StepperButton";
import { TimePickerModal } from "../components/TimePickerModal";
import { formatNewWords } from "../utils/categories";
import {
  DAILY_GOAL_DEFAULT,
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  stepDailyGoal,
} from "../utils/dailyGoal";
import {
  addReminderTime,
  canAddReminderTime,
  canRemoveReminderTime,
  dateToReminderTime,
  DEFAULT_REMINDER_TIMES,
  formatRemindersPerDay,
  reminderTimeToDate,
  removeReminderTime,
  replaceReminderTime,
  suggestReminderTime,
} from "../utils/reminderTimes";
import { useReduceMotion } from "../hooks/useReduceMotion";
import {
  getNotificationPermission,
  NotificationPermission,
  replanReminders,
  requestNotificationPermission,
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

// Открытый выбор времени: editing — время, которое меняем; null — новое
type TimePickerState = { editing: string | null; initialValue: Date };

export const ProfileScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const scheme = useColorSchemeName();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [stats, setStats] = useState<WordsStats>({
    totalNew: 0,
    review: 0,
    learned: 0,
  });
  const [totalCount, setTotalCount] = useState(0);
  const [reminderEnabled, setReminderEnabledState] = useState(false);
  const [reminderTimes, setReminderTimesState] = useState<readonly string[]>(
    DEFAULT_REMINDER_TIMES,
  );
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("askable");
  const [timePicker, setTimePicker] = useState<TimePickerState | null>(null);
  const isSavingTimesRef = useRef(false);
  const [themePreference, setThemePreferenceState] =
    useState<ThemePreference>("system");
  const [dailyGoal, setDailyGoalState] = useState(DAILY_GOAL_DEFAULT);
  const isSavingGoalRef = useRef(false);

  // Первая загрузка: до её завершения контента нет, затем он плавно
  // появляется (FadeInView); прогресс-бар анимируется только при изменении
  // после загрузки
  const [isLoaded, setIsLoaded] = useState(false);
  const reduceMotion = useReduceMotion();
  const progressBarWidth = useRef(new Animated.Value(0)).current;
  const hasLoadedOnce = useRef(false);
  const prevLearnedPercentage = useRef<number | null>(null);

  const loadProfileData = async () => {
    try {
      const [
        currentStats,
        isReminderEnabled,
        storedReminderTimes,
        storedThemePreference,
        storedDailyGoal,
      ] = await Promise.all([
        getWordsStats(),
        getReminderEnabled(),
        getReminderTimes(),
        getThemePreference(),
        getDailyGoal(),
      ]);
      setStats(currentStats);
      setTotalCount(currentStats.totalNew + currentStats.review + currentStats.learned);
      setReminderEnabledState(isReminderEnabled);
      setReminderTimesState(storedReminderTimes);
      setThemePreferenceState(storedThemePreference);
      setDailyGoalState(storedDailyGoal);
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
  // настройках устройства. Тогда выключаем его — без запроса разрешения и
  // алерта — и снимаем запланированное. Само расписание не проверяем: его
  // в любой момент может переставлять replanReminders
  const syncReminderWithSystem = async () => {
    try {
      const permission = await getNotificationPermission();
      setNotificationPermission(permission);
      if (permission === "granted") return;
      if (!(await getReminderEnabled())) return;
      await setReminderEnabled(false);
      void replanReminders();
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

  // Включение запрашивает разрешение; расписание ставит replanReminders
  // (выключение там же снимает все напоминания)
  const handleReminderToggle = async (enabled: boolean) => {
    void Haptics.selectionAsync().catch(() => {});
    try {
      if (enabled) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          setNotificationPermission(await getNotificationPermission());
          Alert.alert(
            "Напоминания отключены",
            "Разрешите уведомления в настройках устройства, чтобы включить напоминания.",
            [
              { text: "Не сейчас", style: "cancel" },
              {
                text: "Открыть настройки",
                onPress: () => {
                  void Linking.openSettings().catch(() => showErrorAlert());
                },
              },
            ],
          );
          return;
        }
        setNotificationPermission("granted");
      }

      await setReminderEnabled(enabled);
      setReminderEnabledState(enabled);
      void replanReminders();
    } catch {
      showErrorAlert();
    }
  };

  // Время напоминаний сохраняется сразу; при ошибке остаётся прежний список.
  // Повтор существующего времени просто ничего не меняет
  const saveReminderTimes = async (next: readonly string[]) => {
    if (next === reminderTimes || isSavingTimesRef.current) return;
    isSavingTimesRef.current = true;
    try {
      await setReminderTimes(next);
      setReminderTimesState(next);
      void Haptics.selectionAsync().catch(() => {});
      void replanReminders();
    } catch {
      showErrorAlert();
    } finally {
      isSavingTimesRef.current = false;
    }
  };

  const openTimePicker = (editing: string | null) => {
    const time = editing ?? suggestReminderTime(reminderTimes);
    setTimePicker({ editing, initialValue: reminderTimeToDate(time, new Date()) });
  };

  const handleTimePicked = (value: Date) => {
    if (!timePicker) return;
    setTimePicker(null);
    const time = dateToReminderTime(value);
    void saveReminderTimes(
      timePicker.editing === null
        ? addReminderTime(reminderTimes, time)
        : replaceReminderTime(reminderTimes, timePicker.editing, time),
    );
  };

  const canAddTime = canAddReminderTime(reminderTimes);
  const canRemoveTime = canRemoveReminderTime(reminderTimes);
  const reminderSubtitle = reminderEnabled
    ? formatRemindersPerDay(reminderTimes.length)
    : notificationPermission === "blocked"
      ? "Уведомления запрещены в настройках устройства"
      : "Выключены";

  // Цель сохраняется сразу; при ошибке остаётся прежняя. Пока одно
  // нажатие сохраняется, следующие не принимаем
  const handleGoalStep = async (direction: 1 | -1) => {
    const next = stepDailyGoal(dailyGoal, direction);
    if (next === dailyGoal || isSavingGoalRef.current) return;
    isSavingGoalRef.current = true;
    try {
      await setDailyGoal(next);
      setDailyGoalState(next);
      void Haptics.selectionAsync().catch(() => {});
    } catch {
      showErrorAlert();
    } finally {
      isSavingGoalRef.current = false;
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
      {isLoaded && (
      <FadeInView style={styles.contentInner}>
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

      {/* Цель на день: только для блока «Сегодня» в «Учить», размер сессии
          и план не меняет. Для скринридера строка — одно регулируемое поле */}
      <Text style={styles.sectionLabel}>ОБУЧЕНИЕ</Text>
      <View
        style={styles.goalRow}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Цель на день"
        accessibilityValue={{ text: formatNewWords(dailyGoal) }}
        accessibilityActions={[
          { name: "increment", label: "Увеличить цель" },
          { name: "decrement", label: "Уменьшить цель" },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") {
            void handleGoalStep(1);
          } else if (event.nativeEvent.actionName === "decrement") {
            void handleGoalStep(-1);
          }
        }}
      >
        <View style={styles.reminderText}>
          <Text style={styles.rowTitle}>Цель на день</Text>
          <Text style={styles.reminderSubtitle}>Новых слов за день</Text>
        </View>
        <View style={styles.goalStepper}>
          <StepperButton
            onPress={() => void handleGoalStep(-1)}
            disabled={dailyGoal <= DAILY_GOAL_MIN}
            accessibilityLabel="Уменьшить цель"
            icon="remove"
          />
          <Text
            style={styles.goalValue}
            maxFontSizeMultiplier={BIG_DIGITS_MAX_FONT_SCALE}
          >
            {dailyGoal}
          </Text>
          <StepperButton
            onPress={() => void handleGoalStep(1)}
            disabled={dailyGoal >= DAILY_GOAL_MAX}
            accessibilityLabel="Увеличить цель"
            icon="add"
          />
        </View>
      </View>

      {/* Переключатель, под ним (когда включено) — список времени: касание
          строки открывает выбор времени, корзина удаляет (не у последнего) */}
      <Text style={styles.sectionLabel}>НАПОМИНАНИЯ</Text>
      <View
        style={[styles.reminderCard, !reminderEnabled && styles.reminderCardLast]}
      >
        <View style={styles.reminderSwitchRow}>
          <View style={styles.reminderText}>
            <Text style={styles.rowTitle}>Ежедневные напоминания</Text>
            <Text style={styles.reminderSubtitle}>{reminderSubtitle}</Text>
          </View>
          <Switch
            accessibilityLabel="Ежедневные напоминания"
            accessibilityHint={reminderSubtitle}
            value={reminderEnabled}
            onValueChange={handleReminderToggle}
            trackColor={{
              false: theme.switchTrackFalse,
              true: theme.switchTrackTrue,
            }}
            thumbColor={reminderEnabled ? theme.switchThumbOn : theme.switchThumbOff}
          />
        </View>
        {reminderEnabled &&
          reminderTimes.map((time) => (
            <View key={time} style={styles.timeRow}>
              <PressableScale
                onPress={() => openTimePicker(time)}
                accessibilityLabel={`Напоминание в ${time}`}
                accessibilityHint="Открывает выбор времени"
                style={styles.timeButton}
              >
                <Ionicons name="alarm-outline" size={20} color={theme.amberAccent} />
                <Text style={styles.timeText}>{time}</Text>
              </PressableScale>
              {canRemoveTime && (
                <PressableScale
                  onPress={() =>
                    void saveReminderTimes(removeReminderTime(reminderTimes, time))
                  }
                  accessibilityLabel={`Удалить напоминание в ${time}`}
                  style={styles.removeTimeButton}
                >
                  <Ionicons name="trash-outline" size={20} color={theme.textMuted} />
                </PressableScale>
              )}
            </View>
          ))}
      </View>
      {reminderEnabled && (
        <View style={styles.reminderFooter}>
          <Button
            label="Добавить время"
            variant="secondary"
            onPress={() => openTimePicker(null)}
            disabled={!canAddTime}
          />
          {!canAddTime && (
            <Text style={styles.reminderHint}>
              Можно задать не больше трёх напоминаний в день.
            </Text>
          )}
          <Text style={styles.reminderHint}>
            Если цель на день выполнена, остальные напоминания сегодня не
            придут. Если не заходить в приложение неделю, напоминания
            прекратятся.
          </Text>
        </View>
      )}

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

      {/* Раздел перед управлением данными: опасные кнопки остаются последними */}
      <Text style={styles.sectionLabel}>О ПРИЛОЖЕНИИ</Text>
      <PressableScale
        accessibilityLabel="Источники и лицензии"
        accessibilityHint="Открывает список источников данных и их лицензий"
        onPress={() => router.push("/sources")}
        style={styles.navRow}
      >
        <Text style={styles.rowTitle}>Источники и лицензии</Text>
        <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
      </PressableScale>

      <Text style={styles.sectionLabel}>УПРАВЛЕНИЕ ДАННЫМИ</Text>
      <Button
        label="Сбросить прогресс изучения"
        variant="secondary"
        onPress={handleResetProgress}
        style={styles.actionButtonGap}
      />
      <Button
        label="Сбросить всё до начала"
        variant="danger"
        onPress={handleFullReset}
        style={styles.actionButtonGap}
      />
      </FadeInView>
      )}
      {timePicker && (
        <TimePickerModal
          title={
            timePicker.editing === null
              ? "Новое напоминание"
              : "Время напоминания"
          }
          initialValue={timePicker.initialValue}
          onConfirm={handleTimePicked}
          onCancel={() => setTimePicker(null)}
        />
      )}
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
  reminderCard: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 12,
    overflow: "hidden",
  },
  reminderCardLast: { marginBottom: 28 },
  reminderSwitchRow: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reminderText: { flex: 1, paddingRight: 16 },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    paddingRight: 6,
  },
  timeButton: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 10,
  },
  timeText: {
    color: theme.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  removeTimeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  reminderFooter: { marginBottom: 28 },
  reminderHint: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  goalRow: {
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
  goalStepper: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
  },
  goalValue: {
    minWidth: 36,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "800",
    color: theme.textEmphasis,
    fontVariant: ["tabular-nums"],
  },
  rowTitle: {
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
  navRow: {
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
  actionButtonGap: { marginBottom: 12 },
});
