import { DatePicker, Host } from "@expo/ui/swift-ui";
import {
  datePickerStyle,
  environment,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import type { TimeWheelProps } from "./TimeWheel";

// Колесо выбора времени на iOS собрано из SwiftUI напрямую: с SDK 58 <Host>
// прижимает содержимое к левому верхнему углу, а обёртка
// community/datetime-picker не передаёт ему alignment — колесо уезжало
// влево. Здесь Host растянут по ширине и центрирует колесо
export const TimeWheel = ({
  value,
  onChange,
  colorScheme,
  tintColor,
  style,
}: TimeWheelProps) => (
  <Host
    matchContents={{ vertical: true }}
    alignment="center"
    ignoreSafeArea="all"
    style={style}
  >
    <DatePicker
      selection={value}
      displayedComponents={["hourAndMinute"]}
      onDateChange={onChange}
      modifiers={[
        datePickerStyle("wheel"),
        tint(tintColor),
        environment("locale", "ru_RU"),
        environment("colorScheme", colorScheme),
      ]}
    />
  </Host>
);
