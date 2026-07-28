import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  fetchOwnReport,
  fetchOwnReports,
  submitReport,
  transcribe,
  type AuthUser,
  type OwnReportDetail,
  type OwnReportSummary,
} from "./api";
import { isRecordingSupported, startRecording, type AudioRecording, type RecordedAudio } from "./audio";
import { c, styles } from "./styles";
import { disasterOf, formatLongTime, formatShortTime } from "./disaster";

type MicStatus = "idle" | "recording" | "transcribing";
type ReportSection = "compose" | "history" | "detail";

const HISTORY_LIMIT = 20;
const POLL_INTERVAL_MS = 30_000;

const PROCESSING_LABEL: Record<string, string> = {
  SUBMITTED: "Đã tiếp nhận — chờ phân tích",
  ANALYZING: "Đang phân tích",
  ANALYZED: "Đã phân tích",
  ANALYSIS_FAILED: "Phân tích chưa hoàn tất",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Đang tiếp nhận",
  PENDING_RESCUE: "Đã chuyển cứu hộ",
  RESCUE_CONFIRMED: "Cứu hộ đã xác nhận",
  PENDING_WAREHOUSE: "Đang chờ kho chuẩn bị",
  READY: "Kho đã sẵn sàng",
  APPROVED: "Đã duyệt",
  IN_PROGRESS: "Đang thực hiện",
  COMPLETED: "Đã hoàn thành",
  REJECTED: "Đã từ chối",
  DEFERRED: "Đã tạm hoãn",
  CANCELLED: "Đã huỷ",
};

const OUTCOME_LABEL: Record<string, string> = {
  DELIVERED: "Đã giao đủ",
  PARTIAL: "Giao một phần",
  FAILED: "Không giao được",
};

function processingLabel(value: string | null): string {
  return value ? PROCESSING_LABEL[value] ?? "Đang xử lý" : "Chưa có trạng thái xử lý";
}

function statusLabel(value: string): string {
  return STATUS_LABEL[value] ?? `Trạng thái vận hành: ${value}`;
}

function isTerminalStatus(status: string): boolean {
  return ["COMPLETED", "CANCELLED"].includes(status);
}

