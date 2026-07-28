package vn.ungphonhanh.safestock.voice

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.min

class VoiceRecorderModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val SAMPLE_RATE = 16_000
    private const val CHANNELS = 1
    private const val BYTES_PER_SAMPLE = 2
    private const val MAX_SECONDS = 60
    private const val MAX_PCM_BYTES =
      SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * MAX_SECONDS
  }

  private val stateLock = Any()
  private val captureExecutor: ExecutorService = Executors.newSingleThreadExecutor()

  @Volatile
  private var recording = false

  @Volatile
  private var captureError: String? = null

  private var audioRecord: AudioRecord? = null
  private var pcmFile: File? = null
  private var finalizing = false

  override fun getName(): String = "VoiceRecorder"

  @SuppressLint("MissingPermission")
  @ReactMethod
  fun start(promise: Promise) {
    if (
      ContextCompat.checkSelfPermission(
        reactApplicationContext,
        Manifest.permission.RECORD_AUDIO,
      ) != PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject("E_PERMISSION", "Quyền micro chưa được cấp.")
      return
    }

    synchronized(stateLock) {
      if (audioRecord != null || finalizing) {
        promise.reject("E_BUSY", "Bộ ghi âm đang được sử dụng.")
        return
      }

      val minimumBuffer = AudioRecord.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
      )
      if (minimumBuffer <= 0) {
        promise.reject("E_AUDIO_CONFIG", "Thiết bị không hỗ trợ cấu hình ghi âm 16 kHz.")
        return
      }

      val bufferSize = maxOf(minimumBuffer * 2, 4_096)
      val recorder = try {
        createRecorder(bufferSize)
      } catch (error: Exception) {
        promise.reject("E_AUDIO_INIT", error.message, error)
        return
      }
      val file = try {
        File.createTempFile("voice-", ".pcm", reactApplicationContext.cacheDir)
      } catch (error: Exception) {
        recorder.release()
        promise.reject("E_AUDIO_FILE", "Không tạo được vùng nhớ tạm cho bản ghi.", error)
        return
      }

      try {
        recorder.startRecording()
        if (recorder.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
          throw IllegalStateException("Micro không chuyển sang trạng thái ghi âm.")
        }
      } catch (error: Exception) {
        recorder.release()
        file.delete()
        promise.reject("E_AUDIO_START", error.message, error)
        return
      }

      captureError = null
      recording = true
      audioRecord = recorder
      pcmFile = file
      captureExecutor.execute { capturePcm(recorder, file, bufferSize) }
    }

    promise.resolve(null)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    val recorder: AudioRecord
    val file: File

    synchronized(stateLock) {
      recorder = audioRecord ?: run {
        promise.reject("E_NOT_RECORDING", "Không có bản ghi đang hoạt động.")
        return
      }
      file = pcmFile ?: run {
        promise.reject("E_AUDIO_FILE", "Không tìm thấy dữ liệu ghi âm.")
        return
      }
      recording = false
      audioRecord = null
      pcmFile = null
      finalizing = true
    }

    try {
      if (recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
        recorder.stop()
      }
    } catch (_: IllegalStateException) {
      // The capture loop may already have reached the 60-second limit.
    }

    captureExecutor.execute {
      try {
        recorder.release()
        captureError?.let { throw IllegalStateException(it) }
        val pcm = file.readBytes()
        if (pcm.isEmpty()) {
          promise.resolve("")
        } else {
          val wav = encodeWav(pcm)
          promise.resolve(Base64.encodeToString(wav, Base64.NO_WRAP))
        }
      } catch (error: Exception) {
        promise.reject("E_AUDIO_STOP", error.message, error)
      } finally {
        file.delete()
        captureError = null
        synchronized(stateLock) {
          finalizing = false
        }
      }
    }
  }

  override fun invalidate() {
    val cleanup = synchronized(stateLock) {
      recording = false
      Pair(audioRecord, pcmFile).also {
        audioRecord = null
        pcmFile = null
      }
    }
    try {
      cleanup.first?.stop()
    } catch (_: IllegalStateException) {
      // Already stopped.
    }
    captureExecutor.execute {
      cleanup.first?.release()
      cleanup.second?.delete()
    }
    captureExecutor.shutdown()
    super.invalidate()
  }

  @SuppressLint("MissingPermission")
  private fun createRecorder(bufferSize: Int): AudioRecord {
    val sources = intArrayOf(
      MediaRecorder.AudioSource.VOICE_RECOGNITION,
      MediaRecorder.AudioSource.MIC,
    )
    var lastError: Exception? = null

    for (source in sources) {
      try {
        val recorder = AudioRecord(
          source,
          SAMPLE_RATE,
          AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT,
          bufferSize,
        )
        if (recorder.state == AudioRecord.STATE_INITIALIZED) {
          return recorder
        }
        recorder.release()
      } catch (error: Exception) {
        lastError = error
      }
    }
    throw IllegalStateException("Không khởi tạo được micro.", lastError)
  }

  private fun capturePcm(
    recorder: AudioRecord,
    file: File,
    bufferSize: Int,
  ) {
    try {
      FileOutputStream(file).use { output ->
        val buffer = ByteArray(bufferSize)
        var written = 0
        while (recording && written < MAX_PCM_BYTES) {
          val requested = min(buffer.size, MAX_PCM_BYTES - written)
          val read = recorder.read(buffer, 0, requested)
          when {
            read > 0 -> {
              output.write(buffer, 0, read)
              written += read
            }
            read == AudioRecord.ERROR_INVALID_OPERATION ||
              read == AudioRecord.ERROR_BAD_VALUE ||
              read == AudioRecord.ERROR_DEAD_OBJECT -> {
              if (recording) {
                captureError = "Micro ngừng hoạt động khi đang ghi âm."
              }
              break
            }
          }
        }
      }
    } catch (error: Exception) {
      if (recording) {
        captureError = error.message ?: "Không đọc được dữ liệu micro."
      }
    } finally {
      recording = false
    }
  }

  private fun encodeWav(pcm: ByteArray): ByteArray {
    val wav = ByteArray(44 + pcm.size)
    val header = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN)
    header.put("RIFF".toByteArray(StandardCharsets.US_ASCII))
    header.putInt(36 + pcm.size)
    header.put("WAVE".toByteArray(StandardCharsets.US_ASCII))
    header.put("fmt ".toByteArray(StandardCharsets.US_ASCII))
    header.putInt(16)
    header.putShort(1)
    header.putShort(CHANNELS.toShort())
    header.putInt(SAMPLE_RATE)
    header.putInt(SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE)
    header.putShort((CHANNELS * BYTES_PER_SAMPLE).toShort())
    header.putShort((BYTES_PER_SAMPLE * 8).toShort())
    header.put("data".toByteArray(StandardCharsets.US_ASCII))
    header.putInt(pcm.size)
    header.put(pcm)
    return wav
  }
}
