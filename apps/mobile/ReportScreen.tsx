import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { submitReport, transcribe, type AuthUser } from "./api";
import { isRecordingSupported, startRecording, type AudioRecording } from "./audio";
import { MAX_RECORDING_MS } from "./audio-platform-state";
import { c, styles } from "./styles";

type MicStatus = "idle" | "recording" | "transcribing";

/**
 * Màn báo cáo tình huống cho trưởng thôn (role REPORTER) trên mobile.
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được báo cáo");
    } finally {
      setSending(false);
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
        <View>
          <Text style={styles.title}>Báo cáo tình huống</Text>
          <Text style={styles.subtitle}>
            {user.fullName ?? user.email} · Trưởng thôn
          </Text>
        </View>
        <Pressable onPress={onLogout} accessibilityRole="button">
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
                  micStatus === "recording"
                    ? styles.micButtonTextRecording
                    : styles.micButtonText
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
      </ScrollView>
    </View>
  );
}
