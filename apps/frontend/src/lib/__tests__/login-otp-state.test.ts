import assert from "node:assert/strict";
import test from "node:test";
import {
  LOGIN_OTP_EXPIRED_MESSAGE,
  isLoginOtpChallenge,
  loginOtpInputError,
  loginOtpView,
} from "../login-otp-state";

const T0 = Date.parse("2026-09-14T08:00:00.000Z");
const challenge = {
  otpRequired: true as const,
  challengeToken: "thẻ",
  email: "tr***x@gmail.com",
  expiresAt: "2026-09-14T08:01:00.000Z",
  resendAvailableAt: "2026-09-14T08:01:00.000Z",
};

test("trong 60 giây: mã còn hạn, nút gửi lại ẨN; quá 60 giây: hết hạn, nút gửi lại HIỆN", () => {
  const early = loginOtpView(challenge, T0 + 1_000);
  assert.equal(early.expired, false);
  assert.equal(early.canResend, false);
  assert.equal(early.resendIn, 59);

  const lastSecond = loginOtpView(challenge, T0 + 59_500);
  assert.equal(lastSecond.canResend, false, "còn nửa giây vẫn chưa được gửi lại");

  const after = loginOtpView(challenge, T0 + 60_000);
  assert.equal(after.expired, true);
  assert.equal(after.canResend, true);
});

test("nhập mã sau khi đã quá hạn thì báo hết hạn, yêu cầu gửi lại — trước cả khi kiểm định dạng", () => {
  assert.equal(loginOtpInputError("123456", challenge, T0 + 61_000), LOGIN_OTP_EXPIRED_MESSAGE);
  assert.equal(loginOtpInputError("12ab", challenge, T0 + 61_000), LOGIN_OTP_EXPIRED_MESSAGE);
  assert.equal(loginOtpInputError("12ab", challenge, T0 + 1_000), "Mã đăng nhập gồm 6 chữ số.");
  assert.equal(loginOtpInputError(" 123456 ", challenge, T0 + 1_000), null);
});

test("chỉ nhận đúng phản hồi thử thách, không nhầm với phiên đăng nhập thường", () => {
  assert.equal(isLoginOtpChallenge(challenge), true);
  assert.equal(isLoginOtpChallenge({ accessToken: "a", user: {} }), false);
  assert.equal(isLoginOtpChallenge({ otpRequired: true }), false);
});