/**
 * Màn báo cáo tình huống cho REPORTER. Soạn thảo, lịch sử và chi tiết nằm trong
 * cùng component để bản nháp không bị mất khi người dùng xem lại báo cáo cũ.
 * Ghi âm chỉ chạy trên Expo Web và luôn giữ WAV gốc độc lập với transcript.
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
  const [section, setSection] = useState<ReportSection>("compose");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudio | null>(null);
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [lastSentMissionId, setLastSentMissionId] = useState<string | null>(null);

  const [reports, setReports] = useState<OwnReportSummary[]>([]);
  const reportsRef = useRef<OwnReportSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [detail, setDetail] = useState<OwnReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRefreshing, setDetailRefreshing] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const recordingRef = useRef<AudioRecording | null>(null);
  const historyRequestRef = useRef(false);
  const historyRequestVersionRef = useRef(0);
  const detailRequestRef = useRef(false);
  const detailRequestVersionRef = useRef(0);
  const mountedRef = useRef(true);
  const detailRef = useRef<OwnReportDetail | null>(null);
  const selectedReportIdRef = useRef<string | null>(null);
  const micSupported = isRecordingSupported();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      historyRequestVersionRef.current += 1;
      detailRequestVersionRef.current += 1;
      const recording = recordingRef.current;
      recordingRef.current = null;
      if (recording) void recording.stop().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    reportsRef.current = reports;
  }, [reports]);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  useEffect(() => {
    selectedReportIdRef.current = selectedReportId;
  }, [selectedReportId]);

  const loadHistory = useCallback(
    async ({ append = false, silent = false }: { append?: boolean; silent?: boolean } = {}) => {
      if (historyRequestRef.current) return;
      historyRequestRef.current = true;
      const version = ++historyRequestVersionRef.current;
      const hasCachedData = reportsRef.current.length > 0;
      if (mountedRef.current) {
        if (append) setHistoryLoading(true);
        else if (silent || hasCachedData) setHistoryRefreshing(true);
        else setHistoryLoading(true);
        setHistoryError(null);
      }
      try {
        const page = await fetchOwnReports(token, {
          cursor: append ? nextCursorRef.current : null,
          limit: HISTORY_LIMIT,
        });
        if (!mountedRef.current || version !== historyRequestVersionRef.current) return;
        setReports((current) => {
          if (!append) return page.items;
          const ids = new Set(current.map((item) => item.id));
          return [...current, ...page.items.filter((item) => !ids.has(item.id))];
        });
        nextCursorRef.current = page.nextCursor;
        setNextCursor(page.nextCursor);
        setHistoryError(null);
      } catch (requestError) {
        if (!mountedRef.current || version !== historyRequestVersionRef.current) return;
        setHistoryError(requestError instanceof Error ? requestError.message : "Không tải được lịch sử báo cáo");
      } finally {
        historyRequestRef.current = false;
        if (mountedRef.current) {
          setHistoryLoading(false);
          setHistoryRefreshing(false);
        }
      }
    },
    [token],
  );

  const loadDetail = useCallback(
    async (silent = false) => {
      const reportId = selectedReportIdRef.current;
      if (!reportId || detailRequestRef.current) return;
      detailRequestRef.current = true;
      const version = ++detailRequestVersionRef.current;
      if (mountedRef.current) {
        if (silent || detailRef.current) setDetailRefreshing(true);
        else setDetailLoading(true);
        setDetailError(null);
      }
      try {
        const result = await fetchOwnReport(token, reportId);
        if (
          !mountedRef.current ||
          version !== detailRequestVersionRef.current ||
          selectedReportIdRef.current !== reportId
        ) {
          return;
        }
        setDetail(result);
        setDetailError(null);
      } catch (requestError) {
        if (!mountedRef.current || version !== detailRequestVersionRef.current) return;
        setDetailError(requestError instanceof Error ? requestError.message : "Không tải được chi tiết báo cáo");
      } finally {
        detailRequestRef.current = false;
        if (mountedRef.current) {
          setDetailLoading(false);
          setDetailRefreshing(false);
        }
      }
    },
    [token],
  );

  // Refresh history only while its section is visible. Cached rows remain visible on failure.
  useEffect(() => {
    if (section !== "history") return undefined;
    void loadHistory({ silent: reportsRef.current.length > 0 });
    const timer = setInterval(() => void loadHistory({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadHistory, section]);

  // Detail polling stops once the workflow reaches a terminal mission status.
  useEffect(() => {
    if (section !== "detail" || !selectedReportId) return undefined;
    void loadDetail(Boolean(detailRef.current));
    if (detailRef.current && isTerminalStatus(detailRef.current.status)) return undefined;
    const timer = setInterval(() => {
      const current = detailRef.current;
      if (!current || !isTerminalStatus(current.status)) void loadDetail(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadDetail, section, selectedReportId, detail?.status]);

  function appendText(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setDescription((previous) => (previous.trim() ? `${previous.trim()} ${clean}` : clean));
  }

  async function toggleRecording() {
    setVoiceError(null);
    if (micStatus === "recording") {
      const recording = recordingRef.current;
      recordingRef.current = null;
      if (!recording) {
        setMicStatus("idle");
        setVoiceError("Không tìm thấy bản ghi. Vui lòng thử lại.");
        return;
      }
      setMicStatus("transcribing");
      try {
        // Retain bytes and MIME before transcription starts; transcript edits never replace them.
        const result = await recording.stop();
        if (!result) {
          setMicStatus("idle");
          setVoiceError("Bản ghi trống. Vui lòng thử lại hoặc gõ tay.");
          return;
        }
        setRecordedAudio(result);
        try {
          const transcript = await transcribe(token, result.base64, result.mimeType);
          if (transcript.text.trim()) appendText(transcript.text);
          else setVoiceError("Chưa nghe rõ nội dung. Bản ghi vẫn được giữ để gửi; bạn có thể gõ thêm.");
        } catch {
          setVoiceError("Nhận dạng giọng nói chưa sẵn sàng. Bản ghi vẫn được giữ để gửi hoặc thử lại.");
        }
      } catch {
        setVoiceError("Không xử lý được bản ghi. Vui lòng thử lại hoặc gõ tay.");
      } finally {
        setMicStatus("idle");
      }
      return;
    }
    if (micStatus === "idle") {
      try {
        recordingRef.current = await startRecording();
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
    if (micStatus !== "idle") return;
    setSending(true);
    setError(null);
    try {
      const result = await submitReport(token, {
        description: description.trim(),
        ...(location.trim() ? { location: location.trim() } : {}),
        ...(recordedAudio
          ? { audioBase64: recordedAudio.base64, mimeType: recordedAudio.mimeType }
          : {}),
      });
      setLastSentMissionId(result.missionId);
      setDescription("");
      setLocation("");
      setRecordedAudio(null);
      setVoiceError(null);
      setError(null);
      // Refresh immediately; a failed refresh does not invalidate the committed mission ID.
      await loadHistory({ silent: reportsRef.current.length > 0 });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không gửi được báo cáo");
    } finally {
      setSending(false);
    }
  }

  function openDetail(reportId: string) {
    if (micStatus !== "idle" || sending) return;
    setSelectedReportId(reportId);
    selectedReportIdRef.current = reportId;
    setDetail(null);
    detailRef.current = null;
    setDetailError(null);
    setSection("detail");
  }

  function changeSection(next: Exclude<ReportSection, "detail">) {
    if (micStatus !== "idle" || sending) return;
    setSection(next);
  }

  const sectionLocked = micStatus !== "idle" || sending;
  const micLabel =
    micStatus === "recording"
      ? "■ Dừng và nhận dạng"
      : micStatus === "transcribing"
        ? "Đang nhận dạng…"
        : "🎤 Ghi âm mô tả";

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Báo cáo tình huống</Text>
          <Text style={styles.subtitle}>
            {user.fullName ?? user.email} · {user.warehouseName ?? "Trưởng thôn"}
          </Text>
        </View>
        <Pressable
          onPress={onLogout}
          disabled={micStatus !== "idle" || sending}
          accessibilityRole="button"
          accessibilityLabel="Đăng xuất"
          style={styles.smallControl}
        >
          <Text style={[styles.pillText, { color: c.amber }]}>Đăng xuất</Text>
        </Pressable>
      </View>

      <View style={styles.reportTabs} accessibilityRole="tablist">
        <SectionTab
          label="Soạn báo cáo"
          selected={section === "compose"}
          disabled={sectionLocked}
          onPress={() => changeSection("compose")}
        />
        <SectionTab
          label="Lịch sử của tôi"
          selected={section === "history"}
          disabled={sectionLocked}
          onPress={() => changeSection("history")}
        />
      </View>

      {section === "compose" ? (
        <ScrollView contentContainerStyle={styles.reportScroll} keyboardShouldPersistTaps="handled">
          {lastSentMissionId ? (
            <View style={styles.successBox} accessibilityRole="alert">
              <Text style={styles.successTitle}>✓ Đã gửi tới cơ quan điều phối</Text>
              <Text style={styles.successText}>
                Báo cáo đã được máy chủ tiếp nhận. Âm thanh chỉ được lưu khi máy chủ xác nhận thành công.
              </Text>
              <Pressable
                onPress={() => openDetail(lastSentMissionId)}
                accessibilityRole="button"
                accessibilityLabel="Xem báo cáo vừa gửi"
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Xem báo cáo vừa gửi</Text>
              </Pressable>
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
            onChangeText={setDescription}
            multiline
            placeholder="Ví dụ: Lũ quét tại thôn Long Châu, khoảng 200 người mắc kẹt, cần nước sạch và áo phao gấp."
            placeholderTextColor={c.muted}
            accessibilityLabel="Mô tả tình huống"
            editable={!sectionLocked}
          />

          <Text style={styles.label}>Vị trí cụ thể (nếu có)</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            maxLength={300}
            placeholder="Ví dụ: cuối đường liên thôn, gần cầu tràn"
            placeholderTextColor={c.muted}
            accessibilityLabel="Vị trí cụ thể"
            editable={!sectionLocked}
          />

          {micSupported ? (
            <>
              <Pressable
                style={[styles.micButton, micStatus === "recording" && styles.micButtonRecording]}
                onPress={() => void toggleRecording()}
                disabled={micStatus === "transcribing" || sending}
                accessibilityRole="button"
                accessibilityLabel={micLabel}
                accessibilityState={{ busy: micStatus === "transcribing", disabled: sending }}
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
                  ? "Đang ghi… nói rõ rồi bấm dừng."
                  : recordedAudio
                    ? "Đã giữ bản ghi WAV gốc cho lần gửi này. Bạn có thể sửa transcript."
                    : "Bấm để ghi âm, hệ thống tự chuyển thành chữ."}
              </Text>
            </>
          ) : null}

          {voiceError ? <Text style={styles.voiceError}>{voiceError}</Text> : null}
          {recordedAudio ? (
            <Text style={styles.audioPendingText}>
              Bản ghi gốc ({recordedAudio.mimeType}) sẽ gửi cùng báo cáo; chưa xác nhận lưu trên máy chủ.
            </Text>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={[styles.button, (sending || micStatus !== "idle") && { opacity: 0.6 }]}
            onPress={() => void send()}
            disabled={sending || micStatus !== "idle"}
            accessibilityRole="button"
            accessibilityLabel="Gửi báo cáo"
            accessibilityState={{ busy: sending, disabled: micStatus !== "idle" }}
          >
            <Text style={styles.buttonText}>{sending ? "Đang gửi…" : "Gửi báo cáo"}</Text>
          </Pressable>
        </ScrollView>
      ) : section === "history" ? (
        <HistoryList
          reports={reports}
          loading={historyLoading}
          refreshing={historyRefreshing}
          error={historyError}
          nextCursor={nextCursor}
          onRefresh={() => void loadHistory({ silent: reportsRef.current.length > 0 })}
          onRetry={() => void loadHistory({ silent: reportsRef.current.length > 0 })}
          onLoadMore={() => void loadHistory({ append: true })}
          onOpen={openDetail}
        />
      ) : (
        <ReportDetailView
          report={detail}
          loading={detailLoading}
          refreshing={detailRefreshing}
          error={detailError}
          onBack={() => {
            setSelectedReportId(null);
            selectedReportIdRef.current = null;
            setDetail(null);
            detailRef.current = null;
            setSection("history");
          }}
          onRetry={() => void loadDetail(false)}
          onRefresh={() => void loadDetail(true)}
        />
      )}
    </View>
  );
}

function SectionTab({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.reportTab, selected && styles.reportTabSelected, disabled && { opacity: 0.55 }]}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
    >
      <Text style={[styles.reportTabText, selected && styles.reportTabTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function HistoryList({
  reports,
  loading,
  refreshing,
  error,
  nextCursor,
  onRefresh,
  onRetry,
  onLoadMore,
  onOpen,
}: {
  reports: OwnReportSummary[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  nextCursor: string | null;
  onRefresh: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpen: (id: string) => void;
}) {
  if (loading && reports.length === 0) {
    return (
      <View style={styles.reportListPadding}>
        {[0, 1, 2].map((item) => <View key={item} style={styles.skeleton} />)}
      </View>
    );
  }

  return (
    <FlatList
      data={reports}
      keyExtractor={(item) => item.id}
      style={styles.reportList}
      contentContainerStyle={reports.length ? styles.reportListPadding : styles.reportListEmpty}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onEndReached={() => {
        if (nextCursor && !loading) onLoadMore();
      }}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        error && reports.length > 0 ? (
          <View style={styles.cachedErrorBox}>
            <Text style={styles.cachedErrorText}>Đang hiển thị dữ liệu đã tải. {error}</Text>
            <Pressable onPress={onRetry} style={styles.retryControl} accessibilityRole="button">
              <Text style={styles.linkText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : null
      }
      ListEmptyComponent={
        error ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>⚠</Text>
            <Text style={styles.emptyTitle}>Không tải được lịch sử</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable onPress={onRetry} style={styles.retryControl} accessibilityRole="button">
              <Text style={styles.linkText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>▤</Text>
            <Text style={styles.emptyTitle}>Chưa có báo cáo</Text>
            <Text style={styles.emptyText}>Các báo cáo bạn gửi sẽ xuất hiện ở đây.</Text>
          </View>
        )
      }
      ListFooterComponent={
        loading && reports.length > 0 ? <Text style={styles.listFooterText}>Đang tải thêm…</Text> : null
      }
      renderItem={({ item }) => <ReportSummaryCard report={item} onOpen={onOpen} />}
    />
  );
}

function ReportSummaryCard({
  report,
  onOpen,
}: {
  report: OwnReportSummary;
  onOpen: (id: string) => void;
}) {
  const disaster = disasterOf(report.incidentType ?? "");
  return (
    <Pressable
      onPress={() => onOpen(report.id)}
      style={({ pressed }) => [styles.reportCard, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
      accessibilityLabel={`Báo cáo ${disaster.label}, ${statusLabel(report.status)}`}
    >
      <View style={styles.reportCardTop}>
        <Text style={styles.reportCardIcon}>{disaster.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.reportCardTitle}>{disaster.label}</Text>
          <Text style={styles.reportCardDate}>{formatShortTime(report.createdAt) || "Không rõ thời gian"}</Text>
        </View>
        <Text style={styles.reportCardArrow}>›</Text>
      </View>
      <Text style={styles.reportCardDescription} numberOfLines={2}>
        {report.description}
      </Text>
      <View style={styles.reportCardStatusRow}>
        <View style={styles.reportStatusPill}>
          <Text style={styles.reportStatusText}>{statusLabel(report.status)}</Text>
        </View>
        <Text style={styles.reportProcessingText}>{processingLabel(report.processingState)}</Text>
      </View>
    </Pressable>
  );
}

function ReportDetailView({
  report,
  loading,
  refreshing,
  error,
  onBack,
  onRetry,
  onRefresh,
}: {
  report: OwnReportDetail | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onBack: () => void;
  onRetry: () => void;
  onRefresh: () => void;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.detailHeaderRow}>
        <Pressable onPress={onBack} style={styles.touchControl} accessibilityRole="button" accessibilityLabel="Quay lại lịch sử">
          <Text style={styles.backLink}>‹ Quay lại</Text>
        </Pressable>
        <Text style={styles.detailHeaderTitle}>Chi tiết báo cáo</Text>
        <Pressable
          onPress={onRefresh}
          disabled={refreshing || loading}
          style={styles.touchControl}
          accessibilityRole="button"
          accessibilityLabel="Làm mới chi tiết báo cáo"
          accessibilityState={{ busy: refreshing || loading, disabled: refreshing || loading }}
        >
          <Text style={styles.backLink}>{refreshing ? "…" : "↻"}</Text>
        </Pressable>
      </View>
      {loading && !report ? (
        <View style={styles.reportListPadding}>
          {[0, 1, 2].map((item) => <View key={item} style={styles.skeleton} />)}
        </View>
      ) : error && !report ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>⚠</Text>
          <Text style={styles.emptyTitle}>Không tải được chi tiết</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable onPress={onRetry} style={styles.retryControl} accessibilityRole="button">
            <Text style={styles.linkText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : report ? (
        <ScrollView contentContainerStyle={styles.detailScroll}>
          {error ? (
            <View style={styles.cachedErrorBox}>
              <Text style={styles.cachedErrorText}>Đang hiển thị dữ liệu đã tải. {error}</Text>
            </View>
          ) : null}
          <Text style={styles.detailDescriptionLabel}>Mô tả gốc</Text>
          <Text style={styles.detailDescription}>{report.description}</Text>

          <View style={styles.detailStatusGrid}>
            <StatusFact label="Giai đoạn xử lý" value={processingLabel(report.processingState)} />
            <StatusFact label="Trạng thái vận hành" value={statusLabel(report.status)} />
          </View>
          <Text style={styles.detailExplanation}>
            Giai đoạn xử lý và trạng thái vận hành là hai thông tin khác nhau. Trạng thái vận hành phản
            ánh tiến độ điều phối; giai đoạn xử lý phản ánh việc phân tích báo cáo.
          </Text>

          <Text style={styles.sectionTitle}>Thông tin sự cố</Text>
          <DetailField label="Loại sự cố" value={report.incidentType ?? "Chưa xác định"} />
          <DetailField label="Số người ảnh hưởng" value={formatNumber(report.affectedPeople)} />
          {report.location ? <DetailField label="Vị trí" value={report.location} /> : null}
          {report.incidentLat != null && report.incidentLng != null ? (
            <DetailField label="Tọa độ điểm nạn" value={`${report.incidentLat}, ${report.incidentLng}`} />
          ) : null}
          <DetailField label="Ưu tiên" value={report.priority ?? "Chưa có"} />
          <DetailField
            label="Mức độ"
            value={report.severityLevel != null ? `${report.severityLevel}/5` : "Chưa có"}
          />

          <Text style={styles.sectionTitle}>Điều phối và ghi chú</Text>
          <DetailField label="Ghi chú cơ quan điều phối" value={report.adminNote ?? "Không có ghi chú"} />
          <DetailField label="Lý do từ chối" value={report.rejectionReason ?? "Không có"} />
          <DetailField
            label="Kết quả giao"
            value={report.deliveryOutcome ? OUTCOME_LABEL[report.deliveryOutcome] ?? report.deliveryOutcome : "Chưa có"}
          />
          <DetailField label="Ghi chú giao" value={report.deliveryNote ?? "Không có"} />

          <Text style={styles.sectionTitle}>Thời gian</Text>
          <DetailField label="Tạo lúc" value={formatDate(report.createdAt)} />
          <DetailField label="Cập nhật lúc" value={formatDate(report.updatedAt)} />
          <DetailField label="Duyệt lúc" value={formatDate(report.approvedAt)} />
          <DetailField label="Hoàn thành lúc" value={formatDate(report.completedAt)} />

          <Text style={styles.sectionTitle}>Âm thanh</Text>
          <DetailField
            label="Bản ghi gốc"
            value={report.audio.present ? "Có bản ghi âm" : "Không có bản ghi âm"}
          />
          {report.audio.present ? (
            <>
              <DetailField label="Định dạng" value={report.audio.mimeType ?? "Không rõ"} />
              <DetailField label="Dung lượng" value={formatBytes(report.audio.sizeBytes)} />
              <DetailField label="Thời lượng" value={formatDuration(report.audio.durationSeconds)} />
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Thời gian logistics</Text>
          {report.warehouseLogisticsEstimates.length > 0 ? (
            <View>
              {report.warehouseLogisticsEstimates.map((estimate) => (
                <Text
                  key={`${estimate.warehouseName}-${estimate.calculatedAt}`}
                  style={styles.detailExplanation}
                >
                  Ước tính logistics từ {estimate.warehouseName}: {estimate.etaMinutes} phút,
                  khoảng cách {estimate.distanceKm} km. Nguồn {etaSourceLabel(estimate.source)},
                  tính lúc {formatDate(estimate.calculatedAt)}. Đây không phải thời gian đội cứu hộ
                  đến hiện trường.
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>Chưa có thời gian vận chuyển ước tính</Text>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

function StatusFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailStatusFact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function etaSourceLabel(source: "google" | "haversine"): string {
  return source === "google" ? "Google Routes" : "khoảng cách đường chim bay";
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailField}>
      <Text style={styles.detailFieldLabel}>{label}</Text>
      <Text style={styles.detailFieldValue}>{value}</Text>
    </View>
  );
}

function formatNumber(value: number | null): string {
  return value == null ? "Chưa xác định" : `${value} người`;
}

function formatDate(value: string | null | undefined): string {
  return value ? formatLongTime(value) || "Không rõ thời gian" : "Chưa có";
}

function formatBytes(value: number | null): string {
  if (value == null || value < 0) return "Không rõ";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value >= 1024 * 1024 ? 1 : 0)} KB`;
}

function formatDuration(value: number | null): string {
  if (value == null || value < 0) return "Không rõ";
  return `${Math.round(value)} giây`;
}
