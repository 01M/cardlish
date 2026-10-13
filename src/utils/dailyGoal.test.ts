import {
  clampDailyGoal,
  DAILY_GOAL_DEFAULT,
  formatDailyProgress,
  getDailyProgressParts,
  getDailyProgressRatio,
  isDailyGoalReached,
  isValidDailyGoal,
  parseDailyGoal,
  stepDailyGoal,
  toLocalDay,
} from "./dailyGoal";

// Даты строятся из местных компонентов, поэтому тесты не зависят от часового
// пояса машины
const local = (
  year: number,
  monthIndex: number,
  day: number,
  hours = 12,
  minutes = 0,
  seconds = 0,
  ms = 0,
) => new Date(year, monthIndex, day, hours, minutes, seconds, ms);

describe("toLocalDay", () => {
  it("formats the local date with zero padding", () => {
    expect(toLocalDay(local(2026, 0, 5))).toBe("2026-01-05");
    expect(toLocalDay(local(2026, 9, 13))).toBe("2026-10-13");
  });

  it("keeps the local day right before and right after midnight", () => {
    expect(toLocalDay(local(2026, 9, 13, 23, 59, 59, 999))).toBe("2026-10-13");
    expect(toLocalDay(local(2026, 9, 14, 0, 0, 0, 0))).toBe("2026-10-14");
    expect(toLocalDay(local(2026, 9, 14, 0, 30))).toBe("2026-10-14");
  });

  it("crosses month and year boundaries", () => {
    expect(toLocalDay(local(2026, 0, 31, 23, 59))).toBe("2026-01-31");
    expect(toLocalDay(local(2026, 1, 1, 0, 0))).toBe("2026-02-01");
    expect(toLocalDay(local(2025, 11, 31, 23, 59, 59, 999))).toBe("2025-12-31");
    expect(toLocalDay(local(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });

  it("handles leap days", () => {
    expect(toLocalDay(local(2028, 1, 29, 23, 59))).toBe("2028-02-29");
    expect(toLocalDay(local(2028, 2, 1, 0, 0))).toBe("2028-03-01");
  });

  it("moves to the next day when a minute passes midnight", () => {
    const beforeMidnight = local(2026, 11, 31, 23, 59, 30);
    const afterMidnight = new Date(beforeMidnight.getTime() + 60_000);

    expect(toLocalDay(beforeMidnight)).toBe("2026-12-31");
    expect(toLocalDay(afterMidnight)).toBe("2027-01-01");
  });
});

describe("daily goal", () => {
  it("accepts 5–50 in steps of 5", () => {
    expect([5, 10, 25, 50].every(isValidDailyGoal)).toBe(true);
    expect([0, 4, 7, 55, 10.5, -5, NaN].some(isValidDailyGoal)).toBe(false);
  });

  it("parses a stored value and falls back to the default on anything else", () => {
    expect(DAILY_GOAL_DEFAULT).toBe(10);
    expect(parseDailyGoal("25")).toBe(25);
    expect(parseDailyGoal("5")).toBe(5);
    expect(parseDailyGoal("50")).toBe(50);
    for (const value of [null, undefined, "", "abc", "7", "0", "55", "-5", "10.0", " 10", "1e1"]) {
      expect(parseDailyGoal(value)).toBe(DAILY_GOAL_DEFAULT);
    }
  });

  it("clamps to the range and rounds to the step", () => {
    expect(clampDailyGoal(0)).toBe(5);
    expect(clampDailyGoal(99)).toBe(50);
    expect(clampDailyGoal(12)).toBe(10);
    expect(clampDailyGoal(13)).toBe(15);
    expect(clampDailyGoal(NaN)).toBe(DAILY_GOAL_DEFAULT);
  });

  it("steps by 5 and stops at the limits", () => {
    expect(stepDailyGoal(10, 1)).toBe(15);
    expect(stepDailyGoal(10, -1)).toBe(5);
    expect(stepDailyGoal(5, -1)).toBe(5);
    expect(stepDailyGoal(50, 1)).toBe(50);
  });
});

describe("daily progress labels", () => {
  it("shows the count of new words today below the goal", () => {
    expect(formatDailyProgress(0, 10)).toBe("Новых слов сегодня: 0 из 10");
    expect(formatDailyProgress(9, 10)).toBe("Новых слов сегодня: 9 из 10");
    expect(isDailyGoalReached(9, 10)).toBe(false);
  });

  it("switches to the reached wording at the goal and shows words over the goal", () => {
    expect(formatDailyProgress(10, 10)).toBe("Цель на день выполнена: 10 из 10");
    expect(formatDailyProgress(23, 10)).toBe(
      "Цель на день выполнена: 10 из 10, ещё 13 сверх цели",
    );
    expect(isDailyGoalReached(10, 10)).toBe(true);
  });

  it("splits the visible label into title, count and over-goal extra", () => {
    expect(getDailyProgressParts(7, 10)).toEqual({
      title: "Новых слов сегодня",
      count: "7 из 10",
      extra: null,
    });
    expect(getDailyProgressParts(10, 10)).toEqual({
      title: "Цель выполнена",
      count: "10 из 10",
      extra: null,
    });
    expect(getDailyProgressParts(23, 10)).toEqual({
      title: "Цель выполнена",
      count: "10 из 10",
      extra: "+13",
    });
  });

  it("fills the bar proportionally and caps it at 100%", () => {
    expect(getDailyProgressRatio(0, 10)).toBe(0);
    expect(getDailyProgressRatio(5, 20)).toBe(0.25);
    expect(getDailyProgressRatio(10, 10)).toBe(1);
    expect(getDailyProgressRatio(30, 10)).toBe(1);
  });
});
