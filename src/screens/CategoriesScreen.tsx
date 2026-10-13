import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Button } from "../components/Button";
import { FadeInView } from "../components/FadeInView";
import { PressableScale } from "../components/PressableScale";
import {
  getCategoryCounts,
  getLearnSelection,
  setLearnSelection,
} from "../db/database";
import { Theme } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import { showErrorAlert } from "../utils/alerts";
import {
  canDeselectGroup,
  canSelectGroup,
  Category,
  CATEGORY_GROUPS,
  CategoryCounts,
  CategoryGroup,
  deselectGroup,
  formatCategoryCount,
  isGroupHoldingLastSelection,
  isLastSelected,
  selectGroup,
  toggleCategory,
} from "../utils/categories";

// Как у формы слова: заголовок сразу под верхним безопасным отступом, но не
// ближе 24 к краю, если отступ нулевой
const MIN_TOP_PADDING = 24;

const LAST_SECTION_MESSAGE = "Должен быть выбран хотя бы один раздел";

// Выбор разделов для новых слов «Учить»: группы «Свои слова», «Словарь по
// частотности» и «Темы» с действиями «Все» / «Нет» в заголовке. Открывается
// модально с экрана «Учить»; выбор применяется и сохраняется сразу, «Учить»
// пересчитывает план при возврате (useFocusEffect)
export const CategoriesScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [selection, setSelection] = useState<string[]>([]);
  const [counts, setCounts] = useState<CategoryCounts>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Пока сохраняется одно нажатие, следующие не принимаем
  const isSavingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [savedSelection, savedCounts] = await Promise.all([
        getLearnSelection(),
        getCategoryCounts(),
      ]);
      setSelection(savedSelection);
      setCounts(savedCounts);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
      showErrorAlert();
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Новый выбор сначала сохраняется, затем показывается; при ошибке остаётся
  // прежний
  const saveSelection = async (next: string[]) => {
    isSavingRef.current = true;
    try {
      await setLearnSelection(next);
      setSelection(next);
      void Haptics.selectionAsync().catch(() => {});
    } catch {
      showErrorAlert();
    } finally {
      isSavingRef.current = false;
    }
  };

  const handleToggle = async (key: string) => {
    if (isSavingRef.current) return;
    if (isLastSelected(selection, key)) {
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Warning,
      ).catch(() => {});
      AccessibilityInfo.announceForAccessibility(LAST_SECTION_MESSAGE);
      return;
    }
    await saveSelection(toggleCategory(selection, key));
  };

  // «Все» / «Нет» в заголовке группы; выключенные кнопки сюда не доходят
  const handleSelectGroup = async (group: CategoryGroup) => {
    if (isSavingRef.current || !canSelectGroup(selection, group)) return;
    await saveSelection(selectGroup(selection, group));
  };

  const handleDeselectGroup = async (group: CategoryGroup) => {
    if (isSavingRef.current || !canDeselectGroup(selection, group)) return;
    await saveSelection(deselectGroup(selection, group));
  };

  const renderRow = (category: Category) => (
    <CategoryRow
      key={category.key}
      category={category}
      countText={formatCategoryCount(
        category,
        counts[category.key] ?? { total: 0, remaining: 0 },
      )}
      checked={selection.includes(category.key)}
      isLast={isLastSelected(selection, category.key)}
      onPress={() => void handleToggle(category.key)}
      styles={styles}
    />
  );

  return (
    <View
      style={[
        styles.container,
        { paddingTop: Math.max(insets.top, MIN_TOP_PADDING) },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Разделы
        </Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
        >
          <Ionicons name="close" size={22} style={styles.closeIcon} />
        </TouchableOpacity>
      </View>

      {/* До первой загрузки — только фон; ошибка — если она не удалась */}
      {isLoaded && (
        <FadeInView style={styles.content}>
          {loadFailed ? (
            <View
              style={[
                styles.errorContainer,
                { paddingBottom: Math.max(insets.bottom + 20, 32) },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={48}
                style={styles.errorIcon}
              />
              <Text style={styles.errorTitle}>Не удалось загрузить данные</Text>
              <Button
                label="Повторить"
                onPress={load}
                style={styles.retryButtonGap}
              />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: insets.bottom + 24 },
              ]}
              contentInsetAdjustmentBehavior="never"
            >
              <Text style={styles.intro}>
                Новые слова для сессий берутся только из выбранных разделов:
                сначала свои слова, затем слова словаря — от частых к редким.
                Слово из нескольких выбранных разделов попадёт в сессию один
                раз.{" " + LAST_SECTION_MESSAGE}.
              </Text>
              {CATEGORY_GROUPS.map((group) => (
                <View key={group.kind}>
                  <GroupHeader
                    title={group.title}
                    canSelect={canSelectGroup(selection, group)}
                    canDeselect={canDeselectGroup(selection, group)}
                    holdsLastSelection={isGroupHoldingLastSelection(
                      selection,
                      group,
                    )}
                    onSelect={() => void handleSelectGroup(group)}
                    onDeselect={() => void handleDeselectGroup(group)}
                    styles={styles}
                  />
                  {group.categories.map(renderRow)}
                </View>
              ))}
            </ScrollView>
          )}
        </FadeInView>
      )}
    </View>
  );
};

