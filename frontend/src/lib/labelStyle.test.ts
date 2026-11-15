import { describe, expect, it } from "vitest";
import {
  hasLabel,
  hexToRgba,
  labelFilterValue,
  parseLabelFilter,
  readableTextColor,
  splitChips,
} from "./labelStyle";

describe("hexToRgba", () => {
  it("converts a hex color with alpha", () => {
    expect(hexToRgba("#FF4058", 0.14)).toBe("rgba(255, 64, 88, 0.14)");
  });

  it("falls back to grey for malformed input", () => {
    expect(hexToRgba("not-a-color", 0.14)).toBe("rgba(128, 128, 128, 0.14)");
  });
});

describe("readableTextColor", () => {
  it("uses dark text on white", () => {
    expect(readableTextColor("#FFFFFF")).toBe("#0b0d0e");
  });

  it("uses dark text on pale yellow", () => {
    expect(readableTextColor("#FFE066")).toBe("#0b0d0e");
  });

  it("uses white text on navy", () => {
    expect(readableTextColor("#1E3A8A")).toBe("#ffffff");
  });

  it("uses white text on a near-black label", () => {
    expect(readableTextColor("#111111")).toBe("#ffffff");
  });

  it("uses dark text on the shipped preset colors that sit in the mid-luminance band", () => {
    for (const color of ["#FF4058", "#F59E0B", "#22C55E", "#8B5CF6", "#EC4899", "#14B8A6"]) {
      expect(readableTextColor(color), color).toBe("#0b0d0e");
    }
  });

  it("uses white text on the shipped dark-gray preset", () => {
    expect(readableTextColor("#6B7280")).toBe("#ffffff");
  });
});

describe("hasLabel", () => {
  it("matches by id", () => {
    expect(hasLabel([{ id: 3 }], 3)).toBe(true);
    expect(hasLabel([{ id: 3 }], 4)).toBe(false);
  });

  it("treats a missing label list as no match", () => {
    expect(hasLabel(undefined, 1)).toBe(false);
    expect(hasLabel([], 1)).toBe(false);
  });
});

describe("label filters", () => {
  it("round-trips a label id", () => {
    expect(parseLabelFilter(labelFilterValue(7))).toBe(7);
  });

  it("rejects non-label filters", () => {
    expect(parseLabelFilter("all")).toBeUndefined();
    expect(parseLabelFilter("bookmark")).toBeUndefined();
    expect(parseLabelFilter("label:abc")).toBeUndefined();
    expect(parseLabelFilter("label:0")).toBeUndefined();
  });
});

describe("splitChips", () => {
  it("keeps three and counts the rest", () => {
    expect(splitChips([1, 2, 3, 4, 5])).toEqual({
      visible: [1, 2, 3],
      hiddenCount: 2,
    });
  });

  it("counts nothing when everything fits", () => {
    expect(splitChips([1])).toEqual({ visible: [1], hiddenCount: 0 });
  });
});
