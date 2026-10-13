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
  getSelectionAvailability,
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
  CategoryCount,
  CategoryCounts,
  CategoryGroup,
  deselectGroup,
  formatBandRange,
  formatCategoryAccessibilityLabel,
  formatNewWords,
  formatNumber,
  hasGroupActions,
  isGroupHoldingLastSelection,
  isLastSelected,
  selectGroup,
  toggleCategory,
} from "../utils/categories";

// Как у формы слова: заголовок сразу под верхним безопасным отступом, но не
// ближе 24 к краю, если отступ нулевой
const MIN_TOP_PADDING = 24;

// Размеры чипов и плиток. Чип 40 pt + hitSlop до 44 pt касания
const CHIP_HEIGHT = 40;
const CHIP_HIT_SLOP = (44 - CHIP_HEIGHT) / 2;
const CHIP_CHECK_SIZE = 16;
const TILE_MIN_HEIGHT = 64;
const TILE_EMOJI_SIZE = 24;
const TILE_EMOJI_WIDTH = 30;
const TILE_CHECK_SIZE = 18;
const TILE_CHECK_INSET = 8;
// Справа у плитки место под галочку, чтобы она не наезжала на название
const TILE_CHECK_RESERVE = TILE_CHECK_SIZE + TILE_CHECK_INSET + 4;
const TILE_COLUMNS = 2;
const GRID_GAP = 8;
const BAR_PADDING = 16;
// Боковой отступ экрана: заголовок, чипы, плитки и нижняя панель на одной линии
const SCREEN_GUTTER = 24;

const LAST_SECTION_MESSAGE = "Должен быть выбран хотя бы один раздел";

const SUBTITLE = "Новые слова берутся из выбранных разделов.";
// Правила выбора — только для диктора, на экране их нет
const SUBTITLE_SPOKEN = `${SUBTITLE} Слово из нескольких разделов попадёт в сессию один раз. ${LAST_SECTION_MESSAGE}.`;

const CUSTOM_GROUP = CATEGORY_GROUPS.find((group) => group.kind === "custom");
const LISTED_GROUPS = CATEGORY_GROUPS.filter((group) => group.kind !== "custom");

const EMPTY_COUNT: CategoryCount = { total: 0, remaining: 0 };

