import '../../global.css';
import type { ReactNode } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@nestovin/ui-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { wireOnlineManager } from '../lib/online';
import { AnimatedSplash } from '../components/AnimatedSplash';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
wireOnlineManager();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) =>
        !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export default function RootLayout() {
  const [loaded, failed] = useFonts({
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const ready = loaded || Boolean(failed);
  // The native splash stays up until the in-app splash has painted its first (identical) frame.
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <SplashGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
                <Stack.Screen name="(app)" />
                <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
                <Stack.Screen name="sign-in" options={{ animation: 'slide_from_right' }} />
              </Stack>
            </SplashGate>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Holds the animated splash until the stored session has been restored, so nobody sees a flash of the wrong screen. */
function SplashGate({ children }: { children: ReactNode }) {
  const { ready } = useAuth();
  return <AnimatedSplash ready={ready}>{children}</AnimatedSplash>;
}
