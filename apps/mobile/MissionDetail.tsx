import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  CameraView as ExpoCameraView,
  useCameraPermissions,
  type CameraViewProps,
} from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  acceptWarehouseMaterialRequest,
  completeMission,
  fetchMission,
  fetchMissionDeliveryPhoto,
  fetchMissionWarehouseRoutes,
  fetchWarehouseMaterialRequests,
  confirmWarehousePickup,
  fetchReturnableSupplies,
  markSuppliesReturned,
  prepareWarehouseMaterialRequest,
  reportWarehouseMaterialDiscrepancy,
  transcribe,
  type MissionDeliveryPhoto,
  type MissionDetail,
  type MissionWarehouseRoute,
  type ReturnableSupply,
  type WarehouseMaterialRequest,
} from "./api";
import { c, styles } from "./styles";
import { assessDanger, disasterOf, formatLongTime } from "./disaster";
import {
  BULK_ACTION_LABEL,
  planBulkAction,
  warehouseProgress,
  type BulkActionKind,
} from "@safestock/shared-types";
import { supplyOf, supplyProgress } from "./supplies";
import { confirmAction, notify } from "./dialog";
import { readOfflineCache, writeOfflineCache } from "./offline-cache";
import { FIELD_FORCE_ROLE_LABEL } from "./role-labels";
import {
  deliveryOutcomeLabel,
  missionPickupStage,
  missionPlaceLabel,
  missionStageForViewer,
  missionStageLabel,
  missionStageNeedsAction,
  ownWarehouseStage,
  warehousePickupStates,
} from "./mission-state";
import {
  MAX_EVIDENCE_PHOTOS,
  addEvidencePhoto,
  deliveryReportSummary,
  pickCaptureSize,
  removeEvidencePhoto,
  type EvidencePhoto,
} from "./mission-delivery-report";
import { isRecordingSupported, startRecording, type AudioRecording } from "./audio";
import { MissionMap } from "./MissionMap";
import { type MissionMapData } from "./mission-map-html";
import {
  buildPickupPlan,
  formatTravel,
  pickupItemStatusLabel,
  pickupStopStateLabel,
  type PickupStop,
} from "./mission-pickup-plan";

/**
 * `CameraView` của expo-camera phải cast mới dùng được với bản @types/react hiện
 * tại (cùng lý do đã ghi ở InventoryScreen). Khai luôn phần `takePictureAsync`
 * cần tới, vì bản cast theo `ComponentType` làm mất kiểu của ref.
 */
interface CameraHandle {
  takePictureAsync: (options?: {
    base64?: boolean;
    quality?: number;
  }) => Promise<{ base64?: string; uri: string } | undefined>;
  getAvailablePictureSizesAsync: () => Promise<string[]>;
}

const CompatibleCameraView = ExpoCameraView as unknown as ComponentType<
  CameraViewProps & { ref?: Ref<CameraHandle> }
>;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING_RESCUE: `Chờ ${FIELD_FORCE_ROLE_LABEL} xác nhận`,
  RESCUE_CONFIRMED: "Đã xác nhận",
  PENDING_WAREHOUSE: "Chờ kho chuẩn bị",
  READY: "Kho đã sẵn sàng",
  COMPLETED: "Hoàn thành",
  RETURNED: "Đã hoàn trả vật tư",
  REJECTED: "Đã từ chối",
  DEFERRED: "Tạm hoãn",
  CANCELLED: "Đã huỷ",
};