type GroupHeaderProps = {
  title: string;
  canSelect: boolean;
  canDeselect: boolean;
  // «Нет» выключено, потому что выбраны только разделы этой группы
  holdsLastSelection: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  styles: ReturnType<typeof createStyles>;
};

// Заголовок группы (для VoiceOver — заголовок) и действия «Все» / «Нет».
// При крупном шрифте действия переносятся под название
const GroupHeader = ({
  title,
  canSelect,
  canDeselect,
  holdsLastSelection,
  onSelect,
  onDeselect,
  styles,
}: GroupHeaderProps) => (
  <View style={styles.groupHeader}>
    <Text style={styles.groupLabel} accessibilityRole="header">
      {title}
    </Text>
    <View style={styles.groupActions}>
      <GroupAction
        label="Все"
        accessibilityLabel={`Выбрать все разделы группы ${title}`}
        disabled={!canSelect}
        onPress={onSelect}
        styles={styles}
      />
      <GroupAction
        label="Нет"
        accessibilityLabel={`Снять все разделы группы ${title}`}
        accessibilityHint={holdsLastSelection ? LAST_SECTION_MESSAGE : undefined}
        disabled={!canDeselect}
        onPress={onDeselect}
        styles={styles}
      />
    </View>
  </View>
);

type GroupActionProps = {
  label: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
};

// Текстовая кнопка заголовка группы, не меньше 44 pt; выключенная —
// полупрозрачная, как у StepperButton
const GroupAction = ({
  label,
  accessibilityLabel,
  accessibilityHint,
  disabled,
  onPress,
  styles,
}: GroupActionProps) => (
  <PressableScale
    style={[styles.groupAction, disabled && styles.groupActionDisabled]}
    onPress={onPress}
    disabled={disabled}
    pressedScale={0.92}
    accessibilityLabel={accessibilityLabel}
    accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled }}
  >
    <Text style={styles.groupActionText}>{label}</Text>
  </PressableScale>
);

type CategoryRowProps = {
  category: Category;
  countText: string;
  checked: boolean;
  // Единственный выбранный раздел: снять нельзя, подсказываем почему
  isLast: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
};

// Строка раздела: отметка, название, описание и счётчик слов
const CategoryRow = ({
  category,
  countText,
  checked,
  isLast,
  onPress,
  styles,
}: CategoryRowProps) => (
  <PressableScale
    style={[styles.row, checked && styles.rowChecked]}
    onPress={onPress}
    pressedScale={0.98}
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
    accessibilityLabel={
      category.kind === "topic"
        ? `${category.title}. ${countText}`
        : `${category.title}. ${category.description}. ${countText}`
    }
    accessibilityHint={isLast ? LAST_SECTION_MESSAGE : undefined}
  >
    <Ionicons
      name={checked ? "checkmark-circle" : "ellipse-outline"}
      size={24}
      style={checked ? styles.checkIconChecked : styles.checkIcon}
    />
    <View style={styles.rowText}>
      <Text style={styles.rowTitle}>{category.title}</Text>
      {category.kind !== "topic" && (
        <Text style={styles.rowDescription}>{category.description}</Text>
      )}
      <Text style={styles.rowCount}>{countText}</Text>
    </View>
  </PressableScale>
);

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.pageBackground },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      paddingBottom: 12,
      columnGap: 12,
    },
    title: {
      flex: 1,
      fontSize: 28,
      fontWeight: "800",
      color: theme.textEmphasis,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.secondaryControlBackgroundAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    closeIcon: {
      color: theme.textTertiary,
    },
    content: { flex: 1 },
    listContent: { paddingHorizontal: 24, paddingTop: 4 },
    intro: {
      color: theme.textSecondary,
      fontSize: 15,
      lineHeight: 21,
      marginBottom: 16,
    },
    groupHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: 8,
      marginTop: 8,
      marginBottom: 4,
    },
    groupLabel: {
      flexGrow: 1,
      flexShrink: 1,
      fontSize: 13,
      fontWeight: "700",
      color: theme.textMutedAlt,
      textTransform: "uppercase",
      paddingVertical: 4,
    },
    groupActions: {
      flexDirection: "row",
      marginLeft: "auto",
      columnGap: 4,
    },
    groupAction: {
      minWidth: 44,
      minHeight: 44,
      paddingHorizontal: 10,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    groupActionDisabled: {
      opacity: 0.35,
    },
    groupActionText: {
      color: theme.amberAccent,
      fontSize: 15,
      fontWeight: "700",
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      columnGap: 12,
      minHeight: 44,
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 10,
    },
    rowChecked: {
      borderColor: theme.amberAccent,
    },
    checkIcon: {
      color: theme.textMuted,
    },
    checkIconChecked: {
      color: theme.amberAccent,
    },
    rowText: { flex: 1 },
    rowTitle: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: "700",
    },
    rowDescription: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 19,
      marginTop: 2,
    },
    rowCount: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
      fontVariant: ["tabular-nums"],
    },
    errorContainer: {
      flex: 1,
      paddingHorizontal: 30,
      justifyContent: "center",
      alignItems: "center",
    },
    errorIcon: {
      color: theme.textMuted,
      marginBottom: 16,
    },
    errorTitle: {
      fontSize: 24,
      fontWeight: "800",
      color: theme.textEmphasis,
      textAlign: "center",
    },
    retryButtonGap: {
      marginTop: 24,
    },
  });
