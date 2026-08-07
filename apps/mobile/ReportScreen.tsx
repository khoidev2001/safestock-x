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
export function ReportScreen({
  token,
  user,
  onLogout,
}: {
  token: string;
  user: AuthUser;
  onLogout: () => void;
}) {
  const [description, setDescription] = useState("");
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
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
  const requestRef = useRef<{ description: string; requestId: string } | null>(null);

  useEffect(
    () => () => {
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
      const recording = recordingRef.current;
      recordingRef.current = null;
      if (recording) void recording.stop().catch(() => undefined);
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

  function requestFor(descriptionText: string) {
    const current = requestRef.current;
    if (current?.description === descriptionText) return current.requestId;
    const next = { description: descriptionText, requestId: createRequestId() };
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
    } catch {
      setVoiceError("Nhận dạng giọng nói chưa sẵn sàng — vui lòng gõ tay.");
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

  async function send() {
    if (description.trim().length < 5) {
      setError("Vui lòng mô tả tình huống (ít nhất 5 ký tự).");
      return;
    }
    const cleanDescription = description.trim();
    const requestId = requestFor(cleanDescription);
    setSending(true);
    setError(null);
    try {
      await submitReport(token, { description: cleanDescription, requestId });
      requestRef.current = null;
      setSent(true);
      setDescription("");
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
        ? "Đang nhận dạng…"
        : "🎤 Ghi âm mô tả";

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        {/* Co lại được để không đè lên nút bên phải — xem ghi chú ở App.tsx. */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.title}>
            Báo cáo tình huống
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {user.fullName ?? user.email} · Trưởng thôn
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onLogout}
          style={{ flexShrink: 0, marginLeft: 12 }}
        >
          <Text style={[styles.pillText, { color: c.amber }]}>Đăng xuất</Text>
        </Pressable>
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
                : "Bấm để ghi âm, hệ thống tự chuyển thành chữ bằng PhoWhisper."}
            </Text>
          </>
        ) : null}

        {voiceError ? <Text style={styles.voiceError}>{voiceError}</Text> : null}
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

      {report.location ? (
        <>
          <Text style={styles.reportDetailLabel}>Địa điểm</Text>
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
