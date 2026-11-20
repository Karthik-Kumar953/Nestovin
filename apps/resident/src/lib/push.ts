import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/**
 * Registers this device's native push token (FCM on Android, APNs on iOS) with
 * the API (RES-13). Push needs a development/production build with Firebase
 * configured; everything is still delivered to the in-app inbox without it.
 */
export async function registerForPush(): Promise<'registered' | 'denied' | 'unavailable'> {
  try {
    if (!Device.isDevice) return 'unavailable';
    if (Platform.OS === 'android') {
      // Android 13+: the channel must exist before asking, or no prompt appears.
      await Notifications.setNotificationChannelAsync('default', { name: 'Updates', importance: Notifications.AndroidImportance.DEFAULT });
    }
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return 'denied';
    const token = await Notifications.getDevicePushTokenAsync();
    await api('/v1/resident/devices', { method: 'POST', body: { token: String(token.data), platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
    return 'registered';
  } catch {
    // Missing Firebase config (google-services.json) or Expo Go: in-app inbox still works.
    return 'unavailable';
  }
}