// Выбор разделов для новых слов «Учить»: чип «Свои слова», группа «Частота»
// (чипы полос) и «Темы» (плитки в две колонки), у групп — «Все» / «Нет».
// Внизу закреплён счётчик новых слов текущего выбора (объединение без
// повторов, как у плана на «Учить») и «Готово». Выбор сохраняется сразу при
// каждом нажатии; «Учить» пересчитывает план при возврате (useFocusEffect)
export const CategoriesScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [selection, setSelection] = useState<string[]>([]);
  const [counts, setCounts] = useState<CategoryCounts>({});
  const [availableNew, setAvailableNew] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Пока сохраняется одно нажатие, следующие не принимаем
  const isSavingRef = useRef(false);
  // Номер последнего запроса счётчика: устаревший ответ не показываем
  const availabilityRequestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++availabilityRequestRef.current;
    try {
      const [savedSelection, savedCounts] = await Promise.all([
        getLearnSelection(),
        getCategoryCounts(),
      ]);
      const available = await getSelectionAvailability(savedSelection);
      if (request !== availabilityRequestRef.current) return;
      setSelection(savedSelection);
      setCounts(savedCounts);
      setAvailableNew(available.ownNew + available.dictionaryNew);
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

  // Пересчёт счётчика после смены выбора; до ответа остаётся прежнее число,
  // при ошибке — тоже (выбор уже сохранён, план на «Учить» пересчитается)
  const refreshAvailability = async (next: string[]) => {
    const request = ++availabilityRequestRef.current;
    try {
      const available = await getSelectionAvailability(next);
      if (request !== availabilityRequestRef.current) return;
      setAvailableNew(available.ownNew + available.dictionaryNew);
    } catch (error) {
      console.error("Не удалось пересчитать новые слова выбора", error);
    }
  };

  // Новый выбор сначала сохраняется, затем показывается; при ошибке остаётся
  // прежний
  const saveSelection = async (next: string[]) => {
    isSavingRef.current = true;
    try {
      await setLearnSelection(next);
      setSelection(next);
      void Haptics.selectionAsync().catch(() => {});
      void refreshAvailability(next);
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

  const itemProps = (category: Category) => {
    const count = counts[category.key] ?? EMPTY_COUNT;
    return {
      category,
      remainingText: formatNumber(count.remaining),
      accessibilityLabel: formatCategoryAccessibilityLabel(category, count),
      checked: selection.includes(category.key),
      isLast: isLastSelected(selection, category.key),
      onPress: () => void handleToggle(category.key),
      styles,
    };
  };

  // Полосы — чипы с диапазоном, темы — плитки по TILE_COLUMNS в ряд
  // (последний неполный ряд добивается пустым местом той же ширины)
  const renderGroupBody = (group: CategoryGroup) => {
    if (group.kind !== "topic") {
      return (
        <View style={styles.chips}>
          {group.categories.map((category) => (
            <CategoryChip
              key={category.key}
              label={
                category.kind === "band"
                  ? formatBandRange(category.from, category.to)
                  : category.title
              }
              {...itemProps(category)}
            />
          ))}
        </View>
      );
    }
    const rows: Category[][] = [];
    for (let i = 0; i < group.categories.length; i += TILE_COLUMNS) {
      rows.push(group.categories.slice(i, i + TILE_COLUMNS));
    }
    return rows.map((row) => (
      <View key={row[0].key} style={styles.tileRow}>
        {row.map((category) => (
          <TopicTile key={category.key} {...itemProps(category)} />
        ))}
        {Array.from({ length: TILE_COLUMNS - row.length }, (_, index) => (
          <View key={index} style={styles.tileSpacer} />
        ))}
      </View>
    ));
  };

  const availableNewText = formatNewWords(availableNew);

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
            <>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.listContent}
                contentInsetAdjustmentBehavior="never"
              >
                <Text
                  style={styles.subtitle}
                  accessibilityLabel={SUBTITLE_SPOKEN}
                >
                  {SUBTITLE}
                </Text>
                {CUSTOM_GROUP && (
                  <View style={styles.chips}>
                    {CUSTOM_GROUP.categories.map((category) => (
                      <CategoryChip
                        key={category.key}
                        label={category.title}
                        {...itemProps(category)}
                      />
                    ))}
                  </View>
                )}
                {LISTED_GROUPS.map((group) => (
                  <View key={group.kind}>
                    <GroupHeader
                      title={group.title}
                      hasActions={hasGroupActions(group)}
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
                    {renderGroupBody(group)}
                  </View>
                ))}
              </ScrollView>

              {/* Закреплённая панель: счётчик выбора и «Готово» */}
              <View
                style={[
                  styles.bottomBar,
                  { paddingBottom: insets.bottom + BAR_PADDING },
                ]}
              >
                <View
                  style={styles.barText}
                  accessible
                  accessibilityLabel={`${availableNewText} из выбранных разделов`}
                  accessibilityLiveRegion="polite"
                >
                  <Text style={styles.barCount}>{availableNewText}</Text>
                  <Text style={styles.barCaption}>из выбранных разделов</Text>
                </View>
                <Button
                  label="Готово"
                  onPress={() => router.back()}
                  style={styles.doneButton}
                />
              </View>
            </>
          )}
        </FadeInView>
      )}
    </View>
  );
};

