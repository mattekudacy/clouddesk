import { describe, it, expect } from "vitest";
import { mergeDomainScore } from "./scoreMerge";

describe("mergeDomainScore", () => {
  it("takes the first observation raw, ignoring the seeded previous score", () => {
    expect(mergeDomainScore(50, 90, false)).toBe(90);
  });

  it("blends with alpha = 0.4 on subsequent observations", () => {
    // 60 * 0.6 + 90 * 0.4 = 36 + 36 = 72
    expect(mergeDomainScore(60, 90, true)).toBe(72);
  });

  it("rounds to the nearest integer", () => {
    // 55 * 0.6 + 70 * 0.4 = 33 + 28 = 61
    expect(mergeDomainScore(55, 70, true)).toBe(61);
  });

  it("pulls a low new score down as fast as it pulls a high one up", () => {
    // 80 * 0.6 + 20 * 0.4 = 48 + 8 = 56
    expect(mergeDomainScore(80, 20, true)).toBe(56);
  });

  it("handles a session score of 0", () => {
    expect(mergeDomainScore(0, 100, true)).toBe(40);
  });

  it("handles a session score of 100", () => {
    expect(mergeDomainScore(100, 0, true)).toBe(60);
  });

  it("returns the same score when previous and new agree", () => {
    expect(mergeDomainScore(50, 50, true)).toBe(50);
  });
});
