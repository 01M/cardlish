import { StyleProp, ViewStyle } from "react-native";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";

export type TimeWheelProps = {
  value: Date;
  onChange: (value: Date) => void;
  colorScheme: "light" | "dark";
  tintColor: string;
  style?: StyleProp<ViewStyle>;
};

// Колесо выбора времени (часы и минуты) для листа TimePickerModal. На iOS
// используется TimeWheel.ios.tsx; на Android лист не показывается (там
// системный диалог), этот вариант — для остальных платформ (web)
export const TimeWheel = ({
  value,
  onChange,
  colorScheme,
  tintColor,
  style,
}: TimeWheelProps) => (
  <DateTimePicker
    mode="time"
    display="spinner"
    value={value}
    locale="ru_RU"
    themeVariant={colorScheme}
    accentColor={tintColor}
    onValueChange={(_, date) => onChange(date)}
    style={style}
  />
);