type GroupHeaderProps = {
  title: string;
  // Нет у группы из одного раздела (hasGroupActions)
  hasActions: boolean;
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
  hasActions,
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
    {hasActions && (
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
    )}
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

type CategoryItemProps = {
  category: Category;
  // Число оставшихся новых слов; полная фраза — в accessibilityLabel
  remainingText: string;
  accessibilityLabel: string;
  checked: boolean;
  // Единственный выбранный раздел: снять нельзя, подсказываем почему
  isLast: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
};

// Чип: галочка (если выбран), подпись и число оставшихся новых слов
const CategoryChip = ({
  label,
  remainingText,
  accessibilityLabel,
  checked,
  isLast,
  onPress,
  styles,
}: CategoryItemProps & { label: string }) => (
  <PressableScale
    style={[styles.chip, checked && styles.itemChecked]}
    onPress={onPress}
    pressedScale={0.95}
    hitSlop={CHIP_HIT_SLOP}
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
    accessibilityLabel={accessibilityLabel}
    accessibilityHint={isLast ? LAST_SECTION_MESSAGE : undefined}
  >
    {checked && (
      <Ionicons
        name="checkmark-circle"
        size={CHIP_CHECK_SIZE}
        style={styles.checkIcon}
      />
    )}
    <Text style={[styles.chipLabel, checked && styles.labelChecked]}>
      {label}
    </Text>
    <Text style={[styles.count, checked && styles.countChecked]}>
      {remainingText}
    </Text>
  </PressableScale>
);

// Плитка темы: эмодзи слева (скрыт от диктора), название и число новых слов,
// галочка выбранной — в правом верхнем углу
const TopicTile = ({
  category,
  remainingText,
  accessibilityLabel,
  checked,
  isLast,
  onPress,
  styles,
}: CategoryItemProps) => (
  <PressableScale
    style={[styles.tile, checked && styles.itemChecked]}
    onPress={onPress}
    pressedScale={0.97}
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
    accessibilityLabel={accessibilityLabel}
    accessibilityHint={isLast ? LAST_SECTION_MESSAGE : undefined}
  >
    <View
      style={styles.tileEmojiBox}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={styles.tileEmoji}>
        {category.kind === "topic" ? category.emoji : ""}
      </Text>
    </View>
    <View style={styles.tileText}>
      <Text style={[styles.tileTitle, checked && styles.labelChecked]}>
        {category.title}
      </Text>
      <Text style={[styles.count, checked && styles.countChecked]}>
        {remainingText}
      </Text>
    </View>
    {checked && (
      <Ionicons
        name="checkmark-circle"
        size={TILE_CHECK_SIZE}
        style={[styles.checkIcon, styles.tileCheck]}
      />
    )}
  </PressableScale>
);

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.pageBackground },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: SCREEN_GUTTER,
      paddingBottom: 4,
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
    scroll: { flex: 1 },
    listContent: { paddingHorizontal: SCREEN_GUTTER, paddingBottom: 24 },
    subtitle: {
      color: theme.textMuted,
      fontSize: 15,
      lineHeight: 20,
      marginBottom: 16,
    },
    groupHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: 8,
      // Высота строки действий (44 pt)
      minHeight: 44,
      marginTop: 12,
      marginBottom: 4,
    },
    groupLabel: {
      flexGrow: 1,
      flexShrink: 1,
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.6,
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
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: GRID_GAP,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      columnGap: 6,
      maxWidth: "100%",
      minHeight: CHIP_HEIGHT,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: CHIP_HEIGHT / 2,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    // Выбранный чип или плитка: янтарный фон, оранжевая рамка, текст
    // amberAccent (оранжевый текст на светлом фоне не дотягивает до 4.5:1)
    itemChecked: {
      backgroundColor: theme.selectedTint,
      borderColor: theme.orangeAccent,
    },
    checkIcon: {
      color: theme.amberAccent,
    },
    chipLabel: {
      flexShrink: 1,
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: "600",
      fontVariant: ["tabular-nums"],
    },
    labelChecked: {
      color: theme.amberAccent,
    },
    count: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: "500",
      fontVariant: ["tabular-nums"],
    },
    // Приглушён начертанием, а не прозрачностью: цвет остаётся amberAccent
    // и держит контраст 4.5:1 на selectedTint
    countChecked: {
      color: theme.amberAccent,
      fontWeight: "400",
    },
    tileRow: {
      flexDirection: "row",
      columnGap: GRID_GAP,
      marginBottom: GRID_GAP,
    },
    tileSpacer: { flex: 1 },
    tile: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      columnGap: 8,
      minHeight: TILE_MIN_HEIGHT,
      paddingVertical: 10,
      paddingLeft: 10,
      paddingRight: TILE_CHECK_RESERVE,
      borderRadius: 14,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    tileEmojiBox: {
      width: TILE_EMOJI_WIDTH,
      alignItems: "center",
    },
    tileEmoji: {
      fontSize: TILE_EMOJI_SIZE,
    },
    tileText: { flex: 1 },
    tileTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "600",
    },
    tileCheck: {
      position: "absolute",
      top: TILE_CHECK_INSET,
      right: TILE_CHECK_INSET,
    },
    bottomBar: {
      flexDirection: "row",
      alignItems: "center",
      columnGap: 16,
      paddingTop: BAR_PADDING,
      paddingHorizontal: SCREEN_GUTTER,
      backgroundColor: theme.pageBackground,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    barText: { flex: 1 },
    barCount: {
      color: theme.textEmphasis,
      fontSize: 16,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    barCaption: {
      color: theme.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    // Кнопка своего размера, не растягивается по высоте панели
    doneButton: {
      alignSelf: "center",
      flexShrink: 0,
      minWidth: 120,
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
