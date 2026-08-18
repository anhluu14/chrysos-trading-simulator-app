import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

interface SecureStorage {
  setItem: (key: string, value: string) => Promise<void>;
  getItem: (key: string) => Promise<string | null>;
  deleteItem: (key: string) => Promise<void>;
}

const PREFIX = Constants.expoConfig?.extra?.SECURE_STORE_PREFIX || "";
const keyFor = (key: string) => `${PREFIX}${key}`;
const usesWebStorage = Platform.OS === "web";

const secureStorage: SecureStorage = {
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (usesWebStorage) {
        await AsyncStorage.setItem(keyFor(key), value);
        return;
      }
      await SecureStore.setItemAsync(keyFor(key), value);
    } catch (error) {
      console.error("SecureStorage setItem error:", error);
      throw error;
    }
  },

  async getItem(key: string): Promise<string | null> {
    try {
      if (usesWebStorage) {
        return await AsyncStorage.getItem(keyFor(key));
      }
      return await SecureStore.getItemAsync(keyFor(key));
    } catch (error) {
      console.error("SecureStorage getItem error:", error);
      return null;
    }
  },

  async deleteItem(key: string): Promise<void> {
    try {
      if (usesWebStorage) {
        await AsyncStorage.removeItem(keyFor(key));
        return;
      }
      await SecureStore.deleteItemAsync(keyFor(key));
    } catch (error) {
      console.error("SecureStorage deleteItem error:", error);
      throw error;
    }
  },
};

export default secureStorage;
