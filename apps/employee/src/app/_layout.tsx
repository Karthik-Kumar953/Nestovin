import '../../global.css';
import '../lib/net';
import { useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { linkFor } from '../lib/links';
import { AnimatedSplash } from '../ui/splash';
import { c } from '../ui/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

/** Notification responses already routed. Module-level so a remount doesn't route the same tap again. */
const handledResponses = new Set<string>();

/**
 * Push tap → the screen for that update (only once signed in). Each response navigates once:
 * the session object changes on every token refresh, and `useLastNotificationResponse` keeps
 * returning the last tap, so the effect alone would re-open the screen (BUG-QA-018).
 */
function NotificationRouter() {
  const signedIn = !!useAuth().session;
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!signedIn || !last) return;
    const id = last.notification.request.identifier;
    if (handledResponses.has(id)) return;
    handledResponses.add(id);
    const data = (last.notification.request.content.data ?? {}) as Record<string, unknown>;
    router.push(linkFor(String(data.eventType ?? ''), data));
  }, [last, signedIn]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  // The native splash (brand background + logo) stays up until fonts load and the
  // in-app splash has painted its first (identical) frame; it hides itself then.
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          {Platform.OS !== 'web' ? <NotificationRouter /> : null}
          <SplashGate>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}>
            <Stack.Screen name="index" options={{ animation: 'fade' }} />
            <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
            <Stack.Screen name="(app)" options={{ animation: 'fade' }} />
            <Stack.Screen name="change-password" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="applied" options={{ gestureEnabled: false }} />
          </Stack>
          </SplashGate>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Holds the animated splash until the stored session has been restored, so nobody sees a flash of the wrong screen. */
function SplashGate({ children }: { children: ReactNode }) {
  const { ready } = useAuth();
  return <AnimatedSplash ready={ready}>{children}</AnimatedSplash>;
}
