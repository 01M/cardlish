import { getPlanNoteText, getSessionPlan } from "./sessionPlan";

describe("getSessionPlan", () => {
  describe('source "custom"', () => {
    it("takes only own words when there are enough of them", () => {
      expect(
        getSessionPlan("custom", 10, { newCustom: 25, newDict: 100 }),
      ).toEqual({
        own: 10,
        dictionary: 0,
        total: 10,
        ownShare: 1,
        isOwnShort: false,
      });
    });

    it("takes exactly all own words when they match the session size", () => {
      expect(
        getSessionPlan("custom", 10, { newCustom: 10, newDict: 100 }),
      ).toMatchObject({ own: 10, dictionary: 0, isOwnShort: false });
    });

    it("fills the rest from the dictionary when own words are short (plan note case)", () => {
      expect(
        getSessionPlan("custom", 10, { newCustom: 3, newDict: 100 }),
      ).toEqual({
        own: 3,
        dictionary: 7,
        total: 10,
        ownShare: 0.3,
        isOwnShort: true,
      });
    });

    it("takes the whole session from the dictionary when there are no own words", () => {
      expect(
        getSessionPlan("custom", 10, { newCustom: 0, newDict: 100 }),
      ).toEqual({
        own: 0,
        dictionary: 10,
        total: 10,
        ownShare: 0,
        isOwnShort: true,
      });
    });

    it("caps the session at what is available when the size is larger", () => {
      const plan = getSessionPlan("custom", 50, { newCustom: 4, newDict: 6 });

      // Примечание показывает dictionary: «добавим 6 из словаря», а не
      // 46 (размер сессии минус свои слова), как было раньше
      expect(plan).toMatchObject({
        own: 4,
        dictionary: 6,
        total: 10,
        isOwnShort: true,
      });
      expect(plan.ownShare).toBeCloseTo(0.4);
    });

    it("adds only the available dictionary words when they are fewer than needed", () => {
      // Не хватает 7 своих слов, но в словаре осталось 2 новых — сессия,
      // полоса, легенда и примечание сходятся на 2
      expect(
        getSessionPlan("custom", 10, { newCustom: 3, newDict: 2 }),
      ).toEqual({
        own: 3,
        dictionary: 2,
        total: 5,
        ownShare: 0.6,
        isOwnShort: true,
      });
    });

    it("keeps the note without the dictionary clause when the dictionary is empty", () => {
      // Видимость примечания не зависит от словаря, но «добавим 0 из
      // словаря» не показываем — остаётся только первая часть
      const stats = { newCustom: 3, newDict: 0 };
      const plan = getSessionPlan("custom", 10, stats);

      expect(plan).toMatchObject({
        own: 3,
        dictionary: 0,
        total: 3,
        isOwnShort: true,
      });
      expect(getPlanNoteText(plan, stats.newCustom)).toBe(
        "Своих слов не хватает (3)",
      );
    });
  });

  describe('source "dictionary"', () => {
    it("ignores own words and takes only dictionary words", () => {
      expect(
        getSessionPlan("dictionary", 10, { newCustom: 25, newDict: 100 }),
      ).toEqual({
        own: 0,
        dictionary: 10,
        total: 10,
        ownShare: 0,
        isOwnShort: false,
      });
    });

    it("caps the session at the available dictionary words", () => {
      expect(
        getSessionPlan("dictionary", 20, { newCustom: 25, newDict: 7 }),
      ).toMatchObject({ own: 0, dictionary: 7, total: 7, isOwnShort: false });
    });
  });

  it.each(["custom", "dictionary"] as const)(
    'returns an empty plan with ownShare 0 when nothing is available (source "%s")',
    (source) => {
      const plan = getSessionPlan(source, 10, { newCustom: 0, newDict: 0 });

      expect(plan).toMatchObject({ own: 0, dictionary: 0, total: 0, ownShare: 0 });
    },
  );
});
