import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { OfflineBanner } from './feedback';
import { Heading, Muted, Title } from './primitives';
import { c } from './theme';

/**
 * Standard screen: mint canvas, 20 px margins, scroll, pull to refresh,
 * offline strip. Tab roots draw their own large title; pushed screens use the
 * native header and pass `edges={['bottom']}`.
 */
export function Screen({
  children,
  title,
  subtitle,
  onRefresh,
  edges = ['top', 'left', 'right'],
  footer,
  scroll = true,
  padded = true,
  offlineMessage,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  onRefresh?: () => Promise<unknown>;
  edges?: Edge[];
  footer?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  offlineMessage?: string;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;
  const head = (
    <>
      {title ? (
        <View className="gap-1 pb-1 pt-2">
          <Title>{title}</Title>
          {subtitle ? <Muted>{subtitle}</Muted> : null}
        </View>
      ) : null}
      <OfflineBanner message={offlineMessage} />
    </>
  );
  const body = <View className={`gap-4 ${padded ? 'px-5' : ''}`}>{head}{children}</View>;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ paddingBottom: footer ? 24 : 120, paddingTop: 8 }}
            refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={c.tealAction} colors={[c.tealAction]} /> : undefined}
          >
            {body}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, paddingTop: 8 }}>{body}</View>
        )}
        {footer ? <View className="gap-3 border-t border-line/60 bg-canvas px-5 pb-4 pt-3">{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Small section header inside a screen. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View className="gap-3">
      <View className="min-h-[32px] flex-row items-center justify-between">
        <Heading>{title}</Heading>
        {action}
      </View>
      {children}
    </View>
  );
}
