import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/** iOS notification haptics; Android CONFIRM / REJECT (Mobile_Design_System.md). Never throws. */
export const haptic = {
  success() {
    void (Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    ).catch(() => undefined);
  },
  error() {
    void (Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    ).catch(() => undefined);
  },
  warning() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  },
  select() {
    void Haptics.selectionAsync().catch(() => undefined);
  },
};
