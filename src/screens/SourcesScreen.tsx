import { useMemo } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "../components/PressableScale";
import sourcesJson from "../data/sources.json";
import { Theme } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import { showErrorAlert } from "../utils/alerts";
import {
  DataSource,
  formatUrlForDisplay,
  parseSources,
} from "../utils/sources";

// Список статичный: разбираем и проверяем его один раз при загрузке модуля
const SOURCES = parseSources(sourcesJson);

// Строка ссылки ~28 pt + по 8 pt сверху и снизу — зона касания 44 pt
const LINK_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

const openUrl = async (url: string) => {
  try {
    await Linking.openURL(url);
  } catch {
    showErrorAlert("Не удалось открыть ссылку.");
  }
};

export const SourcesScreen = () => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 24 },
      ]}
      contentInsetAdjustmentBehavior="never"
    >
      <Text style={styles.intro}>
        Приложение работает без интернета: все данные хранятся на устройстве.
        Встроенный словарь — это данные сторонних авторов, они используются на
        условиях лицензий, указанных ниже.
      </Text>
      {SOURCES.map((source) => (
        <SourceCard key={source.key} source={source} styles={styles} />
      ))}
    </ScrollView>
  );
};

// Карточка одного источника
const SourceCard = ({
  source,
  styles,
}: {
  source: DataSource;
  styles: ReturnType<typeof createStyles>;
}) => (
  <View style={styles.card}>
    <Text style={styles.cardTitle} accessibilityRole="header">
      {source.title}
    </Text>
    <Text style={styles.meta}>{source.author}</Text>
    <Text style={styles.meta}>Версия: {source.version}</Text>

    <Text style={styles.fieldLabel}>Что используется</Text>
    <Text style={styles.fieldText}>{source.usageRu}</Text>

    <Text style={styles.fieldLabel}>Лицензия</Text>
    <Text style={styles.fieldText}>{source.licenceName}</Text>
    <SourceLink
      url={source.licenceUrl}
      accessibilityLabel={`Открыть текст лицензии: ${formatUrlForDisplay(source.licenceUrl)}`}
      styles={styles}
    />

    <Text style={styles.fieldLabel}>Что изменено</Text>
    <Text style={styles.fieldText}>{source.changesRu}</Text>

    {source.url !== "" && (
      <>
        <Text style={styles.fieldLabel}>Сайт проекта</Text>
        <SourceLink
          url={source.url}
          accessibilityLabel={`Открыть сайт проекта: ${formatUrlForDisplay(source.url)}`}
          styles={styles}
        />
      </>
    )}

    {source.noticeText !== "" && (
      <>
        <Text style={styles.fieldLabel}>Уведомление</Text>
        <Text style={styles.noticeText}>{source.noticeText}</Text>
      </>
    )}
  </View>
);

// Ссылка открывается во внешнем браузере
const SourceLink = ({
  url,
  accessibilityLabel,
  styles,
}: {
  url: string;
  accessibilityLabel: string;
  styles: ReturnType<typeof createStyles>;
}) => (
  <PressableScale
    accessibilityRole="link"
    accessibilityLabel={accessibilityLabel}
    accessibilityHint="Откроется в браузере"
    hitSlop={LINK_HIT_SLOP}
    onPress={() => void openUrl(url)}
    style={styles.link}
  >
    <Text style={styles.linkText}>{formatUrlForDisplay(url)}</Text>
  </PressableScale>
);

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.pageBackground },
    content: { paddingHorizontal: 24, paddingTop: 16 },
    intro: {
      color: theme.textSecondary,
      fontSize: 15,
      lineHeight: 21,
      marginBottom: 20,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      marginBottom: 16,
    },
    cardTitle: {
      color: theme.textPrimary,
      fontSize: 17,
      fontWeight: "800",
      marginBottom: 6,
    },
    meta: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    fieldLabel: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 14,
      marginBottom: 4,
    },
    fieldText: {
      color: theme.textSecondary,
      fontSize: 15,
      lineHeight: 21,
    },
    noticeText: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    link: {
      alignSelf: "flex-start",
      paddingVertical: 4,
    },
    linkText: {
      color: theme.linkBlue,
      fontSize: 15,
      lineHeight: 20,
      textDecorationLine: "underline",
    },
  });
