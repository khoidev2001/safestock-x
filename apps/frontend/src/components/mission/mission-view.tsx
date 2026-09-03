"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AiProgressDialog } from "@/components/shared/ai-progress-dialog";
import { ColorIcon } from "@/components/shared/color-icon";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-store";
import { useMissionFocus } from "@/lib/mission-focus-store";
import { missionDeepLink } from "@/lib/mission-inbox-state";
import type { LatLng } from "@/lib/geo";
import { ApiError } from "@/lib/api";
import {
  analyzeMission,
  approveMission,
  cancelMission,
  generateActionPlan,
  generatePlan,
  getMission,
  listMissions,
  parseIncident,
  planFromReport,
  prepareMission,
  transcribeAudio,
  type DeliveryOutcome,
  type GenerateInput,
  type Mission,
} from "@/lib/mission-api";
import { listAllWarehouses } from "@/lib/warehouse-api";
import { listHamlets } from "@/lib/hamlet-api";
import {
  findHamlet,
  locationStatus,
  normalizeHamletName,
  selectableHamlets,
} from "@/lib/hamlet-match";
import { clearDraft, readDraft, writeDraft } from "@/lib/mission-draft";
import { blobToWavBase64, SILENCE_RMS } from "@/lib/audio-wav";
import { ActionPlanView } from "./action-plan-view";
import { MissionInbox, STATUS_LABELS } from "./mission-inbox";
import { MissionReadinessPanel } from "./mission-readiness-panel";
import { CoordinationAnalysisPanel, requestId } from "./coordination-analysis-panel";
import { WarehouseRequestPanel } from "./warehouse-request-panel";
import { WorkflowStepper } from "./workflow-stepper";
import { FIELD_FORCE_ROLE_LABEL } from "@safestock/shared-types";

const IncidentMap = dynamic(() => import("./incident-map").then((m) => m.IncidentMap), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-md border bg-[var(--surface)]" />,
});

const INCIDENT_TYPES = [
  { value: "FLOOD", label: "Lũ lụt" },
  { value: "STORM", label: "Bão" },
  { value: "LANDSLIDE", label: "Sạt lở" },
  { value: "FIRE", label: "Cháy" },
  { value: "ISOLATION", label: "Cô lập" },
  { value: "OTHER", label: "Khác" },
];

type IncidentForm = GenerateInput["incident"] & {
  children: number;
  elderly: number;
  medicalSupportCases: number;
};

export interface MissionViewProps {
  warehouseId: string;
  /**
   * Có id thì đây là TRANG CHI TIẾT của đúng nhiệm vụ đó.
   *
   * Một component phục vụ cả ba màn hình vì phần lớn state dùng chung (form,
   * điểm ghim, các mutation). Tách ra thì phải nhân bản chỗ đó, mà chúng vốn là
   * một luồng.
   */
  missionId?: string;
  /**
   * Màn hình nào đang dùng component này.
   *
   * - `khai-bao`: chỉ form khai tình huống mới và bản đồ ghim điểm nạn.
   * - `danh-sach`: chỉ hộp nhiệm vụ.
   *
   * Trước đây hai việc này chung một trang nên nó dài lê thê, mà khai một vụ mới
   * và theo dõi các vụ đang chạy là hai đầu việc khác nhau, thường của hai người
   * khác nhau, vào ở hai thời điểm khác nhau.
   */
  variant?: "khai-bao" | "danh-sach";
}

