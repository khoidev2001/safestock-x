import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
  useSecureAuthCookie,
} from "../auth-cookie";

describe("web refresh-token cookie", () => {
  it("only reads the dedicated cookie and tolerates malformed encodings", () => {
    expect(
      readRefreshCookie({
        headers: { cookie: "theme=dark; ung_pho_nhanh_refresh=refresh%2Etoken" },
      } as never),
    ).toBe("refresh.token");
    expect(
      readRefreshCookie({
        headers: { cookie: "ung_pho_nhanh_refresh=%E0%A4" },
      } as never),
    ).toBeNull();
  });

  it("writes an httpOnly, scoped, SameSite refresh cookie", () => {
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    setRefreshCookie(response as never, "refresh-token", true);
    clearRefreshCookie(response as never, true);

    expect(response.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      "refresh-token",
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/api/auth",
      }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      expect.objectContaining({ httpOnly: true, secure: true, path: "/api/auth" }),
    );
  });

  it("requires an explicit true value before marking cookies Secure", () => {
    expect(useSecureAuthCookie("true")).toBe(true);
    expect(useSecureAuthCookie("false")).toBe(false);
    expect(useSecureAuthCookie(undefined)).toBe(false);
  });
});