/** Màn chỉ đọc phương án, kèm Trợ lý hiện trường có xác nhận của người dùng. */
export function MissionDetailScreen({
  token,
  userId,
  role,
  warehouseId,
  missionId,
  refreshSignal,
  onBack,
}: {
  token: string;
  userId: string;
  role: string;
  /** Kho người này phụ trách — quyết định dòng nào họ tự tay làm gộp được. */
  warehouseId?: string | null;
  missionId: string;
  /**
   * Đổi giá trị là màn hình tải lại. Vỏ app truyền vào id thông báo mới nhất của
   * chính nhiệm vụ này, nên kho vừa xuất hàng hay vừa ký nhận là nội dung ở đây
   * đổi theo ngay — không bắt người đang đứng ở kho phải thoát ra rồi vào lại.
   */
  refreshSignal?: string | null;
  onBack: () => void;
}) {
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheStoredAt, setCacheStoredAt] = useState<string | null>(null);
  const [resultText, setResultText] = useState("");
  const [resultPhotos, setResultPhotos] = useState<EvidencePhoto[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [fieldVoiceBusy, setFieldVoiceBusy] = useState(false);
  const [fieldRecording, setFieldRecording] = useState(false);
  const [warehouseActionId, setWarehouseActionId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [warehouseNotes, setWarehouseNotes] = useState<Record<string, string>>({});
  /** Đang gửi lượt xác nhận "đội đã hoàn trả vật tư". */
  const [returnBusy, setReturnBusy] = useState(false);
  /**
   * Kho đã tự trả lời "CHƯA hoàn trả" cho nhiệm vụ này chưa.
   *
   * Giữ lại trong bộ lưu chứ không chỉ trong bộ nhớ: người giữ kho mở nhiệm vụ,
   * thấy đội chưa mang đồ về, bấm "Chưa hoàn trả" rồi đi làm việc khác. Mở lại
   * mà câu hỏi hiện y như cũ thì màn hình quên mất câu trả lời vừa nhận, và nó
   * hỏi lại mỗi lần — thứ người dùng học được từ đó là bỏ qua câu hỏi.
   *
   * `null` là chưa đọc xong bộ lưu; khác `false` ở chỗ chưa biết gì để mà vẽ.
   */
  const [returnPending, setReturnPending] = useState<boolean | null>(null);
  /**
   * Phần vật tư tái sử dụng CÒN THIẾU theo lượt đếm gần nhất.
   *
   * Giữ ở màn hình chứ không tính lại từ nhiệm vụ: nhiệm vụ chỉ mang trạng thái
   * chung (còn ở COMPLETED nghĩa là chưa thu hồi xong), không nói dòng nào thiếu
   * bao nhiêu — mà đó mới là thứ người giữ kho cần đọc lần sau.
   */
  const [outstandingReturns, setOutstandingReturns] = useState<ReturnableSupply[]>([]);
  const [pickedQuantities, setPickedQuantities] = useState<Record<string, string>>({});
  const [routes, setRoutes] = useState<MissionWarehouseRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(role === "RESCUE");
  /**
   * Người xem có tự bấm mở/gấp phần chi tiết chưa; `null` là chưa bấm lần nào.
   *
   * Chưa bấm thì để trạng thái nhiệm vụ quyết định: đã đóng thì gấp lại, còn
   * đang chạy thì mở. Không thể lấy `mission.status` làm giá trị khởi tạo vì lúc
   * dựng màn hình nhiệm vụ chưa tải xong; mà lưu một `boolean` rồi ghi đè bằng
   * effect thì màn hình bung ra một nhịp rồi tự gấp lại trước mắt người dùng.
   */
  const [detailsOpenChoice, setDetailsOpenChoice] = useState<boolean | null>(null);
  const recordingRef = useRef<AudioRecording | null>(null);

  useEffect(
    () => () => {
      void recordingRef.current?.stop();
      recordingRef.current = null;
    },
    [],
  );

  // Câu trả lời "chưa hoàn trả" của chính kho này, cho chính nhiệm vụ này.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await readOfflineCache<{ pending: boolean }>(
          userId,
          `mission-return-pending.${missionId}`,
        );
        if (active) setReturnPending(stored?.data.pending === true);
      } catch {
        // Không đọc được thì coi như chưa trả lời: câu hỏi hiện ra, không mất gì.
        if (active) setReturnPending(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, missionId]);

  const load = useCallback(async () => {
    setError(null);
    let hasCachedData = false;
    try {
      const cached = await readOfflineCache<MissionDetail>(userId, `mission.${missionId}`);
      if (cached) {
        hasCachedData = true;
        setMission(cached.data);
        setCacheStoredAt(cached.storedAt);
        setLoading(false);
      } else {
        setLoading(true);
      }
    } catch {
      setLoading(true);
    }
    try {
      const latest = await fetchMission(token, missionId);
      if (role === "WAREHOUSE") {
        const ownRequests = await fetchWarehouseMaterialRequests(token);
        latest.warehouseRequests = ownRequests.filter((request) => request.missionId === missionId);
      }
      setMission(latest);
      setCacheStoredAt(null);
      await writeOfflineCache(userId, `mission.${missionId}`, latest);
    } catch (e) {
      setError(
        hasCachedData
          ? "Đang xem bản lưu vì chưa kết nối được ungphonhanh.life."
          : e instanceof Error
            ? e.message
            : "Lỗi tải dữ liệu",
      );
    } finally {
      setLoading(false);
    }
  }, [token, userId, missionId, role]);

  useEffect(() => {
    load();
  }, [load]);

  // Bỏ qua lần chạy đầu: `load` ở trên vừa tải xong, gọi thêm là hai lượt mạng
  // cho cùng một lần mở màn.
  const seenSignal = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (seenSignal.current === undefined) {
      seenSignal.current = refreshSignal ?? null;
      return;
    }
    if (seenSignal.current === (refreshSignal ?? null)) return;
    seenSignal.current = refreshSignal ?? null;
    void load();
  }, [refreshSignal, load]);

  /**
   * Tuyến kho → điểm nạn, chỉ tải cho lực lượng hiện trường.
   *
   * Tách hẳn khỏi `load` chứ không gọi nối tiếp trong đó: tính tuyến gọi OSRM một
   * lượt cho mỗi kho, mà nội dung nhiệm vụ (vật tư, trạng thái) phải hiện ngay.
   * Gộp vào một lượt là bắt người đang đứng ngoài mưa chờ cả phần chậm nhất mới
   * đọc được phần nhanh nhất — và OSRM lỗi thì mất luôn cả màn hình.
   */
  const loadRoutes = useCallback(async () => {
    if (role !== "RESCUE") return;
    const cacheKey = `mission.${missionId}.routes`;
    try {
      const cached = await readOfflineCache<MissionWarehouseRoute[]>(userId, cacheKey);
      if (cached) {
        setRoutes(cached.data);
        setRoutesLoading(false);
      }
    } catch {
      // Bản lưu hỏng chỉ làm mất tiện lợi; vẫn tải bản mới bên dưới.
    }
    try {
      const latest = await fetchMissionWarehouseRoutes(token, missionId);
      setRoutes(latest);
      await writeOfflineCache(userId, cacheKey, latest);
    } catch {
      // Mất mạng hoặc máy định tuyến đang tắt: giữ bản lưu (nếu có) và để bản đồ
      // tự báo. Không đẩy lên `error` chung — dòng lỗi đỏ ở đó nói về nhiệm vụ,
      // mà nhiệm vụ thì vẫn tải được bình thường.
    } finally {
      setRoutesLoading(false);
    }
  }, [role, token, userId, missionId]);

  useEffect(() => {
    void loadRoutes();
  }, [loadRoutes]);

  async function toggleFieldVoice() {
    setError(null);
    if (fieldRecording) {
      setFieldVoiceBusy(true);
      try {
        const audioBase64 = await recordingRef.current?.stop();
        recordingRef.current = null;
        setFieldRecording(false);
        if (!audioBase64) return;
        const result = await transcribe(token, audioBase64);
        // Nối vào phần đã gõ chứ không ghi đè: người ta hay gõ vài chữ rồi nói
        // nốt phần dài, mất phần đã gõ là mất công gõ lại giữa hiện trường.
        if (result.text.trim()) {
          setResultText((current) =>
            current.trim() ? `${current.trim()} ${result.text.trim()}` : result.text.trim(),
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không nhận dạng được giọng nói");
      } finally {
        setFieldVoiceBusy(false);
      }
      return;
    }
    try {
      recordingRef.current = await startRecording();
      setFieldRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể mở ghi âm");
    }
  }

  /**
   * Báo kết quả và ĐÓNG nhiệm vụ.
   *
   * Chỉ có đường "đã hoàn thành" ở đây: người chưa giao xong thì còn đang ở
   * ngoài đường, họ không mở màn này ra để báo dở dang. Kết quả bằng chữ và ảnh
   * bằng chứng đều tuỳ chọn, nên nút luôn bấm được — thứ bắt buộc duy nhất là
   * người thật xác nhận việc đã xong.
   */
  async function submitDeliveryReport() {
    const confirmed = await confirmAction({
      title: "Xác nhận đã hoàn thành",
      message: `${deliveryReportSummary(resultText, resultPhotos.length)} Nhiệm vụ sẽ đóng lại và không sửa được nữa.`,
      confirmLabel: "Đã hoàn thành",
    });
    if (!confirmed) return;

    setCompleting(true);
    setError(null);
    try {
      await completeMission(
        token,
        missionId,
        "DELIVERED",
        resultText.trim() || undefined,
        resultPhotos.map((photo) => ({ dataBase64: photo.dataBase64 })),
      );
      setResultText("");
      setResultPhotos([]);
      await load();
      notify("Đã ghi nhận", "Nhiệm vụ đã đóng với kết quả giao đủ.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được báo cáo kết quả");
    } finally {
      setCompleting(false);
    }
  }

  /**
   * Nhận một loạt ảnh vừa chụp hoặc vừa chọn từ thư viện.
   *
   * Cộng dồn trong MỘT lượt rồi mới ghi lại: chọn 3 ảnh cùng lúc từ thư viện mà
   * gọi ba lần thì mỗi lần đều tính từ danh sách cũ, và chỉ tấm cuối trụ lại.
   */
  function keepEvidencePhotos(dataList: string[]) {
    let photos = resultPhotos;
    let firstError: string | undefined;
    for (const dataBase64 of dataList) {
      const next = addEvidencePhoto(photos, {
        id: `anh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        dataBase64,
      });
      photos = next.photos;
      if (next.error && !firstError) firstError = next.error;
    }
    setResultPhotos(photos);
    if (firstError) setError(firstError);
  }

  /**
   * Lấy ảnh có sẵn trong máy.
   *
   * Không phải ảnh nào cũng chụp được ngay lúc đang đứng báo cáo: nhiều người
   * chụp lúc bàn giao hàng rồi mới mở app ra báo khi về tới chỗ có sóng. Bắt
   * chụp lại là bắt họ chụp một tấm không còn nói lên điều gì.
   */
  async function pickEvidenceFromLibrary() {
    setError(null);
    const remainingSlots = MAX_EVIDENCE_PHOTOS - resultPhotos.length;
    if (remainingSlots <= 0) {
      setError(`Mỗi lần báo kèm tối đa ${MAX_EVIDENCE_PHOTOS} ảnh.`);
      return;
    }
    try {
      // KHÔNG xin quyền trước: bộ chọn ảnh của hệ điều hành trả về đúng tấm người
      // dùng chỉ định, không cho app đọc cả thư viện, nên Android lẫn iOS đều
      // không đòi quyền. Xin trước chỉ tạo thêm một cửa có thể bị từ chối và khoá
      // luôn một tính năng vốn chạy được.
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        // Nén lại như lúc chụp: ảnh trong máy thường là bản gốc chưa qua nén nào.
        quality: 0.5,
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
      });
      if (picked.canceled) return;
      const data = picked.assets
        .map((asset) => asset.base64)
        .filter((base64): base64 is string => Boolean(base64));
      if (data.length === 0) {
        setError("Không đọc được ảnh đã chọn, hãy thử ảnh khác.");
        return;
      }
      keepEvidencePhotos(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Không mở được thư viện ảnh: ${e.message}`
          : "Không mở được thư viện ảnh",
      );
    }
  }

  async function updateWarehouseRequest(
    kind: "accept" | "prepare" | "discrepancy" | "pickup",
    request: WarehouseMaterialRequest,
  ) {
    setWarehouseActionId(request.id);
    setError(null);
    try {
      const note = warehouseNotes[request.id]?.trim();
      if (kind === "discrepancy" && (!note || note.length < 3)) {
        throw new Error("Cần ghi rõ chênh lệch (ít nhất 3 ký tự).");
      }
      if (kind === "pickup") {
        const raw = (pickedQuantities[request.id] ?? "").trim();
        // Để trống nghĩa là lấy đủ. Lấy đủ mới là trường hợp thường gặp; bắt gõ
        // lại đúng con số đã hiện sẵn chỉ tạo thêm một chỗ để gõ nhầm.
        const quantity = raw === "" ? request.preparedQuantity : Number(raw);
        if (!Number.isInteger(quantity) || quantity < 0) {
          throw new Error("Số thực lấy phải là số nguyên không âm.");
        }
        if (quantity < request.preparedQuantity && !note) {
          throw new Error(
            `Thiếu ${request.preparedQuantity - quantity} so với số đã soạn — phải ghi rõ lý do.`,
          );
        }
        await confirmWarehousePickup(token, request.id, quantity, note || undefined);
        setPickedQuantities((current) => ({ ...current, [request.id]: "" }));
      } else if (kind === "accept") {
        await acceptWarehouseMaterialRequest(token, request.id, note || undefined);
      } else if (kind === "prepare") {
        await prepareWarehouseMaterialRequest(token, request.id);
      } else {
        await reportWarehouseMaterialDiscrepancy(token, request.id, note as string);
      }
      setWarehouseNotes((current) => ({ ...current, [request.id]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được yêu cầu vật tư");
    } finally {
      setWarehouseActionId(null);
    }
  }

  /**
   * Chạy một việc cho cả loạt dòng, TUẦN TỰ chứ không song song.
   *
   * Mỗi lượt gọi đều đụng vào tồn kho thật. Bắn năm lượt cùng lúc là năm giao
   * dịch tranh nhau đúng những lô hàng đó, và thứ tự chúng chốt không ai đoán
   * được. Chạy lần lượt thì chậm hơn vài giây, đổi lại kho luôn cộng trừ đúng.
   *
   * Dừng ngay ở lỗi ĐẦU TIÊN. Chạy tiếp là giấu mất chỗ hỏng: người dùng thấy
   * "xong" trong khi một dòng đã trượt, mà chính dòng đó mới là dòng có chuyện.
   */
  async function runBulkWarehouseAction(kind: BulkActionKind, rows: WarehouseMaterialRequest[]) {
    setBulkBusy(true);
    setError(null);
    try {
      for (const request of rows) {
        if (kind === "pickup") {
          await confirmWarehousePickup(token, request.id, request.preparedQuantity);
          setPickedQuantities((current) => ({ ...current, [request.id]: "" }));
        } else if (kind === "accept") {
          await acceptWarehouseMaterialRequest(token, request.id);
        } else {
          await prepareWarehouseMaterialRequest(token, request.id);
        }
      }
      await load();
    } catch (e) {
      // Tải lại dù hỏng giữa chừng: những dòng đã chạy xong là thay đổi THẬT ở
      // kho, màn hình phải phản ánh đúng phần đã làm được.
      await load().catch(() => undefined);
      setError(e instanceof Error ? e.message : "Không hoàn tất được thao tác hàng loạt");
    } finally {
      setBulkBusy(false);
    }
  }

  /**
   * Kho ký nhận đã thu hồi đủ vật tư — bước cuối, đóng hẳn nhiệm vụ.
   *
   * Hỏi lại trước khi gửi: đây là chữ ký chốt sổ, sau nó nhiệm vụ không còn bước
   * nào và không lùi lại được.
   */
  async function confirmSuppliesReturned() {
    const agreed = await confirmAction({
      title: "Đội đã hoàn trả đủ vật tư?",
      message:
        "Xác nhận là đã đếm lại và nhận đủ phần vật tư mang về. Nhiệm vụ khép lại sau bước này.",
      confirmLabel: "Đã nhận đủ",
    });
    if (!agreed) return;
    setReturnBusy(true);
    setError(null);
    try {
      await markSuppliesReturned(token, missionId);
      setOutstandingReturns([]);
      await markReturnPending(false);
      await load();
      notify("Đã ghi nhận", "Nhiệm vụ đã khép lại. Điều phối và đội cứu hộ nhận được thông báo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa gửi được xác nhận hoàn trả vật tư");
    } finally {
      setReturnBusy(false);
    }
  }

  /**
   * Ghi số đã nhận lại của từng dòng vật tư.
   *
   * Về đủ hết thì máy chủ tự khép nhiệm vụ; còn thiếu thì nó trả lại đúng những
   * dòng đang thiếu để màn hình bày ra — người giữ kho không phải nhớ trong đầu
   * tới chuyến sau.
   */
  async function submitReturnCounts(items: { sku: string; returnedQuantity: number }[]) {
    if (items.length === 0) {
      notify("Chưa có số nào", "Nhập số đã nhận lại cho ít nhất một loại vật tư.");
      return;
    }
    setReturnBusy(true);
    setError(null);
    try {
      const result = await markSuppliesReturned(token, missionId, items);
      const outstanding = result.outstandingReturns ?? [];
      setOutstandingReturns(outstanding);
      await markReturnPending(false);
      await load();
      notify(
        "Đã ghi nhận",
        outstanding.length === 0
          ? "Đã nhận đủ toàn bộ vật tư. Nhiệm vụ khép lại."
          : `Đã ghi số nhận lại. Còn ${outstanding.length} loại chưa về đủ, nhiệm vụ vẫn đang chờ thu hồi.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa ghi được số vật tư đã nhận lại");
    } finally {
      setReturnBusy(false);
    }
  }

  /** Ghi nhớ câu trả lời "chưa hoàn trả" (hoặc xoá nó) cho riêng máy này. */
  async function markReturnPending(pending: boolean) {
    setReturnPending(pending);
    try {
      await writeOfflineCache(userId, `mission-return-pending.${missionId}`, { pending });
    } catch {
      // Không ghi được thì lần mở sau câu hỏi hiện lại — phiền, nhưng không sai.
    }
  }

  const fieldForce = role === "RESCUE";
  const pickupStage = missionPickupStage(mission?.status ?? "", mission?.warehouseRequests);
  const completed = mission?.status === "COMPLETED" || mission?.status === "RETURNED";
  const detailsOpen = detailsOpenChoice ?? !completed;

  const mapData = useMemo<MissionMapData>(
    () => ({
      incident:
        mission?.incidentLat != null && mission?.incidentLng != null
          ? { lat: mission.incidentLat, lng: mission.incidentLng }
          : null,
      incidentLabel: mission?.hamletName?.trim() || mission?.location?.trim() || "Điểm gặp nạn",
      warehouses: routes.map((route) => ({
        id: route.id,
        name: route.name,
        kind: route.kind,
        lat: route.lat,
        lng: route.lng,
        distanceKm: route.distanceKm,
        etaMinutes: route.etaMinutes,
        routeCoordinates:
          route.routeStatus === "ROUTED" ? (route.routeGeometry?.coordinates ?? null) : null,
      })),
    }),
    [mission?.incidentLat, mission?.incidentLng, mission?.hamletName, mission?.location, routes],
  );

  const pickupStops = useMemo(
    () => buildPickupPlan(routes, mission?.warehouseRequests ?? []),
    [routes, mission?.warehouseRequests],
  );

  /**
   * Kho đang đăng nhập đang ở chặng nào của CHÍNH MÌNH.
   *
   * Quyết định màn hình bày ra bảng nào: còn nợ hàng thì bày việc phải làm, giao
   * xong rồi thì bày biên bản đã giao. Xem `ownWarehouseStage`.
   */
  const ownStage = ownWarehouseStage(warehouseId, mission?.warehouseRequests);
  /** Phiếu của chính kho mình — nguồn cho bảng "Vật tư đã xuất". */
  const ownRequests = useMemo(
    () =>
      (mission?.warehouseRequests ?? []).filter(
        (request) => !warehouseId || request.warehouseId === warehouseId,
      ),
    [mission?.warehouseRequests, warehouseId],
  );
  /**
   * Người dùng có tự gập/mở hai mục của màn cứu hộ không.
   *
   * `null` là "chưa đụng tới" — lúc đó mặc định chạy theo chặng công việc: chưa
   * lấy hàng thì mở điểm lấy hàng, lấy xong thì mở bảng vật tư. Đặt cứng
   * `useState(true/false)` thì mặc định chỉ đúng ở lượt dựng đầu tiên và không
   * bao giờ đổi theo việc nữa.
   */
  const [pickupPlanOpenChoice, setPickupPlanOpenChoice] = useState<boolean | null>(null);
  const [suppliesOpenChoice, setSuppliesOpenChoice] = useState<boolean | null>(null);

  /** Từng kho đã xuất xong chưa — để đội cứu hộ đi được kho nào hay kho ấy. */
  const pickupStates = useMemo(
    () => warehousePickupStates(mission?.warehouseRequests),
    [mission?.warehouseRequests],
  );
  /**
   * Kho đã soạn xong mà đội CHƯA ký nhận — tức là còn hàng đang chờ người tới lấy.
   *
   * Đây mới là danh sách "đi ngay được", không phải `mission.status === READY`.
   * Trạng thái nhiệm vụ chỉ bật lên READY khi kho CUỐI CÙNG xong, nên bám vào nó
   * là bắt đội ngồi chờ trong khi hàng ở kho thôn đã nằm sẵn trên kệ từ sáng.
   */
  const warehousesToVisit = pickupStates.filter((state) => state.ready && !state.pickedUp);
  const allWarehousesReady = pickupStates.length > 0 && pickupStates.every((state) => state.ready);

  /**
   * Đội đã ký nhận hàng ở MỌI kho chưa — mốc lật hai mục của màn cứu hộ.
   *
   * Trước mốc này việc là ĐI LẤY, nên mở điểm lấy hàng. Sau mốc này hàng đã trên
   * xe, việc là soát lại mang đủ chưa, nên mở bảng vật tư và gập điểm lấy hàng
   * lại — nó đã xong, để mở chỉ tổ đẩy phần cần đọc xuống dưới màn hình.
   */
  const pickupSigned = pickupStage === "PICKED_UP";
  /**
   * Mốc đổi thì BỎ lựa chọn tay của người dùng.
   *
   * Họ gập mục điểm lấy hàng lúc đang chờ kho là ý định cho LÚC ĐÓ. Giữ nguyên
   * lựa chọn đó sau khi ký nhận xong là màn hình đứng im ở bố cục của việc cũ,
   * đúng lúc việc vừa đổi sang thứ khác.
   */
  const lastPickupSignedRef = useRef(pickupSigned);
  useEffect(() => {
    if (lastPickupSignedRef.current === pickupSigned) return;
    lastPickupSignedRef.current = pickupSigned;
    setPickupPlanOpenChoice(null);
    setSuppliesOpenChoice(null);
  }, [pickupSigned]);
  const pickupPlanOpen = pickupPlanOpenChoice ?? !pickupSigned;
  const suppliesOpen = suppliesOpenChoice ?? pickupSigned;

  return (
    <View style={styles.screen}>
      {/* Xếp DỌC: nút quay lại một dòng, tiêu đề dòng dưới.
          Trước đây ba khối nằm ngang một hàng, mà tiêu đề ở màn này dài ngắn tuỳ
          số hiệu. Trên máy thật "Chi tiết nhiệm vụ số 1" ăn hết chỗ trống rồi
          chạm sát vào nút, đọc ra thành một chuỗi dính liền "Quay lạiChi tiết
          nhiệm vụ số 1" — nút bấm được nhưng nhìn như lỗi. Cho chữ co lại
          (`numberOfLines`) không cứu được, vì cắt tiêu đề đi thì mất đúng cái số
          hiệu là thứ người trực cần đọc.

          Tách dòng thì tiêu đề dài bao nhiêu cũng không chạm tới nút, và nút nằm
          sát mép trên — chỗ ngón cái với tới dễ nhất khi cầm một tay. */}
      <View style={[styles.header, local.detailHeader]}>
        {/* Mũi tên vector thay cho ký tự "‹": ký tự đó là dấu ngoặc nhọn tiếng
            Pháp, cỡ do phông quyết định nên luôn nhỏ hơn chữ đứng cạnh. */}
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={20} color={c.amber} />
          <Text style={styles.backLink}>Quay lại</Text>
        </Pressable>
        {/* Số hiệu ngay trên thanh tiêu đề: mở hai ba nhiệm vụ rồi quay lại thì
            "Chi tiết nhiệm vụ" không nói được đang đứng ở việc nào. Chưa tải xong
            (hoặc bản ghi cũ không có số) thì giữ nguyên tiêu đề cũ thay vì nhấp
            nháy một số rỗng. */}
        <Text numberOfLines={1} style={styles.title}>
          {mission?.missionNo != null
            ? `Chi tiết nhiệm vụ số ${mission.missionNo}`
            : "Chi tiết nhiệm vụ"}
        </Text>
      </View>

      {loading ? (
        <View style={{ padding: 16 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeleton} />
          ))}
        </View>
      ) : error && !mission ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Không tải được</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable onPress={load} accessibilityRole="button">
            <Text style={styles.linkText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : mission ? (
        <ScrollView contentContainerStyle={styles.detailScroll}>
          {cacheStoredAt ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: c.amber,
                backgroundColor: "rgba(245,158,11,0.12)",
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
              }}
              accessibilityRole="alert"
            >
              <Text style={{ color: c.amber, fontSize: 12, fontWeight: "700" }}>
                Ngoại tuyến · chỉ đọc · bản lưu {new Date(cacheStoredAt).toLocaleString("vi-VN")}
              </Text>
            </View>
          ) : null}
          {/* Lỗi nằm NGOÀI khối gấp: nó nói về lượt tải vừa rồi, không phải về
              nội dung nhiệm vụ, nên gấp mất là người dùng ngồi nhìn dữ liệu cũ
              mà không biết lượt làm mới đã hỏng. */}
          {error ? <Text style={[styles.errorText, { marginBottom: 12 }]}>{error}</Text> : null}

          {completed ? (
            <>
              <CompletedReportPanel token={token} mission={mission} />
              {/* Đội đã giao xong thì việc của kho chưa hết: phao, đèn pin, loa cầm
                  tay là hàng tái sử dụng, phải quay về kho rồi mới khép sổ được.
                  Trước đây điện thoại không có chỗ nào ký việc đó, nên kho dùng
                  máy phải mở trang web mới đóng được nhiệm vụ — mà kho thì làm
                  việc ngay tại kệ hàng, bằng điện thoại.

                  Hỏi thẳng thành HAI lựa chọn thay vì chỉ bày một nút "xác nhận":
                  câu trả lời thường gặp lúc mới giao xong là "chưa về", và một
                  màn hình chỉ có nút đồng ý thì người đang vội bấm nó cho xong. */}
              {role === "WAREHOUSE" &&
              (mission.status === "COMPLETED" ||
                // Nhiệm vụ không có gì để thu hồi mà đã bị đẩy sang RETURNED (kho
                // lỡ bấm xác nhận lúc còn bày nút): vẫn phải đọc ra "không cần
                // trả", chứ không phải "đã nhận lại vật tư" — câu đó khai một lượt
                // thu hồi chưa từng xảy ra.
                (mission.status === "RETURNED" && mission.hasReturnableSupplies === false)) ? (
                <SuppliesReturnPanel
                  pending={returnPending === true}
                  busy={returnBusy}
                  offline={Boolean(cacheStoredAt)}
                  outstanding={outstandingReturns}
                  nothingToReturn={mission.hasReturnableSupplies === false}
                  handedOver={(mission.warehouseRequests ?? []).filter(
                    (request) => (request.pickedUpQuantity ?? 0) > 0,
                  )}
                  onConfirm={() => void confirmSuppliesReturned()}
                  onSubmitCounts={(items) => void submitReturnCounts(items)}
                  onMarkPending={() => void markReturnPending(true)}
                  onReopen={() => void markReturnPending(false)}
                  loadReturnable={() => fetchReturnableSupplies(token, missionId)}
                />
              ) : null}

              {/* Đã khép sổ: nói rõ chứ không chỉ đổi nhãn trạng thái ở cuối trang,
                  vì đây là chỗ vừa nãy còn là câu hỏi. */}
              {role === "WAREHOUSE" &&
              mission.status === "RETURNED" &&
              mission.hasReturnableSupplies !== false ? (
                <View style={local.returnedBox}>
                  <MaterialCommunityIcons name="check-decagram" size={20} color={c.green} />
                  <Text style={local.returnedText}>
                    Kho đã nhận lại vật tư — nhiệm vụ khép lại, không còn bước nào phải làm.
                  </Text>
                </View>
              ) : null}

              {/* Một nút duy nhất cho cả mảng nội dung cũ: bản đồ, tuyến lấy hàng
                  và bảng vật tư đều là chuyện trước lúc giao xong. Gấp riêng từng
                  khối thì người muốn đối chiếu lại phải bấm ba lần. */}
              <Pressable
                onPress={() => setDetailsOpenChoice(!detailsOpen)}
                accessibilityRole="button"
                accessibilityState={{ expanded: detailsOpen }}
                style={local.detailsToggle}
              >
                <MaterialCommunityIcons
                  name={detailsOpen ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={c.primary}
                />
                <Text style={local.detailsToggleText}>
                  {detailsOpen ? "Thu gọn chi tiết nhiệm vụ" : "Xem lại chi tiết nhiệm vụ"}
                </Text>
              </Pressable>
            </>
          ) : null}

          {detailsOpen ? (
            <>
              <MissionHero mission={mission} role={role} warehouseId={warehouseId} />

              <View style={styles.factRow}>
                <Fact
                  label="Nhận lúc"
                  value={mission.createdAt ? formatLongTime(mission.createdAt) : "—"}
                />
                <Fact label="Thời lượng" value={`${mission.durationHours} giờ`} />
                <Fact label="Đáp ứng" value={`${mission.fulfillment}%`} />
              </View>

              {/* LỰC LƯỢNG HIỆN TRƯỜNG: chỗ nào, đi đường nào, ghé kho nào lấy gì.
              Đặt NGAY SAU phần tóm tắt tình huống vì đó là thứ họ mở nhiệm vụ ra
              để tìm; bảng vật tư tổng ở dưới chỉ để đối chiếu lại cho đủ. */}
              {fieldForce ? (
                <>
                  <MissionMap data={mapData} loading={routesLoading && routes.length === 0} />
                  <SectionToggle
                    title={`Điểm lấy vật tư${pickupStops.length > 0 ? ` (${pickupStops.length} kho)` : ""}`}
                    open={pickupPlanOpen}
                    onToggle={() => setPickupPlanOpenChoice(!pickupPlanOpen)}
                  >
                    <PickupPlanSection
                      hideTitle
                      stops={pickupStops}
                      loading={routesLoading && pickupStops.length === 0}
                    />
                  </SectionToggle>
                </>
              ) : null}

              {/* Kho chỉ thấy MỘT trong hai bảng, không bao giờ cả hai.
                  - Chưa phát hành tới kho này: bảng "Vật tư cần mang" của phương
                    án, để họ biết trước sẽ phải soạn những gì.
                  - Đang nợ hàng: giấu bảng phương án đi, chỉ còn bảng việc phải
                    làm bên dưới. Hai bảng liệt kê gần như cùng một danh sách vật
                    dụng với hai bộ số khác nhau (theo phương án và theo phiếu
                    xuất) — người đứng bốc hàng nhìn hai bảng cạnh nhau không biết
                    phải cân theo cột nào.
                  - Đã ký nhận xong: bảng việc biến mất, bảng phương án quay lại
                    nhưng đổi vai — nay nó là BIÊN BẢN, ghi số thực người đi lấy đã
                    ký nhận chứ không phải số dự kiến. */}
              {role === "WAREHOUSE" && ownStage !== "NONE" ? (
                ownStage === "HANDED_OVER" ? (
                  <ExportedSuppliesSection requests={ownRequests} />
                ) : null
              ) : fieldForce ? (
                <SectionToggle
                  title={`Vật tư cần mang (${mission.requirements.length})`}
                  open={suppliesOpen}
                  onToggle={() => setSuppliesOpenChoice(!suppliesOpen)}
                >
                  <SuppliesSection hideTitle requirements={mission.requirements} />
                </SectionToggle>
              ) : (
                <SuppliesSection requirements={mission.requirements} />
              )}

              {role === "WAREHOUSE" &&
              (mission.warehouseRequests?.length ?? 0) > 0 &&
              ownStage !== "HANDED_OVER" ? (
                <WarehouseMaterialRequestPanel
                  requests={mission.warehouseRequests ?? []}
                  notes={warehouseNotes}
                  busyRequestId={warehouseActionId}
                  onNoteChange={(requestId, note) =>
                    setWarehouseNotes((current) => ({ ...current, [requestId]: note }))
                  }
                  onAction={(kind, request) => void updateWarehouseRequest(kind, request)}
                  onPickedQuantityChange={(requestId, value) =>
                    setPickedQuantities((current) => ({ ...current, [requestId]: value }))
                  }
                  pickedQuantities={pickedQuantities}
                  offline={Boolean(cacheStoredAt)}
                  assignedWarehouseId={warehouseId}
                  onBulkAction={(kind, rows) => void runBulkWarehouseAction(kind, rows)}
                  bulkBusy={bulkBusy}
                />
              ) : null}

              {/* Ô báo kết quả chỉ hiện khi nhiệm vụ THẬT SỰ đóng được: kho đã sẵn
              sàng và máy đang có mạng. Nút bấm vào là báo lỗi còn tệ hơn không
              có nút, nhất là với người đang đứng ngoài mưa. */}
              {fieldForce && !cacheStoredAt && pickupStage === "PICKED_UP" ? (
                <DeliveryReportPanel
                  text={resultText}
                  onChangeText={setResultText}
                  photos={resultPhotos}
                  onAddPhoto={() => setCameraOpen(true)}
                  onPickPhoto={() => void pickEvidenceFromLibrary()}
                  onRemovePhoto={(id) =>
                    setResultPhotos((current) => removeEvidencePhoto(current, id))
                  }
                  onVoice={() => void toggleFieldVoice()}
                  onSubmit={() => void submitDeliveryReport()}
                  voiceAvailable={isRecordingSupported()}
                  recording={fieldRecording}
                  voiceBusy={fieldVoiceBusy}
                  submitting={completing}
                />
              ) : null}

              <View style={{ marginTop: 20 }}>
                {/* Nhãn trạng thái ĐỔI MÀU theo chặng của chính người đang xem.
                Với người đi giao, "kho đã xuất xong" không phải một dòng trạng
                thái để đọc cho biết — đó là hiệu lệnh xuất phát, nên nó phải bắt
                mắt khác hẳn lúc còn phải ngồi chờ. */}
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        fieldForce && warehousesToVisit.length > 0
                          ? "rgba(21,128,61,0.12)"
                          : c.surfaceAlt,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: fieldForce && warehousesToVisit.length > 0 ? c.green : c.text },
                    ]}
                  >
                    {/* Gọi ĐÍCH DANH kho đã xong. "Kho đã chuẩn bị xong" nói chung
                        chung thì người đọc vẫn phải mở danh sách điểm lấy hàng ra
                        dò xem là kho nào — mà câu này tồn tại chính để họ khỏi phải
                        dò. Xong hết thì gộp lại một câu, vì lúc đó liệt kê tên
                        chẳng thêm gì. */}
                    {fieldForce && warehousesToVisit.length > 0
                      ? allWarehousesReady
                        ? "Tất cả các kho đã chuẩn bị xong — hãy đến lấy"
                        : `${warehousesToVisit.map((state) => state.name).join(", ")} đã chuẩn bị xong — hãy đến lấy`
                      : (STATUS_LABEL[mission.status] ?? mission.status)}
                  </Text>
                </View>
                <Text style={[styles.emptyText, { marginTop: 10, textAlign: "left" }]}>
                  {allWarehousesReady
                    ? "Các kho đã chuẩn bị xong vật tư. Việc liên hệ và triển khai do con người quyết định ngoài thực tế."
                    : "Bạn nhận thông tin phương án và tự đến các điểm lấy vật tư; ứng dụng không phân công cá nhân hoặc đội."}
                </Text>
                {/* Nói thẳng vì sao CHƯA có ô báo kết quả, và điều gì sẽ mở nó ra.
                Không có dòng này thì người đi hiện trường mở nhiệm vụ ra chỉ thấy
                trống, và "trống" đọc ra thành "app hỏng" chứ không phải "chưa tới
                lượt mình". */}
                {fieldForce && !cacheStoredAt && !completed ? (
                  <Text
                    style={[
                      styles.emptyText,
                      { marginTop: 8, textAlign: "left" },
                      warehousesToVisit.length > 0 && { color: c.green, fontWeight: "700" },
                    ]}
                  >
                    {/* Câu này phải nói đúng ĐIỀU KIỆN mở ô báo kết quả, vì nó là
                        thứ duy nhất giải thích khoảng trống bên dưới. Điều kiện đó
                        là chữ ký nhận ở MỌI kho, không phải việc các kho xuất xong. */}
                    {warehousesToVisit.length > 0
                      ? allWarehousesReady
                        ? "Tới các kho nhận hàng. Người giữ kho bấm ký nhận sau khi bàn giao — ký đủ mọi kho thì ô báo cáo kết quả hiện ra."
                        : "Tới kho đã chuẩn bị xong để nhận trước phần của kho đó; các kho còn lại vẫn đang soạn. Ô báo cáo kết quả hiện ra khi đã ký nhận đủ mọi kho."
                      : pickupStates.length > 0
                        ? "Các kho đang chuẩn bị. Kho nào xong trước sẽ hiện ở đây ngay, không phải chờ đủ cả nhóm."
                        : ""}
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      ) : null}

      <EvidenceCamera
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptured={(dataBase64) => {
          setCameraOpen(false);
          keepEvidencePhotos([dataBase64]);
        }}
        onError={(message) => {
          setCameraOpen(false);
          setError(message);
        }}
      />
    </View>
  );
}

function WarehouseMaterialRequestPanel({
  requests,
  notes,
  busyRequestId,
  onNoteChange,
  onAction,
  onPickedQuantityChange,
  pickedQuantities,
  offline,
  assignedWarehouseId,
  onBulkAction,
  bulkBusy,
}: {
  requests: WarehouseMaterialRequest[];
  notes: Record<string, string>;
  busyRequestId: string | null;
  onNoteChange: (requestId: string, note: string) => void;
  onAction: (
    kind: "accept" | "prepare" | "discrepancy" | "pickup",
    request: WarehouseMaterialRequest,
  ) => void;
  pickedQuantities: Record<string, string>;
  onPickedQuantityChange: (requestId: string, value: string) => void;
  offline: boolean;
  /** Kho của chính người đang xem — chỉ dòng của kho này mới làm gộp được. */
  assignedWarehouseId?: string | null;
  onBulkAction: (kind: BulkActionKind, rows: WarehouseMaterialRequest[]) => void;
  bulkBusy: boolean;
}) {
  // Đếm cả khoản đã ký nhận: hàng đã có người mang đi thì đương nhiên kho đã
  // soạn xong. Đếm thiếu là kho vừa làm xong lại lùi về "chưa xong".
  const prepared = requests.filter(
    (request) => request.status === "PREPARED" || request.status === "PICKED_UP",
  ).length;
  /*
    Nút làm GỘP, chỉ cho dòng của CHÍNH kho mình.
    
    Một nhiệm vụ lớn huy động năm kho; bấm hộ kho khác thì máy chủ chặn, và người
    dùng nhận một câu báo lỗi cho việc lẽ ra phần mềm phải tự biết. Cùng điều kiện
    với bản web — quy tắc ba mốc nối đuôi nằm trong `planBulkAction` ở gói dùng
    chung, một bản cho cả hai màn hình.
  */
  const bulkTargets = assignedWarehouseId
    ? requests.filter((request) => request.warehouseId === assignedWarehouseId)
    : [];
  const bulk = planBulkAction(bulkTargets, (request) => pickedQuantities[request.id] ?? "");
  const progress = warehouseProgress(requests);
  const bulkDisabled = offline || bulkBusy || bulk.kind === null || bulk.rows.length === 0;

  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.sectionTitle}>
        Chuẩn bị theo vật tư ({prepared}/{requests.length})
      </Text>
      <Text style={[styles.emptyText, { textAlign: "left", marginBottom: 10 }]}>
        Tiếp nhận từng dòng, kiểm tra lô thực tế rồi mới xác nhận xuất. Mỗi dòng chỉ xuất một lần.
      </Text>

      {/*
        KHO NÀO CÒN NỢ — khối quan trọng nhất của cả bảng này.

        Một nhiệm vụ huy động nhiều kho. Kho mình làm xong hết phần của mình mà
        nhiệm vụ vẫn ghi "Chờ kho chuẩn bị", người trực đọc thành "app hỏng" hoặc
        "bấm không ăn" — trong khi sự thật là một kho khác chưa ai đụng tới. Con
        số gộp không nói được điều đó; phải gọi thẳng tên kho ra thì họ mới biết
        cần gọi điện cho ai.
      */}
      {progress.length > 1 ? (
        <View style={{ marginBottom: 12, gap: 6 }}>
          {progress.map((row) => (
            <View
              key={row.warehouseId}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderWidth: 1,
                borderColor: row.done ? c.green : c.amber,
                backgroundColor: row.done ? "rgba(34,197,94,0.10)" : "rgba(234,122,18,0.10)",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 9,
              }}
            >
              <Text style={{ color: c.text, fontSize: 13, fontWeight: "800", flexShrink: 1 }}>
                {row.warehouseId === assignedWarehouseId ? `${row.name} (kho mình)` : row.name}
              </Text>
              <Text
                style={{
                  color: row.done ? c.green : c.amber,
                  fontSize: 12,
                  fontWeight: "800",
                }}
              >
                {row.done
                  ? "✓ đội đã ký nhận đủ"
                  : row.awaitingPickup
                    ? "đã xuất, chờ đội tới lấy"
                    : `còn ${row.total - row.prepared}/${row.total} chưa xuất`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Một nút duy nhất, đúng mốc kế tiếp. Bày cả ba cùng lúc thì người dùng
          phải tự đoán bấm cái nào trước, mà bấm sai thứ tự là máy chủ chặn. */}
      {bulk.kind && !offline ? (
        <View style={{ marginBottom: 12 }}>
          <Pressable
            disabled={bulkDisabled}
            onPress={() => onBulkAction(bulk.kind as BulkActionKind, bulk.rows)}
            accessibilityRole="button"
            style={[styles.actionButton, { opacity: bulkDisabled ? 0.6 : 1 }]}
          >
            <Text style={styles.actionButtonText}>
              {bulkBusy
                ? "Đang xử lý…"
                : `${BULK_ACTION_LABEL[bulk.kind]} (${bulk.rows.length} dòng)`}
            </Text>
          </Pressable>
          {/* Nói rõ vì sao còn dòng ở lại. Lặng lẽ bỏ qua thì người dùng bấm xong
              tưởng đã hết, trong khi vẫn còn khoản hàng chưa ai ký. */}
          {bulk.partialPickupCount > 0 ? (
            <Text style={[styles.emptyText, { textAlign: "left", marginTop: 6 }]}>
              {bulk.partialPickupCount} dòng khai lấy thiếu — phải ký riêng từng dòng kèm lý do.
            </Text>
          ) : null}
        </View>
      ) : null}
      {requests.map((request) => {
        const busy = busyRequestId === request.id;
        /*
          Chỉ dòng của CHÍNH kho mình mới có nút.
          
          Máy chủ vốn đã chặn theo kho của người gọi, nên bấm vào dòng của kho
          khác chỉ nhận về một câu báo lỗi — mà người dùng thì đọc thành "app
          hỏng". Cùng điều kiện với bản web (`isOwnWarehouse`).
        */
        const isOwnWarehouse = !assignedWarehouseId || request.warehouseId === assignedWarehouseId;
        return (
          <View
            key={request.id}
            style={{
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor:
                request.status === "PICKED_UP"
                  ? c.green
                  : request.status === "PREPARED"
                    ? c.amber
                    : c.border,
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: "800" }}>
                  {request.itemName}
                </Text>
                <Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{request.sku}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: "800" }}>
                  {request.status === "PICKED_UP"
                    ? (request.pickedUpQuantity ?? 0)
                    : request.status === "PREPARED"
                      ? request.preparedQuantity
                      : request.requestedQuantity}{" "}
                  {request.unit}
                </Text>
                <Text
                  style={{
                    color:
                      request.status === "PICKED_UP"
                        ? c.green
                        : request.status === "PREPARED"
                          ? c.amber
                          : c.muted,
                    fontSize: 11,
                    fontWeight: "800",
                    marginTop: 3,
                  }}
                >
                  {warehouseRequestStatus(request.status)}
                </Text>
              </View>
            </View>

            {request.adminNote ? (
              <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 8 }}>
                Điều phối: {request.adminNote}
              </Text>
            ) : null}
            {request.warehouseNote ? (
              <Text style={{ color: c.amber, fontSize: 12, lineHeight: 18, marginTop: 8 }}>
                Đã báo: {request.warehouseNote}
              </Text>
            ) : null}

            {request.status === "PICKED_UP" ? (
              <Text
                style={{
                  color:
                    (request.pickedUpQuantity ?? 0) < request.preparedQuantity ? c.amber : c.green,
                  fontSize: 12,
                  lineHeight: 18,
                  marginTop: 8,
                  fontWeight: "700",
                }}
              >
                Đã ký nhận {request.pickedUpQuantity ?? 0}/{request.preparedQuantity} {request.unit}
                {(request.pickedUpQuantity ?? 0) < request.preparedQuantity
                  ? ` — thiếu ${request.preparedQuantity - (request.pickedUpQuantity ?? 0)}. Lý do: ${request.pickupNote ?? "không ghi"}`
                  : " (đủ)"}
              </Text>
            ) : null}

            {/* KÝ NHẬN LẤY HÀNG — màn hình của đội hiện trường.
                Họ làm việc trên điện thoại chứ không ngồi máy tính, nên thiếu ở
                đây là thiếu đúng chỗ người ta dùng. Để trống ô số nghĩa là lấy
                đủ: lấy đủ mới là trường hợp thường gặp, bắt gõ lại đúng con số
                đã hiện sẵn chỉ tạo thêm một chỗ để gõ nhầm. */}
            {request.status === "PREPARED" && isOwnWarehouse && !offline ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: c.text, fontSize: 12, fontWeight: "800", marginBottom: 6 }}>
                  Ký nhận đã lấy hàng
                </Text>
                <TextInput
                  accessibilityLabel={`Số thực lấy của ${request.itemName}`}
                  keyboardType="number-pad"
                  onChangeText={(text) => onPickedQuantityChange(request.id, text)}
                  placeholder={`Số thực lấy (để trống = đủ ${request.preparedQuantity})`}
                  placeholderTextColor={c.muted}
                  style={[styles.reasonInput, { marginBottom: 8 }]}
                  value={pickedQuantities[request.id] ?? ""}
                />
                <TextInput
                  accessibilityLabel={`Lý do thiếu của ${request.itemName}`}
                  maxLength={1_000}
                  onChangeText={(text) => onNoteChange(request.id, text)}
                  placeholder="Thiếu thì ghi rõ vì sao (kho hết, xe không chở hết…)"
                  placeholderTextColor={c.muted}
                  style={[styles.reasonInput, { marginBottom: 8 }]}
                  value={notes[request.id] ?? ""}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => onAction("pickup", request)}
                  style={[styles.actionButton, { opacity: busy ? 0.6 : 1 }]}
                >
                  <Text style={styles.actionButtonText}>
                    {busy ? "Đang gửi…" : "Ký nhận đã lấy hàng"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {request.status !== "PREPARED" &&
            request.status !== "PICKED_UP" &&
            isOwnWarehouse &&
            !offline ? (
              <>
                <TextInput
                  value={notes[request.id] ?? ""}
                  onChangeText={(text) => onNoteChange(request.id, text)}
                  placeholder="Ghi chú tiếp nhận hoặc mô tả thiếu/sai"
                  placeholderTextColor={c.muted}
                  multiline
                  maxLength={1_000}
                  style={[styles.reasonInput, { marginTop: 10, marginBottom: 8 }]}
                  accessibilityLabel={`Ghi chú cho ${request.itemName}`}
                />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Pressable
                    disabled={busy}
                    onPress={() =>
                      onAction(request.status === "PENDING" ? "accept" : "prepare", request)
                    }
                    accessibilityRole="button"
                    style={[styles.actionButton, { flexGrow: 1, opacity: busy ? 0.6 : 1 }]}
                  >
                    <Text style={styles.actionButtonText}>
                      {busy
                        ? "Đang xử lý…"
                        : request.status === "PENDING"
                          ? "Tiếp nhận"
                          : "Xác nhận xuất"}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    onPress={() => onAction("discrepancy", request)}
                    accessibilityRole="button"
                    style={{
                      borderWidth: 1,
                      borderColor: c.amber,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: c.amber, fontSize: 13, fontWeight: "800" }}>
                      Báo thiếu / sai
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function warehouseRequestStatus(status: WarehouseMaterialRequest["status"]): string {
  if (status === "PENDING") return "CHỜ TIẾP NHẬN";
  if (status === "ACCEPTED") return "ĐÃ TIẾP NHẬN";
  // "Đã soạn" và "đã có người cầm đi" là hai việc khác nhau, và khoảng giữa hai
  // việc ấy chính là nơi hàng bị thiếu mà không ai ghi lại.
  if (status === "PREPARED") return "CHỜ NGƯỜI LẤY";
  return "ĐÃ KÝ NHẬN";
}

/**
 * Thẻ đầu màn chi tiết — nói ĐÚNG những gì thẻ trong danh sách đã nói, cùng thứ
 * tự, cùng chữ, cùng màu.
 *
 * Trước đây hai thẻ kể hai câu chuyện khác nhau về cùng một nhiệm vụ: danh sách
 * nhấn "Cần tiếp nhận" (việc phải làm, chữ cam) còn thẻ này nhấn "CHƯA NGUY CẤP"
 * (mức nguy, nền xanh). Người trực đọc danh sách rồi mở ra, thấy một màn hình
 * nói giọng khác hẳn, và phải tự nối hai thứ lại với nhau.
 *
 * Chặng việc tính theo VAI người đang đọc, đúng cùng một hàm mà danh sách dùng —
 * trưởng thôn đọc phiếu của chính kho mình, đội cứu hộ đọc chặng chung.
 */
function MissionHero({
  mission,
  role,
  warehouseId,
}: {
  mission: MissionDetail;
  role: string;
  warehouseId?: string | null;
}) {
  const disaster = disasterOf(mission.incidentType);
  const danger = assessDanger(mission.incidentType, mission.affectedPeople);
  const stage = missionStageForViewer(mission, role, warehouseId);
  const stageText = missionStageLabel(role, stage);
  const stageNeedsAction = missionStageNeedsAction(role, stage);
  const place = missionPlaceLabel(mission);

  return (
    <View style={[styles.hero, { backgroundColor: danger.bg, borderColor: danger.stripe }]}>
      {/* KHÔNG lặp lại số hiệu ở đây: thanh tiêu đề ngay phía trên đã ghi "Chi
          tiết nhiệm vụ số 2", nên thẻ ghi thêm "Nhiệm vụ số 2" là đọc hai lần
          cùng một câu, và nó chiếm mất dòng đầu — dòng mắt nhìn tới trước nhất.
          Thẻ ngoài danh sách thì vẫn giữ số hiệu, vì ở đó không có tiêu đề nào
          nói hộ.

          Mức nguy cũng bỏ khỏi thẻ này: nó đã nằm trong nền và viền của chính
          thẻ (`danger.bg`, `danger.stripe`), và dòng chặng việc ngay dưới mới là
          thứ nói cho người trực biết phải làm gì. */}

      {/* VIỆC PHẢI LÀM, viết theo vai người đang đọc — cùng câu chữ và cùng màu
          nhấn với thẻ ngoài danh sách. */}
      <Text style={[styles.heroStage, stageNeedsAction && { color: c.amber }]}>{stageText}</Text>

      <View style={styles.heroDisaster}>
        <Text style={styles.heroIcon}>{disaster.icon}</Text>
        <Text style={styles.heroDisasterName}>{disaster.label}</Text>
      </View>
      {place ? <Text style={styles.heroLocation}>📍 {place}</Text> : null}

      <View style={styles.heroPeopleRow}>
        <Text style={styles.heroPeopleNumber}>{mission.affectedPeople}</Text>
        <Text style={styles.heroPeopleUnit}>người gặp nạn</Text>
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factBox}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

/**
 * Ô BÁO KẾT QUẢ ở cuối màn nhiệm vụ — bước cuối của người đi giao.
 *
 * Cả lời kể lẫn ảnh đều để trống được. Người vừa lội nước về có thể chẳng còn gì
 * đáng kể ngoài "đã giao xong"; bắt nhập cho đủ ô chỉ đẻ ra những dòng ghi chú
 * vô nghĩa, còn thứ thật sự cần ghi nhận là nhiệm vụ đã đóng. Vì vậy nút xác
 * nhận KHÔNG BAO GIỜ bị khoá vì ô trống — nó chỉ khoá lúc đang gửi.
 *
 * Chỉ có một đường ra: đã hoàn thành. Chưa xong thì người ta còn ngoài đường,
 * không mở màn này ra để báo dở dang.
 */
function DeliveryReportPanel({
  text,
  onChangeText,
  photos,
  onAddPhoto,
  onPickPhoto,
  onRemovePhoto,
  onVoice,
  onSubmit,
  voiceAvailable,
  recording,
  voiceBusy,
  submitting,
}: {
  text: string;
  onChangeText: (text: string) => void;
  photos: EvidencePhoto[];
  onAddPhoto: () => void;
  onPickPhoto: () => void;
  onRemovePhoto: (id: string) => void;
  onVoice: () => void;
  onSubmit: () => void;
  voiceAvailable: boolean;
  recording: boolean;
  voiceBusy: boolean;
  submitting: boolean;
}) {
  const full = photos.length >= MAX_EVIDENCE_PHOTOS;
  return (
    <View style={local.reportBox}>
      <Text style={styles.reasonTitle}>Báo cáo kết quả</Text>
      <Text style={[styles.emptyText, { textAlign: "left", marginBottom: 8 }]}>
        Kể lại kết quả tại điểm giao và chụp ảnh làm bằng chứng. Cả hai đều không bắt buộc — không
        có gì để ghi thì cứ bấm xác nhận.
      </Text>
      <TextInput
        style={styles.reasonInput}
        value={text}
        onChangeText={onChangeText}
        multiline
        placeholder="Ví dụ: đã giao đủ cho 100 người tại nhà văn hoá thôn, có trưởng thôn ký nhận"
        placeholderTextColor={c.muted}
        accessibilityLabel="Kết quả thực hiện nhiệm vụ"
      />

      <View style={local.photoHeader}>
        <Text style={local.photoTitle}>
          Ảnh bằng chứng ({photos.length}/{MAX_EVIDENCE_PHOTOS})
        </Text>
        <View style={local.photoActions}>
          <Pressable
            onPress={onAddPhoto}
            disabled={full || submitting}
            accessibilityRole="button"
            accessibilityLabel="Chụp ảnh bằng chứng"
            style={[local.photoAdd, (full || submitting) && local.disabled]}
          >
            <MaterialCommunityIcons name="camera-plus-outline" size={16} color={c.primary} />
            <Text style={local.photoAddText}>{full ? "Đã đủ" : "Chụp ảnh"}</Text>
          </Pressable>
          {/* Ảnh đã có sẵn trong máy: nhiều người chụp lúc bàn giao rồi mới mở
              app ra báo khi về tới chỗ có sóng. */}
          <Pressable
            onPress={onPickPhoto}
            disabled={full || submitting}
            accessibilityRole="button"
            accessibilityLabel="Chọn ảnh bằng chứng từ thư viện"
            style={[local.photoAdd, (full || submitting) && local.disabled]}
          >
            <MaterialCommunityIcons name="image-multiple-outline" size={16} color={c.primary} />
            <Text style={local.photoAddText}>Thư viện</Text>
          </Pressable>
        </View>
      </View>

      {photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={local.photoStrip}>
          {photos.map((photo) => (
            <View key={photo.id} style={local.thumbWrap}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${photo.dataBase64}` }}
                style={local.thumb}
                accessibilityLabel="Ảnh bằng chứng đã chụp"
              />
              {/* Bỏ được từng tấm: ảnh chụp vội ngoài hiện trường hay ra một tấm
                  nhoè hoặc chụp nhầm mặt đất, mà gửi rồi thì không rút lại được. */}
              <Pressable
                onPress={() => onRemovePhoto(photo.id)}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Bỏ ảnh này"
                style={local.thumbRemove}
              >
                <MaterialCommunityIcons name="close" size={14} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <Text style={local.summary}>{deliveryReportSummary(text, photos.length)}</Text>

      <View style={styles.actionRow}>
        {voiceAvailable ? (
          <Pressable
            style={[styles.btnReject, (voiceBusy || submitting) && local.disabled]}
            onPress={onVoice}
            disabled={voiceBusy || submitting}
            accessibilityRole="button"
            accessibilityLabel={
              recording ? "Dừng ghi âm và chuyển thành chữ" : "Đọc kết quả bằng giọng nói"
            }
          >
            <Text style={styles.btnRejectText}>
              {voiceBusy ? "Đang nhận dạng…" : recording ? "Dừng ghi âm" : "Đọc kết quả"}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.btnAccept, submitting && local.disabled]}
          onPress={onSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Xác nhận đã hoàn thành nhiệm vụ"
        >
          <Text style={styles.btnAcceptText}>
            {submitting ? "Đang gửi…" : "Xác nhận đã hoàn thành"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Biên nhận của lần báo hoàn thành — thứ duy nhất còn mở sau khi nhiệm vụ đóng.
 *
 * Gửi xong rồi thì câu hỏi còn lại chỉ là "mình đã gửi đi những gì": lời kể nào,
 * mấy tấm ảnh, ảnh chụp cái gì. Trước đây màn hình chỉ nói "đã gửi kèm 1 ảnh —
 * xem trên máy điều phối", tức là người vừa gửi không xem lại được chính thứ
 * mình gửi, mà đó lại là bằng chứng họ phải chịu trách nhiệm.
 *
 * Ảnh KHÔNG tải sẵn. Mỗi tấm vài trăm KB, và người mở lại báo cáo thường vẫn
 * đứng đúng chỗ sóng yếu đã chụp nó — cũng chính là lý do máy chủ để ảnh ở một
 * đường riêng thay vì nhét vào JSON nhiệm vụ. Bấm xem thì mới tải.
 */
function CompletedReportPanel({ token, mission }: { token: string; mission: MissionDetail }) {
  // Giữ nguyên tham chiếu qua các lần vẽ lại: `?? []` sinh mảng mới mỗi lần, mà
  // mảng đó nằm trong phụ thuộc của hàm tải ảnh bên dưới.
  const photos = useMemo(() => mission.deliveryPhotos ?? [], [mission.deliveryPhotos]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [uris, setUris] = useState<Record<string, string>>({});
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<MissionDeliveryPhoto | null>(null);
  const missionId = mission.id;

  const loadPhotos = useCallback(async () => {
    setGalleryOpen(true);
    setPhotoError(null);
    setLoadingPhotos(true);
    try {
      // Tải song song: nhiều nhất sáu tấm, chờ lần lượt thì tấm cuối về sau cả
      // phút trên 3G. Một tấm hỏng làm cả mẻ báo lỗi, nên có nút thử lại bên dưới.
      const loaded = await Promise.all(
        photos.map(
          async (photo) =>
            [photo.id, await fetchMissionDeliveryPhoto(token, missionId, photo.id)] as const,
        ),
      );
      setUris(Object.fromEntries(loaded));
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Không tải được ảnh bằng chứng");
    } finally {
      setLoadingPhotos(false);
    }
  }, [photos, token, missionId]);

  return (
    <View style={local.doneBox}>
      <View style={local.doneHead}>
        <MaterialCommunityIcons name="check-decagram" size={20} color={c.green} />
        <Text style={local.doneTitle}>Đã gửi báo cáo hoàn thành</Text>
      </View>
      <Text style={local.doneOutcome}>
        Kết quả: {deliveryOutcomeLabel(mission.deliveryOutcome)}
      </Text>

      <Text style={local.doneLabel}>Lời kể đã gửi</Text>
      {mission.deliveryNote?.trim() ? (
        <Text style={local.doneNote}>{mission.deliveryNote}</Text>
      ) : (
        /* Nói rõ "không gửi gì" thay vì để trống: ô trống đọc ra thành "chưa tải
           xong", và người ta sẽ ngồi chờ một thứ không bao giờ tới. */
        <Text style={local.doneEmpty}>Không kèm lời kể nào.</Text>
      )}

      <Text style={local.doneLabel}>Ảnh bằng chứng ({photos.length})</Text>
      {photos.length === 0 ? (
        <Text style={local.doneEmpty}>Không kèm ảnh nào.</Text>
      ) : !galleryOpen ? (
        <Pressable
          onPress={() => void loadPhotos()}
          accessibilityRole="button"
          accessibilityLabel={`Xem ${photos.length} ảnh bằng chứng đã gửi`}
          style={local.photoAdd}
        >
          <MaterialCommunityIcons name="image-multiple-outline" size={16} color={c.primary} />
          <Text style={local.photoAddText}>
            Xem {photos.length} ảnh ·{" "}
            {formatByteSize(photos.reduce((sum, p) => sum + p.byteSize, 0))}
          </Text>
        </Pressable>
      ) : (
        <>
          {loadingPhotos ? (
            <View style={local.photoLoading}>
              <ActivityIndicator color={c.primary} />
              <Text style={local.doneEmpty}>Đang tải ảnh…</Text>
            </View>
          ) : null}
          {photoError ? (
            <View>
              <Text style={styles.errorText}>{photoError}</Text>
              <Pressable onPress={() => void loadPhotos()} accessibilityRole="button">
                <Text style={styles.linkText}>Thử lại</Text>
              </Pressable>
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={local.photoStrip}>
            {photos.map((photo) => {
              const uri = uris[photo.id];
              return (
                <Pressable
                  key={photo.id}
                  onPress={() => (uri ? setViewing(photo) : undefined)}
                  disabled={!uri}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Xem to ảnh bằng chứng đã gửi"
                  style={local.thumbWrap}
                >
                  {uri ? (
                    <Image source={{ uri }} style={local.thumb} />
                  ) : (
                    <View style={[local.thumb, local.thumbPending]} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}

      {/* Xem to trên nền tối: ảnh hiện trường hay chụp trong mưa, thu nhỏ bằng
          con tem thì không đọc nổi biển hiệu hay số lượng hàng trong khung. */}
      <Modal
        visible={viewing !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewing(null)}
      >
        <Pressable
          style={local.viewerBackdrop}
          onPress={() => setViewing(null)}
          accessibilityRole="button"
          accessibilityLabel="Đóng ảnh"
        >
          {viewing && uris[viewing.id] ? (
            <Image
              source={{ uri: uris[viewing.id] }}
              style={local.viewerImage}
              resizeMode="contain"
              accessibilityLabel="Ảnh bằng chứng đã gửi"
            />
          ) : null}
          <Text style={local.viewerHint}>Chạm để đóng</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Dung lượng cho người đang đếm dung lượng 3G, không phải cho máy. */
function formatByteSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Máy ảnh chụp bằng chứng tại chỗ.
 *
 * Chụp thẳng trong ứng dụng chứ không chọn từ thư viện: bằng chứng giao hàng
 * phải là ảnh của chính chuyến đi này. Ảnh cũng đi thẳng từ máy ảnh vào lượt
 * gửi, không lưu lại trên máy — điện thoại công vụ hay được dùng chung.
 */
function EvidenceCamera({
  open,
  onClose,
  onCaptured,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCaptured: (dataBase64: string) => void;
  onError: (message: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const cameraRef = useRef<CameraHandle | null>(null);

  /**
   * Hỏi máy xem chụp được những cỡ nào rồi chọn cỡ vừa đủ.
   *
   * Chạy sau khi máy ảnh sẵn sàng, vì trước đó danh sách cỡ chưa có. Hỏi không
   * được thì bỏ qua — giữ mặc định của máy vẫn chụp được, chỉ nặng hơn.
   */
  async function choosePictureSize() {
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      if (sizes) setPictureSize(pickCaptureSize(sizes));
    } catch {
      // Máy không trả lời được thì giữ mặc định; đây không phải lỗi đáng báo.
    }
  }

  async function capture() {
    if (busy) return;
    setBusy(true);
    try {
      // quality 0.5 trên cỡ ảnh đã chọn ở trên: đủ đọc biển hiệu và mặt hàng, mà
      // vẫn gửi nổi qua sóng 3G. Máy chủ còn nén lại lần nữa về cạnh 1600px, nên
      // chụp to hơn mức này không thêm được chi tiết nào vào tấm ảnh cuối cùng.
      const shot = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.5 });
      if (!shot?.base64) throw new Error("Máy ảnh không trả về ảnh, hãy thử lại.");
      onCaptured(shot.base64);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Không chụp được ảnh");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <View style={local.camera}>
        {!permission ? (
          <ActivityIndicator color={c.amber} size="large" />
        ) : !permission.granted ? (
          <View style={styles.center}>
            <Text style={local.cameraTitle}>Cần quyền máy ảnh để chụp bằng chứng</Text>
            <Pressable
              onPress={() => void requestPermission()}
              accessibilityRole="button"
              style={local.cameraPrimary}
            >
              <Text style={local.cameraPrimaryText}>Cho phép máy ảnh</Text>
            </Pressable>
            <Pressable onPress={onClose} accessibilityRole="button" style={local.cameraSecondary}>
              <Text style={local.cameraSecondaryText}>Đóng</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CompatibleCameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              pictureSize={pictureSize}
              onCameraReady={() => void choosePictureSize()}
            />
            <View style={local.cameraOverlay}>
              <Text style={local.cameraHint}>Chụp hàng đã giao và nơi giao</Text>
              <Pressable
                onPress={() => void capture()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Chụp"
                style={[local.shutter, busy && local.disabled]}
              >
                <MaterialCommunityIcons name="camera" size={28} color="#0f172a" />
              </Pressable>
              <Pressable onPress={onClose} accessibilityRole="button" style={local.cameraSecondary}>
                <Text style={local.cameraSecondaryText}>Đóng</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

/**
 * Lộ trình lấy vật tư của lực lượng hiện trường: kho nào, xa bao nhiêu, mất bao
 * lâu, lấy những món gì, và kho đã soạn xong chưa.
 *
 * Kho GẦN ĐIỂM NẠN xếp trước, đánh số 1, 2, 3 — đọc từ trên xuống là đúng thứ tự
 * nên đi. Không có nút bấm nào ở đây: người đi lấy hàng chỉ xem rồi tự tới kho,
 * còn việc ký xuất là của người giữ kho bấm trên máy của họ.
 */
function PickupPlanSection({
  stops,
  loading,
  hideTitle = false,
}: {
  stops: PickupStop[];
  loading: boolean;
  /** Tiêu đề do khối gập bên ngoài vẽ — không vẽ lần thứ hai ở đây. */
  hideTitle?: boolean;
}) {
  if (loading) {
    return (
      <View style={hideTitle ? undefined : { marginTop: 18 }}>
        {hideTitle ? null : <Text style={styles.sectionTitle}>Điểm lấy vật tư</Text>}
        <View style={styles.skeleton} />
        <View style={styles.skeleton} />
      </View>
    );
  }

  if (stops.length === 0) {
    return (
      <View style={hideTitle ? undefined : { marginTop: 18 }}>
        {hideTitle ? null : <Text style={styles.sectionTitle}>Điểm lấy vật tư</Text>}
        <Text style={[styles.emptyText, { textAlign: "left" }]}>
          Phương án chưa phân bổ vật tư về kho nào. Chờ cơ quan điều phối phát hành, hoặc liên hệ
          trực tiếp nếu đã nhận lệnh đi.
        </Text>
      </View>
    );
  }

  return (
    <View style={hideTitle ? undefined : { marginTop: 18 }}>
      {hideTitle ? null : (
        <Text style={styles.sectionTitle}>Điểm lấy vật tư ({stops.length} kho)</Text>
      )}
      <Text style={[styles.emptyText, { textAlign: "left", marginBottom: 10 }]}>
        Kho gần điểm gặp nạn xếp trước. Tự di chuyển tới kho để nhận hàng; người giữ kho bấm xác
        nhận xuất kho sau khi bàn giao.
      </Text>
      {stops.map((stop, index) => (
        <PickupStopCard key={stop.warehouseId} stop={stop} order={index + 1} />
      ))}
    </View>
  );
}

function PickupStopCard({ stop, order }: { stop: PickupStop; order: number }) {
  const state = pickupStopStateLabel(stop);
  const tone = state.tone === "done" ? c.green : state.tone === "ready" ? c.amber : c.muted;

  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: state.tone === "waiting" ? c.border : tone,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        {/* Số thứ tự đi: kho gần nhất là 1. Nhìn con số là biết ghé đâu trước,
            không phải so từng dòng quãng đường với nhau. */}
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: stop.kind === "HAMLET" ? c.green : c.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>{order}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: "800" }}>{stop.name}</Text>
          <Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>
            {stop.kind === "HAMLET"
              ? "Kho thôn"
              : stop.kind === "CENTRAL"
                ? "Kho trung tâm"
                : "Kho trong xã"}
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            backgroundColor: c.surfaceAlt,
            borderRadius: 8,
            paddingHorizontal: 9,
            paddingVertical: 6,
          }}
        >
          <MaterialCommunityIcons name="map-marker-distance" size={14} color={c.text} />
          <Text style={{ color: c.text, fontSize: 12, fontWeight: "700" }}>
            {formatTravel(stop.distanceKm, stop.etaMinutes)}
          </Text>
        </View>
        <View
          style={{
            borderRadius: 8,
            paddingHorizontal: 9,
            paddingVertical: 6,
            backgroundColor: state.tone === "waiting" ? c.surfaceAlt : `${tone}1A`,
            borderWidth: 1,
            borderColor: state.tone === "waiting" ? c.border : tone,
          }}
        >
          <Text style={{ color: tone, fontSize: 11, fontWeight: "800" }}>{state.label}</Text>
        </View>
      </View>

      <View style={{ marginTop: 10, gap: 8 }}>
        {stop.items.map((item) => {
          const meta = supplyOf(item.sku, item.itemName);
          return (
            <View
              key={item.sku}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  backgroundColor: meta.tint,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 15 }}>{meta.icon}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: "700" }} numberOfLines={2}>
                  {item.itemName}
                </Text>
                <Text style={{ color: c.muted, fontSize: 11, marginTop: 2 }}>
                  {pickupItemStatusLabel(item.status)}
                </Text>
              </View>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: "800", flexShrink: 0 }}>
                {item.quantity} {item.unit}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Tiêu đề mục bấm được để gập/mở.
 *
 * Màn của đội cứu hộ có hai mục dài nối đuôi nhau — điểm lấy hàng và bảng vật
 * dụng — nhưng ở mỗi thời điểm chỉ MỘT trong hai là việc đang làm: chưa lấy hàng
 * thì cần biết đi kho nào, lấy xong rồi thì cần soát lại mang đủ chưa. Mở cả hai
 * là bắt cuộn qua mục không dùng tới, giữa lúc đang đứng ngoài mưa một tay cầm máy.
 *
 * Gập chứ không ẩn: người dùng vẫn mở lại được bất cứ lúc nào, và nhìn tiêu đề là
 * biết ở đó có gì.
 */
function SectionToggle({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={{ marginTop: 18 }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Text style={[styles.sectionTitle, { marginTop: 0, flex: 1 }]}>{title}</Text>
        <MaterialCommunityIcons
          name={open ? "chevron-up" : "chevron-down"}
          size={22}
          color={c.muted}
        />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

/** Danh sách vật tư dạng thẻ trực quan + tóm tắt "đủ / thiếu" ở đầu mục. */
function SuppliesSection({
  requirements,
  hideTitle = false,
}: {
  requirements: MissionDetail["requirements"];
  /** Tiêu đề do khối gập bên ngoài vẽ — không vẽ lần thứ hai ở đây. */
  hideTitle?: boolean;
}) {
  if (requirements.length === 0) {
    return (
      <>
        <Text style={styles.sectionTitle}>Vật tư theo phương án</Text>
        <Text style={styles.emptyText}>Chưa có vật tư trong phương án.</Text>
      </>
    );
  }

  // Thiếu lên trước để Lực lượng hiện trường thấy ngay điều cần chú ý.
  const sorted = [...requirements].sort((a, b) => b.shortage - a.shortage);
  const shortItems = requirements.filter((r) => r.shortage > 0).length;

  return (
    <>
      <View style={styles.suppliesHead}>
        {hideTitle ? (
          <View style={{ flex: 1 }} />
        ) : (
          <Text style={styles.sectionTitle}>Vật tư cần mang ({requirements.length})</Text>
        )}
        {shortItems > 0 ? (
          <View style={styles.shortSummary}>
            <Text style={styles.shortSummaryText}>⚠ Thiếu {shortItems} loại</Text>
          </View>
        ) : (
          <View style={styles.fullSummary}>
            <Text style={styles.fullSummaryText}>✓ Đủ vật tư</Text>
          </View>
        )}
      </View>
      {sorted.map((r) => (
        <SupplyCard key={r.id} req={r} />
      ))}
    </>
  );
}

/**
 * Biên bản những gì kho ĐÃ GIAO, hiện sau khi người đi lấy ký nhận xong.
 *
 * Cùng hình thẻ với "Vật tư cần mang" nhưng đọc theo chiều ngược lại: bảng kia
 * là dự kiến (phương án nói cần bấy nhiêu), bảng này là việc đã rồi (đã soạn bấy
 * nhiêu, người ta ký nhận bấy nhiêu). Số ký nhận mới là con số kho phải trả lời
 * khi có ai hỏi lại, nên nó là con số to nhất trên thẻ.
 *
 * Ký nhận HỤT so với số đã soạn không phải lỗi hiển thị: người đi lấy chở không
 * hết, hoặc đếm lại thấy thiếu. Chỗ đó phải nổi lên kèm lý do đã ghi, vì phần
 * chênh vẫn đang nằm trong kho và ai đó sẽ phải đối chiếu.
 */
function ExportedSuppliesSection({ requests }: { requests: WarehouseMaterialRequest[] }) {
  if (requests.length === 0) return null;
  const shortRows = requests.filter(
    (request) => (request.pickedUpQuantity ?? 0) < request.preparedQuantity,
  ).length;
  const sorted = [...requests].sort((left, right) =>
    left.itemName.localeCompare(right.itemName, "vi"),
  );

  return (
    <>
      <View style={styles.suppliesHead}>
        <Text style={styles.sectionTitle}>Vật tư đã xuất ({requests.length})</Text>
        {shortRows > 0 ? (
          <View style={styles.shortSummary}>
            <Text style={styles.shortSummaryText}>⚠ {shortRows} loại ký nhận hụt</Text>
          </View>
        ) : (
          <View style={styles.fullSummary}>
            <Text style={styles.fullSummaryText}>✓ Đã bàn giao đủ</Text>
          </View>
        )}
      </View>
      {sorted.map((request) => (
        <ExportedSupplyCard key={request.id} request={request} />
      ))}
    </>
  );
}

function ExportedSupplyCard({ request }: { request: WarehouseMaterialRequest }) {
  const meta = supplyOf(request.sku, request.itemName);
  const received = request.pickedUpQuantity ?? 0;
  const prog = supplyProgress(request.preparedQuantity, received);
  const missing = request.preparedQuantity - received;

  return (
    <View style={[styles.supplyCard, { borderLeftColor: prog.color }]}>
      <View style={[styles.supplyIconBox, { backgroundColor: meta.tint }]}>
        <Text style={styles.supplyIcon}>{meta.icon}</Text>
      </View>

      <View style={styles.supplyMain}>
        <View style={styles.supplyTopRow}>
          <Text style={styles.supplyName} numberOfLines={2}>
            {request.itemName}
          </Text>
          <Text style={[styles.supplyStatusText, { color: missing > 0 ? c.red : c.green }]}>
            {missing > 0 ? "Hụt" : "Đã giao"}
          </Text>
        </View>

        <Text style={styles.supplyGroup}>{meta.group}</Text>

        <View style={styles.supplyBarTrack}>
          <View
            style={[
              styles.supplyBarFill,
              { width: `${Math.round(prog.ratio * 100)}%`, backgroundColor: prog.color },
            ]}
          />
        </View>

        <View style={styles.supplyQtyRow}>
          {/* Số ĐÃ KÝ NHẬN đứng trước, số đã soạn làm nền so sánh — đúng thứ tự
              câu hỏi "cuối cùng giao được bao nhiêu / trên bao nhiêu đã soạn". */}
          <Text style={styles.supplyQtyStrong}>
            {received}
            <Text style={styles.supplyQtyMuted}>
              /{request.preparedQuantity} {request.unit} đã soạn
            </Text>
          </Text>
          {missing > 0 ? (
            <Text style={styles.supplyShort}>
              Hụt {missing} {request.unit}
            </Text>
          ) : null}
        </View>
        {missing > 0 ? (
          <Text style={[styles.supplyGroup, { marginTop: 2 }]}>
            Lý do: {request.pickupNote ?? "không ghi"}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Ô xác nhận hoàn trả vật tư, chỉ kho thấy và chỉ sau khi đội đã giao xong.
 *
 * BA câu trả lời, vì thực tế ở kho có ba tình huống khác nhau:
 *
 *   - "Đã hoàn trả đủ": một nút, đóng nhiệm vụ. Trường hợp thường gặp nhất, nên
 *     nó không được bắt ai gõ thêm con số nào.
 *   - "Trả chưa đủ": mở bảng đếm từng dòng. Đội mang về 6 trên 10 cái áo phao là
 *     chuyện bình thường (xe đầy, một phần còn ở điểm tập kết) — trước đây không
 *     có chỗ nào ghi con số 6 đó, nên nó chỉ nằm trong đầu người trực tới lúc
 *     quên mất.
 *   - "Chưa hoàn trả": chưa có gì về cả, chỉ ghi nhớ để màn hình thôi hỏi lại.
 *
 * Ngoại tuyến thì không bày nút ký: nút bấm vào là báo lỗi còn tệ hơn không có
 * nút, nhất là với người đang đứng giữa kho lúc mất sóng.
 */
function SuppliesReturnPanel({
  pending,
  busy,
  offline,
  outstanding,
  nothingToReturn,
  handedOver,
  onConfirm,
  onSubmitCounts,
  onMarkPending,
  onReopen,
  loadReturnable,
}: {
  pending: boolean;
  busy: boolean;
  offline: boolean;
  /** Phần còn thiếu đã ghi nhận ở lượt đếm trước — rỗng là chưa đếm lần nào. */
  outstanding: ReturnableSupply[];
  /** Nhiệm vụ không có vật tư tái sử dụng nào đang nằm ngoài kho. */
  nothingToReturn: boolean;
  /** Những thứ đội đã ký nhận mang đi — để người trực tự đối chiếu kết luận trên. */
  handedOver: WarehouseMaterialRequest[];
  onConfirm: () => void;
  onSubmitCounts: (items: { sku: string; returnedQuantity: number }[]) => void;
  onMarkPending: () => void;
  onReopen: () => void;
  loadReturnable: () => Promise<ReturnableSupply[]>;
}) {
  /** Đang mở bảng đếm từng dòng. */
  const [counting, setCounting] = useState(false);
  const [rows, setRows] = useState<ReturnableSupply[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * Số đang gõ cho từng mã hàng, GIỮ DẠNG CHUỖI.
   *
   * Giữ số thì ô nhập không xoá trắng được: xoá ký tự cuối ra chuỗi rỗng, mà rỗng
   * đổi thành 0 thì con số 0 nhảy lại vào ô ngay dưới ngón tay người đang gõ.
   */
  const [counts, setCounts] = useState<Record<string, string>>({});
  /** Mã hàng đang mở ô nhập; các dòng khác chỉ hiện con số. */
  const [editingSku, setEditingSku] = useState<string | null>(null);

  async function openCounting() {
    setCounting(true);
    setLoadError(null);
    if (rows) return;
    setLoading(true);
    try {
      const items = await loadReturnable();
      setRows(items);
      // Điền sẵn phần đã đếm ở lượt trước; chưa đếm thì để trống chứ không điền 0 —
      // số 0 điền sẵn là một lời khai người dùng chưa hề nói.
      setCounts(
        Object.fromEntries(
          items
            .filter((item) => item.returnedQuantity != null)
            .map((item) => [item.sku, String(item.returnedQuantity)]),
        ),
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Không tải được danh sách vật tư phải thu hồi");
    } finally {
      setLoading(false);
    }
  }

  function submitCounts() {
    if (!rows) return;
    onSubmitCounts(
      rows
        // Dòng chưa gõ gì thì KHÔNG gửi: im lặng khác hẳn với khai "về 0 cái".
        .filter((row) => (counts[row.sku] ?? "").trim() !== "")
        .map((row) => ({ sku: row.sku, returnedQuantity: Number(counts[row.sku]) })),
    );
  }

  /**
   * Nhiệm vụ không có gì để đòi về — chỉ phát đồ tiêu hao.
   *
   * KHÔNG bày nút nào cả, kể cả một nút "khép sổ". Chừng nào còn một nút ở đây
   * thì nó còn là cái bẫy: kho bấm cho xong việc và nhiệm vụ ghi vào sổ một lượt
   * thu hồi chưa từng xảy ra — đúng chuyện đã xảy ra với nhiệm vụ 828, bấm xong
   * thì trạng thái đọc ra "đã trả vật tư" cho một thùng mì tôm.
   *
   * Thay bằng một câu trả lời dứt điểm, kèm ĐÚNG những thứ đã cấp đi để người
   * trực tự đối chiếu — kết luận này đúng hay sai là nhìn danh sách mà biết, chứ
   * không phải tin lời máy.
   */
  if (nothingToReturn) {
    return (
      <View style={local.returnBox}>
        <View style={local.returnHead}>
          <MaterialCommunityIcons name="check-decagram" size={20} color={c.green} />
          <Text style={local.returnTitle}>Không cần hoàn trả vật tư</Text>
        </View>
        <Text style={local.returnHint}>
          Nhiệm vụ này không có vật tư tái sử dụng nào. Toàn bộ phần đã cấp là đồ tiêu hao, phát cho
          dân là xong — kho không phải nhận lại gì.
        </Text>
        {handedOver.length > 0 ? (
          <View style={local.returnOutstanding}>
            <Text style={local.returnOutstandingTitle}>Đã cấp cho đội:</Text>
            {handedOver.map((item) => (
              <Text key={item.id} style={local.returnOutstandingRow}>
                • {item.itemName}: {item.pickedUpQuantity} {item.unit}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={local.returnBox}>
      <View style={local.returnHead}>
        <MaterialCommunityIcons name="package-variant-closed" size={20} color={c.amber} />
        <Text style={local.returnTitle}>Đội cứu hộ đã hoàn trả vật tư chưa?</Text>
      </View>
      <Text style={local.returnHint}>
        Đội đã giao xong tại hiện trường. Phần vật tư tái sử dụng (phao, đèn pin, loa cầm tay…) phải
        về lại kho thì nhiệm vụ mới khép sổ được.
      </Text>

      {/* Phần còn thiếu của lượt đếm trước, hiện ngay cả khi bảng đếm đang đóng:
          đây là khoản nợ đang treo, không phải một chi tiết phải đi tìm. */}
      {outstanding.length > 0 && !counting ? (
        <View style={local.returnOutstanding}>
          <Text style={local.returnOutstandingTitle}>Còn thiếu {outstanding.length} loại:</Text>
          {outstanding.map((item) => (
            <Text key={item.sku} style={local.returnOutstandingRow}>
              • {item.itemName}: thiếu {item.outstandingQuantity} {item.unit} (đã nhận{" "}
              {item.returnedQuantity ?? 0}/{item.handedOverQuantity})
            </Text>
          ))}
        </View>
      ) : null}

      {offline ? (
        <Text style={local.returnOffline}>
          Đang ngoại tuyến — kết nối lại rồi mới ký xác nhận được.
        </Text>
      ) : counting ? (
        <View style={{ marginTop: 12 }}>
          {loading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color={c.amber} />
              <Text style={local.returnHint}>Đang tra phần vật tư phải thu hồi…</Text>
            </View>
          ) : loadError ? (
            <Text style={local.returnError}>{loadError}</Text>
          ) : rows && rows.length === 0 ? (
            <Text style={local.returnHint}>
              Kho của bạn không có vật tư nào cần hoàn trả ở nhiệm vụ này — bấm “Đóng” rồi “Đã hoàn
              trả đủ” để khép sổ.
            </Text>
          ) : (
            <>
              <Text style={local.returnCountHint}>
                Chạm vào số để sửa, hoặc bấm “Đủ” nếu dòng đó về đủ. Dòng nào chưa đếm thì để trống.
              </Text>
              {(rows ?? []).map((row) => {
                const typed = counts[row.sku] ?? "";
                const full = typed !== "" && Number(typed) === row.handedOverQuantity;
                return (
                  <View key={row.sku} style={local.returnRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={local.returnRowName} numberOfLines={2}>
                        {row.itemName}
                      </Text>
                      <Text style={local.returnRowMeta}>
                        Đã giao ra {row.handedOverQuantity} {row.unit}
                        {typed !== "" && Number(typed) < row.handedOverQuantity
                          ? ` · còn thiếu ${row.handedOverQuantity - Number(typed)}`
                          : ""}
                      </Text>
                    </View>
                    {editingSku === row.sku ? (
                      <TextInput
                        style={local.returnInput}
                        value={typed}
                        onChangeText={(value) => {
                          const digits = value.replace(/\D/g, "").slice(0, 7);
                          // Chặn ngay tại chỗ gõ: nhận về nhiều hơn số đã đưa đi là
                          // gõ nhầm, và máy chủ sẽ từ chối cả lượt gửi vì một dòng.
                          const capped =
                            digits === ""
                              ? ""
                              : String(Math.min(Number(digits), row.handedOverQuantity));
                          setCounts((current) => ({ ...current, [row.sku]: capped }));
                        }}
                        onBlur={() => setEditingSku(null)}
                        keyboardType="number-pad"
                        autoFocus
                        accessibilityLabel={`Số ${row.itemName} đã nhận lại`}
                      />
                    ) : (
                      <Pressable
                        onPress={() => setEditingSku(row.sku)}
                        accessibilityRole="button"
                        accessibilityLabel={`Nhập số ${row.itemName} đã nhận lại`}
                        style={local.returnCountBox}
                      >
                        <Text style={local.returnCountText}>{typed === "" ? "—" : typed}</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => {
                        setEditingSku(null);
                        setCounts((current) => ({
                          ...current,
                          [row.sku]: String(row.handedOverQuantity),
                        }));
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: full }}
                      accessibilityLabel={`${row.itemName} đã trả đủ`}
                      style={[local.returnFullChip, full && local.returnFullChipOn]}
                    >
                      <MaterialCommunityIcons
                        name={full ? "check-circle" : "check-circle-outline"}
                        size={16}
                        color={full ? "#FFFFFF" : c.green}
                      />
                      <Text style={[local.returnFullText, full && { color: "#FFFFFF" }]}>Đủ</Text>
                    </Pressable>
                  </View>
                );
              })}
              <View style={local.returnActions}>
                <Pressable
                  onPress={submitCounts}
                  disabled={busy || !rows || rows.length === 0}
                  accessibilityRole="button"
                  style={[local.returnButton, local.returnButtonYes, busy && { opacity: 0.6 }]}
                >
                  <MaterialCommunityIcons name="content-save-outline" size={18} color="#FFFFFF" />
                  <Text style={local.returnButtonYesText}>
                    {busy ? "Đang gửi…" : "Ghi số đã trả"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setCounting(false)}
                  disabled={busy}
                  accessibilityRole="button"
                  style={[local.returnButton, local.returnButtonNo, busy && { opacity: 0.6 }]}
                >
                  <Text style={local.returnButtonNoText}>Đóng</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      ) : pending ? (
        <>
          <Text style={local.returnPending}>
            Đã ghi: CHƯA hoàn trả. Nhiệm vụ vẫn nằm ở bước chờ thu hồi vật tư.
          </Text>
          <Pressable
            onPress={onReopen}
            accessibilityRole="button"
            style={[local.returnButton, local.returnButtonGhost]}
          >
            <Text style={local.returnButtonGhostText}>Đội vừa mang về — xác nhận lại</Text>
          </Pressable>
        </>
      ) : (
        <View style={local.returnActions}>
          <Pressable
            onPress={onConfirm}
            disabled={busy}
            accessibilityRole="button"
            style={[local.returnButton, local.returnButtonYes, busy && { opacity: 0.6 }]}
          >
            <MaterialCommunityIcons name="check-circle-outline" size={18} color="#FFFFFF" />
            <Text style={local.returnButtonYesText}>{busy ? "Đang gửi…" : "Đã hoàn trả đủ"}</Text>
          </Pressable>
          <Pressable
            onPress={() => void openCounting()}
            disabled={busy}
            accessibilityRole="button"
            style={[local.returnButton, local.returnButtonPartial, busy && { opacity: 0.6 }]}
          >
            <MaterialCommunityIcons name="scale-balance" size={18} color={c.amber} />
            <Text style={local.returnButtonPartialText}>Trả chưa đủ</Text>
          </Pressable>
          <Pressable
            onPress={onMarkPending}
            disabled={busy}
            accessibilityRole="button"
            style={[local.returnButton, local.returnButtonNo, busy && { opacity: 0.6 }]}
          >
            <MaterialCommunityIcons name="clock-outline" size={18} color={c.muted} />
            <Text style={local.returnButtonNoText}>Chưa hoàn trả</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Một dòng vật tư: icon lớn nhận diện · tên · số lượng cấp/cần · thanh đáp ứng. */
function SupplyCard({ req }: { req: MissionDetail["requirements"][number] }) {
  const meta = supplyOf(req.sku, req.itemName);
  const prog = supplyProgress(req.required, req.allocated);

  return (
    <View style={[styles.supplyCard, { borderLeftColor: prog.color }]}>
      <View style={[styles.supplyIconBox, { backgroundColor: meta.tint }]}>
        <Text style={styles.supplyIcon}>{meta.icon}</Text>
      </View>

      <View style={styles.supplyMain}>
        <View style={styles.supplyTopRow}>
          <Text style={styles.supplyName} numberOfLines={2}>
            {req.itemName}
          </Text>
          {/* Chỉ hai màu: đủ thì xanh lá, còn thiếu thì đỏ. Thanh tiến độ ngay
              bên dưới vẫn giữ màu riêng cho "thiếu một phần" và "chưa có cái nào",
              nên phân biệt đó không mất đi — chỉ là nó không cần chen vào dòng
              tên vật tư nữa. */}
          <Text
            style={[styles.supplyStatusText, { color: prog.status === "FULL" ? c.green : c.red }]}
          >
            {prog.label}
          </Text>
        </View>

        <Text style={styles.supplyGroup}>{meta.group}</Text>

        <View style={styles.supplyBarTrack}>
          <View
            style={[
              styles.supplyBarFill,
              { width: `${Math.round(prog.ratio * 100)}%`, backgroundColor: prog.color },
            ]}
          />
        </View>

        <View style={styles.supplyQtyRow}>
          <Text style={styles.supplyQtyStrong}>
            {req.allocated}
            <Text style={styles.supplyQtyMuted}>
              /{req.required} {req.unit}
            </Text>
          </Text>
          {req.shortage > 0 ? (
            <Text style={styles.supplyShort}>
              Thiếu {req.shortage} {req.unit}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  detailHeader: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 4,
    // Đệm trên mỏng lại: 24 điểm của `styles.header` là để chừa thanh trạng thái
    // cho những màn hình mở thẳng lên đầu ứng dụng. Màn chi tiết luôn nằm dưới
    // thanh vai trò nên chừng ấy chỉ đẩy nút quay lại trôi vào giữa khoảng trống,
    // xa mép trên đúng cái chỗ ngón cái hay tìm nó.
    paddingTop: 10,
    paddingBottom: 12,
  },
  returnBox: {
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: c.amberSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.amber,
    padding: 14,
  },
  returnHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  returnTitle: { color: c.text, fontSize: 15, fontWeight: "800", flex: 1 },
  returnHint: { color: c.text, fontSize: 13, lineHeight: 19, marginTop: 8 },
  returnActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  returnButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  returnButtonYes: { backgroundColor: c.green },
  returnButtonYesText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  returnButtonNo: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  returnButtonNoText: { color: c.muted, fontSize: 13, fontWeight: "800" },
  returnButtonPartial: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.amber },
  returnButtonPartialText: { color: c.amber, fontSize: 13, fontWeight: "800" },
  returnError: { color: c.red, fontSize: 13, fontWeight: "700" },
  returnCountHint: { color: c.muted, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  returnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  returnRowName: { color: c.text, fontSize: 13, fontWeight: "700" },
  returnRowMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
  returnCountBox: {
    minWidth: 54,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  returnCountText: { color: c.text, fontSize: 15, fontWeight: "800" },
  returnInput: {
    minWidth: 54,
    borderWidth: 1,
    borderColor: c.amber,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    color: c.text,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  returnFullChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: c.green,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  returnFullChipOn: { backgroundColor: c.green },
  returnFullText: { color: c.green, fontSize: 12, fontWeight: "800" },
  returnOutstanding: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.red,
    backgroundColor: "rgba(220,38,38,0.06)",
    padding: 10,
  },
  returnOutstandingTitle: { color: c.red, fontSize: 12, fontWeight: "800" },
  returnOutstandingRow: { color: c.text, fontSize: 12, marginTop: 3, lineHeight: 17 },
  returnButtonGhost: {
    marginTop: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.green,
  },
  returnButtonGhostText: { color: c.green, fontSize: 13, fontWeight: "800" },
  returnPending: { color: c.text, fontSize: 13, fontWeight: "700", marginTop: 12 },
  returnOffline: { color: c.muted, fontSize: 13, fontWeight: "700", marginTop: 12 },
  returnedBox: {
    marginTop: 4,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(21,128,61,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.green,
    padding: 14,
  },
  returnedText: { color: c.text, fontSize: 13, fontWeight: "700", flex: 1, lineHeight: 19 },
  doneBox: {
    backgroundColor: "rgba(21,128,61,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.green,
    padding: 14,
    marginBottom: 12,
  },
  doneHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  doneTitle: { color: c.green, fontSize: 15, fontWeight: "800" },
  doneOutcome: { color: c.text, fontSize: 14, fontWeight: "700", marginTop: 6 },
  doneLabel: {
    color: c.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 4,
  },
  doneNote: { color: c.text, fontSize: 14, lineHeight: 20 },
  doneEmpty: { color: c.muted, fontSize: 13, fontStyle: "italic" },
  photoLoading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  thumbPending: { borderWidth: 1, borderColor: c.border },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    gap: 12,
  },
  viewerImage: { width: "100%", height: "82%" },
  viewerHint: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  detailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 4,
  },
  detailsToggleText: { color: c.primary, fontSize: 14, fontWeight: "700" },
  reportBox: {
    marginTop: 20,
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.green,
    padding: 14,
  },
  photoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  photoTitle: { color: c.text, fontSize: 13, fontWeight: "700" },
  photoActions: { flexDirection: "row", gap: 8 },
  photoAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: c.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  photoAddText: { color: c.primary, fontSize: 13, fontWeight: "700" },
  photoStrip: { marginBottom: 4 },
  thumbWrap: { marginRight: 8 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: c.surfaceAlt },
  thumbRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: c.red,
    alignItems: "center",
    justifyContent: "center",
  },
  summary: { color: c.muted, fontSize: 12, marginTop: 8 },
  disabled: { opacity: 0.6 },
  camera: { flex: 1, backgroundColor: "#000000" },
  // Nền màn máy ảnh là đen tuyền, nên chữ ở nhánh xin quyền phải là chữ sáng.
  cameraTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 36,
    gap: 14,
  },
  cameraHint: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    backgroundColor: "rgba(15,23,42,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  shutter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraPrimary: {
    backgroundColor: c.amber,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  cameraPrimaryText: { color: "#0f172a", fontSize: 15, fontWeight: "800" },
  cameraSecondary: { paddingHorizontal: 18, paddingVertical: 10 },
  cameraSecondaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});
