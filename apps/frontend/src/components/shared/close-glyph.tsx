/**
 * Dấu × của các nút đóng — vẽ bằng SVG, không dùng ký tự "×".
 *
 * Ký tự "×" là một CHỮ CÁI: nó ngồi trên đường cơ sở của phông, có phần nhô lên
 * và phần chừa dưới riêng, nên trong một nút vuông nó không bao giờ nằm đúng
 * giữa — luôn lệch lên trên vài pixel. Nét của nó cũng đổi theo phông chữ máy
 * người dùng đang cài, và trên máy thiếu phông thì ra ô vuông rỗng. Muốn nó to
 * lên thì phải chỉnh cỡ CHỮ, kéo theo cả line-height, và kích thước thật của
 * hình lại phụ thuộc phông.
 *
 * Hai nét SVG thì luôn đúng 16×16, luôn cân giữa, và đậm nhạt do `strokeWidth`
 * quyết định chứ không do phông.
 */
export function CloseGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M3.5 3.5 12.5 12.5" />
      <path d="M12.5 3.5 3.5 12.5" />
    </svg>
  );
}
