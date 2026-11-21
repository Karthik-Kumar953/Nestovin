import { Alert, Platform } from 'react-native';

/*
 * Alert.alert does nothing on react-native-web, so confirmations and error
 * notices fall back to the browser's own dialogs there. Native keeps the
 * system alert (iOS destructive style, Android Material dialog).
 */

type WebWindow = { confirm: (m: string) => boolean; alert: (m: string) => void };
const web = () => globalThis as unknown as WebWindow;

/** Ask before a destructive or irreversible step. `onConfirm` runs only on yes. */
export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
}: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  if (Platform.OS === 'web') {
    if (web().confirm(message ? `${title}\n\n${message}` : title)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

/** A short notice with one OK button (errors after an action). */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    web().alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
