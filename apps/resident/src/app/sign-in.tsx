import { useState } from 'react';
import { Redirect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { toE164, useAuth } from '../lib/auth';
import { missingEnv } from '../lib/env';
import { Banner, Button, Field, H1, P, Screen } from '../components/ui';

/** RES-01: phone OTP sign-in. The OTP is sent by Supabase Auth via the MSG91 hook. */
export default function SignIn() {
  const { session } = useAuth();
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Redirect href="/" />;

  const send = async () => {
    const e164 = toE164(phone);
    if (!e164) return setError('Enter a valid 10-digit mobile number');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (err) return setError(err.message.includes('rate') ? 'Too many attempts. Please wait a minute and try again.' : 'We could not send the code. Please try again.');
    setSentTo(e164);
  };

  const verify = async () => {
    if (!sentTo || !/^\d{6}$/.test(code)) return setError('Enter the 6-digit code');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ phone: sentTo, token: code, type: 'sms' });
    setBusy(false);
    if (err) setError('That code is not correct or has expired.');
  };

  return (
    <Screen>
      <H1>Welcome to Nestovin</H1>
      <P muted>Managed maid, cook and caretaker services for your home.</P>
      {missingEnv.length ? <Banner tone="warning">App configuration is incomplete ({missingEnv.join(', ')}). See apps/resident/README.md.</Banner> : null}
      {!sentTo ? (
        <>
          <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="98765 43210" maxLength={16} />
          <Button title="Send code" onPress={() => void send()} busy={busy} />
        </>
      ) : (
        <>
          <P>We sent a 6-digit code to {sentTo}.</P>
          <Field label="Code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ''))} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} />
          <Button title="Verify and continue" onPress={() => void verify()} busy={busy} />
          <Button title="Use a different number" variant="ghost" onPress={() => { setSentTo(null); setCode(''); }} />
        </>
      )}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </Screen>
  );
}
