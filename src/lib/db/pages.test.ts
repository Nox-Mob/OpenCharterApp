import { describe, expect, it } from "vitest";
import { readAllPages } from "./pages";

describe("readAllPages", () => {
  it("reads until a short page and asks for consecutive ranges", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => i);
    const asked: [number, number][] = [];
    const out = await readAllPages<number>(async (from, to) => {
      asked.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(out).toEqual(rows);
    expect(asked).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("asks once more when the last page is exactly full", async () => {
    let calls = 0;
    const out = await readAllPages<number>(async (from) => {
      calls++;
      return { data: from === 0 ? [1, 2] : [], error: null };
    }, 2);
    expect(out).toEqual([1, 2]);
    expect(calls).toBe(2);
  });

  it("throws the first error", async () => {
    await expect(
      readAllPages(async () => ({ data: null, error: new Error("boom") })),
    ).rejects.toThrow("boom");
  });
});
