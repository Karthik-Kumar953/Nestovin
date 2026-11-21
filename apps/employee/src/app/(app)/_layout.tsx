import { useEffect } from 'react';
import { Redirect, Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'react-native-reanimated';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { registerForPush } from '../../lib/push';
import { useMe } from '../../lib/queries';
import { supabase } from '../../lib/supabase';
import { AppLoading, c } from '../../ui';

/**
 * Signed-in area. Guards: a session, an active employee (/me succeeds) and a
 * changed temporary password. Pushed screens use the native header.
 */
export default function AppLayout() {
  const { session, ready } = useAuth();
  const qc = useQueryClient();
  const me = useMe(!!session);
  const reduceMotion = useReducedMotion();
  const unauth = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (unauth) void supabase.auth.signOut().then(() => qc.clear());
  }, [qc, unauth]);
  useEffect(() => {
    if (me.data && !me.data.mustChangePassword) void registerForPush();
  }, [me.data]);

  if (!ready) return <AppLoading />;
  if (!session || unauth) return <Redirect href="/welcome" />;
  if (me.data?.mustChangePassword) return <Redirect href="/change-password" />;
  if (!me.data && me.isPending) return <AppLoading />;

  const header = {
    headerShown: true,
    headerTintColor: c.tealAction,
    headerTitleStyle: { fontFamily: 'Manrope_700Bold', color: c.charcoal },
    headerShadowVisible: false,
    headerStyle: { backgroundColor: c.background },
    headerBackButtonDisplayMode: 'minimal' as const,
    contentStyle: { backgroundColor: c.background },
    ...(reduceMotion ? { animation: 'fade' as const } : {}),
  };
  return (
    <Stack screenOptions={header}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="visit/[id]/index" options={{ title: 'Visit' }} />
      <Stack.Screen name="visit/[id]/check-in" options={{ title: 'Check in', presentation: 'fullScreenModal', gestureEnabled: false }} />
      <Stack.Screen name="visit/[id]/complete" options={{ title: 'Complete visit', presentation: 'modal' }} />
      <Stack.Screen name="visit/[id]/absent" options={{ title: 'Resident not available', presentation: 'modal' }} />
      <Stack.Screen name="visit/[id]/correction" options={{ title: 'Request a correction', presentation: 'modal' }} />
      <Stack.Screen name="offers" options={{ title: 'Extra work' }} />
      <Stack.Screen name="leave/index" options={{ title: 'Leave' }} />
      <Stack.Screen name="leave/new" options={{ title: 'Request leave', presentation: 'modal' }} />
      <Stack.Screen name="training" options={{ title: 'Training' }} />
      <Stack.Screen name="payslips" options={{ title: 'Payslips' }} />
    </Stack>
  );
}
