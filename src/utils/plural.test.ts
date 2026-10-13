import { pluralRu } from "./plural";

const words = (count: number) => pluralRu(count, "слово", "слова", "слов");

describe("pluralRu", () => {
  it("picks one / few / many by the last digits", () => {
    expect(
      [0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111, 112, 1002].map(words),
    ).toEqual([
      "слов",
      "слово",
      "слова",
      "слова",
      "слов",
      "слов",
      "слов",
      "слов",
      "слово",
      "слова",
      "слов",
      "слово",
      "слов",
      "слов",
      "слова",
    ]);
  });
});
