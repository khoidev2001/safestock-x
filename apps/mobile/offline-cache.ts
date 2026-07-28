import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";
import {
  parseOfflineEnvelope,
  serializeOfflineEnvelope,
  type ParsedOfflineEnvelope,
} from "./offline-cache-state";

const CACHE_PREFIX = "safestock.mobile.cache.v1";
const ENCRYPTED_PREFIX = "safestock.encrypted-cache.v1:";

interface NativeSecureCacheCipher {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

function nativeSecureCacheCipher(): NativeSecureCacheCipher | null {
  const module = NativeModules.SecureCacheCipher as
    | Partial<NativeSecureCacheCipher>
    | undefined;
  return typeof module?.encrypt === "function" &&
    typeof module?.decrypt === "function"
    ? (module as NativeSecureCacheCipher)
    : null;
}

export async function readOfflineCache<T>(
  userId: string,
  scope: string,
): Promise<ParsedOfflineEnvelope<T> | null> {
  const key = cacheKey(userId, scope);
  const stored = await AsyncStorage.getItem(key);
  if (!stored) return null;

  if (Platform.OS === "web") {
    return parseOfflineEnvelope<T>(stored, userId);
  }
  if (!stored.startsWith(ENCRYPTED_PREFIX)) {
    await AsyncStorage.removeItem(key);
    return null;
  }
  const cipher = nativeSecureCacheCipher();
  if (!cipher) {
    await AsyncStorage.removeItem(key);
    return null;
  }
  try {
    const raw = await cipher.decrypt(stored.slice(ENCRYPTED_PREFIX.length));
    return parseOfflineEnvelope<T>(raw, userId);
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function writeOfflineCache<T>(
  userId: string,
  scope: string,
  data: T,
): Promise<void> {
  const raw = serializeOfflineEnvelope(userId, data);
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(cacheKey(userId, scope), raw);
    return;
  }
  const cipher = nativeSecureCacheCipher();
  if (!cipher) {
    await AsyncStorage.removeItem(cacheKey(userId, scope));
    return;
  }
  try {
    const encrypted = await cipher.encrypt(raw);
    await AsyncStorage.setItem(
      cacheKey(userId, scope),
      `${ENCRYPTED_PREFIX}${encrypted}`,
    );
  } catch {
    // Fail closed: dữ liệu live vẫn dùng được nhưng không để lại cache plaintext.
    await AsyncStorage.removeItem(cacheKey(userId, scope));
  }
}

export async function clearOfflineCache(userId: string): Promise<void> {
  const prefix = `${CACHE_PREFIX}.${userId}.`;
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(prefix),
  );
  if (keys.length > 0) await AsyncStorage.multiRemove(keys);
}

function cacheKey(userId: string, scope: string): string {
  return `${CACHE_PREFIX}.${userId}.${scope}`;
}
