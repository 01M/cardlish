/**
 * @jest-environment node
 */
/// <reference types="node" />
// Проверки тематических разделов (генерирует scripts/build_topics.py; приложение
// их пока не читает). Ключи — dict_key карточек словаря
import { readFileSync } from "node:fs";
import { join } from "node:path";
import dictionary from "./dictionary.json";
import topics from "./topics.json";

// Совпадает с MIN_TOPIC_SIZE в scripts/build_topics.py: меньшие разделы не пишутся
const MIN_TOPIC_SIZE = 40;

const dictionaryKeys = new Set(
  (dictionary as { term: string }[]).map((card) => card.term.trim().toLowerCase()),
);
const membership = topics as unknown as Record<string, unknown>;
const entries = Object.entries(membership);

describe("src/assets/topics.json", () => {
  it("maps slugs to arrays of strings", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [slug, keys] of entries) {
      expect(slug).toMatch(/^[a-z]+$/);
      expect(Array.isArray(keys)).toBe(true);
      expect((keys as unknown[]).every((key) => typeof key === "string")).toBe(true);
    }
  });

  it("has unique slugs in the file text", () => {
    // JSON.parse молча оставляет последний из повторов, поэтому смотрим текст
    const text = readFileSync(join(__dirname, "topics.json"), "utf8");
    const slugs = [...text.matchAll(/^ {2}"([^"]+)": \[/gm)].map((match) => match[1]);

    expect(slugs).toEqual(Object.keys(membership));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has only non-empty topics with at least the minimum size", () => {
    const small = entries
      .filter(([, keys]) => (keys as string[]).length < MIN_TOPIC_SIZE)
      .map(([slug, keys]) => `${slug}: ${(keys as string[]).length}`);

    expect(small).toEqual([]);
  });

  it("uses only keys that exist in dictionary.json", () => {
    const unknown = entries.flatMap(([slug, keys]) =>
      (keys as string[])
        .filter((key) => !dictionaryKeys.has(key))
        .map((key) => `${slug}: ${key}`),
    );

    expect(unknown.slice(0, 20)).toEqual([]);
  });

  it("has no duplicate keys within a topic and keeps keys sorted", () => {
    for (const [slug, keys] of entries) {
      const list = keys as string[];
      expect({ slug, duplicates: list.length - new Set(list).size }).toEqual({
        slug,
        duplicates: 0,
      });
      expect({ slug, sorted: list.join("\n") === [...list].sort().join("\n") }).toEqual({
        slug,
        sorted: true,
      });
    }
  });
});
