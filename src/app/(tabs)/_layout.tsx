import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#D97706",
        tabBarInactiveTintColor: "#8A938F",
        tabBarStyle: {
          // Высчитываем высоту с учетом нижнего отступа устройства
          height: 58 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: "#FFFDF8",
          borderTopColor: "#E8E3D7",
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Учить",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 20, fontWeight: "800" }}>Aa</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: "Повторение",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 20, fontWeight: "800" }}>↻</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="words"
        options={{
          title: "Слова",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 20, fontWeight: "800" }}>☰</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Профиль",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 20, fontWeight: "800" }}>●</Text>
          ),
        }}
      />
    </Tabs>
  );
}