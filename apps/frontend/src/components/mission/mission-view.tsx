"use client";

import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AiProgressDialog } from "@/components/shared/ai-progress-dialog";
import { ColorIcon } from "@/components/shared/color-icon";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-store";
import { useMissionFocus } from "@/lib/mission-focus-store";
import { missionDeepLink, missionNumberLink } from "@/lib/mission-inbox-state";
import type { LatLng } from "@/lib/geo";
import { ApiError } from "@/lib/api";
import {
  analyzeMission,
  approveMission,
  cancelMission,
  generateActionPlan,
  generatePlan,
  fetchMissionDeliveryPhoto,
  getLatestCoordinationAnalysis,
  getMission,
  getWarehouseRoutes,
  parseIncident,
  planFromReport,
  markSuppliesReturned,
  prepareMission,
  transcribeAudio,
  type DeliveryOutcome,
  type GenerateInput,
  type Mission,
  type MissionDeliveryPhoto,
  type ParsedIncident,
  fetchMissionReportAudio,
  type MissionReportAudio,
} from "@/lib/mission-api";
import { listAllWarehouses } from "@/lib/warehouse-api";
import { listHamlets } from "@/lib/hamlet-api";
import {
  findHamlet,
  locationStatus,
  normalizeHamletName,
  selectableHamlets,
  type HamletOption,
} from "@/lib/hamlet-match";
import {
  clearDraft,
  moveDraft,
  pruneDrafts,
  readDraft,
  writeDraft,
  type MissionDraft,
} from "@/lib/mission-draft";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { blobToWavBase64, SILENCE_RMS } from "@/lib/audio-wav";
import { ActionPlanView } from "./action-plan-view";
import { MissionInbox } from "./mission-inbox";
import { MissionReadinessPanel } from "./mission-readiness-panel";
import { CoordinationAnalysisPanel, requestId } from "./coordination-analysis-panel";
import { WarehouseRequestPanel } from "./warehouse-request-panel";
import { WorkflowStepper } from "./workflow-stepper";
import { completedStepIndex } from "./workflow-progress";
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

/**
 * Form lúc chưa ai nhập gì.
 *
 * Tách ra thành hằng vì nó còn được dùng để TRẢ LỜI câu hỏi "người dùng đã đụng
 * vào form chưa" — điều kiện duy nhất cho phép đổ số liệu của nhiệm vụ đè lên form
 * mà chắc chắn không xoá mất thứ ai đó đang gõ dở.
 */
const DEFAULT_FORM: IncidentForm = {
  incidentType: "FLOOD",
  location: "",
  affectedPeople: 100,
  durationHours: 24,
  children: 0,
  elderly: 0,
  medicalSupportCases: 0,
};

/**
 * Số liệu của một nhiệm vụ, đọc ra đúng hình dạng của form.
 *
 * Dùng ở hai chỗ phải khớp nhau tuyệt đối: lúc đổ nhiệm vụ lên form khi mở trang,
 * và lúc bấm "Huỷ" giữa chừng để trả form về nguyên trạng. Hai chỗ chép tay hai
 * bản là kiểu bỏ sót đúng một trường, rồi "Huỷ" lại lặng lẽ giữ lại phần đã sửa.
 */
function formFromMission(mission: Mission): IncidentForm {
  const parsed = mission.parsedInput ?? {};
  return {
    incidentType: mission.incidentType,
    location: mission.location ?? "",
    affectedPeople: mission.affectedPeople,
    durationHours: mission.durationHours,
    children: parsed.children ?? 0,
    elderly: parsed.elderly ?? 0,
    medicalSupportCases: parsed.medicalSupportCases ?? 0,
  };
}

/**
 * Khoá của lượt "lập bản tham mưu" trong kho mutation.
 *
 * Cần một khoá cố định vì lượt chạy phải theo dõi được XUYÊN QUA lần chuyển trang
 * giữa chừng: bấm ở tab điều phối, chạy tiếp ở trang nhiệm vụ.
 */
const COORDINATION_MUTATION_KEY = "mission-coordination-analysis";