export function MissionView({
  warehouseId,
  missionId: missionIdProp,
  variant = "khai-bao",
}: MissionViewProps) {
  const role = useAuth((s) => s.user?.role);
  const assignedWarehouseId = useAuth((s) => s.user?.warehouseId);
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const missionId = missionIdProp?.trim() || null;
  /** Trang chi tiết mới hiện các khối thuộc về một nhiệm vụ. */
  const isDetailPage = Boolean(missionId);
  const fieldUpdateId = searchParams.get("fieldUpdate")?.trim() || null;
  /** Lời kể mang sang từ khung trợ lý, để không phải gõ lại y nguyên. */
  const describeParam = searchParams.get("describe")?.trim() || null;
  const selectMission = useCallback(
    (id: string, replace = false) => {
      const href = missionDeepLink(id);
      if (replace) {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    },
    [router],
  );
  const [form, setForm] = useState<IncidentForm>({
    incidentType: "FLOOD",
    location: "",
    affectedPeople: 100,
    durationHours: 24,
    children: 0,
    elderly: 0,
    medicalSupportCases: 0,
  });
  /**
   * Điểm sự cố ghim tay trên bản đồ, dùng khi chỗ xảy ra việc không trùng thôn nào
   * trong danh mục — ngập giữa hai thôn, sạt lở trên đường liên xã.
   *
   * Ba trạng thái, không phải hai: `undefined` là chưa đụng tới (lấy điểm của
   * nhiệm vụ đang mở), `null` là đã chủ động xoá, còn lại là điểm vừa đặt. Thiếu
   * trạng thái "chưa đụng" thì không phân biệt được xoá với chưa chọn.
   */
  const [incidentPoint, setIncidentPoint] = useState<LatLng | null | undefined>(undefined);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  /**
   * Lời kể đã được AI phân tích. Bấm phân tích lần hai trên đúng lời kể cũ chỉ
   * tạo lại đúng kết quả cũ, nhưng trên đường đi nó xoá bản tham mưu và ghi đè
   * nhu cầu — người dùng mất dữ liệu để đổi lấy không gì cả. Khoá nút cho tới khi
   * lời kể thật sự đổi.
   */
  const [analyzedDescription, setAnalyzedDescription] = useState<string | null>(null);

  // Mở đúng nhiệm vụ khi bấm thông báo (chuông) — kể cả mission đã REJECTED/DEFERRED.
  const focusMissionId = useMissionFocus((s) => s.focusMissionId);
  const clearFocus = useMissionFocus((s) => s.clearFocus);
  useEffect(() => {
    if (focusMissionId) {
      if (focusMissionId !== missionId) {
        selectMission(focusMissionId);
      }
      clearFocus();
    }
  }, [focusMissionId, missionId, clearFocus, selectMission]);

  const missionListQuery = useQuery({
    queryKey: ["missions", "inbox", role, assignedWarehouseId],
    queryFn: () => listMissions(),
    enabled: Boolean(role),
    refetchInterval: 5000,
  });

  // Kho trong xã, để bản đồ có gì mà hiện ngay cả khi chưa lập phương án. Danh sách
  // kho gần như không đổi nên không cần refetch định kỳ như hộp nhiệm vụ.
  const warehouseListQuery = useQuery({
    queryKey: ["all-warehouses", "mission-map"],
    queryFn: listAllWarehouses,
    enabled: role === "ADMIN",
    staleTime: 5 * 60 * 1000,
  });

  // Danh mục thôn để ô địa điểm là danh sách chọn thay vì ô gõ tự do. Cùng nguồn
  // với bản đồ nên thứ chọn được ở đây đúng bằng thứ ghim được trên map.
  const hamletListQuery = useQuery({
    queryKey: ["hamlets", "dong-xuan", "mission-form"],
    queryFn: () => listHamlets("dong-xuan"),
    enabled: role === "ADMIN",
    staleTime: 5 * 60 * 1000,
  });

  const missionQuery = useQuery({
    queryKey: ["mission", missionId],
    queryFn: () => getMission(missionId as string),
    enabled: Boolean(missionId),
    refetchInterval: 5000, // Cập nhật trạng thái khi bộ phận khác hoàn tất phần việc.
  });

  const mission = missionQuery.data;
  // Báo cáo của trưởng thôn (mobile): DRAFT chỉ có mô tả thô, chưa phân tích (0 nhu cầu).
  // Admin mở tin này trên web để đọc lại rồi phân tích thành phương án ngay trên chính nó.
  const isReportDraft =
    Boolean(mission?.reportText) &&
    mission?.status === "DRAFT" &&
    mission.requirements.length === 0;

  // Mở một báo cáo chưa phân tích → đổ mô tả thô vào ô nhập để admin xem lại rồi phân tích.
  // Chỉ chạy khi cờ báo cáo/mô tả đổi (không đè chỉnh sửa của admin khi query tự refetch).
  useEffect(() => {
    if (draftOwnsDescriptionRef.current) return;
    if (isReportDraft && mission?.reportText) setDescription(mission.reportText);
  }, [isReportDraft, mission?.reportText]);

  // Trợ lý chuyển sang kèm lời kể: điền sẵn vào ô mô tả, chỉ một lần cho mỗi
  // lời kể để không đè lên phần người dùng đang sửa dở.
  const seededDescribeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!describeParam || seededDescribeRef.current === describeParam) return;
    seededDescribeRef.current = describeParam;
    setDescription(describeParam);
  }, [describeParam]);

  // Đổi nhiệm vụ thì bỏ điểm đang sửa dở, nếu không nó dính sang nhiệm vụ kế tiếp.
  useEffect(() => {
    setIncidentPoint(undefined);
  }, [missionId]);

  /**
   * Khôi phục bản nháp khi mở lại đúng nhiệm vụ đó.
   *
   * Chặng giữa "đã phân tích bằng AI" và "đã lập bản tham mưu" không có gì nằm ở
   * backend: nhu cầu mới chỉ là số trên form. Rời tab lúc này là mất sạch, và
   * người dùng phải kể lại từ đầu. Giữ ở máy họ cho tới khi có bản tham mưu thật.
   *
   * Chỉ chạy một lần cho mỗi missionId — chạy lại sẽ đè lên phần đang gõ dở.
   */
  const restoredForRef = useRef<string | null>(null);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  // Bản nháp có lời kể riêng thì đừng để lời kể gốc của báo cáo đè lên: admin đã
  // sửa lại rồi, trả về bản thô là xoá đúng phần họ vừa làm.
  const draftOwnsDescriptionRef = useRef(false);
  useEffect(() => {
    const key = missionId ?? "new";
    if (restoredForRef.current === key) return;
    restoredForRef.current = key;
    const draft = readDraft(missionId);
    draftOwnsDescriptionRef.current = Boolean(draft?.description);
    setHydratedFor(key);
    if (!draft) return;
    setForm({
      incidentType: draft.incidentType,
      location: draft.location,
      affectedPeople: draft.affectedPeople,
      durationHours: draft.durationHours,
      children: draft.children,
      elderly: draft.elderly,
      medicalSupportCases: draft.medicalSupportCases,
    });
    if (draft.description) setDescription(draft.description);
    setAnalyzedDescription(draft.analyzedDescription);
    if (draft.incidentLat != null && draft.incidentLng != null) {
      setIncidentPoint({ lat: draft.incidentLat, lng: draft.incidentLng });
    }
  }, [missionId]);

  // Phân tích BÁO CÁO đang mở ngay trên nó (không tạo mission mới) — dùng lại cho cả
  // đường "mô tả bằng lời" lẫn "nhập tay form", tránh đẻ DRAFT mồ côi bỏ quên báo cáo.
  const analyzeOpenReport = (incident: GenerateInput["incident"]) => {
    const reportPoint =
      mission?.incidentLat != null && mission?.incidentLng != null
        ? { lat: mission.incidentLat, lng: mission.incidentLng }
        : undefined;
    return planFromReport(missionId as string, {
      incident,
      ...(reportPoint ? { incidentLat: reportPoint.lat, incidentLng: reportPoint.lng } : {}),
    });
  };

  /** Dựng phương án từ số liệu đang có trên form (hoặc phân tích ngay trên báo cáo đang mở). */
  const planFromForm = () => {
    if (missionId && isReportDraft) return analyzeOpenReport(form);
    return generatePlan({
      warehouseId,
      incident: form,
      // Nhập tay vẫn có thể kèm lời kể; có thì giữ lại làm nguồn cho bản tham mưu.
      ...(description.trim() ? { description } : {}),
      ...(formIncidentPoint
        ? { incidentLat: formIncidentPoint.lat, incidentLng: formIncidentPoint.lng }
        : {}),
    });
  };

  // AI phân tích lời kể → tính nhu cầu vật tư + lập phương án NGAY trong một bước.
  // Backend chỉ chấp nhận thôn đã xác minh hoặc tọa độ thật; không sinh điểm giả để lấp dữ liệu.
  const analyze = useMutation({
    mutationFn: async () => {
      const p = await parseIncident(description);
      const incident = {
        incidentType: p.incidentType,
        location: p.location ?? undefined,
        affectedPeople: p.affectedPeople,
        durationHours: p.durationHours,
        children: p.children,
        elderly: p.elderly,
        medicalSupportCases: p.medicalSupportCases,
      };
      setForm(incident); // phản chiếu lên form để cán bộ vẫn xem/sửa lại được sau
      if (missionId && isReportDraft) return analyzeOpenReport(incident);
      return generatePlan({
        warehouseId,
        incident,
        description,
        ...(formIncidentPoint
          ? { incidentLat: formIncidentPoint.lat, incidentLng: formIncidentPoint.lng }
          : {}),
      });
    },
    onSuccess: (m: Mission) => {
      setAnalyzedDescription(description.trim());
      selectMission(m.id);
      setParseError(null);
      queryClient.invalidateQueries({ queryKey: ["mission", m.id] });
      queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
    },
    onError: (err) => {
      setParseError(
        err instanceof ApiError
          ? err.message
          : "Chưa phân tích được mô tả. Thử diễn đạt rõ hơn hoặc nhập tay bên dưới.",
      );
    },
  });

  /**
   * Số liệu trên form đã lệch khỏi nhiệm vụ đang lưu chưa.
   *
   * Bản tham mưu đọc BẢN GHI nhiệm vụ, không đọc form. Sửa form xong bấm thẳng
   * "Lập bản tham mưu" thì tham mưu vẫn theo số của lần phân tích trước — đúng
   * cái lỗi đổi địa điểm sang thôn khác mà bản tham mưu vẫn ghi thôn cũ.
   *
   * Chỉ đồng bộ khi thật sự lệch: mỗi lần đồng bộ là một lần tính lại nhu cầu và
   * xoá phương án hành động đã sinh, không nên làm khi không có gì đổi.
   */
  const formDiffersFromMission = (current: Mission) => {
    const parsed = current.parsedInput ?? {};
    return (
      current.incidentType !== form.incidentType ||
      normalizeHamletName(current.location ?? "") !== normalizeHamletName(form.location ?? "") ||
      current.affectedPeople !== form.affectedPeople ||
      current.durationHours !== form.durationHours ||
      (parsed.children ?? 0) !== (form.children ?? 0) ||
      (parsed.elderly ?? 0) !== (form.elderly ?? 0) ||
      (parsed.medicalSupportCases ?? 0) !== (form.medicalSupportCases ?? 0)
    );
  };

  /** Ghi số liệu form xuống nhiệm vụ và tính lại nhu cầu vật tư theo đúng số đó. */
  const syncMissionWithForm = (id: string) =>
    planFromReport(id, {
      incident: form,
      ...(formIncidentPoint
        ? { incidentLat: formIncidentPoint.lat, incidentLng: formIncidentPoint.lng }
        : {}),
    });

  /**
   * Lập bản tham mưu cho nhiệm vụ đang mở.
   *
   * Nút nằm ở khối tình huống nhưng kết quả hiện ở khối tham mưu bên dưới: ghi
   * thẳng vào cache của query mà khối đó đang đọc, khỏi phải dựng đường truyền
   * state xuyên qua mấy tầng component chỉ để chuyển một cú bấm.
   */
  const analyzeCoordination = useMutation({
    mutationFn: async () => {
      // Chưa có nhiệm vụ thì tự tính nhu cầu vật tư trước rồi mới tham mưu.
      //
      // Bản tham mưu vốn dựng TRÊN nhu cầu đã tính (backend đọc mission.requirements),
      // nên hai việc này là một chuỗi chứ không phải hai lựa chọn. Bắt người dùng
      // bấm đúng thứ tự chỉ để hệ thống có cái mà đọc là bắt họ gánh chi tiết cài
      // đặt của mình.
      let id = missionId;
      if (!id) {
        const created = await planFromForm();
        id = created.id;
        queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
        selectMission(created.id);
      } else if (mission && isMissionEditable && formDiffersFromMission(mission)) {
        // Form mới là bản gốc. Phân tích bằng AI chỉ điền hộ vào form; cán bộ sửa
        // lại rồi thì phải ghi phần sửa đó xuống nhiệm vụ TRƯỚC khi tham mưu.
        await syncMissionWithForm(id);
        await queryClient.invalidateQueries({ queryKey: ["mission", id] });
        queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
      }
      const result = await analyzeMission(id, { requestId: requestId() });
      return { missionId: id, snapshot: result.snapshot };
    },
    onSuccess: (result) => {
      setAnalysisError(null);
      // Từ đây backend đã giữ bản tham mưu, bản nháp cục bộ hết việc. Giữ lại chỉ
      // để lần sau mở lên nó đè ngược lên dữ liệu thật vừa lập.
      clearDraft(result.missionId);
      clearDraft(null);
      queryClient.setQueryData(
        ["mission", result.missionId, "coordination-analysis"],
        result.snapshot,
      );
    },
    onError: (err) =>
      setAnalysisError(
        err instanceof ApiError ? err.message : "Chưa lập được bản tham mưu. Vui lòng thử lại.",
      ),
  });

  const genActionPlan = useMutation({
    mutationFn: () => generateActionPlan(missionId as string),
    onSuccess: () => {
      setWorkflowError(null);
      queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
      return queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
    },
    onError: (err) =>
      setWorkflowError(
        err instanceof ApiError
          ? err.message
          : "Chưa thể lập kế hoạch cứu hộ. Vui lòng kiểm tra địa điểm ứng phó.",
      ),
  });

  const step = useMutation({
    mutationFn: (fn: (id: string) => Promise<Mission>) => fn(missionId as string),
    onSuccess: () => {
      setWorkflowError(null);
      queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
      return queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
    },
    onError: (err) =>
      setWorkflowError(
        err instanceof ApiError ? err.message : "Chưa thể cập nhật nhiệm vụ. Vui lòng thử lại.",
      ),
  });

  const isAdmin = role === "ADMIN";
  const missionHasIncidentPoint = mission?.incidentLat != null && mission?.incidentLng != null;
  const missionPoint = missionHasIncidentPoint
    ? { lat: mission!.incidentLat as number, lng: mission!.incidentLng as number }
    : null;

  /**
   * Nhiệm vụ đang mở có còn nhận chỉnh sửa không.
   *
   * Đã phát hành rồi thì khối "Tình huống khẩn cấp" không còn là chỗ sửa nhiệm vụ
   * đó nữa — nó quay về đúng vai trò gốc: form khai một sự việc MỚI.
   */
  const isMissionEditable = !mission || mission.status === "DRAFT";

  /**
   * Khối "Tình huống khẩn cấp" có đang hiện không.
   *
   * Quan trọng vì hai nút AI nằm trong đó. Nhiệm vụ đã phát hành thì khối này ẩn
   * đi — và trước đây nút "Lập bản tham mưu" ẩn theo, khiến nhiệm vụ đã phát hành
   * không còn đường nào lập tham mưu. Khối tham mưu phải tự có nút của nó cho
   * đúng trường hợp đó.
   */
  const composerVisible = isAdmin && variant === "khai-bao" && (!isDetailPage || isMissionEditable);

  /**
   * Điểm nạn của các nhiệm vụ ĐÃ DUYỆT và chưa đóng, để hiện lên bản đồ.
   *
   * Bản nháp cố tình không tính: nó chưa phải quyết định của xã, hiện lên chỉ làm
   * rối. Nhiệm vụ đã hoàn tất/huỷ cũng bỏ — chỗ đó không còn ai đang xử lý nên
   * lập vụ mới ở đấy là hợp lệ. Nhiệm vụ đang mở cũng loại, vì nó đã có dấu ghim
   * đỏ riêng rồi, vẽ thêm một chấm cam chồng lên chỉ gây hiểu nhầm.
   */
  const ongoingIncidents = useMemo(() => {
    const ACTIVE: string[] = ["PENDING_WAREHOUSE", "READY", "PENDING_RESCUE", "RESCUE_CONFIRMED"];
    return (missionListQuery.data ?? [])
      .filter(
        (item) =>
          ACTIVE.includes(item.status) &&
          item.id !== missionId &&
          item.incidentLat != null &&
          item.incidentLng != null,
      )
      .map((item) => ({
        id: item.id,
        label:
          item.location?.trim() ||
          (INCIDENT_TYPES.find((t) => t.value === item.incidentType)?.label ?? item.incidentType),
        statusLabel: STATUS_LABELS[item.status] ?? item.status,
        lat: item.incidentLat as number,
        lng: item.incidentLng as number,
        // Chỉ lấy tuyến đã tính được thật; kho chưa có tuyến thì không vẽ đường
        // thẳng thay thế — một đường chim bay trên bản đồ đọc y như đường đi thật.
        routes: (item.actionPlan?.warehouses ?? [])
          .filter((w) => w.routeStatus === "ROUTED" && w.routeGeometry)
          .map((w) => w.routeGeometry!.coordinates),
      }));
  }, [missionListQuery.data, missionId]);

  /**
   * Điểm đang dùng cho form khai tình huống.
   *
   * Người vận hành vừa ghim thì lấy của họ. Chưa đụng thì mượn điểm của nhiệm vụ
   * — nhưng CHỈ khi nhiệm vụ còn là nháp. Nhiệm vụ đã phát hành mà vẫn mượn điểm
   * của nó thì form khai sự việc mới lại hiện dấu ghim của vụ cũ, và trước đây
   * còn bị khoá luôn không ghim được chỗ khác: một xã đang có hai điểm nạn cùng
   * lúc là chuyện bình thường, mà giao diện lại chặn mất.
   */
  const formIncidentPoint =
    incidentPoint !== undefined ? incidentPoint : isMissionEditable ? missionPoint : null;

  /**
   * ADMIN luôn ghim được: hoặc đang sửa nhiệm vụ nháp, hoặc đang khai vụ mới.
   * Không còn trường hợp nào bản đồ chỉ để nhìn đối với người điều phối.
   */
  const canEditIncidentPoint = isAdmin;

  const reportHasIncidentPoint = isReportDraft && missionHasIncidentPoint;
  const hamletOptions = useMemo(
    () => selectableHamlets(hamletListQuery.data ?? []),
    [hamletListQuery.data],
  );
  /**
   * EMPTY = chưa chọn thôn (được phép, khi ghim tay một điểm ngoài thôn).
   * INVALID = báo cáo có nhắc một nơi nhưng danh mục không có → phải cảnh báo.
   */
  const locationState = locationStatus(hamletOptions, form.location);
  const locationInvalid = locationState === "INVALID";

  const canCalculatePlan = Boolean(
    (formIncidentPoint || form.location?.trim() || reportHasIncidentPoint) && !locationInvalid,
  );

  /**
   * Ghi bản nháp lại mỗi lần người dùng đổi gì đó. Chỉ ghi khi khối khai báo còn
   * hiện: nhiệm vụ đã phát hành thì form không còn nữa, ghi tiếp là lưu một bản
   * nháp không bao giờ dùng tới.
   */
  useEffect(() => {
    if (!composerVisible) return;
    // Chưa khôi phục xong mà đã ghi thì lần ghi đầu tiên mang giá trị mặc định và
    // xoá mất bản nháp vừa đọc lên — hiệu ứng chạy trước khi state kịp cập nhật.
    if (hydratedFor !== (missionId ?? "new")) return;
    writeDraft(missionId, {
      description,
      incidentType: form.incidentType,
      location: form.location ?? "",
      affectedPeople: form.affectedPeople,
      durationHours: form.durationHours,
      children: form.children,
      elderly: form.elderly,
      medicalSupportCases: form.medicalSupportCases,
      incidentLat: formIncidentPoint?.lat ?? null,
      incidentLng: formIncidentPoint?.lng ?? null,
      analyzedDescription,
    });
  }, [
    composerVisible,
    hydratedFor,
    missionId,
    description,
    form,
    formIncidentPoint,
    analyzedDescription,
  ]);

  return (
    <div className="space-y-4">
      {/* Các bước liệt kê là việc hệ thống THẬT SỰ chạy cho từng nút, không phải
          chữ trang trí cho có vẻ bận rộn. */}
      <AiProgressDialog
        open={analyze.isPending}
        title="Phân tích lời kể thành số liệu"
        estimate="7 giây"
        steps={[
          "Bóc tách loại tình huống, số người và nhóm dễ tổn thương từ lời kể",
          "Đối chiếu từng con số ngược lại với chính câu vừa nhập",
          "Đối chiếu địa điểm với danh mục thôn đã xác minh",
          "Tính nhu cầu vật tư và phân bổ kho theo định mức",
        ]}
      />
      <AiProgressDialog
        open={analyzeCoordination.isPending}
        title="Lập bản tham mưu điều phối"
        estimate="20 giây"
        steps={[
          "Trích dữ kiện có nguồn từ lời kể, gắn nhãn đã báo cáo hay suy luận",
          "Tính nhu cầu vật tư theo định mức của hệ thống",
          "Dò tuyến đường thật từ từng kho tới điểm nạn",
          "Đối chiếu dự báo mưa và nêu các điểm còn phải xác minh",
        ]}
      />
      <AiProgressDialog
        open={genActionPlan.isPending}
        title="Lập kế hoạch cứu hộ"
        estimate="40 giây"
        steps={[
          "Chấm mức khẩn cấp và dự báo bằng công thức của hệ thống",
          "Viết mục tiêu 6 giờ đầu",
          "Viết việc phải làm theo mốc 0–2 giờ, 2–6 giờ, 6–24 giờ",
          "Kiểm lại: chặn mọi con số không có trong dữ liệu đã tính",
        ]}
      />

      {/* Đường về danh sách. Là <Link> chứ không phải nút gọi router.back(): mở
          thẳng bằng link từ chuông thông báo thì lịch sử trình duyệt không có
          trang trước, bấm lùi sẽ văng ra khỏi ứng dụng. */}
      {isDetailPage && (
        <Link
          href="/missions"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text)]"
        >
          <ColorIcon name="left" size={16} tone="blue" />
          Về danh sách nhiệm vụ
        </Link>
      )}

      {/* Trang chi tiết chỉ mở lại form khi nhiệm vụ còn là nháp — lúc đó sửa số
          liệu rồi tính lại là việc hợp lệ. Đã phát hành thì form không còn chỗ ở
          đây nữa; muốn khai vụ mới thì quay về tab điều phối. */}
      {composerVisible && (
        <section className="app-panel p-5">
          <h2 className="font-semibold">Tình huống khẩn cấp</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Nhập quy mô ảnh hưởng và chỉ chỗ xảy ra sự việc để hệ thống tính nhu cầu vật tư.
          </p>

          {/* Hai cột: nhập bên trái, bản đồ bên phải. Chọn điểm và điền số liệu là
              một việc liền mạch — tách hai khối bắt người dùng cuộn qua lại. */}
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div className="min-w-0">
              <DescribeIncidentBlock
                value={description}
                onChange={setDescription}
                onAnalyze={() => analyze.mutate()}
                analyzing={analyze.isPending}
                error={parseError}
                analyzedValue={analyzedDescription}
              />

              <div className="mt-4 space-y-3">
                <Field label="Loại tình huống">
                  <select
                    value={form.incidentType}
                    onChange={(e) => setForm({ ...form, incidentType: e.target.value })}
                    className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                  >
                    {INCIDENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Địa điểm ứng phó">
                  {/* Danh sách chọn, không phải ô gõ tự do: gõ tay thì sai một dấu
                      là backend không tra ra thôn nào, mất toạ độ và mất luôn phần
                      tính tuyến — mà lỗi chỉ hiện ra sau khi đã bấm lập phương án. */}
                  <select
                    value={
                      locationInvalid ? "" : (findHamlet(hamletOptions, form.location)?.name ?? "")
                    }
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    aria-invalid={locationInvalid}
                    className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                    style={locationInvalid ? { borderColor: "var(--color-critical)" } : undefined}
                  >
                    <option value="">— Không thuộc thôn nào, ghim tay trên bản đồ —</option>
                    {hamletOptions.map((h) => (
                      <option key={h.id} value={h.name}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {locationInvalid && (
                  <p role="alert" className="text-xs text-[var(--color-critical)]">
                    Vui lòng chọn thôn hợp lệ. Báo cáo ghi “{form.location}” nhưng tên này không có
                    trong danh mục thôn đã xác minh của xã.
                  </p>
                )}
                {hamletListQuery.isPending && (
                  <p className="text-xs text-[var(--text-muted)]">Đang tải danh mục thôn…</p>
                )}

                {/* Không để tên thôn trống thì bấm bản đồ cũng vô ích: backend chỉ
                  dùng toạ độ rời khi ô địa điểm để trống. Nói rõ ngay tại đây. */}
                <p className="text-xs text-[var(--text-muted)]">
                  {form.location?.trim()
                    ? "Đang dùng tên thôn ở trên. Xoá ô này để ghim tự do một điểm không thuộc thôn nào."
                    : formIncidentPoint
                      ? "Đang dùng điểm đã ghim. Bấm vào chính dấu ghim đỏ để bỏ, hoặc kéo nó sang chỗ khác."
                      : "Bỏ trống ô trên rồi bấm lên bản đồ bên phải để ghim đúng chỗ đang xảy ra sự việc."}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Số người"
                    value={form.affectedPeople}
                    onChange={(v) => setForm({ ...form, affectedPeople: v })}
                  />
                  <NumberField
                    label="Số giờ cô lập dự kiến"
                    value={form.durationHours}
                    onChange={(v) => setForm({ ...form, durationHours: v })}
                  />
                  <NumberField
                    label="Trẻ em"
                    value={form.children}
                    onChange={(v) => setForm({ ...form, children: v })}
                  />
                  <NumberField
                    label="Người già"
                    value={form.elderly}
                    onChange={(v) => setForm({ ...form, elderly: v })}
                  />
                  <NumberField
                    label="Ca y tế"
                    value={form.medicalSupportCases}
                    onChange={(v) => setForm({ ...form, medicalSupportCases: v })}
                  />
                </div>
              </div>

              {/* Một nút cho một ý định. Tính nhu cầu vật tư vốn chỉ là bước hệ thống
                  phải làm trước để có cái mà tham mưu — bắt người dùng bấm riêng là
                  bắt họ gánh chi tiết cài đặt của mình. */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => analyzeCoordination.mutate()}
                  // Nhiệm vụ còn sửa được thì bản tham mưu lập theo form, nên form
                  // sai là không lập được — chứ không phải lặng lẽ lập theo số cũ.
                  disabled={
                    analyzeCoordination.isPending || (isMissionEditable && !canCalculatePlan)
                  }
                  title={
                    canCalculatePlan || !isMissionEditable
                      ? "Tính nhu cầu vật tư rồi lập bản tham mưu trong một lượt"
                      : "Cần nhập thôn đã xác minh hoặc ghim một điểm trên bản đồ"
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2.5 font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
                >
                  <ColorIcon name="magic" size={19} tone="amber" />
                  {analyzeCoordination.isPending
                    ? "Đang tính nhu cầu và lập bản tham mưu…"
                    : "Lập bản tham mưu"}
                </button>
              </div>
              {analysisError && (
                <p className="mt-2 text-xs text-[var(--color-critical)]">{analysisError}</p>
              )}
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Vị trí sự cố và các kho</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {!isMissionEditable
                  ? "Nhiệm vụ đang mở đã phát hành. Bấm lên bản đồ để ghim một sự việc MỚI — nhiệm vụ cũ không bị ảnh hưởng."
                  : mission
                    ? missionHasIncidentPoint
                      ? "Vị trí đã được ghi nhận trong phương án. Kéo dấu ghim đỏ để dời, bấm vào nó để bỏ."
                      : "Nhiệm vụ chưa có điểm ứng phó. Hãy nhập thôn đã xác minh và tính lại phương án."
                    : "Bấm lên bản đồ để ghim chỗ đang xảy ra sự việc; bấm vào dấu ghim đỏ để bỏ, kéo để dời. Dùng khi nơi đó không thuộc thôn nào trong danh mục — còn lại cứ nhập tên thôn ở khối bên trái."}
              </p>
              <div className="mt-3">
                {/* Bản đồ này làm cả hai việc: chưa có phương án thì chọn điểm, có
                  rồi thì xem tuyến. Bày hai bản đồ chỉ tổ rối.

                  Tuyến của nhiệm vụ ĐÃ PHÁT HÀNH thì không vẽ ở đây: lúc đó khối
                  này là form khai sự việc mới, để nguyên tuyến cũ thì người dùng
                  tưởng mình đang sửa vụ cũ. Tuyến đó vẫn xem được ở khối kế hoạch
                  bên dưới. */}
                <IncidentMap
                  warehouses={isMissionEditable ? (mission?.actionPlan?.warehouses ?? []) : []}
                  baseWarehouses={warehouseListQuery.data ?? []}
                  incidentPoint={formIncidentPoint}
                  onPickIncident={canEditIncidentPoint ? setIncidentPoint : undefined}
                  ongoingIncidents={ongoingIncidents}
                  onOpenIncident={selectMission}
                  keepIncidentFocus
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {!isDetailPage && variant === "danh-sach" && (
        <MissionInbox
          missions={missionListQuery.data ?? []}
          selectedMissionId={missionId}
          role={role}
          warehouseId={assignedWarehouseId}
          isLoading={missionListQuery.isPending}
          error={missionListQuery.error}
          onRetry={() => missionListQuery.refetch()}
          onSelect={selectMission}
        />
      )}

      {/* Từ đây trở xuống là thông tin của MỘT nhiệm vụ, chỉ có ở trang riêng của
          nó. Trước đây tất cả nằm chung tab điều phối nên trang dài lê thê: form
          khai vụ mới, hộp nhiệm vụ, rồi cả chục khối của vụ đang chạy nối đuôi
          nhau — mà hai việc đó chẳng liên quan gì nhau. */}
      {isDetailPage && (
        <>
          {missionQuery.isPending ? (
            <MissionDetailLoading />
          ) : missionQuery.isError ? (
            <MissionDetailError
              message={
                missionQuery.error instanceof ApiError
                  ? missionQuery.error.message
                  : "Không mở được nhiệm vụ này. Nhiệm vụ có thể đã bị xóa hoặc bạn không có quyền truy cập."
              }
              onRetry={() => missionQuery.refetch()}
            />
          ) : !mission ? (
            <EmptyState isAdmin={isAdmin} />
          ) : (
            <>
              {isReportDraft && (
                <ReportDraftBanner
                  reportText={mission.reportText ?? ""}
                  isAdmin={isAdmin}
                  onAnalyze={() => analyze.mutate()}
                  analyzing={analyze.isPending}
                />
              )}
              {mission.readinessAssessment && (
                <MissionReadinessPanel assessment={mission.readinessAssessment} />
              )}
              <WarehouseRequestPanel
                missionId={mission.id}
                requests={mission.warehouseRequests ?? []}
                role={role}
                assignedWarehouseId={assignedWarehouseId}
              />
              {/* Bằng chứng hiện trường nằm bên trong khối tham mưu: nó chính là
                  nguồn làm bản tham mưu đổi, tách ra thì phải cuộn qua lại giữa
                  hai khối mới đối chiếu được. */}
              {isAdmin && (
                <CoordinationAnalysisPanel
                  missionId={mission.id}
                  fieldUpdateId={fieldUpdateId}
                  onRun={composerVisible ? undefined : () => analyzeCoordination.mutate()}
                  running={analyzeCoordination.isPending}
                  error={composerVisible ? null : analysisError}
                />
              )}
              <section className="app-panel p-5">
                <WorkflowStepper status={mission.status} />
                <div className="mt-5 border-t pt-4">
                  <RoleActions
                    mission={mission}
                    role={role}
                    assignedWarehouseId={assignedWarehouseId}
                    isReportDraft={isReportDraft}
                    hasIncidentPoint={missionHasIncidentPoint}
                    onGenerateActionPlan={() => genActionPlan.mutate()}
                    onPublish={() => step.mutate(approveMission)}
                    onPrepare={() => step.mutate(prepareMission)}
                    onCancel={(note) => step.mutate((id) => cancelMission(id, note))}
                    busy={genActionPlan.isPending || step.isPending}
                  />
                </div>
                {workflowError && (
                  <p className="mt-3 text-sm text-[var(--color-critical)]">{workflowError}</p>
                )}
              </section>

              {mission.actionPlan ? (
                <ActionPlanView plan={mission.actionPlan} incidentPoint={missionPoint} />
              ) : (
                <div className="rounded-md border border-dashed bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
                  Chọn <b>Lập kế hoạch cứu hộ</b> để tạo các bước thực hiện chi tiết.
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function MissionDetailLoading() {
  return (
    <div className="app-panel space-y-4 p-5" aria-label="Đang tải chi tiết nhiệm vụ" aria-busy>
      <div className="h-5 w-44 animate-pulse rounded bg-[var(--surface-2)]" />
      <div className="h-16 animate-pulse rounded-md bg-[var(--surface-2)]" />
      <div className="h-36 animate-pulse rounded-md bg-[var(--surface-2)]" />
    </div>
  );
}

function MissionDetailError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="app-panel border-[var(--color-critical)]/30 bg-[var(--color-critical)]/5 p-5"
    >
      <h2 className="font-semibold">Không mở được nhiệm vụ</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md border bg-[var(--surface)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px"
      >
        Thử lại
      </button>
    </div>
  );
}

const actionBtn =
  "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition active:translate-y-px disabled:opacity-60";
const primaryStyle = { background: "var(--color-accent)", color: "var(--color-accent-fg)" };

/** Nút hành động hiện theo role + trạng thái — người dùng chỉ thấy việc của mình. */
function RoleActions({
  mission,
  role,
  assignedWarehouseId,
  isReportDraft,
  hasIncidentPoint,
  onGenerateActionPlan,
  onPublish,
  onPrepare,
  onCancel,
  busy,
}: {
  mission: Mission;
  role: string | undefined;
  assignedWarehouseId: string | null | undefined;
  isReportDraft: boolean;
  hasIncidentPoint: boolean;
  onGenerateActionPlan: () => void;
  onPublish: () => void;
  onPrepare: () => void;
  onCancel: (note: string) => void;
  busy: boolean;
}) {
  const isAdmin = role === "ADMIN";
  const preparations = mission.warehousePreparations ?? [];
  const preparedWarehouseCount = preparations.filter((item) => item.preparedAt).length;
  const assignedPreparation = assignedWarehouseId
    ? preparations.find((item) => item.warehouseId === assignedWarehouseId)
    : undefined;
  const isLegacySourceWarehouse =
    preparations.length === 0 && assignedWarehouseId === mission.warehouseId;
  const warehouseCanPrepare =
    role === "WAREHOUSE" &&
    mission.status === "PENDING_WAREHOUSE" &&
    (mission.warehouseRequests?.length ?? 0) === 0 &&
    (Boolean(assignedPreparation && !assignedPreparation.preparedAt) || isLegacySourceWarehouse);
  const warehouseAlreadyPrepared =
    role === "WAREHOUSE" &&
    mission.status === "PENDING_WAREHOUSE" &&
    Boolean(assignedPreparation?.preparedAt);
  /**
   * ADMIN huỷ được khi chưa có kho nào xuất vật tư.
   *
   * Gồm cả bản nháp: lập nhầm, lập trùng một sự việc đã có người điều phối, hay
   * đọc lại thấy sai — đều cần đường bỏ đi. Trước đây chỉ cho huỷ sau khi phát
   * hành, nên bản nháp sai nằm lại mãi trong hộp nhiệm vụ, và cách duy nhất để
   * dọn là phát hành nó ra rồi mới huỷ — tức là bắt kho nhận một lệnh biết thừa
   * là sai. State machine ở backend vốn đã cho DRAFT → CANCELLED.
   */
  const adminCanCancelActive =
    isAdmin &&
    preparedWarehouseCount === 0 &&
    (mission.status === "DRAFT" || mission.status === "PENDING_WAREHOUSE");

  return (
    <div className="space-y-4">
      {mission.status === "COMPLETED" && mission.deliveryOutcome && (
        <DeliveryResultBanner outcome={mission.deliveryOutcome} note={mission.deliveryNote} />
      )}

      {preparations.length > 0 &&
        (mission.status === "PENDING_WAREHOUSE" || mission.status === "READY") && (
          <div className="rounded-md border bg-[var(--surface-2)] p-3">
            <p className="text-sm font-semibold">
              Tiến độ kho: {preparedWarehouseCount}/{preparations.length} đã chuẩn bị
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Nhiệm vụ chỉ sẵn sàng giao khi tất cả kho tham gia đã xuất phần được phân bổ.
            </p>
          </div>
        )}

      <div className="flex flex-wrap gap-2">
        {/* Báo cáo chưa phân tích: hành động nằm ở thẻ báo cáo phía trên, không hiện nút phương án. */}
        {isAdmin && mission.status === "DRAFT" && !isReportDraft && (
          <>
            {!mission.actionPlan && (
              <button
                className={actionBtn}
                style={primaryStyle}
                onClick={onGenerateActionPlan}
                disabled={busy || !hasIncidentPoint}
                title={
                  hasIncidentPoint
                    ? undefined
                    : "Cần xác nhận địa điểm ứng phó trước khi lập kế hoạch"
                }
              >
                <ColorIcon name="mission" size={18} tone="orange" /> Lập kế hoạch cứu hộ
              </button>
            )}
            {mission.actionPlan && (
              <button
                className={actionBtn}
                style={primaryStyle}
                onClick={onPublish}
                disabled={
                  busy ||
                  !hasIncidentPoint ||
                  mission.readinessAssessment?.status === "NOT_DISPATCHABLE"
                }
                title={
                  !hasIncidentPoint
                    ? "Cần xác nhận địa điểm ứng phó trước khi gửi"
                    : mission.readinessAssessment?.status === "NOT_DISPATCHABLE"
                      ? "Cần xử lý phần vật tư còn thiếu trước khi gửi"
                      : undefined
                }
              >
                <ColorIcon name="send" size={18} tone="blue" /> Duyệt và phát hành
              </button>
            )}
          </>
        )}

        {isAdmin && mission.status === "DRAFT" && !isReportDraft && !hasIncidentPoint && (
          <p className="w-full text-sm text-[var(--color-critical)]">
            Cần xác nhận địa điểm ứng phó trước khi lập kế hoạch hoặc gửi nhiệm vụ.
          </p>
        )}

        {warehouseCanPrepare && (
          <button className={actionBtn} style={primaryStyle} onClick={onPrepare} disabled={busy}>
            Chuẩn bị và xuất phần của kho này
          </button>
        )}

        {warehouseAlreadyPrepared && (
          <p className="text-sm text-[var(--text-muted)]">
            Kho của bạn đã xuất xong; đang chờ các kho còn lại.
          </p>
        )}

        {role === "WAREHOUSE" &&
          mission.status === "PENDING_WAREHOUSE" &&
          !warehouseCanPrepare &&
          !warehouseAlreadyPrepared && (
            <p className="text-sm text-[var(--text-muted)]">
              Kho của bạn không có phần vật tư được phân bổ trong nhiệm vụ này.
            </p>
          )}

        {/* ADMIN huỷ nhiệm vụ khi đang chạy (kho chưa xuất vật tư) */}
        {adminCanCancelActive && <AdminCancelActive onCancel={onCancel} busy={busy} />}

        {!actionableFor(mission.status, role) && (
          <p className="text-sm text-[var(--text-muted)]">{statusHint(mission.status, role)}</p>
        )}
      </div>
    </div>
  );
}

/** Có nút hành động cho role ở trạng thái này không (để quyết định hiện hint). */
function actionableFor(status: string, role: string | undefined): boolean {
  if (role === "ADMIN") return ["DRAFT", "PENDING_WAREHOUSE"].includes(status);
  if (role === "RESCUE") return false;
  if (role === "WAREHOUSE") return status === "PENDING_WAREHOUSE";
  return false;
}

const OUTCOME_META: Record<DeliveryOutcome, { label: string; tone: string }> = {
  DELIVERED: { label: "Đã giao đủ", tone: "var(--color-ready)" },
  PARTIAL: { label: "Giao một phần", tone: "var(--color-attention)" },
  FAILED: { label: "Không giao được", tone: "var(--color-critical)" },
};

/** Băng kết quả giao khi nhiệm vụ đã COMPLETED. */
function DeliveryResultBanner({
  outcome,
  note,
}: {
  outcome: DeliveryOutcome;
  note?: string | null;
}) {
  const meta = OUTCOME_META[outcome];
  return (
    <div className="rounded-md border p-3" style={{ borderColor: meta.tone }}>
      <div className="flex items-center gap-2">
        <ColorIcon name="success" size={18} tone="green" />
        <p className="text-sm font-semibold" style={{ color: meta.tone }}>
          Kết quả giao: {meta.label}
        </p>
      </div>
      {note && <p className="mt-1 text-sm text-[var(--text-muted)]">{note}</p>}
    </div>
  );
}

/** ADMIN huỷ nhiệm vụ đang chạy (kho chưa xuất) — bấm huỷ rồi nhập lý do xác nhận. */
function AdminCancelActive({
  onCancel,
  busy,
}: {
  onCancel: (note: string) => void;
  busy: boolean;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [note, setNote] = useState("");

  if (!cancelling) {
    return (
      <button
        className={`${actionBtn} border border-[var(--color-critical)] text-[var(--color-critical)]`}
        onClick={() => setCancelling(true)}
        disabled={busy}
      >
        Huỷ nhiệm vụ
      </button>
    );
  }

  return (
    <div className="w-full space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={`Lý do huỷ nhiệm vụ (gửi cho ${FIELD_FORCE_ROLE_LABEL.toLowerCase()} và kho)`}
        className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          className={actionBtn}
          style={{ background: "var(--color-critical)", color: "#fff" }}
          onClick={() => onCancel(note)}
          disabled={busy}
        >
          Xác nhận huỷ
        </button>
        <button
          className={`${actionBtn} border`}
          onClick={() => setCancelling(false)}
          disabled={busy}
        >
          Quay lại
        </button>
      </div>
    </div>
  );
}

function statusHint(status: string, role: string | undefined): string {
  if (status === "READY") {
    return `Kho đã chuẩn bị xong và sẵn sàng giao vật tư cho ${FIELD_FORCE_ROLE_LABEL.toLowerCase()}.`;
  }
  if (status === "PENDING_RESCUE") {
    return `Đang chờ ${FIELD_FORCE_ROLE_LABEL.toLowerCase()} xác nhận.`;
  }
  if (status === "PENDING_WAREHOUSE") return "Đang chờ kho chuẩn bị vật tư.";
  if (status === "DRAFT" && role !== "ADMIN") return "Bộ phận điều phối đang lập kế hoạch.";
  if (status === "REJECTED") {
    return `${FIELD_FORCE_ROLE_LABEL} đã từ chối. Chờ bộ phận điều phối xử lý.`;
  }
  if (status === "DEFERRED")
    return "Nhiệm vụ đang tạm hoãn, chờ bộ phận điều phối cập nhật và gửi lại.";
  if (status === "CANCELLED") return "Nhiệm vụ đã huỷ.";
  if (status === "COMPLETED") return "Nhiệm vụ đã hoàn thành. Xem kết quả giao ở trên.";
  return "Không có hành động cho vai trò của bạn ở bước này.";
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="rounded-md border border-dashed bg-[var(--surface)] p-10 text-center">
      <ColorIcon className="mx-auto" name="workflow" size={30} tone="blue" />
      <p className="mt-3 font-medium">Chưa có nhiệm vụ cứu hộ</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {isAdmin
          ? "Nhập tình huống bên trái để bắt đầu lập phương án."
          : "Chờ cơ quan lập và gửi phương án cứu hộ."}
      </p>
    </div>
  );
}

/**
 * Báo cáo thô của trưởng thôn (gửi từ mobile) — hiển thị nguyên văn để admin đọc lại,
 * kèm nút phân tích. Mô tả đã được đổ sẵn xuống ô nhập bên trái để admin xem/sửa trước
 * khi bấm phân tích; nút ở đây là lối tắt nhanh. RESCUE/WAREHOUSE chỉ xem, không phân tích.
 */
function ReportDraftBanner({
  reportText,
  isAdmin,
  onAnalyze,
  analyzing,
}: {
  reportText: string;
  isAdmin: boolean;
  onAnalyze: () => void;
  analyzing: boolean;
}) {
  return (
    <section className="app-panel border-l-4 border-l-[var(--color-accent)] p-5">
      <div className="flex items-center gap-2">
        <ColorIcon name="mission" size={18} tone="orange" />
        <h3 className="text-sm font-semibold">Báo cáo từ trưởng thôn</h3>
        <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
          Chưa phân tích
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap rounded-md bg-[var(--surface)] p-3 text-sm">
        {reportText}
      </p>
      {isAdmin ? (
        <>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Đã đổ mô tả xuống ô nhập bên trái — xem/sửa lại rồi phân tích thành phương án ngay trên
            báo cáo này (không tạo tin mới).
          </p>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={analyzing}
            className="mt-3 flex items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
          >
            <ColorIcon name="mission" size={18} tone="orange" />
            {analyzing ? "Đang phân tích" : "Phân tích báo cáo"}
          </button>
        </>
      ) : (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Chờ cơ quan phân tích và lập phương án.
        </p>
      )}
    </section>
  );
}

/**
 * Nhập tình huống bằng lời → AI phân tích và lập phương án cứu hộ ngay. Nút mic ghi âm
 * rồi PhoWhisper local nhận dạng (offline, giọng Việt). Không hỗ trợ mic → ẩn nút, gõ tay vẫn chạy.
 */
function DescribeIncidentBlock({
  value,
  onChange,
  onAnalyze,
  analyzing,
  error,
  analyzedValue,
}: {
  value: string;
  onChange: (v: string) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  error: string | null;
  /** Lời kể đã phân tích rồi; trùng với ô hiện tại thì khoá nút. */
  analyzedValue: string | null;
}) {
  // Ghi thêm vào cuối phần đã có (nối tiếp nhiều lần nói), gọn ghẽ khoảng trắng.
  const { supported, status, voiceError, toggle } = useAudioRecorder((text) =>
    onChange([value.trim(), text.trim()].filter(Boolean).join(" ")),
  );
  const recording = status === "recording";
  const transcribing = status === "transcribing";
  // Phân tích lại đúng lời kể cũ cho ra đúng kết quả cũ, nhưng lại xoá bản tham
  // mưu và ghi đè nhu cầu đang có. Sửa một chữ trong ô là nút mở lại ngay.
  const analyzedAlready = analyzedValue !== null && analyzedValue === value.trim();

  return (
    <div className="mt-4 rounded-md border border-dashed bg-[var(--surface-2)] p-3">
      <div className="flex items-center gap-2">
        <ColorIcon name="magic" size={16} tone="amber" />
        <span className="text-xs font-semibold">
          Mô tả tình huống bằng lời — AI phân tích &amp; lập phương án ngay
        </span>
      </div>
      {/* Ô mô tả rộng rãi: người kể tình huống thật thường viết vài câu, ô ba dòng
          bắt họ cuộn ngay trong lúc đang gấp. Không chừa lề phải nữa vì nút mic đã
          xuống hàng nút bên dưới. */}
      <div className="mt-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          placeholder='Vd: "Lũ quét xã Đồng Xuân, khoảng 200 người mắc kẹt, nhiều trẻ em, 3 ngày chưa có nước sạch"'
          className="w-full resize-y rounded-md border bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing || value.trim().length < 5 || analyzedAlready}
          title={
            analyzedAlready
              ? "Lời kể này đã phân tích rồi. Sửa nội dung ở ô trên để phân tích lại."
              : "Đọc lời kể thành số liệu rồi điền vào form bên dưới"
          }
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
        >
          <ColorIcon name="magic" size={15} tone="amber" />
          {analyzing ? "Đang phân tích & lập phương án…" : "Phân tích bằng AI"}
        </button>
        {/* Nút nói nằm cạnh nút phân tích: hai cách nhập cùng một việc, để chung
            hàng thì thấy ngay là chọn một trong hai. Trước đây nó lửng lơ trong góc
            ô nhập, dễ tưởng là biểu tượng trang trí. */}
        {supported && (
          <button
            type="button"
            onClick={toggle}
            disabled={transcribing}
            title={recording ? "Dừng và nhận dạng" : "Nói để nhập (tiếng Việt, offline)"}
            aria-label={recording ? "Dừng ghi âm" : "Nhập bằng giọng nói"}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition active:translate-y-px disabled:opacity-60"
            style={
              recording
                ? {
                    borderColor: "var(--color-critical)",
                    background: "color-mix(in oklch, var(--color-critical) 12%, transparent)",
                  }
                : undefined
            }
          >
            <ColorIcon name="microphone" size={15} tone={recording ? "red" : "blue"} />
            {recording ? "Dừng ghi âm" : transcribing ? "Đang nhận dạng…" : "Nói để nhập"}
          </button>
        )}
        {/* Trạng thái ghi âm/nhận dạng đã nằm trên chính nhãn nút, không lặp lại. */}
      </div>
      {analyzedAlready && !analyzing && (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Đã phân tích lời kể này. Sửa nội dung ở ô trên nếu muốn phân tích lại — số liệu bên dưới
          vẫn sửa tay được bình thường.
        </p>
      )}
      {voiceError && <p className="mt-1.5 text-xs text-[var(--color-attention)]">{voiceError}</p>}
      {error && <p className="mt-1.5 text-xs text-[var(--color-critical)]">{error}</p>}
    </div>
  );
}

type RecorderStatus = "idle" | "recording" | "transcribing";

/**
 * Ghi âm mic → WAV 16kHz → PhoWhisper local (offline) trả text tiếng Việt.
 * Trả {supported, status, voiceError, toggle}. Thiếu getUserMedia/AudioContext → supported=false.
 * Lỗi micro/nhận dạng (vd ai-service tắt, 503) → voiceError, KHÔNG chặn luồng gõ tay.
 */
function useAudioRecorder(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const micLabelRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported(
      Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== "undefined" &&
        Boolean(
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext,
        ),
    );
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Nhớ tên thiết bị trình duyệt thực sự chọn, để lúc báo lỗi gọi đúng tên nó
      // ra. Máy này có tới bốn micro đang bật, trong đó có một micro ảo — biết
      // trình duyệt lấy cái nào là biết ngay phải sửa gì.
      micLabelRef.current = stream.getAudioTracks()[0]?.label ?? "";
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) {
          setStatus("idle");
          return;
        }
        setStatus("transcribing");
        try {
          const { base64, rms } = await blobToWavBase64(blob);
          // Micro trả về im lặng SỐ HỌC (rms = 0) tuy đoạn ghi vẫn đủ số giây —
          // đó là dấu hiệu trình duyệt đang lấy nhầm thiết bị, hay gặp nhất là
          // micro ảo của phần mềm đổi giọng: nó tồn tại, cấp quyền được, ghi đủ
          // thời lượng, nhưng không có phần mềm nào bơm tiếng vào. Gửi lên máy
          // chủ thì cũng chỉ nhận lại "chưa nghe rõ", mà đó là câu chỉ sai đường:
          // người dùng sẽ đi nói to hơn thay vì đi đổi thiết bị. Chặn tại đây và
          // gọi đúng tên thiết bị ra.
          if (rms < SILENCE_RMS) {
            const micro = micLabelRef.current;
            setVoiceError(
              `Micro${micro ? ` "${micro}"` : ""} không thu được tiếng nào. ` +
                "Chọn micro khác ở biểu tượng bên phải thanh địa chỉ trình duyệt, rồi thử lại.",
            );
            return;
          }
          const { text } = await transcribeAudio(base64);
          if (text.trim()) onText(text);
          else setVoiceError("Chưa nghe rõ nội dung. Vui lòng nói lại hoặc gõ tay.");
        } catch (err) {
          setVoiceError(
            err instanceof ApiError
              ? "Nhận dạng giọng nói chưa sẵn sàng — vui lòng gõ tay."
              : "Không xử lý được âm thanh. Vui lòng gõ tay.",
          );
        } finally {
          setStatus("idle");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setStatus("recording");
    } catch {
      stopStream();
      setStatus("idle");
      setVoiceError("Không truy cập được micro. Kiểm tra quyền trình duyệt hoặc gõ tay.");
    }
  };

  const toggle = () => {
    if (status === "recording") {
      recorderRef.current?.stop();
      recorderRef.current = null;
      return;
    }
    if (status === "idle") void startRecording();
  };

  return { supported, status, voiceError, toggle };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="tabular w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
      />
    </Field>
  );
}
