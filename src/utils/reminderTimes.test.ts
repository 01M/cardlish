import {
  addReminderTime,
  canAddReminderTime,
  canRemoveReminderTime,
  dateToReminderTime,
  DEFAULT_REMINDER_TIMES,
  formatReminderTime,
  formatRemindersPerDay,
  isValidReminderTimes,
  normalizeReminderTimes,
  parseReminderTime,
  parseReminderTimes,
  reminderTimeToDate,
  removeReminderTime,
  replaceReminderTime,
  serializeReminderTimes,
  suggestReminderTime,
} from "./reminderTimes";

describe("parseReminderTime", () => {
  it("accepts zero-padded 24-hour HH:MM", () => {
    expect(parseReminderTime("00:00")).toEqual({ hour: 0, minute: 0 });
    expect(parseReminderTime("09:05")).toEqual({ hour: 9, minute: 5 });
    expect(parseReminderTime("23:59")).toEqual({ hour: 23, minute: 59 });
  });

  it("rejects everything else", () => {
    for (const value of [
      "9:00",
      "24:00",
      "12:60",
      "12:5",
      " 12:00",
      "12:00 ",
      "12-00",
      "1200",
      "",
      12,
      null,
      undefined,
      ["12:00"],
    ]) {
      expect(parseReminderTime(value)).toBeNull();
    }
  });
});

describe("formatReminderTime / picker dates", () => {
  it("pads hours and minutes", () => {
    expect(formatReminderTime(7, 5)).toBe("07:05");
    expect(formatReminderTime(23, 0)).toBe("23:00");
  });

  it("round-trips through a local date", () => {
    const base = new Date(2026, 9, 13, 15, 42);
    const date = reminderTimeToDate("07:30", base);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
      2026, 9, 13,
    ]);
    expect([date.getHours(), date.getMinutes()]).toEqual([7, 30]);
    expect(dateToReminderTime(date)).toBe("07:30");
    expect(dateToReminderTime(new Date(2026, 0, 1, 0, 0))).toBe("00:00");
  });

  it("falls back to the default time for garbage", () => {
    const date = reminderTimeToDate("garbage", new Date(2026, 9, 13));
    expect(dateToReminderTime(date)).toBe("20:00");
  });
});

describe("normalizeReminderTimes", () => {
  it("drops invalid values, dedupes, sorts and keeps the earliest three", () => {
    expect(
      normalizeReminderTimes(["21:00", "bad", "09:00", "21:00", 5, "13:30", "07:15"]),
    ).toEqual(["07:15", "09:00", "13:30"]);
    expect(normalizeReminderTimes([])).toEqual([]);
  });
});

describe("parseReminderTimes", () => {
  it("defaults when the setting is absent or broken", () => {
    for (const value of [
      null,
      undefined,
      "",
      "garbage",
      "{\"a\":1}",
      "\"20:00\"",
      "[]",
      "[\"25:00\", 7, null]",
    ]) {
      expect(parseReminderTimes(value)).toEqual(["20:00"]);
    }
  });

  it("cleans a stored list", () => {
    expect(parseReminderTimes("[\"21:00\",\"09:00\",\"09:00\"]")).toEqual([
      "09:00",
      "21:00",
    ]);
    expect(parseReminderTimes("[\"9:00\",\"07:30\",\"12:60\"]")).toEqual([
      "07:30",
    ]);
    expect(
      parseReminderTimes("[\"22:00\",\"08:00\",\"12:00\",\"18:00\"]"),
    ).toEqual(["08:00", "12:00", "18:00"]);
  });

  it("returns a fresh array, not the shared default", () => {
    const times = parseReminderTimes(null);
    expect(times).toEqual(DEFAULT_REMINDER_TIMES);
    expect(times).not.toBe(DEFAULT_REMINDER_TIMES);
  });
});

describe("isValidReminderTimes / serializeReminderTimes", () => {
  it("accepts 1–3 distinct valid times and writes them sorted", () => {
    expect(isValidReminderTimes(["20:00"])).toBe(true);
    expect(serializeReminderTimes(["20:00"])).toBe("[\"20:00\"]");
    expect(serializeReminderTimes(["21:00", "08:00", "12:30"])).toBe(
      "[\"08:00\",\"12:30\",\"21:00\"]",
    );
  });

  it("round-trips through parseReminderTimes", () => {
    const times = ["07:00", "13:15", "22:45"];
    expect(parseReminderTimes(serializeReminderTimes(times))).toEqual(times);
  });

  it("refuses to write an invalid list", () => {
    for (const times of [
      [],
      ["08:00", "09:00", "10:00", "11:00"],
      ["08:00", "08:00"],
      ["8:00"],
      ["08:00", "garbage"],
    ]) {
      expect(isValidReminderTimes(times)).toBe(false);
      expect(() => serializeReminderTimes(times)).toThrow();
    }
  });
});

describe("list edits", () => {
  it("adds a new time in order, up to three", () => {
    expect(addReminderTime(["20:00"], "08:00")).toEqual(["08:00", "20:00"]);
    expect(addReminderTime(["08:00", "20:00"], "12:00")).toEqual([
      "08:00",
      "12:00",
      "20:00",
    ]);
  });

  it("returns the same array when there is nothing to change", () => {
    const one = ["20:00"];
    const full = ["08:00", "12:00", "20:00"];
    expect(addReminderTime(one, "20:00")).toBe(one);
    expect(addReminderTime(one, "bad")).toBe(one);
    expect(addReminderTime(full, "21:00")).toBe(full);
    expect(replaceReminderTime(full, "08:00", "12:00")).toBe(full);
    expect(replaceReminderTime(full, "09:00", "10:00")).toBe(full);
    expect(replaceReminderTime(full, "08:00", "8:00")).toBe(full);
    expect(removeReminderTime(one, "20:00")).toBe(one);
    expect(removeReminderTime(full, "09:00")).toBe(full);
  });

  it("replaces a time and keeps the list sorted", () => {
    expect(replaceReminderTime(["08:00", "20:00"], "08:00", "21:30")).toEqual([
      "20:00",
      "21:30",
    ]);
  });

  it("removes a time but never the last one", () => {
    expect(removeReminderTime(["08:00", "20:00"], "08:00")).toEqual(["20:00"]);
    expect(canRemoveReminderTime(["20:00"])).toBe(false);
    expect(canRemoveReminderTime(["08:00", "20:00"])).toBe(true);
    expect(canAddReminderTime(["08:00", "12:00"])).toBe(true);
    expect(canAddReminderTime(["08:00", "12:00", "20:00"])).toBe(false);
  });

  it("suggests the nearest free whole hour around 20:00", () => {
    expect(suggestReminderTime([])).toBe("20:00");
    expect(suggestReminderTime(["20:00"])).toBe("19:00");
    expect(suggestReminderTime(["19:00", "20:00"])).toBe("21:00");
    expect(suggestReminderTime(["19:00", "20:00", "21:00"])).toBe("18:00");
    expect(suggestReminderTime(["08:30"])).toBe("20:00");
  });
});

describe("formatRemindersPerDay", () => {
  it("uses the right form of «раз»", () => {
    expect([1, 2, 3].map(formatRemindersPerDay)).toEqual([
      "1 раз в день",
      "2 раза в день",
      "3 раза в день",
    ]);
  });
});
