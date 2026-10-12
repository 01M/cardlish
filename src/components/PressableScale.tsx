import { ReactNode, useRef } from "react";
import {
  Animated,
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { useReduceMotion } from "../hooks/useReduceMotion";

type PressableScaleProps = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  pressedScale?: number;
};

// Свойства, задающие положение и размер блока среди соседей: они уходят
// на внешний Pressable, остальное (фон, рамка, отступы внутри) — на
// анимируемый Animated.View
const OUTER_LAYOUT_KEYS = [
  "display",
  "flex",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "alignSelf",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "aspectRatio",
  "margin",
  "marginHorizontal",
  "marginVertical",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginStart",
  "marginEnd",
  "position",
  "top",
  "bottom",
  "left",
  "right",
  "start",
  "end",
  "zIndex",
] as const;

const splitStyle = (style: StyleProp<ViewStyle>) => {
  const flat = StyleSheet.flatten(style) ?? {};
  const outer: ViewStyle = {};
  const inner: ViewStyle = { ...flat };
  for (const key of OUTER_LAYOUT_KEYS) {
    if (key in flat) {
      (outer as Record<string, unknown>)[key] = flat[key];
      delete inner[key];
    }
  }

  // По ширине внутренний блок заполняет Pressable растяжением (alignItems
  // по умолчанию stretch). По высоте безусловный flexGrow нельзя: если
  // родитель меряет Pressable с ограничением «не больше» (ряд с
  // alignItems: "flex-start"), Yoga растянет блок до высоты ряда.
  // Числовые высоты копируем — так блок совпадает с Pressable без flex;
  // flexGrow — только когда высота Pressable задаётся явно иначе
  // (процент, flex, aspectRatio) и уже не зависит от содержимого
  for (const key of ["height", "minHeight", "maxHeight"] as const) {
    const value = flat[key];
    if (typeof value === "number") inner[key] = value;
  }
  const hasDerivedHeight =
    (flat.height !== undefined && typeof flat.height !== "number") ||
    (flat.flex ?? 0) > 0 ||
    (flat.flexGrow ?? 0) > 0 ||
    flat.flexBasis !== undefined ||
    flat.aspectRatio !== undefined;
  if (hasDerivedHeight) inner.flexGrow = 1;

  return { outer, inner };
};

// Кнопка с откликом сжатием: при нажатии содержимое уменьшается до
// pressedScale, при отпускании возвращается пружиной; без анимации, когда
// кнопка выключена или включено "уменьшить движение". Роль по умолчанию —
// "button"; accessibility-пропсы и hitSlop уходят на внешний Pressable
export const PressableScale = ({
  style,
  children,
  pressedScale = 0.97,
  disabled,
  onPressIn,
  onPressOut,
  accessibilityRole = "button",
  ...rest
}: PressableScaleProps) => {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const { outer, inner } = splitStyle(style);

  const springTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      speed: 18,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  const handlePressIn = (event: GestureResponderEvent) => {
    if (!disabled && !reduceMotion) springTo(pressedScale);
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    if (reduceMotion) {
      scale.setValue(1);
    } else {
      springTo(1);
    }
    onPressOut?.(event);
  };

  return (
    <Pressable
      {...rest}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={outer}
    >
      <Animated.View style={[inner, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};
