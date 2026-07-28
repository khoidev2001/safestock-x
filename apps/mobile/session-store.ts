import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  parseStoredSession,
  serializeSession,
  type StoredSession,
} from "./session-state";

const SESSION_KEY = "safestock.mobile.session.v1";

export async function loadStoredSession(): Promise<StoredSession | null> {
  const raw =
    Platform.OS === "web"
      ? await AsyncStorage.getItem(SESSION_KEY)
      : await SecureStore.getItemAsync(SESSION_KEY);
  return parseStoredSession(raw);
}

export async function saveStoredSession(
  session: StoredSession,
): Promise<void> {
  const raw = serializeSession(session);
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(SESSION_KEY, raw);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, raw, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearStoredSession(): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
