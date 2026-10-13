import {
  getPlanNoteText,
  getSessionPlan,
  isSelectionExhausted,
} from "./sessionPlan";

// Выбор со своими словами и полосами словаря
const mixed = (ownNew: number, dictionaryNew: number) => ({
  includesCustom: true,
  ownNew,
  dictionaryNew,
});

// Выбор только из полос словаря (getSelectionAvailability даёт ownNew 0)
const bandsOnly = (dictionaryNew: number) => ({
  includesCustom: false,
  ownNew: 0,
  dictionaryNew,
});

describe("getSessionPlan", () => {
  describe("selection with own words and dictionary bands", () => {
    it("takes only own words when there are enough of them", () => {
      expect(getSessionPlan(10, mixed(25, 100))).toEqual({
        own: 10,
        dictionary: 0,
        total: 10,
        ownShare: 1,
        isOwnShort: false,
      });
    });

    it("takes exactly all own words when they match the session size", () => {
      expect(getSessionPlan(10, mixed(10, 100))).toMatchObject({
        own: 10,
        dictionary: 0,
        isOwnShort: false,
      });
    });

    it("fills the rest from the selected bands when own words are short (plan note case)", () => {
      expect(getSessionPlan(10, mixed(3, 100))).toEqual({
        own: 3,
        dictionary: 7,
        total: 10,
        ownShare: 0.3,
        isOwnShort: true,
      });
    });

    it("takes the whole session from the bands and shows no note when there are no own words", () => {
      // «Своих слов не хватает (0)» не показываем — полоса и легенда и так
      // говорят, что вся сессия из словаря
      const plan = getSessionPlan(10, mixed(0, 100));

      expect(plan).toEqual({
        own: 0,
        dictionary: 10,
        total: 10,
        ownShare: 0,
        isOwnShort: false,
      });
      expect(getPlanNoteText(plan, 0)).toBe("");
    });

    it("caps the session at what is available when the size is larger", () => {
      const plan = getSessionPlan(50, mixed(4, 6));

      // Примечание показывает dictionary: «добавим 6 из словаря», а не
      // 46 (размер сессии минус свои слова)
      expect(plan).toMatchObject({
        own: 4,
        dictionary: 6,
        total: 10,
        isOwnShort: true,
      });
      expect(plan.ownShare).toBeCloseTo(0.4);
    });

    it("adds only the available band words when they are fewer than needed", () => {
      // Не хватает 7 своих слов, но в выбранных полосах осталось 2 новых —
      // сессия, полоса, легенда и примечание сходятся на 2
      expect(getSessionPlan(10, mixed(3, 2))).toEqual({
        own: 3,
        dictionary: 2,
        total: 5,
        ownShare: 0.6,
        isOwnShort: true,
      });
    });
  });

  describe("selection with only the custom section", () => {
    it("takes own words only and keeps the note without the dictionary clause", () => {
      // Видимость примечания не зависит от словаря, но «добавим 0 из
      // словаря» не показываем — остаётся только первая часть
      const available = mixed(3, 0);
      const plan = getSessionPlan(10, available);

      expect(plan).toEqual({
        own: 3,
        dictionary: 0,
        total: 3,
        ownShare: 1,
        isOwnShort: true,
      });
      expect(getPlanNoteText(plan, available.ownNew)).toBe(
        "Своих слов не хватает (3)",
      );
    });

    it("hides the note when own words fill the session", () => {
      const plan = getSessionPlan(10, mixed(12, 0));

      expect(plan).toMatchObject({ own: 10, dictionary: 0, isOwnShort: false });
      expect(getPlanNoteText(plan, 12)).toBe("");
    });
  });

  describe("selection with only dictionary bands", () => {
    it("takes only band words and shows no note", () => {
      const plan = getSessionPlan(10, bandsOnly(100));

      expect(plan).toEqual({
        own: 0,
        dictionary: 10,
        total: 10,
        ownShare: 0,
        isOwnShort: false,
      });
      expect(getPlanNoteText(plan, 0)).toBe("");
    });

    it("caps the session at the available band words", () => {
      expect(getSessionPlan(20, bandsOnly(7))).toMatchObject({
        own: 0,
        dictionary: 7,
        total: 7,
        isOwnShort: false,
      });
    });
  });

  describe("exhausted selection", () => {
    it("returns an empty plan for exhausted bands", () => {
      expect(getSessionPlan(10, bandsOnly(0))).toEqual({
        own: 0,
        dictionary: 0,
        total: 0,
        ownShare: 0,
        isOwnShort: false,
      });
    });

    it("returns an empty plan without the short note when the custom section is exhausted too", () => {
      // Остаётся только подсказка исчерпанного выбора под карточкой плана
      const plan = getSessionPlan(10, mixed(0, 0));

      expect(isSelectionExhausted(plan.total, 120)).toBe(true);
      expect(plan).toEqual({
        own: 0,
        dictionary: 0,
        total: 0,
        ownShare: 0,
        isOwnShort: false,
      });
      expect(getPlanNoteText(plan, 0)).toBe("");
    });
  });
});

describe("plan note", () => {
  // Состояние экрана -> текст примечания в карточке плана
  const noteFor = (sessionSize: number, available: ReturnType<typeof mixed>) =>
    getPlanNoteText(getSessionPlan(sessionSize, available), available.ownNew);

  it("is hidden for an exhausted selection", () => {
    expect(noteFor(10, mixed(0, 0))).toBe("");
    expect(noteFor(10, bandsOnly(0))).toBe("");
  });

  it("names a positive own count when own words are short", () => {
    expect(noteFor(10, mixed(3, 100))).toBe("Своих слов не хватает (3), добавим 7 из словаря");
    expect(noteFor(10, mixed(1, 0))).toBe("Своих слов не хватает (1)");
  });

  it("is hidden when own words are not short", () => {
    expect(noteFor(10, mixed(10, 100))).toBe("");
    expect(noteFor(10, bandsOnly(100))).toBe("");
  });

  it("never shows a zero own count", () => {
    for (const size of [5, 10, 50]) {
      for (const dictionaryNew of [0, 3, 100]) {
        expect(noteFor(size, mixed(0, dictionaryNew))).toBe("");
      }
    }
  });
});

describe("getPlanNoteText", () => {
  it("names the own count and the dictionary top-up", () => {
    expect(getPlanNoteText({ isOwnShort: true, dictionary: 7 }, 3)).toBe(
      "Своих слов не хватает (3), добавим 7 из словаря",
    );
  });

  it("is empty when own words are not short", () => {
    expect(getPlanNoteText({ isOwnShort: false, dictionary: 7 }, 3)).toBe("");
  });
});

describe("isSelectionExhausted", () => {
  it("is true only when the selection is empty but other sections still have new words", () => {
    expect(isSelectionExhausted(0, 120)).toBe(true);
    expect(isSelectionExhausted(3, 120)).toBe(false);
    // Новых слов нет совсем — это экран «Новые слова закончились»
    expect(isSelectionExhausted(0, 0)).toBe(false);
  });
});
