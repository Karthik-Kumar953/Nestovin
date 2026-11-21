import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, Button, Entrance, Field, OtpInput, Photo, Text, haptics } from '@nestovin/ui-native';
import { supabase } from '../lib/supabase';
import { toE164, useAuth } from '../lib/auth';
import { missingEnv } from '../lib/env';
import { img } from '../assets/images';
import { Logo } from '../components/common';

const RESEND_SECONDS = 30;

/** RES-01: phone OTP sign-in (Supabase Auth via the MSG91 hook). Two steps on one screen. */
export default function SignIn() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (!wait) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  if (session) return <Redirect href="/" />;

  const send = async () => {
    const e164 = toE164(phone);
    if (!e164) {
      haptics.error();
      return setPhoneError('Enter a 10-digit mobile number, for example 98765 43210');
    }
    setBusy(true);
    setPhoneError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) {
      haptics.error();
      return setPhoneError(error.message.toLowerCase().includes('rate') ? 'Too many attempts. Wait a minute, then try again.' : 'We could not send the code. Check the number and try again.');
    }
    setSentTo(e164);
    setCode('');
    setWait(RESEND_SECONDS);
  };

  const verify = async (value = code) => {
    if (!sentTo || !/^\d{6}$/.test(value)) return setCodeError('Enter the 6-digit code');
    setBusy(true);
    setCodeError(null);
    const { error } = await supabase.auth.verifyOtp({ phone: sentTo, token: value, type: 'sms' });
    setBusy(false);
    if (error) {
      haptics.error();
      setCodeError('That code is not correct or has expired. Check the SMS or send a new code.');
    } else haptics.success();
  };

  const pretty = sentTo ? `${sentTo.slice(0, 3)} ${sentTo.slice(3, 8)} ${sentTo.slice(8)}` : '';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} className="bg-white">
      <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ flexGrow: 1 }}>
        <Photo source={img('res-onboarding-hero.jpg')} scrim fallbackIcon="home-outline" style={{ height: 420 + insets.top }} contentPosition="top" alt="A Nestovin housekeeper at work in a bright home">
          <View style={{ paddingTop: insets.top + 16 }} className="flex-1 justify-between px-gutter pb-16">
            <View className="self-start rounded-lg bg-white p-2.5">
              <Logo size={34} />
            </View>
            <Entrance delay={120} className="gap-2">
              <Text variant="display" tone="inverse">
                Trusted help for your home
              </Text>
              <Text variant="lead" tone="inverseMuted">
                Maid, cook and caretaker services, managed by Nestovin for your community.
              </Text>
            </Entrance>
          </View>
        </Photo>

        <View style={{ paddingBottom: insets.bottom + 24 }} className="-mt-8 flex-1 rounded-t-2xl bg-white px-gutter pt-7 gap-5">
          {missingEnv.length ? <Banner tone="warning" title="App setup incomplete">{`Missing ${missingEnv.join(', ')}. See apps/resident/README.md.`}</Banner> : null}
          {!sentTo ? (
            <Entrance key="phone" className="gap-5">
              <View className="gap-1">
                <Text variant="h2">Sign in or create an account</Text>
                <Text variant="body" tone="muted">We will text you a 6-digit code.</Text>
              </View>
              <Field
                label="Mobile number"
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  if (phoneError) setPhoneError(null);
                }}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder="98765 43210"
                maxLength={16}
                error={phoneError}
                prefix={<Text variant="bodyStrong" tone="muted">+91</Text>}
                returnKeyType="send"
                onSubmitEditing={() => void send()}
              />
              <Button title="Send code" onPress={() => void send()} loading={busy} />
              <Text variant="sm" tone="muted" className="text-center">
                Nestovin uses your number only to sign you in and to reach you about your service.
              </Text>
            </Entrance>
          ) : (
            <Entrance key="code" className="gap-5">
              <View className="gap-1">
                <Text variant="h2">Enter the code</Text>
                <Text variant="body" tone="muted">
                  Sent to <Text variant="bodyStrong">{pretty}</Text>
                </Text>
              </View>
              <OtpInput
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (codeError) setCodeError(null);
                }}
                onComplete={(v) => void verify(v)}
                error={codeError}
              />
              <Button title="Verify and continue" onPress={() => void verify()} loading={busy} disabled={code.length < 6} />
              <View className="flex-row justify-between">
                <Button title="Change number" variant="tertiary" size="sm" block={false} onPress={() => setSentTo(null)} />
                <Button title={wait ? `Resend in ${wait}s` : 'Send a new code'} variant="tertiary" size="sm" block={false} disabled={wait > 0 || busy} onPress={() => void send()} />
              </View>
            </Entrance>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
