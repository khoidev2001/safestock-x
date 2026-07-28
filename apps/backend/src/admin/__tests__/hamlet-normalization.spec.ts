import { normalizeHamletName } from "../hamlet-normalization";

describe("normalizeHamletName", () => {
  it.each([
    ["Tân Bình", "tan binh"],
    ["  THÔN TÂN-BÌNH  ", "thon tan binh"],
    ["Triêm Đức", "triem duc"],
    ["Kỳ Đu", "ky du"],
  ])("normalizes %s deterministically", (input, expected) => {
    expect(normalizeHamletName(input)).toBe(expected);
  });
});
