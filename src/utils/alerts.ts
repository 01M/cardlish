import { Alert } from "react-native";

// 1. Подтверждение сброса прогресса: onConfirm вызывается только после
// нажатия «Сбросить»
export const confirmResetProgress = (
  onConfirm: () => void | Promise<void>,
) => {
  Alert.alert(
    "Сброс прогресса",
    'Вы уверены, что хотите перевести все слова обратно в статус "Новые"?',
    [
      { text: "Отмена", style: "cancel" },
      {
        text: "Сбросить",
        style: "destructive",
        onPress: () => {
          void onConfirm();
        },
      },
    ],
  );
};

// 2. Общее сообщение об ошибке для асинхронных обработчиков
export const showErrorAlert = (
  message = "Не удалось выполнить действие. Попробуйте ещё раз.",
) => {
  Alert.alert("Что-то пошло не так", message);
};