/** Form còn nguyên như lúc mới mở — chưa nhập tay, chưa khôi phục bản nháp nào. */
function isDefaultForm(form: IncidentForm): boolean {
  return (
    form.incidentType === DEFAULT_FORM.incidentType &&
    !form.location?.trim() &&
    form.affectedPeople === DEFAULT_FORM.affectedPeople &&
    form.durationHours === DEFAULT_FORM.durationHours &&
    form.children === DEFAULT_FORM.children &&
    form.elderly === DEFAULT_FORM.elderly &&
    form.medicalSupportCases === DEFAULT_FORM.medicalSupportCases
  );
}

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
  /**
   * Mở một nhiệm vụ khi CHỈ biết id.
   *
   * Đường dẫn chính tắc theo số hiệu, nhưng chỗ gọi ở đây (chuông thông báo) chỉ
   * cầm `missionId`. `/mission/<id>` là đường chuyển tiếp: nó tra số hiệu rồi
   * thay địa chỉ, nên người dùng vẫn dừng lại ở /missions/nhiem-vu-98.
   */
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

  /** Mở nhiệm vụ khi đã biết số hiệu — đi thẳng, không qua bước chuyển tiếp. */
  const openMissionByNo = useCallback(
    (missionNo: number) => router.push(missionNumberLink(missionNo), { scroll: false }),
    [router],
  );
  const [form, setForm] = useState<IncidentForm>(DEFAULT_FORM);
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
  /**
   * Đang mở form để sửa lại số liệu đã phân tích.
   *
   * Phân tích xong thì khối này chuyển sang BẢNG để soát: bảy ô nhập nằm cạnh nhau
   * đọc rất chậm khi việc cần làm chỉ là đối chiếu với lời kể xem AI có nghe nhầm
   * không. Bấm "Chỉnh sửa" mới mở lại đúng các ô đó.
   */
  const [editingIncident, setEditingIncident] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  /**
   * Tuyến từ các kho CÓ CẤP HÀNG tới điểm nạn, để bản đồ vẽ đường ngay sau khi tính
   * nhu cầu.
   *
   * Trước đây tuyến chỉ nằm trong `mission.actionPlan`, mà cái đó chỉ sinh ra khi bấm
   * "Lập bản tham mưu" — một bước có gọi LLM. Nên vừa tính xong nhu cầu, hệ thống đã
   * biết chính xác kho nào cấp gì mà bản đồ vẫn trắng đường.
   *
   * `enabled` bám đúng hai điều kiện:
   * - nhiệm vụ CÒN LÀ NHÁP: đã phát hành thì khối này là form khai vụ mới, vẽ tuyến
   *   của vụ cũ lên đó là gây hiểu nhầm;
   * - chưa có `actionPlan`: có rồi thì dùng luôn tuyến trong đó, gọi OSRM lần nữa
   *   chỉ để nhận lại đúng kết quả cũ.
   */
  const routesQuery = useQuery({
    queryKey: ["mission", missionId, "warehouse-routes"],
    queryFn: () => getWarehouseRoutes(missionId as string),
    enabled:
      Boolean(missionId) && role === "ADMIN" && mission?.status === "DRAFT" && !mission?.actionPlan,
    staleTime: 30 * 1000,
  });
  /**
   * Nhiệm vụ này đã có bản tham mưu chưa.
   *
   * Dùng để GIẤU nút "Lập bản tham mưu" sau khi đã lập: để nút nguyên đó thì nó
   * mời bấm lại một việc vừa xong, mà mỗi lượt bấm là một lượt gọi LLM và một bản
   * tham mưu mới đè lên bản đang đọc dở.
   *
   * Cùng khoá với truy vấn trong khối tham mưu nên hai bên dùng chung một bản dữ
   * liệu — không gọi thêm lượt mạng nào, và lập xong là nút biến mất ngay nhờ
   * `setQueryData` ở `analyzeCoordination`.
   */
  const coordinationQuery = useQuery({
    queryKey: ["mission", missionId, "coordination-analysis"],
    queryFn: () => getLatestCoordinationAnalysis(missionId as string),
    enabled: Boolean(missionId) && role === "ADMIN",
  });
  const hasCoordinationAnalysis = Boolean(coordinationQuery.data);

  // Báo cáo của trưởng thôn (mobile): DRAFT chỉ có mô tả thô, chưa phân tích (0 nhu cầu).
  // Admin mở tin này trên web để đọc lại rồi phân tích thành phương án ngay trên chính nó.
  const isReportDraft =
    // Ghi âm KHÔNG kèm chữ vẫn là một báo cáo. Chỉ xét `reportText` thì báo cáo
    // thuần giọng nói rơi ra khỏi luồng này: nó thành một bản nháp trống trơn,
    // không đổ mô tả, không hiện chỗ nghe lại.
    (Boolean(mission?.reportText) || Boolean(mission?.reportAudio)) &&
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
  // Chế độ sửa cũng đóng lại: mở nhiệm vụ khác mà form vẫn đang mở sửa thì người
  // dùng tưởng mình đang sửa vụ vừa mở, trong khi số liệu là của vụ mới.
  useEffect(() => {
    setIncidentPoint(undefined);
    setEditingIncident(false);
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
  /** Bản nháp mới nhất chưa kịp ghi xuống (đang chờ gộp lượt). */
  const pendingDraftRef = useRef<{
    missionId: string | null;
    draft: Omit<MissionDraft, "savedAt">;
  } | null>(null);
  // Bản nháp có lời kể riêng thì đừng để lời kể gốc của báo cáo đè lên: admin đã
  // sửa lại rồi, trả về bản thô là xoá đúng phần họ vừa làm.
  const draftOwnsDescriptionRef = useRef(false);
  useEffect(() => {
    const key = missionId ?? "new";
    if (restoredForRef.current === key) return;
    restoredForRef.current = key;
    // Dọn rác trước khi đọc: rác sinh ra theo lượt MỞ nhiệm vụ nên dọn theo đúng
    // nhịp đó là đủ, và làm trước lượt ghi đầu tiên thì bản nháp đang mở luôn có
    // chỗ trống mà xuống. Bản của chính màn hình này được giữ lại.
    pruneDrafts(missionId);
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

  /**
   * Đổ số liệu của NHIỆM VỤ lên form khi form còn nguyên giá trị mặc định.
   *
   * Đây là lưới an toàn cho mọi đường vào trang chi tiết mà máy không giữ bản nháp:
   * mở lại một nhiệm vụ nháp từ hộp nhiệm vụ, mở link nhiệm vụ người khác gửi, hay
   * trình duyệt chặn localStorage. Thiếu nó thì form hiện 100 người mặc định trong
   * khi nhiệm vụ đang giữ 500 — và vì "Lập bản tham mưu" ghi FORM xuống nhiệm vụ
   * trước khi tham mưu (`formDiffersFromMission` thấy lệch), một cú bấm là 500 người
   * bị thay bằng 100, kèm theo toàn bộ nhu cầu vật tư tính lại theo con số sai.
   *
   * Chỉ chạy khi form còn y nguyên mặc định — tức chắc chắn chưa ai gõ gì và cũng
   * chưa khôi phục bản nháp nào, nên không có gì để mất. Người dùng vừa sửa một ô
   * thì lần refetch 5 giây sau không được phép kéo số cũ đè lên.
   */
  const missionHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!missionId || !mission) return;
    // Chờ lượt đọc bản nháp xong đã: bản nháp là bản mới hơn, được ưu tiên.
    if (hydratedFor !== missionId) return;
    if (missionHydratedRef.current === missionId) return;
    // Đã phát hành thì khối này là form khai sự việc MỚI, không phải form của nó.
    if (mission.status !== "DRAFT") return;
    // Báo cáo thô của trưởng thôn: bản ghi mới là chỗ trống (OTHER, 0 người) chờ
    // admin bấm phân tích. Đổ chỗ trống đó lên form là tự tay điền số 0 vào.
    if (isReportDraft) return;
    if (!isDefaultForm(form)) {
      missionHydratedRef.current = missionId;
      return;
    }
    missionHydratedRef.current = missionId;
    setForm(formFromMission(mission));
  }, [mission, missionId, hydratedFor, isReportDraft, form]);

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

  /**
   * "Phân tích bằng AI" — CHỈ bóc lời kể thành số và điền vào form.
   *
   * Trước đây nút này làm luôn cả việc tạo nhiệm vụ, tính nhu cầu vật tư rồi nhảy
   * sang trang nhiệm vụ. Người dùng chưa kịp đọc xem AI nghe có đúng không thì hệ
   * thống đã ghi thành một nhiệm vụ thật — nghe nhầm 500 thành 100 là đã có một
   * bản ghi sai nằm trong danh sách, phải sửa hoặc bỏ. Một cú bấm chỉ nên làm một
   * việc, và việc của nút này là ĐIỀN HỘ.
   *
   * Không đụng gì tới backend ngoài lượt bóc chữ: không tạo nhiệm vụ, không tính
   * nhu cầu, không chuyển trang. Bấm "Lập bản tham mưu" mới là lúc chốt.
   */
  /**
   * Kéo lại bản mới nhất sau khi một thao tác bị chặn.
   *
   * Bị chặn gần như luôn có nghĩa là người khác vừa đổi nhiệm vụ này — một xã có
   * nhiều quản trị viên cùng duyệt. Chỉ hiện dòng chữ đỏ mà giữ nguyên màn hình
   * thì người dùng vẫn nhìn thấy nút cũ, phần phân bổ cũ, và bấm lại đúng thứ
   * vừa bị từ chối. Tải lại thì chính giao diện nói ra chuyện gì đã xảy ra.
   */
  const refreshMissionAfterConflict = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
    queryClient.invalidateQueries({ queryKey: ["mission", missionId, "coordination-analysis"] });
    queryClient.invalidateQueries({ queryKey: ["mission", missionId, "warehouse-routes"] });
    queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
  }, [queryClient, missionId]);

  /**
   * Bộ huỷ cho các lượt gọi AI đang chạy, tra theo tên việc.
   *
   * Lượt gọi mô hình có thể treo — mạng rớt, mô hình không trả lời, hoặc lâu hơn
   * mức người dùng chờ được. Không có đường thoát thì hộp thoại chờ khoá cứng màn
   * hình và cách duy nhất là tải lại cả trang, mất luôn phần đang gõ dở ở form.
   *
   * Bấm dừng chỉ cắt được PHÍA MÌNH: máy chủ có thể vẫn chạy nốt và ghi kết quả.
   * Nên sau khi cắt phải tải lại dữ liệu từ máy chủ — hiện đúng thứ đã xảy ra
   * thật, thay vì giả vờ như chưa có gì xảy ra rồi để hai bên lệch nhau.
   */
  const aiAbortRef = useRef<Record<string, AbortController | undefined>>({});
  const newAiSignal = useCallback((key: string) => {
    aiAbortRef.current[key]?.abort();
    const controller = new AbortController();
    aiAbortRef.current[key] = controller;
    return controller.signal;
  }, []);
  const cancelAi = useCallback(
    (key: string) => {
      aiAbortRef.current[key]?.abort();
      aiAbortRef.current[key] = undefined;
      refreshMissionAfterConflict();
    },
    [refreshMissionAfterConflict],
  );

  /** Người dùng tự bấm dừng thì không phải lỗi — đừng hiện dòng đỏ trách họ. */
  const isUserAbort = (error: unknown) =>
    error instanceof DOMException && error.name === "AbortError";

  const analyze = useMutation({
    mutationFn: () => parseIncident(description, newAiSignal("parse")),
    onSuccess: (p: ParsedIncident) => {
      setForm({
        incidentType: p.incidentType,
        // Đã ghim tay thì điểm ghim là địa điểm, kể cả khi lời kể có nhắc tên thôn:
        // backend chạy theo điểm ghim, giữ lại tên thôn chỉ để nó hiện lên như địa
        // điểm ứng phó rồi mâu thuẫn với chính tuyến vẽ trên bản đồ.
        location: formIncidentPoint ? "" : (p.location ?? undefined),
        affectedPeople: p.affectedPeople,
        durationHours: p.durationHours,
        children: p.children,
        elderly: p.elderly,
        medicalSupportCases: p.medicalSupportCases,
      });
      setAnalyzedDescription(description.trim());
      // Vừa điền xong thì phải cho SOÁT, không phải cho sửa: mở sẵn chế độ sửa
      // thì bảng đối chiếu không hiện ra, đúng thứ vừa làm ra để người ta đọc.
      setEditingIncident(false);
      setParseError(null);
    },
    onError: (err) => {
      if (isUserAbort(err)) return;
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
   * Lưu phần admin vừa sửa và tính lại khả năng đáp ứng NGAY.
   *
   * `planFromReport` trả về nhiệm vụ đã tính lại kèm `requirements` và
   * `readinessAssessment`, nên ghi thẳng kết quả vào cache là khối "Khả năng đáp
   * ứng nhiệm vụ" bên dưới đổi theo cùng lúc — không phải bấm "Lập bản tham mưu"
   * (một bước có gọi LLM, chậm và tốn) chỉ để xem sửa một con số thì kho có còn
   * đủ hàng không.
   */
  /**
   * Đang lập lại bản tham mưu ngay sau lượt lưu — bước có gọi LLM nên chậm.
   *
   * Cần cờ riêng, không dùng chung `updateIncident.isPending`: lượt lưu của nhiệm
   * vụ CHƯA có bản tham mưu chỉ là một lượt ghi chớp nhoáng, mở hộp thoại "đang
   * lập bản tham mưu" ở đó là nói sai việc đang chạy.
   */
  const [replanningAfterEdit, setReplanningAfterEdit] = useState(false);

  const updateIncident = useMutation({
    mutationFn: async () => {
      const updated = await syncMissionWithForm(missionId as string);
      // Đã có bản tham mưu thì lập lại luôn theo số vừa sửa.
      //
      // Bản tham mưu dựng TRÊN nhu cầu vật tư, nên sửa số người xong mà giữ bản
      // cũ là để trên màn hình một bản tham mưu tính theo bộ số không còn tồn
      // tại — thứ nguy hiểm hơn hẳn việc không có bản nào. Trước đây người dùng
      // phải tự nhớ bấm lập lại, mà không có gì nhắc họ.
      //
      // Chưa có bản nào thì đừng tự tạo: lập tham mưu là một quyết định, không
      // phải hệ quả của việc sửa một con số.
      if (!hasCoordinationAnalysis) return { updated, snapshot: null };
      setReplanningAfterEdit(true);
      try {
        const result = await analyzeMission(
          updated.id,
          { requestId: requestId() },
          newAiSignal("coordination"),
        );
        return { updated, snapshot: result.snapshot };
      } finally {
        setReplanningAfterEdit(false);
      }
    },
    onSuccess: ({ updated, snapshot }) => {
      setEditError(null);
      setEditingIncident(false);
      if (snapshot) {
        queryClient.setQueryData(["mission", updated.id, "coordination-analysis"], snapshot);
      }
      // Trả điểm về "chưa đụng" để bản đồ bám theo điểm đã lưu của nhiệm vụ: chọn
      // thôn xong là điểm ghim tay bị bỏ, giữ nguyên trạng thái đã-xoá thì lưu
      // xong bản đồ trống trơn dù nhiệm vụ vừa nhận đúng toạ độ của thôn đó.
      setIncidentPoint(undefined);
      // Đắp lên bản cũ chứ không thay hẳn: các endpoint ghi (sửa số liệu, duyệt,
      // xuất kho…) trả về hàng Mission thuần, KHÔNG kèm cờ `hasCoordinationAnalysis`
      // — cờ đó chỉ có ở `getMission` và danh sách, vì backend phải đếm snapshot mới
      // dựng ra được. Gán thẳng là cờ biến mất, mà cờ đó đang điều khiển phụ đề trên
      // đầu trang lẫn việc khối tham mưu mở hay đóng: sửa một con số xong là nhãn tụt
      // về "Bản nháp" và khối tham mưu bật mở lại, cho tới lượt tải lại sau.
      queryClient.setQueryData(["mission", updated.id], (previous?: Mission) =>
        previous ? { ...previous, ...updated } : updated,
      );
      // Đổi số người là đổi luôn danh sách kho góp hàng, nên tuyến vẽ trên bản đồ
      // cũng phải tính lại — nếu không nó còn vẽ đường của bộ số cũ.
      queryClient.invalidateQueries({ queryKey: ["mission", updated.id, "warehouse-routes"] });
      queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
    },
    onError: (err) => {
      if (isUserAbort(err)) return;
      setEditError(
        err instanceof ApiError ? err.message : "Chưa lưu được số liệu vừa sửa. Vui lòng thử lại.",
      );
      refreshMissionAfterConflict();
    },
  });

  /**
   * Lập bản tham mưu cho nhiệm vụ đang mở.
   *
   * Nút nằm ở khối tình huống nhưng kết quả hiện ở khối tham mưu bên dưới: ghi
   * thẳng vào cache của query mà khối đó đang đọc, khỏi phải dựng đường truyền
   * state xuyên qua mấy tầng component chỉ để chuyển một cú bấm.
   */
  const analyzeCoordination = useMutation({
    // Có khoá thì lượt chạy còn theo dõi được sau khi component bị thay.
    mutationKey: [COORDINATION_MUTATION_KEY],
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
        moveDraft(null, created.id);
        openMissionByNo(created.missionNo);
      } else if (mission && isMissionEditable && formDiffersFromMission(mission)) {
        // Form mới là bản gốc. Phân tích bằng AI chỉ điền hộ vào form; cán bộ sửa
        // lại rồi thì phải ghi phần sửa đó xuống nhiệm vụ TRƯỚC khi tham mưu.
        await syncMissionWithForm(id);
        await queryClient.invalidateQueries({ queryKey: ["mission", id] });
        queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
      }
      const result = await analyzeMission(
        id,
        { requestId: requestId() },
        newAiSignal("coordination"),
      );
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
      // Lập tham mưu xong là cờ `hasCoordinationAnalysis` của nhiệm vụ đã đổi, nên
      // bản nhiệm vụ trong cache thành cũ. Không kéo lại thì phụ đề trên đầu trang
      // và thẻ ngoài hộp nhiệm vụ còn ghi "Bản nháp" cho tới lượt làm mới sau.
      //
      // `exact` để không quét luôn các khoá con: bản tham mưu vừa ghi ngay ở trên
      // sẽ bị gọi lại chỉ để nhận đúng cái vừa nhận.
      queryClient.invalidateQueries({ queryKey: ["mission", result.missionId], exact: true });
      queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
    },
    onError: (err) => {
      if (isUserAbort(err)) return;
      setAnalysisError(
        err instanceof ApiError ? err.message : "Chưa lập được bản tham mưu. Vui lòng thử lại.",
      );
      refreshMissionAfterConflict();
    },
  });

  const genActionPlan = useMutation({
    mutationFn: () => generateActionPlan(missionId as string, newAiSignal("action-plan")),
    onSuccess: () => {
      setWorkflowError(null);
      setPendingPlanScroll(true);
      queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
      return queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
    },
    onError: (err) => {
      if (isUserAbort(err)) return;
      setWorkflowError(
        err instanceof ApiError
          ? err.message
          : "Chưa thể lập kế hoạch cứu hộ. Vui lòng kiểm tra địa điểm ứng phó.",
      );
      refreshMissionAfterConflict();
    },
  });

  const step = useMutation({
    mutationFn: (fn: (id: string) => Promise<Mission>) => fn(missionId as string),
    onSuccess: () => {
      setWorkflowError(null);
      queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
      return queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
    },
    onError: (err) => {
      setWorkflowError(
        err instanceof ApiError ? err.message : "Chưa thể cập nhật nhiệm vụ. Vui lòng thử lại.",
      );
      refreshMissionAfterConflict();
    },
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
   * Nhiệm vụ đã được duyệt và phát hành chưa.
   *
   * Mốc này quyết định CHỖ ĐỨNG của khối tiến trình. Trước lúc duyệt, khối đó
   * mang nút "Duyệt và phát hành" nên phải nằm dưới cùng — đẩy hàng ra khỏi kho
   * là việc không lùi lại được, đặt nút lên đầu là mời bấm trước khi đọc mục
   * tiêu, phân bổ kho và cảnh báo.
   *
   * Duyệt xong thì nút đó biến mất và khối chỉ còn là BẢNG TRẠNG THÁI: việc đang
   * nằm ở kho hay ở đội cứu hộ, ai duyệt lúc mấy giờ. Đó là câu hỏi đầu tiên của
   * mọi người mở lại nhiệm vụ, nên nó lên đầu trang — không ai phải cuộn hết một
   * trang dài chỉ để biết việc đang ở đâu.
   *
   * Đọc theo `approvedAt` chứ không theo trạng thái: nhiệm vụ phát hành rồi bị
   * huỷ vẫn là nhiệm vụ đã phát hành, và người mở lại nó vẫn cần thấy trạng thái
   * trước tiên. Bản ghi cũ thiếu mốc duyệt thì lùi về xét trạng thái.
   */
  const isPublished = Boolean(
    mission && (mission.approvedAt || completedStepIndex(mission.status) >= 0),
  );

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
   * Có số liệu để admin soát lại chưa.
   *
   * Hai nguồn đều tính: AI vừa điền vào form (chưa có nhiệm vụ nào cả), hoặc
   * nhiệm vụ đã tính xong nhu cầu vật tư. Nhập tay rồi lập phương án cũng ra đúng
   * bộ số đó và cũng cần soát y như vậy — nên không đo bằng "đã bấm AI hay chưa".
   * Báo cáo thô của trưởng thôn mà chưa phân tích thì chưa có gì để soát.
   */
  const incidentAnalyzed =
    Boolean(analyzedDescription) ||
    Boolean(mission && !isReportDraft && mission.requirements.length > 0);
  /** Đang ở chế độ soát (bảng), thay vì chế độ nhập (các ô). */
  const showIncidentTable = incidentAnalyzed && !editingIncident;
  /**
   * Nút "Lập bản tham mưu" chuyển xuống dưới khối khả năng đáp ứng khi đã có khối
   * đó: thứ tự thao tác thật là soát số liệu → xem kho có đủ hàng không → mới lập
   * tham mưu. Nút nằm trên khối đáp ứng thì phải bấm trước khi đọc được thứ lẽ ra
   * phải đọc. Chưa có nhiệm vụ nào thì nó vẫn phải ở lại trong form, nếu không sẽ
   * không còn đường nào tạo nhiệm vụ đầu tiên.
   */
  const readinessVisible = Boolean(mission?.readinessAssessment);
  /**
   * Đang có một lượt lập tham mưu chạy dở — kể cả lượt do MÀN HÌNH TRƯỚC bấm.
   *
   * Bấm nút ở tab điều phối là hệ thống tạo nhiệm vụ rồi chuyển ngay sang trang
   * riêng của nó, tức component này bị dựng lại từ đầu trong khi lượt chạy vẫn
   * đang bay. Chỉ nhìn `isPending` của chính mình thì trang mới thấy "không có gì
   * đang chạy": khối chờ tắt phụt và nút hiện lại như chưa ai bấm — người dùng
   * bấm lần nữa, và lượt thứ hai đè lên lượt đầu.
   *
   * Kho mutation nằm ở tầng QueryClient nên tra theo khoá là thấy được lượt cũ.
   */
  // Gọi hook TRƯỚC rồi mới ghép điều kiện: viết `a || useIsMutating()` thì toán tử
  // || cắt ngắn, hook không chạy ở một số lượt vẽ và React đổ lỗi sai thứ tự hook.
  const coordinationRunsElsewhere = useIsMutating({ mutationKey: [COORDINATION_MUTATION_KEY] }) > 0;
  const coordinationRunning = analyzeCoordination.isPending || coordinationRunsElsewhere;
  /**
   * Còn hiện nút "Lập bản tham mưu" nữa không.
   *
   * Lập xong thì nút biến mất: việc kế tiếp của người dùng là ĐỌC bản tham mưu
   * vừa ra, không phải bấm lại. Muốn lập lại (sau khi sửa số liệu chẳng hạn) thì
   * đường đi nằm ở chính khối tham mưu bên dưới — đúng chỗ đang hiện bản cũ sắp
   * bị thay.
   */
  const showAnalyzeCta = composerVisible && !hasCoordinationAnalysis && !coordinationRunning;

  /**
   * Đã tới lượt hiện tiến trình và các nút chuyển bước chưa.
   *
   * Thứ tự việc thật là: khai tình huống → lập bản tham mưu → lập kế hoạch cứu
   * hộ → duyệt và phát hành. Bản tham mưu là thứ dựng nên nhu cầu vật tư và phần
   * phân bổ kho, nên hiện nút "Lập kế hoạch cứu hộ" trước khi có nó là mời người
   * dùng nhảy cóc qua đúng bước quyết định.
   */
  const showWorkflowPanel = hasCoordinationAnalysis || (mission?.status ?? "DRAFT") !== "DRAFT";

  /**
   * Đưa màn hình về đầu kế hoạch cứu hộ ngay sau khi lập xong.
   *
   * Lập kế hoạch xong là hai khối phía trên (khả năng đáp ứng, bản tham mưu) cùng
   * thu gọn lại, tức phần nội dung nằm TRÊN chỗ người dùng đang đứng ngắn đi mấy
   * trăm điểm ảnh trong một nhịp. Trình duyệt giữ nguyên vị trí cuộn, nên cùng một
   * vị trí đó giờ rơi vào giữa bảng điều phối kho — người vừa bấm nút thấy màn hình
   * tự nhảy tới một danh sách kho dài, không thấy kết quả mình vừa yêu cầu tính.
   *
   * Đợi kế hoạch có thật rồi mới cuộn: cuộn ngay trong `onSuccess` thì khối còn
   * chưa được dựng, `ref` vẫn rỗng và lệnh cuộn rơi vào hư không.
   */
  const actionPlanRef = useRef<HTMLDivElement>(null);
  const [pendingPlanScroll, setPendingPlanScroll] = useState(false);
  /**
   * Cuộn về khối tiến trình ngay sau khi phát hành.
   *
   * Duyệt xong là cả trang xếp lại: khối tiến trình nhảy từ dưới cùng lên đầu,
   * khối SKU theo nó lên trên. Trình duyệt giữ nguyên vị trí cuộn, nên người vừa
   * bấm nút đang đứng ở cuối trang nhìn vào một khối khác hẳn — kết quả của cú
   * bấm vừa rồi thì nằm tận trên đầu, ngoài màn hình.
   *
   * Đợi `isPublished` đổi rồi mới cuộn, không cuộn ngay trong `onSuccess`: lúc đó
   * khối chưa được dựng lại ở vị trí mới, cuộn tới là cuộn vào chỗ cũ.
   */
  const workflowRef = useRef<HTMLElement>(null);
  const [pendingPublishScroll, setPendingPublishScroll] = useState(false);
  const hasActionPlan = Boolean(mission?.actionPlan);
  useEffect(() => {
    if (!pendingPlanScroll || !hasActionPlan) return;
    const target = actionPlanRef.current;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingPlanScroll(false);
  }, [pendingPlanScroll, hasActionPlan]);

  useEffect(() => {
    if (!pendingPublishScroll || !isPublished) return;
    const target = workflowRef.current;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingPublishScroll(false);
  }, [pendingPublishScroll, isPublished]);

  /**
   * Khối "Chuẩn bị vật tư theo SKU", dựng một lần rồi đặt vào đúng một chỗ.
   *
   * Chỗ của nó là NGAY DƯỚI "Điều phối kho" trong kế hoạch cứu hộ: điều phối kho
   * nói đi kho nào và lấy những gì, khối này là chính những dòng đó chờ người bấm
   * xuất. Đứng trên đầu trang như trước thì phát hành xong người của kho phải cuộn
   * ngược lên, rời khỏi đúng đoạn vừa đọc, mới thấy việc của mình.
   *
   * Nhiệm vụ chưa có kế hoạch cứu hộ (dữ liệu cũ đã phát hành mà thiếu bản tham
   * mưu) thì không có khối điều phối kho nào để đặt xuống dưới, nên nó về lại chỗ
   * cũ — bỏ hẳn thì kho vĩnh viễn không có đường xuất hàng cho nhiệm vụ đó.
   */
  const warehouseRequestPanel = mission ? (
    <WarehouseRequestPanel
      missionId={mission.id}
      requests={mission.warehouseRequests ?? []}
      role={role}
      assignedWarehouseId={assignedWarehouseId}
      missionStatus={mission.status}
    />
  ) : null;

  /**
   * Tiến trình và các nút chuyển bước, dựng một lần rồi đặt vào đúng chỗ theo bước
   * đang đứng.
   *
   * Chỉ mở ra SAU khi có bản tham mưu. Bản tham mưu là thứ dựng nên nhu cầu vật tư
   * và phần phân bổ kho — bấm "Lập kế hoạch cứu hộ" trước đó là dựng kế hoạch trên
   * một phương án chưa ai chốt. Trước đây hai nút này hiện ngay từ lúc nhiệm vụ còn
   * trống, tức mời người dùng làm bước ba trước bước hai.
   *
   * Nhiệm vụ ĐÃ PHÁT HÀNH thì luôn hiện, kể cả khi thiếu bản tham mưu (dữ liệu cũ):
   * lúc đó kho cần nút xuất hàng và điều phối cần nút huỷ — giấu đi là khoá cứng
   * một nhiệm vụ đang chạy.
   */
  const workflowPanel = mission ? (
    /* `scroll-mt`: thanh tiêu đề trang là `sticky top-0`. Cuộn sát mép trên thì
       mép khối chui xuống dưới nó và mất luôn bước đầu của thanh tiến trình. */
    <section className="app-panel scroll-mt-24 p-5" ref={workflowRef}>
      <WorkflowStepper
        status={mission.status}
        warehouseRequests={mission.warehouseRequests}
        hasReturnableSupplies={mission.hasReturnableSupplies}
      />
      {/* Ai chốt phương án này. Một xã có nhiều quản trị viên cùng duyệt để chia
          tải, nên khi phải hỏi lại thì phải biết gọi ai — trước đây hệ thống có lưu
          id người duyệt nhưng không hiện ra đâu cả. */}
      {mission.approvedBy && (
        <p className="mt-4 border-t pt-4 text-sm text-[var(--text-muted)]">
          Duyệt và phát hành bởi{" "}
          <span className="font-semibold text-[var(--text)]">{mission.approvedBy.fullName}</span>
          {mission.approvedAt ? ` · ${formatApprovedAt(mission.approvedAt)}` : ""}
        </p>
      )}
      <div className="mt-5 border-t pt-4">
        <RoleActions
          mission={mission}
          role={role}
          assignedWarehouseId={assignedWarehouseId}
          isReportDraft={isReportDraft}
          hasIncidentPoint={missionHasIncidentPoint}
          onGenerateActionPlan={() => genActionPlan.mutate()}
          onPublish={() => {
            setPendingPublishScroll(true);
            // Phát hành hỏng thì bỏ luôn ý định cuộn: để cờ treo lại thì lần sau
            // nhiệm vụ chuyển sang đã phát hành bằng đường khác, trang tự nhảy
            // một cái không ai hiểu vì sao.
            step.mutate(approveMission, { onError: () => setPendingPublishScroll(false) });
          }}
          onPrepare={() => step.mutate(prepareMission)}
          onMarkReturned={() => step.mutate(markSuppliesReturned)}
          onCancel={(note) => step.mutate((id) => cancelMission(id, note))}
          busy={genActionPlan.isPending || step.isPending}
        />
      </div>
      {workflowError && (
        <p className="mt-3 text-sm text-[var(--color-critical)]">{workflowError}</p>
      )}
    </section>
  ) : null;

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
   * Ghim tay thì BỎ tên thôn đang chọn ở ô "Địa điểm ứng phó".
   *
   * Backend đã lấy điểm ghim làm chuẩn (`resolveIncidentLocation`: điểm ghim thắng
   * văn bản), nhưng tên thôn cũ vẫn được giữ lại làm NHÃN của nhiệm vụ. Nên chọn
   * "Long Bình" rồi ghim một chỗ cách đó vài cây số thì màn hình đọc ra "địa điểm
   * ứng phó: Long Bình" trong khi tuyến lại chạy tới đúng chỗ vừa ghim — hai câu
   * trả lời khác nhau cho cùng một câu hỏi, và người điều phối chỉ nhìn thấy câu
   * sai. Xoá tên thôn ngay lúc ghim thì nhãn nói đúng thứ hệ thống thật sự dùng.
   *
   * Bỏ ghim (bấm vào chính dấu ghim đỏ) thì KHÔNG trả tên thôn cũ lại: không có
   * chỗ nào giữ nó, và chọn lại ở ô trên chỉ mất một cú bấm.
   */
  const pickIncidentPoint = useCallback((point: LatLng | null) => {
    setIncidentPoint(point);
    if (point) setForm((prev) => (prev.location?.trim() ? { ...prev, location: "" } : prev));
  }, []);

  /**
   * Chọn thôn ở ô địa điểm thì bỏ điểm vừa ghim tay.
   *
   * Chiều ngược lại của `pickIncidentPoint`, và cần thiết vì cùng lý do: giữ cả
   * hai thì backend vẫn chạy theo điểm ghim, còn thôn vừa chọn thành ra vô nghĩa
   * mà không ai được báo. Chỉ bỏ điểm do người dùng tự ghim (`incidentPoint` đang
   * giữ một điểm thật) — điểm mượn của nhiệm vụ đang mở thì để nguyên, backend sẽ
   * tự tính lại theo thôn mới khi lưu.
   */
  const selectLocation = useCallback((name: string) => {
    setForm((prev) => ({ ...prev, location: name }));
    if (name.trim()) setIncidentPoint((prev) => (prev ? null : prev));
  }, []);

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
   * Nói thiếu cái gì, thay vì khoá nút và im lặng.
   *
   * Nút xám không nói được nó xám vì lý do gì. Người dùng vừa bấm "Phân tích bằng
   * AI" xong, thấy form đã đầy số, rồi tới nút cuối thì bấm không ăn — không có
   * cách nào đoán ra thứ còn thiếu nằm ở ô "Địa điểm ứng phó" phía trên, nhất là
   * khi lời kể không nhắc tên thôn nào nên ô đó vẫn để trống.
   *
   * Nên nút cứ bấm được; bấm lúc thiếu thì hiện đúng câu phải làm gì.
   */
  /**
   * Nút NÀO vừa bị chặn — không phải một cờ bật/tắt.
   *
   * Có hai nút cùng đòi địa điểm ("Lập bản tham mưu" và "Lưu và tính lại"), mỗi
   * nút có câu nhắc riêng đặt ngay dưới nó. Dùng chung một cờ boolean thì bấm một
   * nút làm CẢ HAI câu hiện lên — đúng cái lỗi hai dòng đỏ giống hệt nhau. Ghi lại
   * nút nào thì mỗi lượt bấm chỉ sáng đúng một chỗ.
   */
  const [locationHintFor, setLocationHintFor] = useState<"cta" | "save" | null>(null);
  /** Thiếu địa điểm nên chưa lập được — dùng chung cho cả nút lập và nút lưu. */
  const locationBlocked = isMissionEditable && !canCalculatePlan;
  // Câu nhắc phải chỉ đúng thứ đang NHÌN THẤY. Ở chế độ bảng soát, ô "Địa điểm ứng
  // phó" là một dòng chữ chứ không phải ô chọn — bảo người ta "chọn ở ô trên" thì
  // họ đi tìm một ô không có ở đó.
  //
  // Không tách nhánh cho "tên thôn lạ": ô địa điểm là danh sách chọn lấy từ chính
  // danh mục đã xác minh, còn toạ độ thì ghim đâu cũng được — nên qua giao diện
  // này không có đường nào ra được một tên ngoài danh mục.
  const locationHint = showIncidentTable
    ? "Chưa có địa điểm ứng phó. Bấm lên bản đồ bên phải để ghim chỗ đang xảy ra sự việc, hoặc bấm “Chỉnh sửa” để chọn thôn."
    : "Chưa có địa điểm ứng phó. Chọn thôn ở ô “Địa điểm ứng phó”, hoặc bấm lên bản đồ bên phải để ghim chỗ đang xảy ra sự việc.";
  /**
   * Câu nhắc tự tắt khi đã đủ điều kiện.
   *
   * Suy ra từ `canCalculatePlan` chứ không lưu thành chuỗi lỗi: lưu chuỗi thì
   * người dùng ghim xong, câu "vui lòng ghim vị trí" vẫn nằm đó đỏ chót cho tới
   * lượt bấm sau — trông như ghim rồi mà hệ thống vẫn không nhận.
   */
  const showLocationHint = locationHintFor !== null && locationBlocked;

  /**
   * Nút "Lập bản tham mưu" — dựng một lần, đặt ở một trong hai chỗ.
   *
   * Cùng một nút cho cả hai vị trí (trong form khi chưa có gì, dưới khối khả năng
   * đáp ứng khi đã có): chép ra hai bản thì mỗi lần sửa điều kiện `disabled` phải
   * nhớ sửa cả hai, và chỗ bị quên chính là chỗ cho bấm khi form đang sai.
   */
  const [confirmingReset, setConfirmingReset] = useState(false);

  /**
   * Trả khối khai báo về đúng trạng thái lúc mới vào trang lần đầu.
   *
   * Xoá cả ba nơi đang giữ dữ liệu, không chỉ các ô nhập: form (số liệu), điểm
   * ghim trên bản đồ, và bản nháp trong máy. Thiếu bất kỳ nơi nào thì "xoá" hoá
   * ra là dối: xoá ô nhập mà bỏ bản nháp thì lượt tải lại trang lôi hết về, còn
   * bỏ điểm ghim thì bản đồ vẫn cắm cờ ở chỗ vừa bảo là đã xoá.
   *
   * Ba cái ref bên dưới là các CHỐT một-lần của những hiệu ứng đổ dữ liệu vào
   * form. Không đóng chốt lại thì ngay lượt vẽ kế tiếp, hiệu ứng "form còn nguyên
   * mặc định thì đổ số liệu nhiệm vụ lên" thấy form vừa bị trả về mặc định và
   * lập tức điền lại y nguyên thứ vừa xoá.
   */
  const resetComposer = useCallback(() => {
    setForm(DEFAULT_FORM);
    setDescription("");
    setIncidentPoint(null);
    setAnalyzedDescription(null);
    setEditingIncident(false);
    setEditError(null);
    setParseError(null);
    setAnalysisError(null);
    setWorkflowError(null);
    setLocationHintFor(null);

    missionHydratedRef.current = missionId;
    draftOwnsDescriptionRef.current = true;
    seededDescribeRef.current = describeParam;

    // Bỏ lượt ghi đang chờ gộp, nếu không nó ghi lại đúng bản vừa xoá.
    pendingDraftRef.current = null;
    clearDraft(missionId);
    // Người dùng vừa nói rõ là muốn dọn: dọn luôn nháp của các nhiệm vụ khác đã
    // quá hạn, thay vì đợi tới lần mở nhiệm vụ sau.
    pruneDrafts(missionId);
  }, [missionId, describeParam]);

  const analyzeCta = (
    <>
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => setConfirmingReset(true)}
          disabled={coordinationRunning}
          title="Xoá hết số liệu đang khai và bắt đầu lại từ đầu"
          className="flex shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--color-critical)] px-4 py-2.5 font-semibold text-white transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
        >
          <ColorIcon name="delete" size={19} tone="red" />
          Đặt lại
        </button>
        <button
          type="button"
          onClick={() => {
            // Bản tham mưu lập theo form, nên thiếu địa điểm là thật sự chưa lập
            // được — chỉ khác chỗ giờ người dùng biết vì sao và phải làm gì.
            if (locationBlocked) {
              setLocationHintFor("cta");
              return;
            }
            setLocationHintFor(null);
            analyzeCoordination.mutate();
          }}
          // Chỉ khoá lúc đang chạy. Khoá vì thiếu dữ liệu là chỗ nút im lặng.
          disabled={coordinationRunning}
          title="Tính nhu cầu vật tư rồi lập bản tham mưu trong một lượt"
          className="flex flex-1 items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2.5 font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
        >
          <ColorIcon name="magic" size={19} tone="amber" />
          {coordinationRunning
            ? "Đang tính nhu cầu và lập bản tham mưu…"
            : "Lập bản tham mưu bằng AI"}
        </button>
      </div>
      {showLocationHint && locationHintFor === "cta" && (
        <p role="alert" className="mt-2 text-xs font-medium text-[var(--color-critical)]">
          {locationHint}
        </p>
      )}
      {analysisError && (
        <p role="alert" className="mt-2 text-xs text-[var(--color-critical)]">
          {analysisError}
        </p>
      )}
    </>
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
    const draft = {
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
    };
    // Gộp lượt ghi: lời kể là ô văn bản dài, gõ thẳng xuống localStorage theo từng
    // phím là hàng nghìn lượt JSON.stringify + ghi ĐỒNG BỘ trên luồng giao diện
    // cho một bản nháp mà chỉ lần cuối cùng có ý nghĩa. Nửa giây im tay mới ghi.
    pendingDraftRef.current = { missionId, draft };
    const timer = setTimeout(() => {
      writeDraft(missionId, draft);
      pendingDraftRef.current = null;
    }, 500);
    return () => clearTimeout(timer);
  }, [
    composerVisible,
    hydratedFor,
    missionId,
    description,
    form,
    formIncidentPoint,
    analyzedDescription,
  ]);

  /**
   * Ghi nốt phần chưa kịp gộp khi rời khối khai báo.
   *
   * Gộp lượt ghi mà không có chỗ này là tự tay phá đúng thứ bản nháp sinh ra để
   * cứu: gõ xong câu cuối rồi chuyển tab ngay trong nửa giây thì hẹn giờ bị dọn
   * cùng component và câu đó không bao giờ xuống tới bộ nhớ.
   */
  useEffect(
    () => () => {
      const pending = pendingDraftRef.current;
      if (pending) writeDraft(pending.missionId, pending.draft);
      pendingDraftRef.current = null;
    },
    [],
  );

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={confirmingReset}
        title="Xoá toàn bộ nội dung đang khai?"
        message="Lời kể, số liệu và điểm ghim trên bản đồ sẽ bị xoá, khối khai báo trở về như lúc mới vào trang. Không khôi phục lại được."
        confirmLabel="Xoá và bắt đầu lại"
        onCancel={() => setConfirmingReset(false)}
        onConfirm={() => {
          setConfirmingReset(false);
          resetComposer();
        }}
      />
      {/* Các bước liệt kê là việc hệ thống THẬT SỰ chạy cho từng nút, không phải
          chữ trang trí cho có vẻ bận rộn. */}
      <AiProgressDialog
        open={analyze.isPending}
        onCancel={() => cancelAi("parse")}
        title="Phân tích lời kể thành số liệu"
        estimate="7 giây"
        steps={[
          "Bóc tách loại tình huống, số người và nhóm dễ tổn thương từ lời kể",
          "Đối chiếu từng con số ngược lại với chính câu vừa nhập",
          "Đối chiếu địa điểm với danh mục thôn đã xác minh",
          "Điền vào form để cán bộ soát lại trước khi chốt",
        ]}
      />
      <AiProgressDialog
        open={coordinationRunning || replanningAfterEdit}
        onCancel={() => cancelAi("coordination")}
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
        onCancel={() => cancelAi("action-plan")}
        title="Lập kế hoạch cứu hộ"
        estimate="40 giây"
        steps={[
          "Đánh giá tình huống và dự báo bằng công thức của hệ thống",
          "Đưa ra phương án để cấp phát vật tư",
          "Điều phối kho và tính quãng đường",
          "Kiểm lại: chặn mọi con số không có trong dữ liệu đã tính",
        ]}
      />

      {/* Số hiệu, trạng thái và lối quay lại nay là TIÊU ĐỀ của trang, dựng ở
          `missions/[slug]/page.tsx`. Để chúng ở đây thì trang có hai tầng tiêu
          đề chồng nhau: chữ "Nhiệm vụ" to đùng của menu ở trên, rồi mới tới số
          hiệu — mà phần chữ to nhất màn hình lại là phần không nói gì. */}

      {/* Trang chi tiết chỉ mở lại form khi nhiệm vụ còn là nháp — lúc đó sửa số
          liệu rồi tính lại là việc hợp lệ. Đã phát hành thì form không còn chỗ ở
          đây nữa; muốn khai vụ mới thì quay về tab điều phối. */}
      {composerVisible && (
        <section className="app-panel p-5 pt-0">
          {/* Hai cột: nhập bên trái, bản đồ bên phải. Chọn điểm và điền số liệu là
              một việc liền mạch — tách hai khối bắt người dùng cuộn qua lại.

              Nhưng liền mạch không có nghĩa là để chúng chảy vào nhau. Trước đây
              hai cột chỉ cách nhau đúng một khoảng trống, mà cột phải có tiêu đề
              còn cột trái lao thẳng vào ô nhập — mắt không tìm ra đâu là ranh giới,
              nhìn thành một mảng dày đặc. Nay mỗi bên có tiêu đề cùng cấp và giữa
              hai bên là một đường kẻ thật: vẫn một khối báo cáo, nhưng đọc được
              ngay là nó gồm hai phần việc.

              Đường kẻ đổi chiều theo cách xếp: dọc khi hai cột nằm cạnh nhau, ngang
              khi màn hình hẹp và chúng chồng lên nhau. */}
          <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:gap-0">
            <div className="min-w-0 lg:pr-7">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ColorIcon name="users" size={17} tone="blue" />
                Quy mô ảnh hưởng
              </h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Kể bằng lời để AI đọc thành số liệu, hoặc bấm thẳng vào bảng bên dưới để sửa.
              </p>
              <DescribeIncidentBlock
                value={description}
                onChange={setDescription}
                missionId={mission?.id ?? null}
                reportAudio={isReportDraft ? (mission?.reportAudio ?? null) : null}
                onAnalyze={() => analyze.mutate()}
                analyzing={analyze.isPending}
                error={parseError}
                analyzedValue={analyzedDescription}
                planLocked={Boolean(mission?.actionPlan)}
              />

              {showIncidentTable ? (
                <IncidentSummaryTable
                  form={form}
                  typeLabel={
                    INCIDENT_TYPES.find((t) => t.value === form.incidentType)?.label ??
                    form.incidentType
                  }
                  pinned={Boolean(formIncidentPoint)}
                  hasActionPlan={Boolean(mission?.actionPlan)}
                  onEdit={() => setEditingIncident(true)}
                />
              ) : (
                <div className="mt-4 space-y-3">
                  <IncidentFormTable
                    form={form}
                    onChange={setForm}
                    onSelectLocation={selectLocation}
                    hamletOptions={hamletOptions}
                    locationInvalid={locationInvalid}
                    pinned={Boolean(formIncidentPoint)}
                  />
                  {locationInvalid && (
                    <p role="alert" className="text-xs text-[var(--color-critical)]">
                      Vui lòng chọn thôn hợp lệ. Báo cáo ghi “{form.location}” nhưng tên này không
                      có trong danh mục thôn đã xác minh của xã.
                    </p>
                  )}
                  {hamletListQuery.isPending && (
                    <p className="text-xs text-[var(--text-muted)]">Đang tải danh mục thôn…</p>
                  )}

                  {/* Nói rõ HAI ô này không cộng vào nhau mà thay cho nhau: cái nào
                  vừa chọn sau thì cái đó là địa điểm ứng phó. */}
                  <p className="text-xs text-[var(--text-muted)]">
                    {form.location?.trim()
                      ? "Đang dùng tên thôn ở trên. Ghim tay trên bản đồ sẽ thay bằng đúng điểm vừa ghim."
                      : formIncidentPoint
                        ? "Đang dùng điểm đã ghim. Bấm vào chính dấu ghim đỏ để bỏ, hoặc kéo nó sang chỗ khác."
                        : "Chọn thôn ở ô trên, hoặc bấm lên bản đồ bên phải để ghim đúng chỗ đang xảy ra sự việc."}
                  </p>
                  {/* Hàng nút của chế độ sửa. Nội dung khác nhau tuỳ đã có nhiệm
                    vụ hay chưa — xem chú thích bên trong. */}
                  {editingIncident && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {/* Chưa có nhiệm vụ nào (vừa phân tích xong ở tab điều phối)
                          thì không có gì để ghi xuống: số liệu còn nằm hoàn toàn
                          trên form, và nơi chốt nó là nút "Lập bản tham mưu". Vẫn
                          hiện nút lưu ở đây thì nó gọi API với id rỗng. */}
                      {missionId ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              if (locationBlocked) {
                                setLocationHintFor("save");
                                return;
                              }
                              setLocationHintFor(null);
                              updateIncident.mutate();
                            }}
                            disabled={updateIncident.isPending}
                            title={
                              hasCoordinationAnalysis
                                ? "Ghi số liệu vừa sửa, tính lại khả năng đáp ứng và lập lại bản tham mưu theo số mới"
                                : "Ghi số liệu vừa sửa xuống nhiệm vụ và tính lại khả năng đáp ứng"
                            }
                            className="flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
                          >
                            <ColorIcon name="save" size={17} tone="green" />
                            {replanningAfterEdit
                              ? "Đang lập lại bản tham mưu…"
                              : updateIncident.isPending
                                ? "Đang tính lại…"
                                : "Lưu và tính lại"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // Trả form về đúng số của nhiệm vụ: bỏ dở giữa chừng mà
                              // giữ lại phần gõ nham nhở thì lần bấm "Lập bản tham mưu"
                              // sau sẽ âm thầm ghi nó xuống nhiệm vụ.
                              if (mission) setForm(formFromMission(mission));
                              setEditingIncident(false);
                            }}
                            disabled={updateIncident.isPending}
                            className="rounded-md border px-4 py-2 text-sm font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px disabled:opacity-60"
                          >
                            Huỷ
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingIncident(false)}
                          title="Quay lại bảng soát. Số liệu vừa sửa được giữ nguyên trên form."
                          className="rounded-md border px-4 py-2 text-sm font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px"
                        >
                          Xong
                        </button>
                      )}
                    </div>
                  )}
                  {editingIncident && showLocationHint && locationHintFor === "save" && (
                    <p role="alert" className="text-xs font-medium text-[var(--color-critical)]">
                      {locationHint}
                    </p>
                  )}
                  {editingIncident && editError && (
                    <p role="alert" className="text-xs text-[var(--color-critical)]">
                      {editError}
                    </p>
                  )}
                </div>
              )}

              {showAnalyzeCta && !readinessVisible && <div className="mt-4">{analyzeCta}</div>}
            </div>

            <div className="min-w-0 border-t pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ColorIcon name="location" size={17} tone="red" />
                Vị trí các kho và điểm gặp nạn
              </h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {!isMissionEditable
                  ? "Nhiệm vụ đang mở đã phát hành. Bấm lên bản đồ để ghim một sự việc MỚI — nhiệm vụ cũ không bị ảnh hưởng."
                  : mission
                    ? missionHasIncidentPoint
                      ? "Vị trí đã được ghi nhận trong phương án. Kéo dấu ghim đỏ để dời, bấm vào nó để bỏ."
                      : "Nhiệm vụ chưa có điểm ứng phó. Hãy nhập thôn đã xác minh và tính lại phương án."
                    : "Bấm lên bản đồ để ghim chỗ đang gặp nạn; bấm vào dấu ghim đỏ để bỏ, kéo để dời."}
              </p>
              <div className="mt-3">
                {/* Bản đồ này làm cả hai việc: chưa có phương án thì chọn điểm, có
                  rồi thì xem tuyến. Bày hai bản đồ chỉ tổ rối.

                  Tuyến của nhiệm vụ ĐÃ PHÁT HÀNH thì không vẽ ở đây: lúc đó khối
                  này là form khai sự việc mới, để nguyên tuyến cũ thì người dùng
                  tưởng mình đang sửa vụ cũ. Tuyến đó vẫn xem được ở khối kế hoạch
                  bên dưới. */}
                <IncidentMap
                  // Tuyến ưu tiên lấy từ bản tham mưu nếu đã lập; chưa lập thì lấy
                  // từ endpoint chỉ-đọc, để vẽ được đường ngay sau khi tính nhu cầu.
                  // Cả hai nguồn đều CHỈ chứa kho có cấp hàng (backend lọc theo
                  // `requirements.allocations`), nên không có đường của kho không góp gì.
                  warehouses={
                    isMissionEditable
                      ? (mission?.actionPlan?.warehouses ?? routesQuery.data ?? [])
                      : []
                  }
                  baseWarehouses={warehouseListQuery.data ?? []}
                  incidentPoint={formIncidentPoint}
                  onPickIncident={canEditIncidentPoint ? pickIncidentPoint : undefined}
                  keepIncidentFocus
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {!isDetailPage && variant === "danh-sach" && (
        <MissionInbox
          selectedMissionId={missionId}
          role={role}
          warehouseId={assignedWarehouseId}
          onSelect={openMissionByNo}
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
              {/* ĐÃ PHÁT HÀNH thì khối tiến trình lên đầu trang, ngay dưới nút trở
                  lại: lúc này nó trả lời "việc đang nằm ở đâu", câu hỏi đầu tiên
                  của mọi người mở lại nhiệm vụ. Chưa phát hành thì nó vẫn nằm
                  dưới, vì khi đó nó mang nút duyệt — xem `isPublished`. */}
              {showWorkflowPanel && isPublished ? workflowPanel : null}
              {/* Phát hành xong thì khối SKU bám ngay dưới thanh tiến trình.
                  Thanh đó nói "đang chờ kho xuất hàng"; khối này là chính những
                  dòng phải xuất. Để nó nằm sâu trong kế hoạch cứu hộ như lúc chưa
                  phát hành thì người của kho mở nhiệm vụ ra phải cuộn qua khả năng
                  đáp ứng, tham mưu, đánh giá, phương án cấp phát — bốn khối họ
                  không cần đọc — mới tới việc của mình. */}
              {isPublished ? warehouseRequestPanel : null}

              {/* Nút lập bản tham mưu đứng NGAY TRÊN chính khối tham mưu — đó là
                  thứ nó sinh ra.

                  `readinessVisible` là chốt LOẠI TRỪ với bản nút nằm trong khối
                  khai tình huống (`showAnalyzeCta && !readinessVisible` ở trên):
                  đúng một trong hai được hiện. Thiếu chốt này thì nhiệm vụ chưa
                  có đánh giá khả năng đáp ứng — tức mọi báo cáo vừa nhận từ trưởng
                  thôn — hiện HAI cặp "Đặt lại / Lập bản tham mưu" chồng nhau, và
                  người trực không biết cặp nào là thật. */}
              {showAnalyzeCta && readinessVisible && (
                <section className="app-panel p-5">{analyzeCta}</section>
              )}
              {/* Bằng chứng hiện trường nằm bên trong khối tham mưu: nó chính là
                  nguồn làm bản tham mưu đổi, tách ra thì phải cuộn qua lại giữa
                  hai khối mới đối chiếu được. */}
              {isAdmin && (
                <CoordinationAnalysisPanel
                  /* Có KẾ HOẠCH CỨU HỘ rồi thì khối này THU GỌN LẠI.
                     Bảng nhu cầu, danh sách kho và quãng đường trong bản tham mưu
                     chính là bộ số mà kế hoạch cứu hộ bên dưới kể lại; để cả hai mở
                     cùng lúc thì người trực đọc hai lần một thứ, và khi hai bên hiện
                     khác nhau một chút họ không biết tin bên nào.

                     Mốc đóng là lúc có kế hoạch, KHÔNG phải lúc có bản tham mưu.
                     Vừa lập tham mưu xong là lúc người trực cần đọc chính nó — đó là
                     kết quả của cú bấm vừa rồi, và chưa có kế hoạch nào để mà trùng.
                     Đóng ngay lúc đó là giấu đi đúng thứ họ vừa yêu cầu tính.

                     `defaultOpen` chỉ được đọc lúc khối được dựng, nên phải đổi cả
                     `key` theo: không có nó, lập kế hoạch xong khối vẫn nằm mở cho
                     tới khi tải lại trang.

                     Đọc cờ từ `mission` chứ không từ một truy vấn riêng: `mission` đã
                     có sẵn trước khi khối này được dựng, nên không có cảnh khối bật
                     mở rồi tự đóng lại ngay trước mắt người dùng lúc mở trang. */
                  /* Tiền tố `tham-muu-` để KHÔNG trùng key với khối khả năng đáp
                     ứng ngay bên dưới. Hai khối là anh em ruột trong cùng một
                     fragment và cùng đổi key theo `mission.actionPlan`; trùng key
                     giữa hai anh em thì React nhân bản hoặc bỏ sót phần tử — đúng
                     lỗi đã gặp: bấm lập bản tham mưu xong khối này hiện ra bốn năm
                     lần chồng lên nhau. */
                  key={mission.actionPlan ? "tham-muu-da-co-ke-hoach" : "tham-muu-chua-co-ke-hoach"}
                  defaultOpen={!mission.actionPlan}
                  missionId={mission.id}
                  fieldUpdateId={fieldUpdateId}
                  // Lập XONG rồi thì không truyền nữa — nút biến mất vĩnh viễn.
                  // Sửa số liệu thì bản tham mưu tự lập lại theo (xem
                  // `updateIncident`), nên một nút mời bấm lại đúng việc hệ thống
                  // vừa tự làm chỉ tổ tốn thêm một lượt gọi LLM.
                  //
                  // Chỉ còn giữ đúng một ca: nhiệm vụ ĐÃ PHÁT HÀNH mà chưa hề có
                  // bản tham mưu. Lúc đó khối khai tình huống đã ẩn nên đây là
                  // đường duy nhất, bỏ nốt thì nhiệm vụ đó vĩnh viễn không lập
                  // được bản nào.
                  onRun={
                    hasCoordinationAnalysis || showAnalyzeCta
                      ? undefined
                      : () => analyzeCoordination.mutate()
                  }
                  running={coordinationRunning}
                  requirements={mission.requirements}
                  /* Sửa vật tư là sửa LỆNH cho kho. Đã duyệt và phát hành thì
                     các kho đang xuất hàng theo đúng con số này, nên chỉ mở khi
                     nhiệm vụ còn nháp. Máy chủ chặn lần nữa — ở đây chỉ là không
                     bày ra nút cho một việc chắc chắn bị từ chối. */
                  requirementsEditable={isAdmin && !isPublished && mission.status === "DRAFT"}
                  missionNo={mission.missionNo}
                />
              )}
              {mission.readinessAssessment && (
                /* Cùng mốc với khối tham mưu: có kế hoạch cứu hộ rồi thì thu gọn
                   lại. Mức đáp ứng và danh sách vật tư thiếu ở đây được kế hoạch
                   cứu hộ bên dưới kể lại một lần nữa.

                   ĐỨNG SAU khối tham mưu, không phải trước. Khối tham mưu là nơi
                   ADMIN chốt CẦN những gì và bao nhiêu; khối này trả lời kho có
                   đáp ứng nổi từng ấy không. Đảo lại là bắt đọc câu trả lời trước
                   khi biết câu hỏi — và tệ hơn, sau mỗi lần sửa vật tư ở trên,
                   con số ở đây đổi theo mà người sửa phải cuộn ngược lên mới thấy.

                   `defaultOpen` chỉ đọc một lần lúc dựng, nên `key` phải đổi theo
                   thì khối mới tự đóng ngay sau khi lập kế hoạch. */
                <MissionReadinessPanel
                  /* Tiền tố `dap-ung-` — xem chú thích ở khối tham mưu bên trên. */
                  key={mission.actionPlan ? "dap-ung-da-co-ke-hoach" : "dap-ung-chua-co-ke-hoach"}
                  assessment={mission.readinessAssessment}
                  defaultOpen={!mission.actionPlan}
                />
              )}
              {/* Không có kế hoạch cứu hộ thì khối SKU không có chỗ để gá vào. */}
              {!isPublished && !mission.actionPlan && warehouseRequestPanel}
              {showWorkflowPanel && !isPublished && !mission.actionPlan ? workflowPanel : null}

              {mission.actionPlan ? (
                /* `scroll-mt`: thanh tiêu đề trang là `sticky top-0`, cuộn sát mép
                   trên thì mép khối chui xuống dưới nó và dòng "Đánh giá tình huống"
                   bị che mất. Chừa sẵn một khoảng cao hơn thanh đó. */
                <div ref={actionPlanRef} className="scroll-mt-24">
                  <ActionPlanView
                    plan={mission.actionPlan}
                    incidentPoint={missionPoint}
                    status={mission.status}
                    // Đã phát hành thì khối này đã lên đầu trang; gá thêm ở đây
                    // là cùng một danh sách hiện hai chỗ trên một trang.
                    warehouseSlot={isPublished ? null : warehouseRequestPanel}
                  />
                </div>
              ) : showWorkflowPanel ? (
                <div className="rounded-md border border-dashed bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
                  Chọn <b>Lập kế hoạch cứu hộ</b> để tạo các bước thực hiện chi tiết.
                </div>
              ) : (
                /* Chưa có tham mưu thì câu nhắc phải chỉ đúng việc kế tiếp. Giữ
                   nguyên câu "Chọn Lập kế hoạch cứu hộ" ở đây là chỉ vào một nút
                   vừa bị ẩn, và người dùng đi tìm một thứ không tồn tại. */
                <div className="rounded-md border border-dashed bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
                  Lập <b>bản tham mưu</b> trước; tiến trình và các bước tiếp theo sẽ mở ra sau đó.
                </div>
              )}

              {/* Có kế hoạch cứu hộ rồi thì nút duyệt xuống DƯỚI CÙNG, sau toàn bộ
                  phần phải đọc. Đặt trên đầu là mời bấm duyệt trước khi đọc mục
                  tiêu, phân bổ kho và cảnh báo — mà duyệt và phát hành là bước
                  đẩy hàng ra khỏi kho, không lùi lại được.

                  Chưa có kế hoạch thì khối này vẫn nằm nguyên chỗ cũ, phía trên:
                  lúc đó nó mang nút "Lập kế hoạch cứu hộ", tức là việc phải làm
                  TRƯỚC chứ không phải việc chốt lại sau khi đọc. */}
              {showWorkflowPanel && !isPublished && mission.actionPlan ? workflowPanel : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Mốc duyệt: ngày giờ đủ để đối chiếu với nhật ký, không cần giây. */
function formatApprovedAt(value: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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
  onMarkReturned,
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
  onMarkReturned: () => void;
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
  /**
   * Kho này bấm được nút "đã hoàn trả" chưa.
   *
   * Điều kiện là nhiệm vụ ĐÃ GIAO XONG (COMPLETED) và người đang xem là kho. Không
   * đòi kho đó phải có phiếu riêng: hàng thừa thường dồn về một chỗ chứ không chia
   * lại đúng như lúc xuất, nên bắt từng kho ký riêng là treo nhiệm vụ ở kho không
   * có gì để nhận về. Máy chủ vẫn chốt lại là kho đó có tham gia nhiệm vụ.
   */
  const warehouseCanConfirmReturn = role === "WAREHOUSE" && mission.status === "COMPLETED";
  /**
   * Nhiệm vụ không có vật tư tái sử dụng nào đang nằm ngoài kho.
   *
   * Chỉ tin khi máy chủ khẳng định `false`; để trống là CHƯA BIẾT, và lúc chưa
   * biết thì phải hỏi như cũ chứ không được tuyên bố là không cần trả.
   */
  const nothingToReturn = mission.hasReturnableSupplies === false;
  const isWarehouse = role === "WAREHOUSE";
  const isReturned = mission.status === "RETURNED";
  /**
   * Những thứ đội đã thật sự ký nhận mang đi.
   *
   * Liệt kê ra cạnh câu "không cần hoàn trả" để người trực đối chiếu được: kết
   * luận này đúng hay sai là nhìn vào danh sách mà biết, chứ không phải tin lời
   * hệ thống. Chỉ dòng ĐÃ ký nhận — phần còn nằm trên kệ không liên quan.
   */
  const handedOverItems = (mission.warehouseRequests ?? []).filter(
    (request) => (request.pickedUpQuantity ?? 0) > 0,
  );
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
        <DeliveryResultBanner
          missionId={mission.id}
          outcome={mission.deliveryOutcome}
          note={mission.deliveryNote}
          photos={mission.deliveryPhotos}
          completedAt={mission.completedAt}
        />
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

        {/* BƯỚC CUỐI, và chỉ KHO bấm được: hàng tái sử dụng phải quay về kho mới
            khép sổ được, mà người đếm lại nó khi về tới nơi mới ký được. Điều phối
            thấy nút này thì họ ký hộ, và chữ ký đó rỗng. */}
        {warehouseCanConfirmReturn && !nothingToReturn && (
          <button
            className={actionBtn}
            style={primaryStyle}
            onClick={onMarkReturned}
            disabled={busy}
          >
            Xác nhận đã hoàn trả vật tư
          </button>
        )}

        {/* KHÔNG có gì để thu hồi: không bày nút nào cả.

            Một nút "xác nhận đã hoàn trả" ở đây là cái bẫy — kho bấm cho xong việc
            và nhiệm vụ ghi vào sổ một lượt thu hồi chưa từng xảy ra. Thay bằng câu
            trả lời dứt điểm, kèm ĐÚNG những thứ đã cấp đi, để người trực tự đối
            chiếu chứ không phải tin lời máy. */}
        {isWarehouse && nothingToReturn && (mission.status === "COMPLETED" || isReturned) && (
          <div className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
            <p className="text-sm font-medium">Không cần hoàn trả vật tư</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Nhiệm vụ này không có vật tư tái sử dụng nào. Toàn bộ phần đã cấp là đồ tiêu hao, phát
              cho dân là xong — kho không phải nhận lại gì.
            </p>
            {handedOverItems.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-sm text-[var(--text-muted)]">
                {handedOverItems.map((item) => (
                  <li key={item.id}>
                    • {item.itemName}: {item.pickedUpQuantity} {item.unit}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {isReturned && !nothingToReturn && (
          <p className="text-sm text-[var(--color-ready)]">
            Kho đã nhận lại vật tư — nhiệm vụ khép lại.
          </p>
        )}

        {isAdmin && mission.status === "COMPLETED" && (
          <p className="text-sm text-[var(--text-muted)]">
            {nothingToReturn
              ? "Không cần trả vật tư — nhiệm vụ không có gì để thu hồi."
              : "Đang chờ kho đếm lại và xác nhận đã hoàn trả vật tư."}
          </p>
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

/**
 * Báo cáo kết quả do lực lượng hiện trường gửi về — bước cuối, và là thứ đóng
 * nhiệm vụ lại.
 *
 * Đây là toàn bộ những gì người ở nhà biết về chuyến đi đó: kết quả, lời kể, ảnh
 * chụp tại chỗ và thời điểm báo. Nên nó phải đọc được như một BÁO CÁO, không phải
 * một dòng trạng thái — người trực mở nhiệm vụ đã đóng ra là để đối chiếu lại xem
 * hàng có thật sự tới nơi hay không.
 *
 * Lời kể có thể trống: người vừa lội nước về không phải lúc nào cũng còn gì để
 * kể thêm. Trống thì nói thẳng là trống, đừng để một khoảng lặng khiến người đọc
 * tưởng dữ liệu bị mất.
 */
function DeliveryResultBanner({
  missionId,
  outcome,
  note,
  photos,
  completedAt,
}: {
  missionId: string;
  outcome: DeliveryOutcome;
  note?: string | null;
  photos?: MissionDeliveryPhoto[];
  completedAt?: string | null;
}) {
  const meta = OUTCOME_META[outcome];
  return (
    <div className="rounded-md border p-4" style={{ borderColor: meta.tone }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ColorIcon name="success" size={18} tone="green" />
          <p className="text-sm font-semibold">
            Báo cáo kết quả từ {FIELD_FORCE_ROLE_LABEL.toLowerCase()}
          </p>
        </div>
        <span
          className="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
          style={{ borderColor: meta.tone, color: meta.tone }}
        >
          {meta.label}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">
        {note?.trim() ? (
          note
        ) : (
          <span className="text-[var(--text-muted)]">
            Không ghi chú kèm theo — chỉ xác nhận đã hoàn thành.
          </span>
        )}
      </p>
      <DeliveryEvidence missionId={missionId} photos={photos ?? []} />
      <p className="mt-3 border-t pt-2 text-xs text-[var(--text-muted)]">
        Nhiệm vụ đã đóng
        {completedAt ? ` lúc ${formatApprovedAt(completedAt)}` : ""}.
      </p>
    </div>
  );
}

/**
 * Ảnh bằng chứng người đi giao chụp tại điểm nạn.
 *
 * Tải bằng fetch có kèm token rồi mới gắn vào `<img>`: đường ảnh đòi quyền xem
 * nhiệm vụ, mà thẻ `<img>` thì không gửi được header nào. Địa chỉ blob thu hồi
 * lúc gỡ khỏi màn hình, nếu không mỗi lần mở nhiệm vụ lại giữ thêm một bản ảnh
 * trong bộ nhớ trình duyệt cho tới khi tải lại trang.
 */
function DeliveryEvidence({
  missionId,
  photos,
}: {
  missionId: string;
  photos: MissionDeliveryPhoto[];
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (photos.length === 0) return;
    let alive = true;
    const created: string[] = [];
    void Promise.all(
      photos.map(async (photo) => {
        const url = await fetchMissionDeliveryPhoto(missionId, photo.id);
        created.push(url);
        return [photo.id, url] as const;
      }),
    )
      .then((pairs) => {
        if (alive) setUrls(Object.fromEntries(pairs));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [missionId, photos]);

  if (photos.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-[var(--text-muted)]">
        {photos.length} ảnh bằng chứng từ hiện trường
      </p>
      {failed ? (
        <p className="mt-1 text-xs text-[var(--color-critical)]">
          Không tải được ảnh bằng chứng. Tải lại trang để thử lại.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((photo) =>
            urls[photo.id] ? (
              // Mở ảnh gốc ở tab mới: ảnh chụp vội ngoài hiện trường thường phải
              // phóng to mới đọc được chữ trên thùng hàng.
              <a key={photo.id} href={urls[photo.id]} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urls[photo.id]}
                  alt="Ảnh bằng chứng giao hàng tại hiện trường"
                  className="h-20 w-20 rounded-md border object-cover"
                />
              </a>
            ) : (
              <div
                key={photo.id}
                className="h-20 w-20 animate-pulse rounded-md bg-[var(--surface-2)]"
              />
            ),
          )}
        </div>
      )}
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
 * Nghe lại lời kể của người báo, ngay trong khối báo cáo.
 *
 * Vì sao cần dù đã có chữ ở trên: chữ kia do máy nhận dạng, và nó sai đúng vào
 * những chỗ đắt nhất — tên thôn, số người. Người điều phối đọc chữ thì không có
 * cách nào biết chỗ nào sai; nghe giọng người báo thì biết ngay, rồi tự điền.
 *
 * Tải theo YÊU CẦU chứ không tải sẵn: một phút ghi âm là gần hai megabyte, mà
 * phần lớn lượt mở nhiệm vụ chỉ để liếc trạng thái. Bấm nghe mới tải.
 */
function ReportAudioPlayer({
  audio,
  missionId,
}: {
  audio: MissionReportAudio | null;
  missionId: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Thu hồi địa chỉ blob khi rời màn hình: trình duyệt giữ nguyên vùng nhớ của
  // file cho tới khi được bảo là không cần nữa.
  useEffect(
    () => () => {
      if (src) URL.revokeObjectURL(src);
    },
    [src],
  );

  if (!audio) return null;

  const seconds = audio.durationMs ? Math.max(1, Math.round(audio.durationMs / 1000)) : null;

  return (
    <div className="mt-3 rounded-md border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ColorIcon name="microphone" size={18} tone="blue" />
        <span className="text-sm font-medium">Ghi âm của người báo</span>
        {seconds ? (
          <span className="tabular text-xs text-[var(--text-muted)]">{seconds} giây</span>
        ) : null}
        {!src ? (
          <button
            className="rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--surface-2)] disabled:opacity-60"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                setSrc(await fetchMissionReportAudio(missionId));
              } catch {
                setError("Chưa tải được bản ghi âm. Kết nối có thể đang gián đoạn.");
              } finally {
                setLoading(false);
              }
            }}
            type="button"
          >
            {loading ? "Đang tải…" : "Mở ghi âm"}
          </button>
        ) : null}
      </div>

      {/* Trình phát của chính trình duyệt: tua, chỉnh âm lượng, tăng tốc độ đọc
          đều có sẵn và người dùng đã quen — dựng lại bằng tay chỉ ra một bản
          nghèo hơn. */}
      {src ? <audio className="mt-2 w-full" controls src={src} /> : null}
      {error ? <p className="mt-2 text-xs text-[var(--color-critical)]">{error}</p> : null}
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Người báo gửi kèm file gốc. Nghe rồi gõ thẳng vào ô mô tả ngay trên, sau đó bấm “Phân tích
        bằng AI”.
      </p>
    </div>
  );
}

/**
 * Nhập tình huống bằng lời → AI phân tích và lập phương án cứu hộ ngay. Nút mic ghi âm
 * rồi PhoWhisper local nhận dạng (offline, giọng Việt). Không hỗ trợ mic → ẩn nút, gõ tay vẫn chạy.
 */
function DescribeIncidentBlock({
  value,
  onChange,
  missionId,
  reportAudio,
  onAnalyze,
  analyzing,
  error,
  analyzedValue,
  planLocked = false,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Nhiệm vụ đang mở — cần để tải bản ghi âm. Null khi đang khai vụ mới. */
  missionId: string | null;
  /** Ghi âm người báo gửi kèm; null thì phần nghe lại biến mất hẳn. */
  reportAudio: MissionReportAudio | null;
  onAnalyze: () => void;
  analyzing: boolean;
  error: string | null;
  /** Lời kể đã phân tích rồi; trùng với ô hiện tại thì khoá nút. */
  analyzedValue: string | null;
  /**
   * Nhiệm vụ đã có kế hoạch cứu hộ — khoá nút phân tích VĨNH VIỄN.
   *
   * Phân tích bằng AI GHI ĐÈ toàn bộ phần số liệu trong form. Khi đã có kế hoạch
   * cứu hộ thì nhu cầu vật tư, phần phân bổ kho và tuyến đường đều đã dựng trên bộ
   * số hiện tại; để nút mở là mời người trực thay bộ số đó bằng một bộ mới do máy
   * đọc lại từ lời kể, trong khi kế hoạch bên dưới vẫn kể theo bộ cũ. Hai bên nói
   * khác nhau mà không có gì trên màn hình nói rằng chúng đã lệch.
   *
   * Khác `analyzedValue`: cái kia chỉ khoá đúng lời kể vừa phân tích, sửa một chữ
   * là mở lại. Cái này khoá hẳn, vì thứ cần bảo vệ không phải lời kể mà là kế hoạch
   * đã lập.
   */
  planLocked?: boolean;
}) {
  // Ghi thêm vào cuối phần đã có (nối tiếp nhiều lần nói), gọn ghẽ khoảng trắng.
  const { supported, status, voiceError, toggle } = useAudioRecorder((text) =>
    onChange([value.trim(), text.trim()].filter(Boolean).join(" ")),
  );
  const recording = status === "recording";
  const transcribing = status === "transcribing";
  // Phân tích lại đúng lời kể cũ cho ra đúng kết quả cũ, nhưng lại ghi đè phần số
  // liệu cán bộ vừa sửa tay. Sửa một chữ trong ô là nút mở lại ngay.
  const analyzedAlready = analyzedValue !== null && analyzedValue === value.trim();

  return (
    // mt-3 để mép trên của khối này ngang đúng mép trên của bản đồ bên phải: hai
    // cột bắt đầu lệch nhau vài pixel là thứ trông "sai" mà không chỉ ra được sai ở đâu.
    <div className="mt-3 rounded-md border border-dashed bg-[var(--surface-2)] p-3">
      <div className="flex items-center gap-2">
        <ColorIcon name="magic" size={16} tone="amber" />
        <span className="text-xs font-semibold">
          Mô tả tình huống bằng lời — AI đọc thành số liệu, điền vào form
        </span>
      </div>
      {/* Ô mô tả rộng rãi: người kể tình huống thật thường viết vài câu, ô ba dòng
          bắt họ cuộn ngay trong lúc đang gấp. Không chừa lề phải nữa vì nút mic đã
          xuống hàng nút bên dưới. */}
      <div className="mt-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder='Vd: "Lũ quét xã Đồng Xuân, khoảng 200 người mắc kẹt, nhiều trẻ em, 3 ngày chưa có nước sạch"'
          className="w-full resize-y rounded-md border bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed"
        />
      </div>
      {/* Ghi âm nằm NGAY DƯỚI ô nhập, không phải trong một khối riêng ở cuối
          trang: người điều phối nghe một câu rồi gõ một câu vào đúng ô ngay trên
          đầu. Trước đây hai thứ này cách nhau cả màn hình cuộn, nên nghe xong
          phải cuộn ngược lên mới điền được. */}
      {missionId && reportAudio ? (
        <ReportAudioPlayer audio={reportAudio} missionId={missionId} />
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAnalyze}
          disabled={planLocked || analyzing || value.trim().length < 5 || analyzedAlready}
          title={
            planLocked
              ? "Nhiệm vụ đã có kế hoạch cứu hộ. Phân tích lại sẽ ghi đè số liệu mà kế hoạch đang dựa vào — sửa thẳng trong bảng số liệu nếu cần."
              : analyzedAlready
                ? "Lời kể này đã phân tích rồi. Sửa nội dung ở ô trên để phân tích lại."
                : "Chỉ đọc lời kể thành số liệu và điền vào form. Chốt phương án là việc của nút “Lập bản tham mưu”."
          }
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
        >
          <ColorIcon name="magic" size={15} tone="amber" />
          {analyzing ? "Đang đọc lời kể…" : "Phân tích bằng AI"}
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
      {/* Nút xám mà không nói vì sao thì người dùng bấm mãi rồi tưởng hệ thống hỏng.
          Câu này đứng TRƯỚC câu "đã phân tích rồi": khi kế hoạch đã lập thì lý do
          khoá là kế hoạch, không phải chuyện lời kể trùng hay khác. */}
      {planLocked ? (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Nhiệm vụ đã có kế hoạch cứu hộ nên không phân tích lại lời kể nữa — phân tích lại sẽ ghi
          đè bộ số mà kế hoạch đang dựa vào. Cần đổi số thì sửa thẳng trong bảng số liệu bên dưới.
        </p>
      ) : analyzedAlready && !analyzing ? (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Đã đọc xong lời kể này và điền số liệu bên dưới. Soát lại rồi bấm “Lập bản tham mưu” để
          chốt; sửa nội dung ở ô trên nếu muốn phân tích lại.
        </p>
      ) : null}
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

/**
 * Bảng soát số liệu đã phân tích.
 *
 * Sau khi AI (hoặc chính admin) chốt số, việc còn lại KHÔNG phải là nhập nữa mà là
 * ĐỐI CHIẾU: đọc lời kể ở trên rồi dò xuống xem có dòng nào nghe nhầm không. Bảy ô
 * nhập nằm cạnh nhau bắt mắt nhảy qua nhảy lại giữa nhãn và ô, còn bảng hai cột thì
 * đọc thẳng một mạch từ trên xuống. Sai chỗ nào thì bấm "Chỉnh sửa" mở lại đúng các
 * ô đó.
 */
/**
 * Ô nhập chiếm trọn lòng một ô bảng: không viền, không nền riêng.
 *
 * `cell-input` là chỗ kéo viền tiêu điểm vào trong (xem globals.css) — không có
 * nó thì viền nở ra ngoài và ô nhập trông như tràn khỏi bảng.
 */
const CELL_CONTROL =
  "cell-input w-full bg-transparent px-3 py-2 text-sm transition hover:bg-[var(--surface-2)]";

/**
 * Một con số trong bảng, xoá trắng được để gõ lại.
 *
 * Ô số bình thường bị kẹt ở đây: giá trị là số nên xoá trắng ra chuỗi rỗng,
 * `Number("")` là 0, state vẫn 0 và ô lập tức hiện lại "0". Người dùng không bao
 * giờ xoá được số 0 đang có — muốn 20 thì phải chấp nhận gõ thành "020".
 *
 * Nên trong lúc đang gõ, ô được phép RỖNG dù state vẫn là 0. Rời ô thì nó thôi
 * rỗng và hiện lại con số thật, để không ai bỏ đi mà tưởng mình vừa để trống.
 */
function NumberCell({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [clearing, setClearing] = useState(false);

  return (
    <input
      id={id}
      type="number"
      min={0}
      // Rỗng thì hiện placeholder "0": ô trắng trơn trông như thiếu dữ liệu, còn
      // số mờ nói đúng thứ sẽ được dùng nếu người dùng bỏ đi mà không gõ gì.
      placeholder="0"
      value={clearing ? "" : value}
      onChange={(e) => {
        const raw = e.target.value;
        setClearing(raw === "");
        onChange(raw === "" ? 0 : Math.max(0, Number(raw)));
      }}
      onBlur={() => setClearing(false)}
      className={`tabular font-semibold ${CELL_CONTROL}`}
    />
  );
}

/**
 * Khai số liệu ngay trong bảng, thay cho một cột ô nhập rời.
 *
 * Bảy ô nhập xếp dọc, mỗi ô một nhãn nhỏ phía trên và một khung viền bao quanh,
 * là bảy khối chữ nhật chồng lên nhau chiếm gần trọn chiều cao cột trái — nhìn
 * dày đặc mà thật ra chỉ chứa bảy con số. Bảng gom nhãn về một cột hẹp có nền,
 * số về một cột: đọc lướt là thấy hết, và trùng đúng hình dáng của bảng soát sau
 * khi phân tích nên chuyển qua lại giữa hai chế độ không còn thấy giao diện nhảy.
 *
 * Ô nhập bỏ viền và bỏ nền riêng, để chính ô bảng làm khung cho nó. Bù lại phần
 * gợi ý "bấm được vào đây": nền sáng lên khi rê chuột, viền tiêu điểm nằm gọn
 * bên trong ô, và hai ô chọn vẫn giữ mũi tên gốc của trình duyệt.
 */
function IncidentFormTable({
  form,
  onChange,
  onSelectLocation,
  hamletOptions,
  locationInvalid,
  pinned,
}: {
  form: IncidentForm;
  onChange: (form: IncidentForm) => void;
  /** Riêng ô địa điểm đi đường khác: chọn thôn còn phải bỏ điểm ghim tay. */
  onSelectLocation: (name: string) => void;
  hamletOptions: HamletOption[];
  locationInvalid: boolean;
  /** Đã ghim tay một điểm trên bản đồ chưa — đổi lời của dòng trống ô địa điểm. */
  pinned: boolean;
}) {
  const numberRow = (
    id: string,
    label: string,
    key: "affectedPeople" | "durationHours" | "children" | "elderly" | "medicalSupportCases",
  ) => ({
    id,
    label,
    control: (
      <NumberCell id={id} value={form[key]} onChange={(v) => onChange({ ...form, [key]: v })} />
    ),
  });

  const rows = [
    {
      id: "incident-type",
      label: "Loại tình huống",
      control: (
        <select
          id="incident-type"
          value={form.incidentType}
          onChange={(e) => onChange({ ...form, incidentType: e.target.value })}
          className={`cell-select cursor-pointer font-semibold ${CELL_CONTROL}`}
        >
          {INCIDENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      ),
    },
    {
      id: "incident-location",
      label: "Địa điểm ứng phó",
      control: (
        // Danh sách chọn, không phải ô gõ tự do: gõ tay thì sai một dấu là backend
        // không tra ra thôn nào, mất toạ độ và mất luôn phần tính tuyến — mà lỗi
        // chỉ hiện ra sau khi đã bấm lập phương án.
        <select
          id="incident-location"
          value={locationInvalid ? "" : (findHamlet(hamletOptions, form.location)?.name ?? "")}
          onChange={(e) => onSelectLocation(e.target.value)}
          aria-invalid={locationInvalid}
          className={`cell-select cursor-pointer font-semibold ${CELL_CONTROL}`}
          style={locationInvalid ? { color: "var(--color-critical)" } : undefined}
        >
          {/* Dòng trống này mang HAI nghĩa tuỳ lúc: chưa ghim gì thì nó là lời mời
              ghim tay, ghim rồi thì nó là câu trả lời "địa điểm đang dùng là điểm
              trên bản đồ". Vẫn để nguyên câu mời khi chưa ghim thì ô địa điểm trông
              như còn bỏ trống, dù người dùng vừa ghim xong và bản đồ bên phải đã
              hiện dấu ghim đỏ. */}
          <option value="">{pinned ? "Đã ghim trên bản đồ" : "Ghim trên bản đồ"}</option>
          {hamletOptions.map((h) => (
            <option key={h.id} value={h.name}>
              {h.name}
            </option>
          ))}
        </select>
      ),
    },
    numberRow("incident-affected", "Số người", "affectedPeople"),
    numberRow("incident-duration", "Số giờ cô lập dự kiến", "durationHours"),
    numberRow("incident-children", "Trẻ em", "children"),
    numberRow("incident-elderly", "Người già", "elderly"),
    numberRow("incident-medical", "Ca y tế", "medicalSupportCases"),
  ];

  return (
    <table className="w-full table-fixed border-collapse overflow-hidden rounded-md border text-sm">
      <tbody className="divide-y">
        {rows.map((row) => (
          <tr key={row.id}>
            {/* Nhãn là <label> thật gắn với ô nhập: bấm vào nhãn là con trỏ nhảy
                đúng ô, và trình đọc màn hình đọc được ô này đang hỏi cái gì. */}
            <th
              scope="row"
              className="w-1/2 bg-[var(--surface-2)] text-left font-medium text-[var(--text-muted)]"
            >
              <label className="block cursor-pointer px-3 py-2" htmlFor={row.id}>
                {row.label}
              </label>
            </th>
            <td className="p-0">{row.control}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IncidentSummaryTable({
  form,
  typeLabel,
  pinned,
  hasActionPlan,
  onEdit,
}: {
  form: IncidentForm;
  typeLabel: string;
  pinned: boolean;
  hasActionPlan: boolean;
  onEdit: () => void;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Loại tình huống", value: typeLabel },
    {
      label: "Địa điểm ứng phó",
      value: form.location?.trim() || (pinned ? "Đã ghim trên bản đồ" : "Chưa xác định"),
    },
    { label: "Số người", value: form.affectedPeople.toLocaleString("vi") },
    { label: "Số giờ cô lập dự kiến", value: `${form.durationHours.toLocaleString("vi")} giờ` },
    { label: "Trẻ em", value: (form.children ?? 0).toLocaleString("vi") },
    { label: "Người già", value: (form.elderly ?? 0).toLocaleString("vi") },
    { label: "Ca y tế", value: (form.medicalSupportCases ?? 0).toLocaleString("vi") },
  ];
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Số liệu đã phân tích</h3>
        <button
          type="button"
          onClick={onEdit}
          // Nói trước cái giá: sửa số là tính lại nhu cầu, mà bản tham mưu đã lập
          // dựng trên nhu cầu cũ nên nó không còn đúng nữa.
          title={
            hasActionPlan
              ? "Sửa số liệu và tính lại nhu cầu. Bản tham mưu đã lập sẽ phải lập lại theo số mới."
              : "Sửa lại số liệu nếu AI nghe nhầm, rồi tính lại nhu cầu"
          }
          className="flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px"
        >
          <ColorIcon name="edit" size={15} tone="blue" />
          Chỉnh sửa
        </button>
      </div>
      <p className="mb-2 text-xs text-[var(--text-muted)]">
        Đối chiếu với lời kể ở trên. Sai chỗ nào thì bấm “Chỉnh sửa” — nhu cầu vật tư và khả năng
        đáp ứng sẽ tính lại theo số mới.
      </p>
      <table className="w-full border-collapse overflow-hidden rounded-md border text-sm">
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                className="w-1/2 bg-[var(--surface-2)] px-3 py-2 text-left font-medium text-[var(--text-muted)]"
              >
                {row.label}
              </th>
              <td className="tabular px-3 py-2 font-semibold">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
