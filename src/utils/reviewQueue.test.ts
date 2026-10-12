import { mergeReviewQueue, ReviewQueue } from "./reviewQueue";

type TestWord = { id: number; term: string };

const word = (id: number, term = `w${id}`): TestWord => ({ id, term });
const words = (...ids: number[]) => ids.map((id) => word(id));
const ids = (queue: ReviewQueue<TestWord>) => queue.words.map((w) => w.id);

describe("mergeReviewQueue", () => {
  it("builds an empty queue from fresh in the same order", () => {
    const fresh = words(3, 1, 2);
    const result = mergeReviewQueue({ words: [], index: 0 }, fresh);

    expect(ids(result)).toEqual([3, 1, 2]);
    expect(result.index).toBe(0);
  });

  it("keeps the previous order of words that are still due", () => {
    const result = mergeReviewQueue(
      { words: words(1, 2, 3), index: 0 },
      words(3, 1, 2),
    );

    expect(ids(result)).toEqual([1, 2, 3]);
  });

  it("drops words that are no longer due", () => {
    const result = mergeReviewQueue(
      { words: words(1, 2, 3, 4), index: 0 },
      words(4, 1),
    );

    expect(ids(result)).toEqual([1, 4]);
  });

  it("appends newly due words at the end in fresh order", () => {
    const result = mergeReviewQueue(
      { words: words(1, 2), index: 0 },
      words(5, 2, 4, 1),
    );

    expect(ids(result)).toEqual([1, 2, 5, 4]);
  });

  it("takes the data of kept words from fresh", () => {
    const result = mergeReviewQueue(
      { words: [word(1, "old"), word(2, "same")], index: 0 },
      [word(2, "same"), word(1, "updated")],
    );

    expect(result.words).toEqual([word(1, "updated"), word(2, "same")]);
  });

  describe("index", () => {
    it("stays on the current word when it is still due", () => {
      // Перед текущим словом выбыло одно — индекс сдвигается, слово то же
      const result = mergeReviewQueue(
        { words: words(1, 2, 3, 4), index: 2 },
        words(4, 3, 2),
      );

      expect(ids(result)).toEqual([2, 3, 4]);
      expect(result.index).toBe(1);
      expect(result.words[result.index].id).toBe(3);
    });

    it("moves to the next remaining word when the current one is dropped", () => {
      const result = mergeReviewQueue(
        { words: words(1, 2, 3, 4), index: 1 },
        words(1, 4),
      );

      expect(ids(result)).toEqual([1, 4]);
      expect(result.words[result.index].id).toBe(4);
    });

    it("wraps to the first word when the dropped current word was last", () => {
      const result = mergeReviewQueue(
        { words: words(1, 2, 3), index: 2 },
        words(1, 2),
      );

      expect(ids(result)).toEqual([1, 2]);
      expect(result.index).toBe(0);
    });

    it("moves to the first appended word when the dropped last word is followed by new ones", () => {
      // «Следующее оставшееся» считается по итоговой очереди, куда уже
      // добавлены новые слова, поэтому переноса на начало нет
      const result = mergeReviewQueue(
        { words: words(1, 2, 3), index: 2 },
        words(9, 1, 2),
      );

      expect(ids(result)).toEqual([1, 2, 9]);
      expect(result.words[result.index].id).toBe(9);
    });

    it("returns an empty queue at index 0 when everything is dropped", () => {
      const result = mergeReviewQueue({ words: words(1, 2), index: 1 }, []);

      expect(result).toEqual({ words: [], index: 0 });
    });

    it("replaces the whole queue when no previous word is due anymore", () => {
      const result = mergeReviewQueue(
        { words: words(1, 2), index: 1 },
        words(7, 8),
      );

      expect(ids(result)).toEqual([7, 8]);
      expect(result.index).toBe(0);
    });
  });

  it("does not mutate the input arrays", () => {
    const prevWords = words(1, 2, 3);
    const fresh = [word(3, "new data"), word(1), word(5)];
    const prevSnapshot = prevWords.map((w) => ({ ...w }));
    const freshSnapshot = fresh.map((w) => ({ ...w }));

    mergeReviewQueue({ words: prevWords, index: 1 }, fresh);

    expect(prevWords).toEqual(prevSnapshot);
    expect(fresh).toEqual(freshSnapshot);
  });
});
