import { useEffect } from 'react';
import { Redirect, Tabs } from 'expo-router';
import { colors } from '@nestovin/design-tokens';
import { useAuth } from '../../lib/auth';
import { registerForPush } from '../../lib/push';
import { Loading, Screen } from '../../components/ui';

/** Signed-in area. Hidden routes (href: null) open from within tabs. */
export default function AppLayout() {
  const { session, ready } = useAuth();
  useEffect(() => {
    if (session) void registerForPush();
  }, [session]);
  if (!ready) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.tealAction, tabBarInactiveTintColor: colors.textSecondary }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="book" options={{ title: 'Book' }} />
      <Tabs.Screen name="visits" options={{ title: 'Visits' }} />
      <Tabs.Screen name="support" options={{ title: 'Support' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="register" options={{ href: null }} />
      <Tabs.Screen name="vote" options={{ href: null }} />
      <Tabs.Screen name="bookings" options={{ href: null }} />
      <Tabs.Screen name="ticket/[id]" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="household" options={{ href: null }} />
    </Tabs>
  );
}
