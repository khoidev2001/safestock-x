package vn.ungphonhanh.safestock.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Mã hóa cache offline bằng AES-256-GCM. Khóa không rời Android Keystore;
 * AsyncStorage chỉ nhận IV + ciphertext đã xác thực.
 */
class SecureCacheCipherModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val KEY_ALIAS = "safestock.offline-cache.v1"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val FORMAT_VERSION: Byte = 1
    private const val GCM_TAG_BITS = 128
    private const val MAX_PLAINTEXT_BYTES = 8 * 1024 * 1024
  }

  private val cryptoExecutor: ExecutorService =
    Executors.newSingleThreadExecutor()

  override fun getName(): String = "SecureCacheCipher"

  @ReactMethod
  fun encrypt(plaintext: String, promise: Promise) {
    cryptoExecutor.execute {
      try {
        val bytes = plaintext.toByteArray(StandardCharsets.UTF_8)
        if (bytes.size > MAX_PLAINTEXT_BYTES) {
          throw IllegalArgumentException("Cache vượt giới hạn 8 MB.")
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val ciphertext = cipher.doFinal(bytes)
        val iv = cipher.iv
        val payload = ByteBuffer
          .allocate(2 + iv.size + ciphertext.size)
          .put(FORMAT_VERSION)
          .put(iv.size.toByte())
          .put(iv)
          .put(ciphertext)
          .array()
        promise.resolve(Base64.encodeToString(payload, Base64.NO_WRAP))
      } catch (error: Exception) {
        promise.reject(
          "E_CACHE_ENCRYPT",
          "Không mã hóa được dữ liệu offline.",
          error,
        )
      }
    }
  }

  @ReactMethod
  fun decrypt(encodedPayload: String, promise: Promise) {
    cryptoExecutor.execute {
      try {
        val payload = Base64.decode(encodedPayload, Base64.NO_WRAP)
        if (payload.size < 2) {
          throw IllegalArgumentException("Payload cache không hợp lệ.")
        }
        val buffer = ByteBuffer.wrap(payload)
        if (buffer.get() != FORMAT_VERSION) {
          throw IllegalArgumentException("Phiên bản cache không được hỗ trợ.")
        }
        val ivLength = buffer.get().toInt() and 0xff
        if (ivLength !in 12..32 || buffer.remaining() <= ivLength) {
          throw IllegalArgumentException("IV cache không hợp lệ.")
        }
        val iv = ByteArray(ivLength)
        buffer.get(iv)
        val ciphertext = ByteArray(buffer.remaining())
        buffer.get(ciphertext)

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
          Cipher.DECRYPT_MODE,
          getOrCreateKey(),
          GCMParameterSpec(GCM_TAG_BITS, iv),
        )
        val plaintext = cipher.doFinal(ciphertext)
        promise.resolve(String(plaintext, StandardCharsets.UTF_8))
      } catch (error: Exception) {
        promise.reject(
          "E_CACHE_DECRYPT",
          "Cache offline không hợp lệ hoặc không còn đọc được.",
          error,
        )
      }
    }
  }

  private fun getOrCreateKey(): SecretKey {
    val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    val existing = keyStore.getKey(KEY_ALIAS, null)
    if (existing is SecretKey) return existing

    val generator = KeyGenerator.getInstance(
      KeyProperties.KEY_ALGORITHM_AES,
      ANDROID_KEYSTORE,
    )
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .setRandomizedEncryptionRequired(true)
        .build(),
    )
    return generator.generateKey()
  }

  override fun invalidate() {
    cryptoExecutor.shutdownNow()
    super.invalidate()
  }
}
