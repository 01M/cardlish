/**
 * Семантические токены темы. Единый источник цветов для всех экранов.
 * Светлая тема повторяет текущие hex-значения в точности.
 *
 * Правило оранжевого: #D97706 (orangeAccent) — заливки кнопок, тинт таб-бара
 * и текст на фоне страницы/карточки. Оранжевый как ТЕКСТ на чернильных
 * (тёмных приподнятых) поверхностях заменяется на amberAccent (#E8A34D в тёмной).
 *
 * Правило buttonInk: каждый элемент с фоном buttonInk обязан использовать
 * textOnButtonInk для текста (в тёмной теме buttonInk светлый, а текст тёмный).
 */

// 1. Тип темы: добавление роли = новый ключ здесь, иначе tsc не пропустит
export interface Theme {
  // Поверхности
  pageBackground: string; // фон экрана
  surface: string; // фон карточек, строк, инфо-блоков
  surfaceElevated: string; // приподнятая поверхность: кнопки-счётчики, поля ввода
  backdrop: string; // фон загрузочного экрана и модального окна
  border: string; // основная рамка карточек
  borderSubtle: string; // рамка кнопок-счётчиков (LearnScreen)
  inputBackground: string; // фон полей ввода
  inputBorder: string; // рамка полей ввода
  secondaryControlBackground: string; // сегмент-переключатель, ряд фильтров
  secondaryControlBackgroundAlt: string; // кнопка закрытия сессии
  secondaryButtonBorder: string; // рамка вторичной кнопки (LearnScreen)
  secondaryButtonBorderAlt: string; // рамка вторичной кнопки (ReviewScreen)

  // Текст
  textPrimary: string; // основной текст (заголовки, термины)
  textEmphasis: string; // усиленный текст: крупные числа, заголовки пустых состояний
  textSecondary: string; // вторичный текст (переводы, подписи)
  textTertiary: string; // текст кнопок-переключателей и крестика закрытия
  textMuted: string; // приглушённый текст (подзаголовки, sectionLabel)
  textMutedAlt: string; // альтернативный приглушённый (транскрипции, label в форме)
  textMutedSoft: string; // самый слабый: подсказки, placeholder, infoSubText
  textMutedHint: string; // подсказки на карточке и флип-хинт
  textOnAccent: string; // текст на оранжевых/чернильных заливках
  textOnButtonInk: string; // текст на заливке buttonInk (nextButton, pill, активный фильтр)
  textButtonSecondary: string; // текст светлых вторичных кнопок (сброс в Profile/Review)
  placeholder: string; // placeholder поисковой строки
  keyboardAppearance: "light" | "dark"; // внешний вид клавиатуры iOS (TextInput)

  // Акценты
  greenAccent: string; // зелёный акцент: бровки, перевод на карточке, success-текст
  orangeAccent: string; // оранжевый: заливки кнопок, тинт таб-бара, warning-текст
  amberAccent: string; // янтарный текст: бровки, статусы, счётчик сессии
  indigoAccent: string; // кнопка «Сохранить» в WordFormModal
  linkBlue: string; // ссылка «Изменить», синий стат «Новые»
  dangerLink: string; // ссылка «Удалить» в WordsScreen

  // Статус-цвета
  successBackground: string; // фон кнопки «Вспомнил», бейджа «ПЕРЕВОД»
  successBorder: string; // рамка кнопки «Вспомнил»
  successText: string; // текст кнопки «Вспомнил», бейджа «ПЕРЕВОД»
  successIcon: string; // галочка пустого состояния LearnScreen
  dangerBackground: string; // фон опасных кнопок
  dangerBorder: string; // рамка опасных кнопок
  dangerText: string; // текст опасных кнопок
  statGreen: string; // стат «Выучено»
  statAmber: string; // стат «На повторе», infoCount
  statBlue: string; // стат «Новые»
  statInk: string; // стат «Всего в базе»

  // «Чернильная» карточка (тёмные панели прогресса/статистики)
  inkCardBackground: string; // фон панели
  inkCardDivider: string; // разделители и дорожка прогресс-бара
  inkCardLabel: string; // надзаголовок панели (ПРОГРЕСС)
  inkCardSubtext: string; // подписи статистики внутри панели
  inkCardSubtextSoft: string; // самый слабый текст панели
  inkCardText: string; // основной текст панели (проценты, числа)
  buttonInk: string; // чернильная заливка: nextButton, progressPill, badgeCount, активный фильтр
  progressBarFill: string; // заполнение прогресс-бара в панели

  // Бейджи и кнопки FlipCard
  badgeAmberBackground: string; // бейдж «СЛОВО»
  badgeAmberText: string; // текст бейджа «СЛОВО»
  speakButtonAmberBackground: string; // кнопка озвучки на лицевой стороне
  speakButtonGreenBackground: string; // кнопка озвучки на обороте
  exampleBackground: string; // блок примера употребления
  exampleLabel: string; // подпись «ПРИМЕР»
  exampleText: string; // текст примера

  // Switch (ProfileScreen)
  switchTrackTrue: string; // дорожка включённого переключателя
  switchTrackFalse: string; // дорожка выключенного переключателя
  switchThumbOn: string; // ползунок включённого
  switchThumbOff: string; // ползунок выключенного

  // Тени
  shadowColor: string; // цвет тени карточки (iOS-only shadow)
}

