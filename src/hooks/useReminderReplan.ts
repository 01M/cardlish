import { useEffect } from "react";
import { AppState } from "react-native";
import { replanReminders } from "../services/notifications";

// Напоминания перепланируются в одном месте: при запуске (как только база
// готова), при возврате в приложение и при уходе в фон — тогда выполненная
// за сессию цель дня сразу снимает оставшиеся сегодняшние напоминания.
// Изменения настроек в «Профиле» перепланируют сами
export const useReminderReplan = (isDbReady: boolean) => {
  useEffect(() => {
    if (!isDbReady) return;
    void replanReminders();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" || state === "background" || state === "inactive") {
        void replanReminders();
      }
    });
    return () => subscription.remove();
  }, [isDbReady]);
};
