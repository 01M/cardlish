import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTheme } from "@/theme/useTheme";

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <NativeTabs tintColor={theme.orangeAccent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Учить</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "rectangle.stack", selected: "rectangle.stack.fill" }}
          md="school"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="review" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>Повторение</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="arrow.triangle.2.circlepath"
          md="refresh"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="words">
        <NativeTabs.Trigger.Label>Слова</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "text.book.closed", selected: "text.book.closed.fill" }}
          md="menu_book"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Профиль</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }}
          md="account_circle"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
