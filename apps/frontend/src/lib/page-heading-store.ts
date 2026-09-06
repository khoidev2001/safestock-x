import { create } from "zustand";

/**
 * Tiêu đề trang, chia sẻ từ nội dung LÊN thanh tiêu đề.
 *
 * Thanh tiêu đề nằm trong `DashboardShell`, còn tiêu đề thật thì chỉ trang mới
 * biết: hầu hết lấy được từ danh mục điều hướng theo path, nhưng trang chi tiết
 * nhiệm vụ có tiêu đề là "Nhiệm vụ số 103" và phụ đề là trạng thái đọc từ dữ
 * liệu vừa tải. Hai chỗ đó nằm hai nhánh khác nhau của cây component nên không
 * truyền prop thẳng được.
 *
 * Chỉ chứa phần GHI ĐÈ. Không có gì ở đây thì thanh tiêu đề tự lấy theo path,
 * nên các trang tĩnh không phải khai báo gì.
 */
interface PageHeadingState {
  title: string | null;
  subtitle: string | null;
  setHeading: (heading: { title?: string; subtitle?: string }) => void;
  clearHeading: () => void;
}

export const usePageHeading = create<PageHeadingState>((set) => ({
  title: null,
  subtitle: null,
  setHeading: ({ title, subtitle }) => set({ title: title ?? null, subtitle: subtitle ?? null }),
  clearHeading: () => set({ title: null, subtitle: null }),
}));
