import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';
import { Stack, router } from 'expo-router';
import { Image } from 'expo-image';
import { LogIn } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { LOGO } from '../assets/images';
import { ApiError, api } from '../lib/api';
import { normalizeEmployeeId, signInWithEmployeeId } from '../lib/auth';
import { missingEnv } from '../lib/env';
import { haptic } from '../lib/haptics';
import { qk } from '../lib/queries';
import { supabase } from '../lib/supabase';
import type { Me } from '../lib/types';
import { Banner, Button, Field, Muted, Screen, Stagger, Text, Title, c } from '../ui';

/** EMP-02: Employee ID + password. The Employee ID maps to an internal staff email (ADR-012). */
export default function SignIn() {
  const qc = useQueryClient();
  const passwordRef = useRef<TextInputInstance>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [idError, setIdError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const code = normalizeEmployeeId(employeeId);
    setIdError(code ? undefined : 'Enter your Employee ID, for example NV-000123');
    if (!code || !password) {
      if (code && !password) setError('Enter your password');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: authError } = await signInWithEmployeeId(code, password);
    if (authError) {
      setBusy(false);
      haptic.error();
      const msg = authError.message.toLowerCase();
      setError(
        msg.includes('fetch') || msg.includes('network')
          ? 'No internet connection. Check your signal and try again.'
          : msg.includes('rate') || msg.includes('too many')
            ? 'Too many attempts. Please wait a few minutes and try again.'
            : 'Employee ID or password is not correct.',
      );
      return;
    }
    try {
      // The API also checks the account is active and login is enabled.
      const me = await api<Me>('/v1/employee/me');
      qc.setQueryData(qk.me, me);
      haptic.success();
      router.replace(me.mustChangePassword ? '/change-password' : '/(app)/(tabs)');
    } catch (e) {
      await supabase.auth.signOut();
      haptic.error();
      setError(e instanceof ApiError ? e.message : 'We could not open your account. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '', headerTransparent: true, headerBackTitle: 'Back', headerTintColor: c.tealAction }} />
      <Screen edges={['bottom', 'left', 'right']} footer={<Button title="Sign in" icon={LogIn} busy={busy} onPress={() => void submit()} />}>
        <View className="h-24" />
        <Stagger index={0}>
          <View className="h-16 w-16 items-center justify-center rounded-xl border border-line bg-white">
            <Image source={LOGO} style={{ width: 42, height: 37 }} contentFit="contain" accessibilityLabel="Nestovin" />
          </View>
        </Stagger>
        <Stagger index={1}>
          <View className="gap-2">
            <Title>Sign in</Title>
            <Muted>Use the Employee ID and password HR gave you.</Muted>
          </View>
        </Stagger>
        {missingEnv.length ? <Banner tone="warning" title="App setup is incomplete">{`Missing ${missingEnv.join(', ')}. See apps/employee/README.md.`}</Banner> : null}
        <Stagger index={2}>
          <View className="gap-4">
            <Field
              label="Employee ID"
              value={employeeId}
              onChangeText={(t) => {
                setEmployeeId(t.toUpperCase());
                setIdError(undefined);
              }}
              onBlur={() => {
                const n = normalizeEmployeeId(employeeId);
                if (n) setEmployeeId(n);
              }}
              placeholder="NV-000123"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              error={idError}
              maxLength={12}
            />
            <Field
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
            />
          </View>
        </Stagger>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Stagger index={3}>
          <View className="rounded-lg bg-mint p-4">
            <Text className="font-semibold text-teal-deep">Forgot your password?</Text>
            <Muted>Ask HR to reset it. They will give you a new temporary password.</Muted>
          </View>
        </Stagger>
      </Screen>
    </>
  );
}
