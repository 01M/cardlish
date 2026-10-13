import {
  createReminderReplanner,
  REMINDER_NOTIFICATION_TYPE,
  ReminderDeps,
  ReminderNotificationsApi,
  ReminderState,
} from "./reminders";

// Модуль expo-notifications подменяется объектом с тем же набором функций
// (jest.fn); база — функцией loadState. Так проверяется только порядок шагов
// адаптера, без устройства

const NOW = new Date(2026, 9, 13, 12, 0);

const STATE: ReminderState = {
  enabled: true,
  times: ["09:00", "20:00"],
  dailyGoal: 10,
  introducedToday: 3,
  reviewCount: 4,
};

const createFakeNotifications = ({ granted = true } = {}) => {
  const calls: string[] = [];
  const api = {
    AndroidImportance: { DEFAULT: 3 },
    SchedulableTriggerInputTypes: { DATE: "date" },
    cancelAllScheduledNotificationsAsync: jest.fn(async () => {
      calls.push("cancelAll");
    }),
    getPermissionsAsync: jest.fn(async () => {
      calls.push("permissions");
      return { granted };
    }),
    setNotificationChannelAsync: jest.fn(async () => {
      calls.push("channel");
      return null;
    }),
    scheduleNotificationAsync: jest.fn(async () => {
      calls.push("schedule");
      return "id";
    }),
  };
  return {
    api,
    calls,
    notifications: api as unknown as ReminderNotificationsApi,
  };
};

const createDeps = (
  overrides: Partial<ReminderDeps> = {},
  state: Partial<ReminderState> = {},
): ReminderDeps => ({
  notifications: createFakeNotifications().notifications,
  loadState: jest.fn(async () => ({ ...STATE, ...state })),
  androidChannel: null,
  now: () => NOW,
  ...overrides,
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe("replanReminders", () => {
  it("cancels everything first, then schedules one-shot DATE triggers", async () => {
    const fake = createFakeNotifications();
    const loadState = jest.fn(async () => STATE);
    const replan = createReminderReplanner(
      createDeps({ notifications: fake.notifications, loadState }),
    );

    await replan();

    expect(loadState).toHaveBeenCalledWith("2026-10-13");
    // Сегодня 09:00 прошло: 20:00 сегодня + 6 дней × 2
    expect(fake.calls).toEqual([
      "cancelAll",
      "permissions",
      ...Array<string>(13).fill("schedule"),
    ]);
    const requests = fake.api.scheduleNotificationAsync.mock.calls.map(
      (call) => (call as unknown[])[0] as {
        content: { title: string; body: string; data: unknown };
        trigger: { type: string; date: Date; channelId?: string };
      },
    );
    expect(requests[0].trigger).toEqual({
      type: "date",
      date: new Date(2026, 9, 13, 20, 0),
    });
    expect(requests[0].content.data).toEqual({ type: REMINDER_NOTIFICATION_TYPE });
    expect(requests[0].content.title).toBe("Время повторить слова");
    expect(requests[0].content.body).toMatch(/4 слова/);
    for (const request of requests) {
      expect(request.trigger.type).toBe("date");
    }
  });

  it("uses the Android channel when given", async () => {
    const fake = createFakeNotifications();
    const replan = createReminderReplanner(
      createDeps({
        notifications: fake.notifications,
        androidChannel: { id: "study-reminders", name: "Напоминания об учебе" },
      }),
    );

    await replan();

    expect(fake.api.setNotificationChannelAsync).toHaveBeenCalledWith(
      "study-reminders",
      { name: "Напоминания об учебе", importance: 3 },
    );
    expect(fake.calls.indexOf("channel")).toBeLessThan(fake.calls.indexOf("schedule"));
    const firstRequest = (
      fake.api.scheduleNotificationAsync.mock.calls[0] as unknown[]
    )[0] as { trigger: { channelId?: string } };
    expect(firstRequest.trigger.channelId).toBe("study-reminders");
  });

  it("skips today when the daily goal is reached", async () => {
    const fake = createFakeNotifications();
    const replan = createReminderReplanner(
      createDeps({ notifications: fake.notifications }, { introducedToday: 10 }),
    );

    await replan();

    const dates = fake.api.scheduleNotificationAsync.mock.calls.map(
      (call) => ((call as unknown[])[0] as { trigger: { date: Date } }).trigger.date,
    );
    expect(dates).toHaveLength(12);
    expect(dates.every((date) => date.getDate() !== 13)).toBe(true);
  });

  it("cancels but schedules nothing without permission", async () => {
    const fake = createFakeNotifications({ granted: false });
    const replan = createReminderReplanner(createDeps({ notifications: fake.notifications }));

    await replan();

    expect(fake.calls).toEqual(["cancelAll", "permissions"]);
  });

  it("cancels everything and asks nothing when reminders are off", async () => {
    const fake = createFakeNotifications();
    const replan = createReminderReplanner(
      createDeps({ notifications: fake.notifications }, { enabled: false }),
    );

    await replan();

    expect(fake.calls).toEqual(["cancelAll"]);
  });

  it("does nothing when the notifications module is unavailable", async () => {
    const loadState = jest.fn(async () => STATE);
    const replan = createReminderReplanner(
      createDeps({ notifications: undefined, loadState }),
    );

    await replan();

    expect(loadState).not.toHaveBeenCalled();
  });

  it("runs overlapping calls one after another and coalesces waiting ones", async () => {
    const fake = createFakeNotifications();
    const gate = deferred();
    let loads = 0;
    fake.api.cancelAllScheduledNotificationsAsync.mockImplementationOnce(async () => {
      fake.calls.push("cancelAll");
      await gate.promise;
    });
    const loadState = jest.fn(async () => {
      loads += 1;
      fake.calls.push(`load${loads}`);
      return STATE;
    });
    const replan = createReminderReplanner(
      createDeps({ notifications: fake.notifications, loadState }),
    );

    const first = replan();
    // Пусть первый вызов дойдёт до снятия и застрянет там
    await new Promise((resolve) => setImmediate(resolve));
    const second = replan();
    const third = replan();
    expect(third).toBe(second);
    expect(fake.calls).toEqual(["load1", "cancelAll"]);

    gate.resolve();
    await Promise.all([first, second, third]);

    const schedules = Array<string>(13).fill("schedule");
    expect(fake.calls).toEqual([
      "load1",
      "cancelAll",
      "permissions",
      ...schedules,
      "load2",
      "cancelAll",
      "permissions",
      ...schedules,
    ]);
    expect(loadState).toHaveBeenCalledTimes(2);
  });

  it("swallows and logs errors, and the next call still runs", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const fake = createFakeNotifications();
    const loadState = jest
      .fn<Promise<ReminderState>, [string]>()
      .mockRejectedValueOnce(new Error("db is closed"))
      .mockResolvedValue(STATE);
    const replan = createReminderReplanner(
      createDeps({ notifications: fake.notifications, loadState }),
    );

    await expect(replan()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to replan reminders:",
      expect.any(Error),
    );
    expect(fake.api.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();

    await replan();
    expect(fake.api.scheduleNotificationAsync).toHaveBeenCalledTimes(13);
  });

  it("swallows a failing schedule call", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const fake = createFakeNotifications();
    fake.api.scheduleNotificationAsync.mockRejectedValueOnce(new Error("limit"));
    const replan = createReminderReplanner(createDeps({ notifications: fake.notifications }));

    await expect(replan()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});
