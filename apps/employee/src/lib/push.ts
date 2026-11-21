import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const TOKEN_KEY = 'nv-worker-push-token';

/**
 * Registers this device's native push token with the API (EMP-10). Push needs
 * a development/production build with Firebase configured; the in-app Updates
 * inbox works without it.
 */
export async function registerForPush(): Promise<'registered' | 'denied' | 'unavailable'> {
  try {
    if (!Device.isDevice) return 'unavailable';
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Work updates', importance: Notifications.AndroidImportance.HIGH });
    }
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return 'denied';
    const token = String((await Notifications.getDevicePushTokenAsync()).data);
    await api('/v1/employee/devices', { method: 'POST', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return 'registered';
  } catch {
    return 'unavailable';
  }
}

/** Best effort on sign-out, so a shared phone stops receiving this worker's updates. */
export async function unregisterPush() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) await api('/v1/employee/devices/remove', { method: 'POST', body: { token } });
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Offline or already gone: the token expires server-side when delivery fails.
  }
}
