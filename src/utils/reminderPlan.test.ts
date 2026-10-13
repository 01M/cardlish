import { toLocalDay } from "./dailyGoal";
import {
  getReminderBody,
  localDayOfYear,
  PlannedReminder,
  planReminders,
  REMINDER_PLAN_MAX,
  REMINDER_TITLE,
  REMINDER_WINDOW_DAYS,
  ReminderPlanInput,
} from "./reminderPlan";

// Даты строятся из местных компонентов, а проверки идут по местным
// компонентам, поэтому тесты не зависят от часового пояса машины
const local = (
  year: number,
  monthIndex: number,
  day: number,
  hours = 12,
  minutes = 0,
) => new Date(year, monthIndex, day, hours, minutes);

const plan = (overrides: Partial<ReminderPlanInput>) =>
  planReminders({
    now: local(2026, 9, 13, 12, 0),
    times: ["09:00", "20:00"],
    windowDays: REMINDER_WINDOW_DAYS,
    goalReachedToday: false,
    reviewCount: 5,
    dailyGoal: 10,
    ...overrides,
  });

const slots = (items: PlannedReminder[]) =>
  items.map(
    ({ at }) =>
      `${toLocalDay(at)} ${String(at.getHours()).padStart(2, "0")}:${String(
        at.getMinutes(),
      ).padStart(2, "0")}`,
  );

