import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { AppLoading } from '../ui';

/** Entry: signed-out workers see the welcome screen; signed-in go to Today. */
export default function Index() {
  const { session, ready } = useAuth();
  if (!ready) return <AppLoading />;
  return <Redirect href={session ? '/(app)/(tabs)' : '/welcome'} />;
}
