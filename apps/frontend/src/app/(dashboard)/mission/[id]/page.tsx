"use client";

import { use, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLoader } from "@/components/shared/brand-loader";
import { getMission } from "@/lib/mission-api";
import { missionNumberLink } from "@/lib/mission-inbox-state";

/**
 * Đường dẫn cũ theo id — nay chỉ chuyển tiếp sang dạng chính tắc theo số hiệu.
 *
 * Thông báo đẩy và link đã gửi đi chỉ mang `missionId` (cuid), nên đường này phải
 * còn sống. Nhưng để nó tự dựng trang chi tiết thì có HAI đường cùng mở một nhiệm
 * vụ, và người bấm thông báo vẫn nhìn thấy một chuỗi cuid vô nghĩa — đúng cái mà
 * đường dẫn theo số hiệu sinh ra để bỏ đi.
 *
 * `replace` chứ không `push`: bấm Quay lại phải về chỗ người dùng đến từ đó, chứ
 * không quay về đúng đường dẫn vừa tự chuyển tiếp rồi lại bị đẩy đi tiếp.
 */
export default function MissionByIdRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const fieldUpdateId = searchParams.get("fieldUpdate");

  const missionQuery = useQuery({
    queryKey: ["mission", decodeURIComponent(id)],
    queryFn: () => getMission(decodeURIComponent(id)),
  });

  const missionNo = missionQuery.data?.missionNo;
  useEffect(() => {
    if (missionNo != null) router.replace(missionNumberLink(missionNo, fieldUpdateId));
  }, [missionNo, fieldUpdateId, router]);

  // Nhiệm vụ không còn (đã xoá, hoặc của xã khác): về hộp nhiệm vụ thay vì kẹt ở
  // màn hình chờ vĩnh viễn.
  useEffect(() => {
    if (missionQuery.isError) router.replace("/missions");
  }, [missionQuery.isError, router]);

  return <BrandLoader className="min-h-[40vh]" label="Đang mở nhiệm vụ…" />;
}
