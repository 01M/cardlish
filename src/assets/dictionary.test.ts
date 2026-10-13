/**
 * @jest-environment node
 */
/// <reference types="node" />
// Проверки поставляемого словаря (генерируется scripts/convert_freedict.py) и
// версии данных, по которой приложение решает, нужна ли синхронизация
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import dictionary from "./dictionary.json";
import dictionaryVersion from "./dictionary.version.json";

const KNOWN_KEYS = ["example", "rank", "term", "transcription", "translation"];

const entries = dictionary as unknown as Record<string, unknown>[];

// Собираем все нарушения сразу, чтобы падение показало их список
const violations = (check: (entry: Record<string, unknown>) => boolean) =>
  entries.filter((entry) => !check(entry)).slice(0, 10);

describe("src/assets/dictionary.json", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("has only the known keys", () => {
    expect(
      violations(
        (entry) =>
          Object.keys(entry).sort().join() === KNOWN_KEYS.join(),
      ),
    ).toEqual([]);
  });

  it("has a non-empty term and translation and string optional fields", () => {
    expect(
      violations(
        (entry) =>
          typeof entry.term === "string" &&
          entry.term.trim() !== "" &&
          typeof entry.translation === "string" &&
          entry.translation.trim() !== "" &&
          typeof entry.transcription === "string" &&
          typeof entry.example === "string",
      ),
    ).toEqual([]);
  });

  it("contains no wiki markup in any field", () => {
    expect(
      violations((entry) =>
        Object.values(entry).every(
          (value) => typeof value !== "string" || !/\[\[|\]\]|\{\{|\}\}/.test(value),
        ),
      ),
    ).toEqual([]);
  });

  // Не больше 5 переводов и отсутствие повторов проверяют Python-тесты
  // конвертера: здесь переводы уже склеены через ", ", а сам перевод может
  // содержать ", " («по́сле того́, как»), поэтому число частей — лишь грубая
  // проверка (5 переводов, в каждом не больше одной запятой)
  it("has at most 10 comma-separated parts in a translation", () => {
    expect(
      violations(
        (entry) => String(entry.translation).split(", ").length <= 10,
      ),
    ).toEqual([]);
  });

  it("has unique lowercase terms", () => {
    const seen = new Set<string>();
    const duplicates = entries
      .map((entry) => String(entry.term).toLowerCase())
      .filter((term) => {
        if (seen.has(term)) return true;
        seen.add(term);
        return false;
      });

    expect(duplicates).toEqual([]);
  });

  it("has integer ranks that cover 1..N exactly once", () => {
    const ranks = entries.map((entry) => entry.rank);

    expect(ranks.filter((rank) => !Number.isInteger(rank))).toEqual([]);
    expect([...(ranks as number[])].sort((a, b) => a - b)).toEqual(
      Array.from({ length: entries.length }, (_, index) => index + 1),
    );
  });
});

// Версия данных — первые 16 hex-символов sha256 по байтам dictionary.json,
// одному "\n" и байтам topics.json (в обоих CRLF → LF); так же её считает
// scripts/data_version.py, которую вызывают convert_freedict.py и build_topics.py
const lfBytesOf = (name: string) =>
  Buffer.from(
    readFileSync(join(__dirname, name)).toString("latin1").replace(/\r\n/g, "\n"),
    "latin1",
  );

describe("src/assets/dictionary.version.json", () => {
  it("matches the current dictionary.json and topics.json", () => {
    const actual = createHash("sha256")
      .update(lfBytesOf("dictionary.json"))
      .update("\n")
      .update(lfBytesOf("topics.json"))
      .digest("hex")
      .slice(0, 16);

    if (dictionaryVersion.version !== actual) {
      throw new Error(
        `dictionary.version.json is stale (${dictionaryVersion.version}, dictionary.json + topics.json hash to ${actual}). ` +
          "Rerun scripts/convert_freedict.py or scripts/build_topics.py and commit the generated files together.",
      );
    }
  });
});
