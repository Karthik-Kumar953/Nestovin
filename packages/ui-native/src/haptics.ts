import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/** Platform haptics per Mobile_Design_System.md: iOS feedback generators, Android CONFIRM/REJECT. Never throws. */
const safe = (p: Promise<void>) => void p.catch(() => undefined);

export const haptics = {
  tap: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => safe(Platform.OS === 'android' ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick) : Haptics.selectionAsync()),
  success: () =>
    safe(Platform.OS === 'android' ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm) : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () =>
    safe(Platform.OS === 'android' ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject) : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  warning: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