describe("planReminders: window and order", () => {
  it("plans today and the next six days, skipping past times", () => {
    expect(slots(plan({}))).toEqual([
      "2026-10-13 20:00",
      "2026-10-14 09:00",
      "2026-10-14 20:00",
      "2026-10-15 09:00",
      "2026-10-15 20:00",
      "2026-10-16 09:00",
      "2026-10-16 20:00",
      "2026-10-17 09:00",
      "2026-10-17 20:00",
      "2026-10-18 09:00",
      "2026-10-18 20:00",
      "2026-10-19 09:00",
      "2026-10-19 20:00",
    ]);
  });

  it("keeps only strictly future times", () => {
    const items = plan({ now: local(2026, 9, 13, 20, 0) });
    expect(slots(items)[0]).toBe("2026-10-14 09:00");
    const justBefore = plan({ now: new Date(local(2026, 9, 13, 20, 0).getTime() - 1) });
    expect(slots(justBefore)[0]).toBe("2026-10-13 20:00");
  });

  it("sorts ascending whatever the order of the times", () => {
    const items = plan({ times: ["20:00", "07:30", "13:00"], now: local(2026, 9, 13, 0, 0) });
    expect(slots(items).slice(0, 4)).toEqual([
      "2026-10-13 07:30",
      "2026-10-13 13:00",
      "2026-10-13 20:00",
      "2026-10-14 07:30",
    ]);
    const times = items.map(({ at }) => at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("ignores duplicate and invalid times", () => {
    expect(slots(plan({ times: ["20:00", "20:00", "8:00", "bad"] }))).toEqual(
      slots(plan({ times: ["20:00"] })),
    );
  });

  it("follows windowDays", () => {
    const items = plan({ windowDays: 2, now: local(2026, 9, 13, 0, 0) });
    expect(slots(items)).toEqual([
      "2026-10-13 09:00",
      "2026-10-13 20:00",
      "2026-10-14 09:00",
      "2026-10-14 20:00",
    ]);
  });

  it("returns an empty plan without times", () => {
    expect(plan({ times: [] })).toEqual([]);
  });
});

describe("planReminders: goal reached today", () => {
  it("drops all of today's reminders but keeps the next days", () => {
    const items = plan({ goalReachedToday: true, now: local(2026, 9, 13, 6, 0) });
    expect(items.some(({ at }) => toLocalDay(at) === "2026-10-13")).toBe(false);
    expect(slots(items)[0]).toBe("2026-10-14 09:00");
    expect(items).toHaveLength(12);
  });

  it("still ends the window six days after today", () => {
    const items = plan({ goalReachedToday: true });
    expect(slots(items).at(-1)).toBe("2026-10-19 20:00");
  });
});

describe("planReminders: cap", () => {
  it("never plans more than 21 items, keeping the earliest", () => {
    expect(REMINDER_PLAN_MAX).toBe(21);
    const full = plan({ times: ["08:00", "13:00", "20:00"], now: local(2026, 9, 13, 0, 0) });
    expect(full).toHaveLength(21);

    const longWindow = plan({
      times: ["08:00", "13:00", "20:00"],
      windowDays: 10,
      now: local(2026, 9, 13, 0, 0),
    });
    expect(longWindow).toHaveLength(21);
    expect(slots(longWindow).at(-1)).toBe("2026-10-19 20:00");

    const fourTimes = plan({
      times: ["06:00", "09:00", "13:00", "20:00"],
      now: local(2026, 9, 13, 0, 0),
    });
    expect(fourTimes).toHaveLength(21);
    expect(slots(fourTimes).at(-1)).toBe("2026-10-18 06:00");
  });
});

describe("planReminders: daylight saving changes", () => {
  // Европа: 29 марта и 25 октября 2026; США: 8 марта и 1 ноября 2026.
  // Каждое напоминание должно прийти в то же местное время на следующий
  // календарный день, где бы ни шли тесты
  it.each([
    ["spring EU", local(2026, 2, 27, 12)],
    ["spring US", local(2026, 2, 6, 12)],
    ["autumn EU", local(2026, 9, 23, 12)],
    ["autumn US", local(2026, 9, 30, 12)],
  ])("keeps local wall-clock times across the %s change", (_, now) => {
    const items = plan({ now, times: ["01:30", "09:00", "20:00"] });
    // Сегодня 01:30 и 09:00 уже прошли
    expect(items).toHaveLength(19);
    const expectedDays = Array.from({ length: 7 }, (__, offset) =>
      toLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)),
    );
    expect(new Set(items.map(({ at }) => toLocalDay(at)))).toEqual(new Set(expectedDays));
    for (const { at } of items) {
      expect(["01:30", "09:00", "20:00"]).toContain(
        `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`,
      );
    }
    expect(
      items.filter(({ at }) => at.getHours() === 9).map(({ at }) => toLocalDay(at)),
    ).toEqual(expectedDays.slice(1));
  });
});

describe("planReminders: text", () => {
  it("uses the existing title", () => {
    for (const item of plan({})) expect(item.title).toBe(REMINDER_TITLE);
    expect(REMINDER_TITLE).toBe("Время повторить слова");
  });

  it("is deterministic: the same slot always gets the same text", () => {
    const first = plan({ now: local(2026, 9, 13, 6, 0) });
    const later = plan({ now: local(2026, 9, 15, 6, 0) });
    const textBySlot = new Map(first.map((item) => [item.at.getTime(), item.body]));
    for (const item of later) {
      if (textBySlot.has(item.at.getTime())) {
        expect(item.body).toBe(textBySlot.get(item.at.getTime()));
      }
    }
    expect(plan({})).toEqual(plan({}));
  });

  it("rotates by day and by time index", () => {
    const items = plan({ now: local(2026, 9, 13, 0, 0), times: ["09:00", "20:00"] });
    // Два времени в один день — разные тексты
    expect(items[0].body).not.toBe(items[1].body);
    // Тот же час в соседние дни — разные тексты, через три дня — снова тот же
    const nine = items.filter(({ at }) => at.getHours() === 9).map(({ body }) => body);
    expect(new Set(nine.slice(0, 3)).size).toBe(3);
    expect(nine[3]).toBe(nine[0]);
  });

  it("has no emoji", () => {
    const bodies = [
      ...plan({ reviewCount: 3 }),
      ...plan({ reviewCount: 0 }),
    ].map(({ title, body }) => `${title} ${body}`);
    for (const text of bodies) {
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("getReminderBody", () => {
  // 1 января — день 0, так что вариант = номер времени
  const jan1 = local(2026, 0, 1, 9);

  it("puts the review count with the right plural forms", () => {
    const counts = [1, 2, 5, 11, 21, 22];
    expect(counts.map((count) => getReminderBody(jan1, 0, count, 10))).toEqual([
      "Пора повторить 1 слово. Хватит пары минут.",
      "Пора повторить 2 слова. Хватит пары минут.",
      "Пора повторить 5 слов. Хватит пары минут.",
      "Пора повторить 11 слов. Хватит пары минут.",
      "Пора повторить 21 слово. Хватит пары минут.",
      "Пора повторить 22 слова. Хватит пары минут.",
    ]);
    expect(counts.map((count) => getReminderBody(jan1, 1, count, 10))).toEqual([
      "1 слово ждёт повторения — короткая сессия закрепит его.",
      "2 слова ждут повторения — короткая сессия закрепит их.",
      "5 слов ждут повторения — короткая сессия закрепит их.",
      "11 слов ждут повторения — короткая сессия закрепит их.",
      "21 слово ждёт повторения — короткая сессия закрепит его.",
      "22 слова ждут повторения — короткая сессия закрепит их.",
    ]);
    expect(counts.map((count) => getReminderBody(jan1, 2, count, 10))).toEqual([
      "Повторите 1 слово, пока оно свежо в памяти.",
      "Повторите 2 слова, пока они свежи в памяти.",
      "Повторите 5 слов, пока они свежи в памяти.",
      "Повторите 11 слов, пока они свежи в памяти.",
      "Повторите 21 слово, пока оно свежо в памяти.",
      "Повторите 22 слова, пока они свежи в памяти.",
    ]);
  });

  it("groups large counts with a non-breaking space", () => {
    expect(getReminderBody(jan1, 0, 1234, 10)).toBe(
      "Пора повторить 1 234 слова. Хватит пары минут.",
    );
  });

  it("talks about new words and the goal when nothing is due", () => {
    expect([0, 1, 2].map((index) => getReminderBody(jan1, index, 0, 10))).toEqual([
      "Новые слова ждут: цель на сегодня — 10 новых слов.",
      "Самое время для новых слов: на сегодня запланировано 10 новых слов.",
      "Короткая сессия — и вы ближе к цели: 10 новых слов в день.",
    ]);
    expect(getReminderBody(jan1, 0, 0, 5)).toBe(
      "Новые слова ждут: цель на сегодня — 5 новых слов.",
    );
  });
});

describe("localDayOfYear", () => {
  it("counts from 1 January using local components", () => {
    expect(localDayOfYear(local(2026, 0, 1, 0, 0))).toBe(0);
    expect(localDayOfYear(local(2026, 0, 1, 23, 59))).toBe(0);
    expect(localDayOfYear(local(2026, 2, 30, 12))).toBe(88);
    expect(localDayOfYear(local(2026, 11, 31, 23, 59))).toBe(364);
    expect(localDayOfYear(local(2028, 11, 31, 12))).toBe(365);
  });
});
