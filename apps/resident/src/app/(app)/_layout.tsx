import { useCallback, useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { colors, SkeletonList } from '@nestovin/ui-native';
import { useAuth } from '../../lib/auth';
import { keys } from '../../lib/queries';
import { registerForPush, usePushNavigation } from '../../lib/push';

/** Signed-in area: tabs plus pushed screens. Registers push and opens the right screen from a notification tap. */
export default function AppLayout() {
  const { session, ready } = useAuth();
  const qc = useQueryClient();

  const refreshInbox = useCallback(() => void qc.invalidateQueries({ queryKey: keys.inbox }), [qc]);
  useEffect(() => {
    if (session && Platform.OS !== 'web') void registerForPush();
  }, [session]);
  // Push taps (and the tap that launched the app) open the related screen; a foreground push refreshes the inbox.
  usePushNavigation(Boolean(session), refreshInbox);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 96 }}>
        <SkeletonList count={3} media />
      </View>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'default',
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="check-in/[id]"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="payment-result" options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack>
  );
}
