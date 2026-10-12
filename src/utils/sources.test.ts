import sourcesJson from "../data/sources.json";
import { formatUrlForDisplay, parseSources } from "./sources";

const validSource = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  key: "example",
  title: "Example dictionary",
  author: "Author",
  version: "1.0",
  url: "https://example.org/",
  licenceName: "CC BY-SA 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  usageRu: "Переводы",
  changesRu: "Формат изменён",
  noticeText: "",
  sortOrder: 1,
  ...overrides,
});

describe("parseSources", () => {
  it("accepts a valid list", () => {
    expect(parseSources([validSource()])).toEqual([validSource()]);
  });

  it("treats a missing noticeText as empty", () => {
    const { noticeText: _omitted, ...source } = validSource();

    expect(parseSources([source])[0].noticeText).toBe("");
  });

  it("orders sources by sortOrder", () => {
    const sources = parseSources([
      validSource({ key: "c", sortOrder: 3 }),
      validSource({ key: "a", sortOrder: 1 }),
      validSource({ key: "b", sortOrder: 2 }),
    ]);

    expect(sources.map((source) => source.key)).toEqual(["a", "b", "c"]);
  });

  it.each([
    "key",
    "title",
    "author",
    "version",
    "licenceName",
    "licenceUrl",
    "usageRu",
    "changesRu",
  ])("rejects a missing or empty %s", (field) => {
    const { [field]: _omitted, ...missing } = validSource();

    expect(() => parseSources([missing])).toThrow(`"${field}"`);
    expect(() => parseSources([validSource({ [field]: "  " })])).toThrow(
      `"${field}"`,
    );
  });

  it("treats a missing or empty url as no project page", () => {
    const { url: _omitted, ...withoutUrl } = validSource();

    expect(parseSources([withoutUrl])[0].url).toBe("");
    expect(parseSources([validSource({ url: "" })])[0].url).toBe("");
  });

  it("rejects a non-string or blank url", () => {
    expect(() => parseSources([validSource({ url: 42 })])).toThrow('"url"');
    expect(() => parseSources([validSource({ url: "  " })])).toThrow("https://");
  });

  it.each(["url", "licenceUrl"])("rejects a non-https %s", (field) => {
    for (const url of ["http://example.org/", "example.org", "ftp://example.org/"]) {
      expect(() => parseSources([validSource({ [field]: url })])).toThrow(
        "https://",
      );
    }
  });

  it("rejects a missing or non-numeric sortOrder", () => {
    const { sortOrder: _omitted, ...missing } = validSource();

    expect(() => parseSources([missing])).toThrow('"sortOrder"');
    expect(() => parseSources([validSource({ sortOrder: "1" })])).toThrow(
      '"sortOrder"',
    );
  });

  it("rejects a non-string noticeText", () => {
    expect(() => parseSources([validSource({ noticeText: null })])).toThrow(
      '"noticeText"',
    );
  });

  it("rejects duplicate keys", () => {
    expect(() =>
      parseSources([validSource(), validSource({ sortOrder: 2 })]),
    ).toThrow("duplicate key");
  });

  it("rejects anything but an array of objects", () => {
    expect(() => parseSources({})).toThrow("expected an array");
    expect(() => parseSources(["source"])).toThrow("expected an object");
  });
});

describe("src/data/sources.json", () => {
  it("is a valid, non-empty source list", () => {
    expect(parseSources(sourcesJson).length).toBeGreaterThan(0);
  });

  it("lists the bundled FreeDict dictionary", () => {
    expect(parseSources(sourcesJson).map((source) => source.key)).toContain(
      "freedict-eng-rus",
    );
  });
});

describe("formatUrlForDisplay", () => {
  it("drops the scheme and a trailing slash", () => {
    expect(formatUrlForDisplay("https://freedict.org/downloads/")).toBe(
      "freedict.org/downloads",
    );
    expect(
      formatUrlForDisplay("https://creativecommons.org/licenses/by-sa/3.0/deed.ru"),
    ).toBe("creativecommons.org/licenses/by-sa/3.0/deed.ru");
  });
});
