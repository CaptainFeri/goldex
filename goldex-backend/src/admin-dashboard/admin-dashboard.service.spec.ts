import { jalaliMonthBounds } from "./admin-dashboard.service";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("jalaliMonthBounds", () => {
  it("starts the year on Nowruz, not on 1 January", () => {
    // The whole reason the series cannot use date_trunc('month').
    expect(ymd(jalaliMonthBounds(1405)[0].start)).toBe("2026-03-21");
  });

  it("returns twelve months", () => {
    expect(jalaliMonthBounds(1405)).toHaveLength(12);
  });

  it("gives the first six months 31 days and the next five 30", () => {
    // The Jalali calendar's own shape; getting it from moment rather than
    // assuming a uniform month is the point.
    const days = jalaliMonthBounds(1405).map(
      (b) => Math.round((b.end.getTime() - b.start.getTime()) / 864e5),
    );
    expect(days.slice(0, 6)).toEqual([31, 31, 31, 31, 31, 31]);
    expect(days.slice(6, 11)).toEqual([30, 30, 30, 30, 30]);
    expect([29, 30]).toContain(days[11]); // Esfand, leap-year dependent
  });

  it("chains the ranges with no gap and no overlap", () => {
    // A row on a boundary must land in exactly one bucket.
    const bounds = jalaliMonthBounds(1405);
    for (let i = 1; i < bounds.length; i++) {
      expect(bounds[i].start.getTime()).toBe(bounds[i - 1].end.getTime());
    }
  });

  it("files a date either side of Nowruz in the right year", () => {
    // 15 March 2026 is Esfand 1404; 25 March is Farvardin 1405. A Gregorian
    // grouping would put both in "March".
    const before = new Date(2026, 2, 15);
    const after = new Date(2026, 2, 25);
    const y1405 = jalaliMonthBounds(1405);
    const y1404 = jalaliMonthBounds(1404);

    const inRange = (d: Date, r: { start: Date; end: Date }) => d >= r.start && d < r.end;
    expect(y1405.findIndex((r) => inRange(after, r))).toBe(0);       // Farvardin 1405
    expect(y1405.some((r) => inRange(before, r))).toBe(false);
    expect(y1404.findIndex((r) => inRange(before, r))).toBe(11);     // Esfand 1404
  });

  it("covers a full year with no day unaccounted for", () => {
    const bounds = jalaliMonthBounds(1405);
    const days = Math.round((bounds[11].end.getTime() - bounds[0].start.getTime()) / 864e5);
    expect([365, 366]).toContain(days);
  });
});
