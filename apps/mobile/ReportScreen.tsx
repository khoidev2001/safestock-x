import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  fetchOwnReport,
  fetchOwnReports,
  submitReport,
  transcribe,
  type AuthUser,
  type OwnReportDetail,
  type OwnReportSummary,
} from "./api";
import { isRecordingSupported, startRecording, type AudioRecording } from "./audio";
import { IncidentPinMap, type PinnedPoint } from "./IncidentPinMap";
import { MAX_RECORDING_MS } from "./audio-platform-state";
import { c, styles } from "./styles";

type MicStatus = "idle" | "recording" | "transcribing";

/**
 * Màn báo cáo tình huống, dùng chung cho quản lý kho tại chỗ (kiêm trưởng thôn)
 * và lực lượng hiện trường: ai đứng tại chỗ xảy ra sự việc thì người đó báo.
 * Mô tả tình huống bằng GÕ TAY hoặc GHI ÂM (voice → PhoWhisper → text) rồi gửi lên
 * cơ quan điều phối. Backend tạo DRAFT + báo ADMIN; admin mở tin trên web sẽ tự
 * phân tích AI. Android APK dùng AudioRecord native; Expo Web dùng Web Audio.
 */
export function ReportScreen({ token, user }: { token: string; user: AuthUser }) {
  const [description, setDescription] = useState("");
  /**
   * Điểm gặp nạn trưởng thôn ghim trên bản đồ. Không bắt buộc.
   *
   * Có điểm này thì backend dùng nó và BỎ QUA tên thôn trong lời kể: người đứng tại
   * chỗ ghim đúng mái nhà bị ngập, còn tên thôn chỉ dẫn tới điểm ứng phó chung của
   * thôn — thường là nhà văn hoá, cách chỗ cần cứu vài trăm mét đến vài km.
   */
  const [pinnedPoint, setPinnedPoint] = useState<PinnedPoint | null>(null);
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  /**
   * Bản ghi âm sẽ GỬI KÈM báo cáo, tách hẳn khỏi đường nhận dạng giọng nói.
   *
   * Nút micro bên trên đổi tiếng nói thành chữ rồi vứt file đi. Chữ đó có thể
   * sai tên thôn hay sai số người — hai thứ quyết định điều bao nhiêu xe đi đâu,
   * mà người điều phối không có cách nào biết nó sai. Giữ lại file để họ nghe
   * thẳng lời người báo rồi tự điền.
   */
  const [attachedAudio, setAttachedAudio] = useState<{
    base64: string;
    durationMs: number;
  } | null>(null);
  const [attachStatus, setAttachStatus] = useState<"idle" | "recording">("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  /**
   * Số giây đã chờ nhận dạng.
   *
   * Lần gọi đầu sau khi PhoWhisper nguội mất 25-30 giây; những lần sau dưới 5.
   * Chỉ hiện đúng chữ "Đang nhận dạng…" đứng im suốt nửa phút thì người dùng
   * tưởng hỏng và bỏ đi — đã gặp thật khi thử trên máy. Đếm giây để cái chờ có
   * hình hài, và nói trước rằng lần đầu lâu.
   */
  const [transcribeSeconds, setTranscribeSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [history, setHistory] = useState<OwnReportSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<OwnReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const recordingRef = useRef<AudioRecording | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref RIÊNG cho lượt ghi đính kèm: dùng chung một ref với lượt nhận dạng thì
  // bấm nhầm nút thứ hai lúc nút thứ nhất đang chạy sẽ cắt mất bản ghi kia.
  const attachRecordingRef = useRef<AudioRecording | null>(null);
  const attachTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachStartedAtRef = useRef(0);
  const requestRef = useRef<{ key: string; requestId: string } | null>(null);

  useEffect(
    () => () => {
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
      if (attachTimeoutRef.current) {
        clearTimeout(attachTimeoutRef.current);
      }
      const recording = recordingRef.current;
      recordingRef.current = null;
      if (recording) void recording.stop().catch(() => undefined);
      const attaching = attachRecordingRef.current;
      attachRecordingRef.current = null;
      if (attaching) void attaching.stop().catch(() => undefined);
    },
    [],
  );

  useEffect(() => {
    void loadHistory();
    // loadHistory only depends on the current authenticated token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function createRequestId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Khoá chống-gửi-trùng: giữ nguyên `requestId` khi người dùng bấm lại đúng cùng
   * một báo cáo (timeout rồi thử lại), nhưng phải ĐỔI khi nội dung đổi.
   *
   * Điểm ghim nằm trong khoá cùng với lời kể. Chỉ khoá theo lời kể thì sửa điểm ghim
   * xong gửi lại vẫn mang `requestId` cũ, backend coi là trùng và giữ nguyên bản
   * ghi cũ — toạ độ mới bị bỏ, mà người báo thì thấy "đã gửi".
   */
  function requestFor(descriptionText: string, point: PinnedPoint | null, audioKey: string) {
    const key = `${descriptionText}|${point ? `${point.lat},${point.lng}` : ""}|${audioKey}`;
    const current = requestRef.current;
    if (current?.key === key) return current.requestId;
    const next = { key, requestId: createRequestId() };
    requestRef.current = next;
    return next.requestId;
  }
  const micSupported = isRecordingSupported();

  /** Nối text nhận dạng vào ô mô tả (không đè phần đã gõ). */
  function appendText(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setDescription((prev) => (prev.trim() ? `${prev.trim()} ${clean}` : clean));
  }

  useEffect(() => {
    if (micStatus !== "transcribing") {
      setTranscribeSeconds(0);
      return;
    }
    const bat = setInterval(() => setTranscribeSeconds((n) => n + 1), 1000);
    return () => clearInterval(bat);
  }, [micStatus]);

  async function finishRecording(recording = recordingRef.current) {
    if (!recording || recordingRef.current !== recording) return;
    recordingRef.current = null;
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    setMicStatus("transcribing");
    try {
      const base64 = await recording.stop();
      if (!base64) return;
      const { text } = await transcribe(token, base64);
      if (text.trim()) appendText(text);
      else setVoiceError("Chưa nghe rõ nội dung. Vui lòng nói lại hoặc gõ tay.");
    } catch (error) {
      // Nói ra lỗi thật, đừng nuốt. Câu chung chung "chưa sẵn sàng" khiến mọi
      // nguyên nhân — mất mạng, hết hạn phiên, model chưa nạp — trông giống hệt
      // nhau, và người trực không biết nên chờ hay nên gõ tay.
      const chiTiet = error instanceof Error ? error.message.trim() : "";
      setVoiceError(
        chiTiet
          ? `Không nhận dạng được: ${chiTiet}. Vui lòng thử lại hoặc gõ tay.`
          : "Nhận dạng giọng nói chưa sẵn sàng — vui lòng gõ tay.",
      );
    } finally {
      setMicStatus("idle");
    }
  }

  async function toggleRecording() {
    setVoiceError(null);
    if (micStatus === "recording") {
      await finishRecording();
      return;
    }
    if (micStatus === "idle") {
      try {
        const recording = await startRecording();
        recordingRef.current = recording;
        recordingTimeoutRef.current = setTimeout(() => {
          void finishRecording(recording);
        }, MAX_RECORDING_MS);
        setMicStatus("recording");
      } catch {
        setVoiceError("Không truy cập được micro. Kiểm tra quyền hoặc gõ tay.");
        setMicStatus("idle");
      }
    }
  }

  /** Dừng lượt ghi đính kèm và giữ lại file, KHÔNG gửi đi nhận dạng. */
  async function finishAttachRecording(recording = attachRecordingRef.current) {
    if (!recording || attachRecordingRef.current !== recording) return;
    attachRecordingRef.current = null;
    if (attachTimeoutRef.current) {
      clearTimeout(attachTimeoutRef.current);
      attachTimeoutRef.current = null;
    }
    setAttachStatus("idle");
    try {
      const base64 = await recording.stop();
      if (!base64) {
        setVoiceError("Bản ghi rỗng. Vui lòng ghi lại.");
        return;
      }
      setAttachedAudio({ base64, durationMs: Date.now() - attachStartedAtRef.current });
    } catch {
      setVoiceError("Không lưu được bản ghi âm. Vui lòng thử lại.");
    }
  }

  async function toggleAttachRecording() {
    setVoiceError(null);
    if (attachStatus === "recording") {
      await finishAttachRecording();
      return;
    }
    // Không cho hai lượt ghi chạy chồng nhau: một micro, một luồng âm thanh.
    if (micStatus !== "idle") {
      setVoiceError("Đang ghi âm để nhận dạng. Dừng lượt đó trước đã.");
      return;
    }
    try {
      const recording = await startRecording();
      attachRecordingRef.current = recording;
      attachStartedAtRef.current = Date.now();
      attachTimeoutRef.current = setTimeout(() => {
        void finishAttachRecording(recording);
      }, MAX_RECORDING_MS);
      setAttachStatus("recording");
    } catch {
      setVoiceError("Không truy cập được micro. Kiểm tra quyền rồi thử lại.");
      setAttachStatus("idle");
    }
  }

  async function send() {
    const cleanDescription = description.trim();
    /*
      Có file ghi âm thì KHÔNG bắt gõ chữ nữa.
      
      Người đứng giữa vùng ngập, một tay cầm ô một tay cầm điện thoại, vừa nói
      xong cả đoạn vào micro — bắt họ gõ thêm năm ký tự là dựng một cái rào ngay
      lúc họ ít rảnh tay nhất, và cái rào ấy chỉ đẻ ra những báo cáo ghi "aaaaa"
      cho qua. Cơ quan điều phối nghe file rồi tự điền số liệu.
      
      Gõ dở dang thì vẫn phải đủ năm ký tự: một hai chữ lạc vào ô không nói được
      gì mà lại che mất chuyện báo cáo này chỉ có tiếng nói.
    */
    if (!attachedAudio && cleanDescription.length < 5) {
      setError("Vui lòng mô tả tình huống (ít nhất 5 ký tự) hoặc gửi kèm file ghi âm.");
      return;
    }
    if (cleanDescription.length > 0 && cleanDescription.length < 5) {
      setError("Mô tả quá ngắn. Viết rõ hơn hoặc xoá hẳn để chỉ gửi file ghi âm.");
      return;
    }
    // Bản ghi âm nằm TRONG khoá: ghi âm xong gửi lại mà khoá không đổi thì máy
    // chủ coi là trùng, giữ nguyên bản cũ — file mới bị bỏ, người gửi vẫn thấy
    // "đã gửi". Đúng cái bẫy mà điểm ghim đã mắc phải trước đây.
    const requestId = requestFor(
      cleanDescription,
      pinnedPoint,
      attachedAudio ? String(attachedAudio.base64.length) : "",
    );
    setSending(true);
    setError(null);
    try {
      await submitReport(token, {
        // Bỏ hẳn khoá khi không có chữ: gửi chuỗi rỗng thì máy chủ vẫn coi là
        // "có mô tả" và trả lỗi độ dài tối thiểu.
        ...(cleanDescription ? { description: cleanDescription } : {}),
        requestId,
        ...(pinnedPoint ? { incidentLat: pinnedPoint.lat, incidentLng: pinnedPoint.lng } : {}),
        ...(attachedAudio
          ? {
              audioBase64: attachedAudio.base64,
              // Máy chủ vẫn tự nhận diện từ byte đầu tệp; gửi kèm chỉ để đối chiếu.
              audioMimeType: "audio/wav",
              audioDurationMs: attachedAudio.durationMs,
            }
          : {}),
      });
      requestRef.current = null;
      setSent(true);
      setDescription("");
      setPinnedPoint(null);
      setAttachedAudio(null);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được báo cáo");
    } finally {
      setSending(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const page = await fetchOwnReports(token);
      setHistory(page.items);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Không tải được lịch sử báo cáo");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openReport(id: string) {
    setDetailLoading(true);
    setHistoryError(null);
    try {
      setSelectedReport(await fetchOwnReport(token, id));
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Không tải được chi tiết báo cáo");
    } finally {
      setDetailLoading(false);
    }
  }

  const micLabel =
    micStatus === "recording"
      ? "■ Dừng và nhận dạng"
      : micStatus === "transcribing"
        ? `Đang nhận dạng… ${transcribeSeconds}s`
        : "🎤 Chuyển giọng nói thành văn bản";

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.title}>
            Báo cáo tình huống
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {user.fullName ?? user.email} · Trưởng thôn
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.reportScroll} keyboardShouldPersistTaps="handled">
        {sent ? (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>✓ Đã gửi tới cơ quan điều phối</Text>
            <Text style={styles.successText}>
              Cơ quan sẽ phân tích và điều phối cứu hộ. Bạn có thể gửi báo cáo mới bên dưới nếu tình
              hình thay đổi.
            </Text>
          </View>
        ) : null}

        <Text style={styles.reportIntro}>
          Mô tả những gì đang xảy ra ở thôn: loại sự cố, số người ảnh hưởng, vị trí, nhu cầu khẩn
          cấp… Gõ tay hoặc bấm ghi âm để đọc.
        </Text>

        <Text style={styles.label}>Mô tả tình huống</Text>
        <TextInput
          style={styles.reportInput}
          value={description}
          onChangeText={(t) => {
            setDescription(t);
            if (sent) setSent(false);
          }}
          multiline
          placeholder="Ví dụ: Lũ quét tại thôn Long Châu, khoảng 200 người mắc kẹt, cần nước sạch và áo phao gấp."
          placeholderTextColor={c.muted}
          aria-label="Mô tả tình huống"
        />

        {micSupported ? (
          <>
            <Pressable
              style={[styles.micButton, micStatus === "recording" && styles.micButtonRecording]}
              onPress={toggleRecording}
              disabled={micStatus === "transcribing"}
              accessibilityRole="button"
            >
              <Text
                style={
                  micStatus === "recording" ? styles.micButtonTextRecording : styles.micButtonText
                }
              >
                {micLabel}
              </Text>
            </Pressable>
            <Text style={styles.micHint}>
              {micStatus === "recording"
                ? "Đang ghi… nói rõ rồi bấm dừng (tối đa 60 giây)."
                : micStatus === "transcribing"
                  ? // Lần đầu sau khi model nguội mất 25-30 giây, những lần sau
                    // dưới 5. Nói trước thì người ta chờ; không nói thì họ tưởng
                    // hỏng và bỏ đi ngay trước lúc chữ hiện ra.
                    "Lần đầu trong buổi có thể mất 20–30 giây. Những lần sau vài giây."
                  : "Bấm để ghi âm, hệ thống tự chuyển thành chữ bằng PhoWhisper."}
            </Text>

            {/* Nút THỨ HAI, việc khác hẳn nút trên: nút trên đổi tiếng nói thành
                chữ rồi bỏ file đi, nút này giữ nguyên file gửi cho cơ quan điều
                phối nghe. Nhãn nói rõ khác biệt đó, vì hai nút micro cạnh nhau
                mà không nói gì thì người dùng đoán chúng làm cùng một việc. */}
            <Pressable
              style={[
                styles.attachButton,
                attachStatus === "recording" && styles.micButtonRecording,
              ]}
              onPress={toggleAttachRecording}
              accessibilityRole="button"
            >
              <Text
                style={
                  attachStatus === "recording"
                    ? styles.micButtonTextRecording
                    : styles.attachButtonText
                }
              >
                {attachStatus === "recording"
                  ? "■ Dừng và đính kèm"
                  : attachedAudio
                    ? "🎙 Ghi âm lại"
                    : "🎙 Gửi file ghi âm gốc"}
              </Text>
            </Pressable>
            <Text style={styles.micHint}>
              {attachStatus === "recording"
                ? "Đang ghi lời kể… bấm dừng khi xong (tối đa 60 giây)."
                : "Gửi nguyên file gốc cho cơ quan điều phối nghe lại. Có file này thì không cần gõ mô tả."}
            </Text>

            {attachedAudio ? (
              <View style={styles.attachedRow}>
                <Text style={styles.attachedText}>
                  Đã đính kèm bản ghi {Math.max(1, Math.round(attachedAudio.durationMs / 1000))}{" "}
                  giây
                </Text>
                <Pressable
                  onPress={() => setAttachedAudio(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Bỏ bản ghi âm đính kèm"
                >
                  <Text style={styles.attachedRemove}>Bỏ</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}

        {voiceError ? <Text style={styles.voiceError}>{voiceError}</Text> : null}

        <IncidentPinMap point={pinnedPoint} onChange={setPinnedPoint} disabled={sending} />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[styles.button, sending && { opacity: 0.6 }]}
          onPress={send}
          disabled={sending}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{sending ? "Đang gửi…" : "Gửi báo cáo"}</Text>
        </Pressable>

        <View style={styles.reportHistorySection}>
          <View style={styles.reportHistoryHeader}>
            <Text style={styles.reportHistoryTitle}>Báo cáo đã gửi</Text>
            <Pressable
              onPress={() => void loadHistory()}
              disabled={historyLoading}
              accessibilityRole="button"
              accessibilityLabel="Tải lại lịch sử báo cáo"
            >
              <Text style={styles.reportHistoryRefresh}>
                {historyLoading ? "Đang tải…" : "Tải lại"}
              </Text>
            </Pressable>
          </View>

          {historyError ? <Text style={styles.errorText}>{historyError}</Text> : null}
          {detailLoading ? (
            <Text style={styles.reportHistoryEmpty}>Đang tải chi tiết báo cáo…</Text>
          ) : selectedReport ? (
            <OwnReportDetailPanel report={selectedReport} onBack={() => setSelectedReport(null)} />
          ) : (
            <OwnReportHistory
              reports={history}
              loading={historyLoading}
              onOpen={(id) => void openReport(id)}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function OwnReportHistory({
  reports,
  loading,
  onOpen,
}: {
  reports: OwnReportSummary[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  if (loading && reports.length === 0) {
    return <Text style={styles.reportHistoryEmpty}>Đang tải các báo cáo đã gửi…</Text>;
  }
  if (reports.length === 0) {
    return (
      <Text style={styles.reportHistoryEmpty}>
        Chưa có báo cáo nào. Báo cáo mới sẽ xuất hiện tại đây sau khi gửi thành công.
      </Text>
    );
  }
  return (
    <>
      {reports.map((report) => (
        <Pressable
          key={report.id}
          style={styles.reportHistoryCard}
          onPress={() => onOpen(report.id)}
          accessibilityRole="button"
          accessibilityLabel={`Xem báo cáo ${shortReport(report.reportText)}`}
        >
          <Text style={styles.reportHistoryCardTitle} numberOfLines={2}>
            {shortReport(report.reportText)}
          </Text>
          <Text style={styles.reportHistoryMeta}>
            {new Date(report.createdAt).toLocaleString("vi-VN")} ·{" "}
            {report.warehouse?.name ?? "Cơ quan điều phối"}
          </Text>
          <Text style={styles.reportHistoryStatus}>{reportStatusLabel(report.status)}</Text>
        </Pressable>
      ))}
    </>
  );
}

function OwnReportDetailPanel({ report, onBack }: { report: OwnReportDetail; onBack: () => void }) {
  return (
    <View style={styles.reportDetailPanel}>
      <Pressable onPress={onBack} accessibilityRole="button">
        <Text style={styles.reportDetailBack}>← Quay lại lịch sử</Text>
      </Pressable>
      <Text style={styles.reportDetailTitle}>Chi tiết báo cáo</Text>
      <Text style={styles.reportHistoryStatus}>{reportStatusLabel(report.status)}</Text>

      <Text style={styles.reportDetailLabel}>Nội dung đã xác nhận</Text>
      <Text style={styles.reportDetailValue}>{report.reportText ?? "Không có nội dung text."}</Text>

      <Text style={styles.reportDetailLabel}>Thời điểm gửi</Text>
      <Text style={styles.reportDetailValue}>
        {new Date(report.createdAt).toLocaleString("vi-VN")}
      </Text>

      {/* Toạ độ đã ghim hiện TRƯỚC ô địa điểm, và nói rõ nó là thứ đang được dùng:
        backend ưu tiên điểm ghim và bỏ qua tên thôn trong lời kể. Không nói thì
        người báo thấy hai dòng khác nhau và không biết cơ quan điều phối đang đi
        tới chỗ nào. */}
      {report.incidentLat != null && report.incidentLng != null ? (
        <>
          <Text style={styles.reportDetailLabel}>Điểm đã ghim trên bản đồ</Text>
          <Text style={styles.reportDetailValue}>
            {report.incidentLat.toFixed(6)}, {report.incidentLng.toFixed(6)}
          </Text>
        </>
      ) : null}

      {report.location ? (
        <>
          <Text style={styles.reportDetailLabel}>
            {report.incidentLat != null && report.incidentLng != null
              ? "Địa điểm ghi trong lời kể (không dùng để định vị)"
              : "Địa điểm"}
          </Text>
          <Text style={styles.reportDetailValue}>{report.location}</Text>
        </>
      ) : null}

      {report.requirements.length > 0 ? (
        <>
          <Text style={styles.reportDetailLabel}>Vật tư trong phương án</Text>
          {report.requirements.map((item) => (
            <Text key={item.id} style={styles.reportDetailValue}>
              • {item.itemName}: {item.allocated}/{item.required} {item.unit}
            </Text>
          ))}
        </>
      ) : null}

      {report.explanation ? (
        <>
          <Text style={styles.reportDetailLabel}>Phản hồi từ hệ thống</Text>
          <Text style={styles.reportDetailValue}>{report.explanation}</Text>
        </>
      ) : null}
    </View>
  );
}

function shortReport(text: string | null): string {
  const normalized = text?.trim();
  if (!normalized) return "Báo cáo tình huống";
  return normalized.length > 100 ? `${normalized.slice(0, 100)}…` : normalized;
}

function reportStatusLabel(status: string): string {
  if (status === "DRAFT") return "Đã nhận · chờ phân tích";
  if (status === "PENDING_WAREHOUSE") return "Đã lập phương án · kho đang chuẩn bị";
  if (status === "READY") return "Vật tư đã sẵn sàng";
  if (status === "CANCELLED") return "Đã đóng / hủy";
  if (status === "COMPLETED") return "Đã hoàn tất";
  return "Đang xử lý";
}
