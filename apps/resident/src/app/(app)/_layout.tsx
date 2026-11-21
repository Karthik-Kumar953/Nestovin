import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Redirect, Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { colors, SkeletonList } from '@nestovin/ui-native';
import { useAuth } from '../../lib/auth';
import { hrefForPush } from '../../lib/deeplinks';
import { keys } from '../../lib/queries';
import { registerForPush } from '../../lib/push';

/** Signed-in area: tabs plus pushed screens. Registers push and opens the right screen from a notification tap. */
export default function AppLayout() {
  const { session, ready } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!session || Platform.OS === 'web') return;
    void registerForPush();
    const open = (resp: Notifications.NotificationResponse | null) => {
      const href = hrefForPush(resp?.notification.request.content.data as Record<string, unknown> | undefined);
      if (href) router.push(href);
    };
    // Cold start from a tapped notification, then taps while running.
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const tap = Notifications.addNotificationResponseReceivedListener(open);
    // A push that arrives in the foreground refreshes the inbox badge.
    const recv = Notifications.addNotificationReceivedListener(() => void qc.invalidateQueries({ queryKey: keys.inbox }));
    return () => {
      tap.remove();
      recv.remove();
    };
  }, [session, qc]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 96 }}>
        <SkeletonList count={3} media />
      </View>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'default' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="check-in/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="payment-result" options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack>
  );
}
