import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// Системная настройка "уменьшить движение": читается при монтировании
// и обновляется по событию reduceMotionChanged
export const useReduceMotion = () => {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) setReduceMotion(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
};
