import { AdminUserService } from "./admin-user.service";

/**
 * What a search term is allowed to match.
 *
 * Phone was missing, which made the only identifier an operator reliably has
 * for a walk-in customer the one thing they could not search by.
 */
const clauses = (term: string): any[] =>
  (Reflect.construct(AdminUserService, Array(12).fill({})) as any).searchClauses(term);

/** The pattern a clause carries, whichever field it is on. */
const patternFor = (field: string, term: string) =>
  clauses(term)
    .filter((c) => c[field])
    .map((c) => c[field].value);

describe("user search", () => {
  it("matches names as a substring", () => {
    expect(patternFor("firstName", "moh")).toEqual(["%moh%"]);
    expect(patternFor("lastName", "moh")).toEqual(["%moh%"]);
  });

  it("matches email as a substring, not only as a suffix", () => {
    // It matched `%term`, so "gmail" found nothing while "@gmail.com" found
    // everyone — surprising next to the name clauses beside it.
    expect(patternFor("email", "gmail")).toEqual(["%gmail%"]);
  });

  it("matches a phone number", () => {
    expect(patternFor("phone", "09121234567")).toContain("%09121234567%");
  });

  it("finds a canonical number typed with a country code", () => {
    // Stored as 09XXXXXXXXX; an operator reading one off a screen may type
    // +98 9121234567.
    expect(patternFor("phone", "+989121234567")).toContain("%9121234567%");
  });

  it("finds a canonical number typed without the leading zero", () => {
    expect(patternFor("phone", "9121234567")).toContain("%9121234567%");
  });

  it("ignores the separators an operator pastes in", () => {
    expect(patternFor("phone", "0912-123-4567")).toContain("%09121234567%");
  });

  it("does not guess a phone from a short term", () => {
    // "12" would match half the customer base by phone and drown the names.
    expect(patternFor("phone", "12")).toEqual([]);
  });

  it("searches no phone for a term with no digits", () => {
    expect(patternFor("phone", "sarah")).toEqual([]);
  });

  it("always offers the name and email clauses", () => {
    // A digits-only term is still a legitimate name fragment somewhere.
    const fields = clauses("0912").map((c) => Object.keys(c)[0]);
    expect(fields).toEqual(expect.arrayContaining(["firstName", "lastName", "email", "phone"]));
  });
});
