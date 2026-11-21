import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Check, KeyRound, ShieldCheck } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { passwordProblem, useAuth } from '../lib/auth';
import { haptic } from '../lib/haptics';
import { qk } from '../lib/queries';
import { supabase } from '../lib/supabase';
import type { Me } from '../lib/types';
import { Banner, Button, Field, Muted, Screen, Stagger, Text, Title, c } from '../ui';

/** ADR-012: the temporary password from HR must be replaced at first sign-in. */
export default function ChangePassword() {
  const { session, ready } = useAuth();
  const qc = useQueryClient();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ pw?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (ready && !session) return <Redirect href="/welcome" />;

  const rules = [
    { ok: pw.length >= 8, text: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(pw) && /\d/.test(pw), text: 'Letters and at least one number' },
    { ok: pw.length > 0 && pw === confirm, text: 'Both passwords match' },
  ];

  const submit = async () => {
    const problem = passwordProblem(pw);
    const next = { pw: problem ?? undefined, confirm: pw !== confirm ? 'The passwords do not match' : undefined };
    setErrors(next);
    if (next.pw || next.confirm) return;
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.updateUser({ password: pw });
    if (authError) {
      setBusy(false);
      haptic.error();
      setError(authError.message.toLowerCase().includes('different') ? 'Choose a password that is different from the temporary one.' : 'We could not change your password. Please try again.');
      return;
    }
    try {
      const me = await api<Me>('/v1/employee/me/password-changed', { method: 'POST' });
      qc.setQueryData(qk.me, me);
      haptic.success();
      router.replace('/(app)/(tabs)');
    } catch (e) {
      // The new password is already saved; retrying only clears the "must change" flag.
      setError(`${errorMessage(e)} Your new password is saved. Tap Save again to continue.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          <Button title="Save new password" icon={ShieldCheck} busy={busy} onPress={() => void submit()} />
          <Button title="Sign out" variant="ghost" onPress={() => void supabase.auth.signOut().then(() => router.replace('/welcome'))} />
        </>
      }
    >
      <View className="h-6" />
      <Stagger index={0}>
        <View className="h-16 w-16 items-center justify-center rounded-xl bg-mint">
          <KeyRound size={30} color={c.tealDeep} strokeWidth={2} />
        </View>
      </Stagger>
      <Stagger index={1}>
        <View className="gap-2">
          <Title>Set your own password</Title>
          <Muted>The password from HR was temporary. Choose one only you know. You will use it every time you sign in.</Muted>
        </View>
      </Stagger>
      <Stagger index={2}>
        <View className="gap-4">
          <Field label="New password" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" error={errors.pw} />
          <Field label="Type it again" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" error={errors.confirm} onSubmitEditing={() => void submit()} />
        </View>
      </Stagger>
      <Stagger index={3}>
        <View className="gap-2.5 rounded-lg border border-line bg-surface p-4" accessibilityLabel={`Password rules: ${rules.map((r) => `${r.text} ${r.ok ? 'done' : 'not yet'}`).join(', ')}`}>
          {rules.map((r) => (
            <View key={r.text} className="flex-row items-center gap-3">
              <View className={`h-6 w-6 items-center justify-center rounded-full ${r.ok ? 'bg-green-action' : 'border-[1.5px] border-line'}`}>{r.ok ? <Check size={15} color={c.white} strokeWidth={3} /> : null}</View>
              <Text className={r.ok ? 'text-ink' : 'text-ink-secondary'}>{r.text}</Text>
            </View>
          ))}
        </View>
      </Stagger>
      {error ? <Banner tone="error">{error}</Banner> : null}
    </Screen>
  );
}
