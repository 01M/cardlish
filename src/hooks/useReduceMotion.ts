import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// Последнее известное значение: компонент, смонтированный позже (например,
// FadeInView после загрузки), сразу получает его, а не false до ответа системы
let lastKnownReduceMotion = false;

// Системная настройка "уменьшить движение": читается при монтировании
// и обновляется по событию reduceMotionChanged
export const useReduceMotion = () => {
  const [reduceMotion, setReduceMotion] = useState(lastKnownReduceMotion);

  useEffect(() => {
    let isMounted = true;
    const update = (enabled: boolean) => {
      lastKnownReduceMotion = enabled;
      if (isMounted) setReduceMotion(enabled);
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then(update)
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      update,
    );
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
};