// 2. Светлая тема — точные текущие значения из кода
export const lightTheme: Theme = {
  pageBackground: "#F7F7F2",
  surface: "#FFFDF8",
  surfaceElevated: "#FFFFFF",
  backdrop: "#FAFAFA",
  border: "#E8E3D7",
  borderSubtle: "#E4E1D8",
  inputBackground: "#FFFFFF",
  inputBorder: "#E5E7EB",
  secondaryControlBackground: "#E6E7E1",
  secondaryControlBackgroundAlt: "#E8E7E0",
  secondaryButtonBorder: "#9CA3AF",
  secondaryButtonBorderAlt: "#A7AAA3",

  textPrimary: "#17202A",
  textEmphasis: "#111827",
  textSecondary: "#374151",
  textTertiary: "#4B5563",
  textMuted: "#68737D",
  textMutedAlt: "#6B7280",
  textMutedSoft: "#9CA3AF",
  textMutedHint: "#7A858D",
  textOnAccent: "#FFFFFF",
  textOnButtonInk: "#FFFFFF",
  textButtonSecondary: "#3F4A50",
  placeholder: "#9CA3AF",
  keyboardAppearance: "light",

  greenAccent: "#087443",
  orangeAccent: "#D97706",
  amberAccent: "#B45309",
  indigoAccent: "#4F46E5",
  linkBlue: "#2563EB",
  dangerLink: "#DC2626",

  successBackground: "#DDF4E8",
  successBorder: "#8CCDA7",
  successText: "#087443",
  successIcon: "#059669",
  dangerBackground: "#FFF1F0",
  dangerBorder: "#F4B4AE",
  dangerText: "#B42318",
  statGreen: "#087443",
  statAmber: "#B45309",
  statBlue: "#2563EB",
  statInk: "#17202A",

  inkCardBackground: "#17202A",
  inkCardDivider: "#3B4852",
  inkCardLabel: "#AEB9C0",
  inkCardSubtext: "#B9C2C8",
  inkCardSubtextSoft: "#C7D0D5",
  inkCardText: "#FFFFFF",
  buttonInk: "#17202A",
  progressBarFill: "#56B77D",

  badgeAmberBackground: "#FCE7C2",
  badgeAmberText: "#B45309",
  speakButtonAmberBackground: "#FFF4E6",
  speakButtonGreenBackground: "#E8F5E9",
  exampleBackground: "#F1F7F2",
  exampleLabel: "#6E8376",
  exampleText: "#31443A",

  switchTrackTrue: "#A7F3D0",
  switchTrackFalse: "#D1D5DB",
  switchThumbOn: "#087443",
  switchThumbOff: "#F9FAFB",

  shadowColor: "#000",
};

// 3. Тёмная тема: страница < карточка < приподнятая поверхность,
//    приглушённый текст #9AA5AD, зелёный светлее (#56B77D), индиго #5B62E0
export const darkTheme: Theme = {
  pageBackground: "#0F1519",
  surface: "#1A242C",
  surfaceElevated: "#242F38",
  backdrop: "#0F1519",
  border: "#33404A",
  borderSubtle: "#33404A",
  inputBackground: "#1A242C",
  inputBorder: "#33404A",
  secondaryControlBackground: "#252E36",
  secondaryControlBackgroundAlt: "#252E36",
  secondaryButtonBorder: "#5A6570",
  secondaryButtonBorderAlt: "#5A6570",

  textPrimary: "#E8EDF0",
  textEmphasis: "#E8EDF0",
  textSecondary: "#C3CCD2",
  textTertiary: "#AEB9C0",
  textMuted: "#9AA5AD",
  textMutedAlt: "#9AA5AD",
  textMutedSoft: "#9AA5AD",
  textMutedHint: "#9AA5AD",
  textOnAccent: "#FFFFFF",
  textOnButtonInk: "#0F1519",
  textButtonSecondary: "#C3CCD2",
  placeholder: "#9AA5AD",
  keyboardAppearance: "dark",

  greenAccent: "#56B77D",
  orangeAccent: "#D97706",
  amberAccent: "#E8A34D",
  indigoAccent: "#5B62E0",
  linkBlue: "#8FA8FF",
  dangerLink: "#FF8A80",

  successBackground: "#173B2E",
  successBorder: "#2E5A46",
  successText: "#56B77D",
  successIcon: "#56B77D",
  dangerBackground: "#3B2020",
  dangerBorder: "#6B3530",
  dangerText: "#F38B80",
  statGreen: "#56B77D",
  statAmber: "#E8A34D",
  statBlue: "#8FA8FF",
  statInk: "#E8EDF0",

  inkCardBackground: "#242F38",
  inkCardDivider: "#3B4852",
  inkCardLabel: "#AEB9C0",
  inkCardSubtext: "#B9C2C8",
  inkCardSubtextSoft: "#C7D0D5",
  inkCardText: "#FFFFFF",
  buttonInk: "#E8EDF0", // светлая заливка: nextButton, progressPill, badgeCount, активный фильтр
  progressBarFill: "#56B77D",

  badgeAmberBackground: "#3A2E18",
  badgeAmberText: "#E8A34D",
  speakButtonAmberBackground: "#2A2318",
  speakButtonGreenBackground: "#1C3A2B",
  exampleBackground: "#1C2B24",
  exampleLabel: "#7FA38E",
  exampleText: "#C3D2C8",

  switchTrackTrue: "#1E5C3F",
  switchTrackFalse: "#3B4852",
  switchThumbOn: "#56B77D",
  switchThumbOff: "#E8EDF0",

  shadowColor: "#000000",
};
