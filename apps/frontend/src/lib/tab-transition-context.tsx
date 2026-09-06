"use client";

import { createContext, useContext } from "react";
import type { TabTransition } from "./use-tab-transition";

/**
 * Trạng thái chuyển tab, mở ra cho cả vùng NỘI DUNG chứ không riêng thanh menu.
 *
 * `useTabTransition` là state cục bộ của `DashboardShell`, mà khối chờ lại do
 * chính shell vẽ. Các đường dẫn nằm trong nội dung — "Mở kho vật tư →", thẻ
 * nhiệm vụ trên trang Tổng quan — vì thế chuyển trang bằng `router.push` trần:
 * bấm xong không có gì đổi cho tới khi trang đích dựng xong, đúng khoảng lặng mà
 * khối chờ sinh ra để lấp. Người dùng bấm hai ba lần vì tưởng hụt.
 *
 * Cho shell phát trạng thái ấy xuống qua context là cách duy nhất để hai đường
 * chuyển trang dùng CHUNG một khối chờ. Nuôi một khối chờ thứ hai trong nội dung
 * là nuôi hai thứ phải nhớ đồng bộ, và chúng sẽ lệch nhau.
 */
const TabTransitionContext = createContext<TabTransition | null>(null);

export const TabTransitionProvider = TabTransitionContext.Provider;

/**
 * Chuyển trang có khối chờ, dùng được ở bất cứ đâu bên trong dashboard.
 *
 * Ngoài dashboard (màn hình đăng nhập, trang danh bạ) không có shell nào phát
 * context, nên trả `null` và người gọi rơi về đường dẫn thường. Ném lỗi ở đây
 * chỉ đổi một liên kết hoạt động bình thường thành một trang trắng.
 */
export function useTabTransitionContext(): TabTransition | null {
  return useContext(TabTransitionContext);
}
