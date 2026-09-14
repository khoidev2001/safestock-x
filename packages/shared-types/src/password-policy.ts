/**
 * Điều kiện mật khẩu mạnh — MỘT nguồn cho backend, web và mobile.
 *
 * Để ở gói dùng chung vì ba nơi cùng phải kiểm: web và mobile báo ngay khi đang gõ,
 * còn máy chủ là chốt chặn cuối. Mỗi nơi tự viết một bản thì sớm muộn sẽ lệch — ô
 * nhập báo "hợp lệ" rồi máy chủ lại từ chối, người dùng không biết mình sai ở đâu.
 *
 * Áp ở mọi chỗ ĐẶT mật khẩu: tạo tài khoản, quản trị đặt lại mật khẩu, quên mật
 * khẩu. KHÔNG áp lúc đăng nhập: chặn ở đó thì người đang có mật khẩu cũ yếu không
 * vào được hệ thống để tự đổi.
 */

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRule {
  key: "length" | "uppercase" | "digit" | "special";
  label: string;
  test: (password: string) => boolean;
}

/** Ký tự đặc biệt = mọi ký tự không phải chữ cái, không phải số, không phải khoảng trắng. */
const SPECIAL = /[^\p{L}\p{N}\s]/u;

export const PASSWORD_RULES: PasswordRule[] = [
  {
    key: "length",
    label: `Ít nhất ${PASSWORD_MIN_LENGTH} ký tự`,
    test: (password) => [...password].length >= PASSWORD_MIN_LENGTH,
  },
  { key: "uppercase", label: "Có chữ in hoa", test: (password) => /\p{Lu}/u.test(password) },
  { key: "digit", label: "Có chữ số", test: (password) => /\p{N}/u.test(password) },
  {
    key: "special",
    label: "Có ký tự đặc biệt (vd: @ # ! ?)",
    test: (password) => SPECIAL.test(password),
  },
];

/** Các điều kiện còn thiếu, theo đúng thứ tự hiển thị. Rỗng nghĩa là mật khẩu đạt. */
export function missingPasswordRules(password: string): PasswordRule[] {
  const value = String(password ?? "");
  return PASSWORD_RULES.filter((rule) => !rule.test(value));
}

/**
 * Câu báo lỗi cho mật khẩu chưa đạt, hoặc `null` nếu đạt.
 *
 * Kể hết điều còn thiếu trong MỘT câu: báo từng điều một thì người dùng sửa xong
 * điều này lại bị báo điều kia, phải thử tới bốn lần mới qua.
 */
export function passwordPolicyViolation(password: string): string | null {
  const missing = missingPasswordRules(password);
  if (missing.length === 0) return null;
  return `Mật khẩu chưa đủ mạnh: ${missing.map((rule) => rule.label.toLowerCase()).join(", ")}.`;
}
