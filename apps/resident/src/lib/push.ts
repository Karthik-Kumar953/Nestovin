import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { hrefForPush } from './deeplinks';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
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
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Updates',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    let granted =
      current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return 'denied';
    const token = await Notifications.getDevicePushTokenAsync();
    await api('/v1/resident/devices', {
      method: 'POST',
      body: { token: String(token.data), platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    });
    return 'registered';
  } catch {
    // Missing Firebase config (google-services.json) or Expo Go: in-app inbox still works.
    return 'unavailable';
  }
}

/** Notifications already routed, so a cold-start response is never replayed when the layout re-renders. */
const handled = new Set<string>();

function openFromResponse(resp: Notifications.NotificationResponse | null) {
  if (!resp) return;
  const id = resp.notification.request.identifier;
  if (handled.has(id)) return;
  handled.add(id);
  // The API sends `eventType` plus the event's own fields (all strings) in the push data.
  const href = hrefForPush(
    resp.notification.request.content.data as Record<string, unknown> | undefined,
  );
  if (href) router.push(href);
}

/**
 * Tapping a push opens the same screen as the matching item in the Updates inbox (RES-13):
 * taps while the app runs, plus the tap that launched the app (cold start). Native only.
 */
export function usePushNavigation(enabled: boolean, onReceived?: () => void) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    void Notifications.getLastNotificationResponseAsync()
      .then(openFromResponse)
      .catch(() => undefined);
    const tap = Notifications.addNotificationResponseReceivedListener(openFromResponse);
    const recv = Notifications.addNotificationReceivedListener(() => onReceived?.());
    return () => {
      tap.remove();
      recv.remove();
    };
  }, [enabled, onReceived]);
}
