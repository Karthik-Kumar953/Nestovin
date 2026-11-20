import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@nestovin/design-tokens';

/*
 * Functional UI kit on Nestovin tokens (sentence case, no emoji). The design
 * pass will restyle these without changing screen logic.
 */

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const body = <View style={[padded && { padding: spacing.md }, { gap: spacing.md }]}>{children}</View>;
  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xl }}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={s.h1} accessibilityRole="header">{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  return <Text style={s.h2} accessibilityRole="header">{children}</Text>;
}
export function P({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  return <Text style={[s.p, muted && { color: colors.textSecondary }, style]}>{children}</Text>;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ title, onPress, variant = 'primary', busy, disabled }: { title: string; onPress: () => void; variant?: Variant; busy?: boolean; disabled?: boolean }) {
  const off = disabled || busy;
  const bg = { primary: colors.tealAction, secondary: colors.surface, ghost: 'transparent', danger: colors.errorText }[variant];
  const fg = variant === 'primary' || variant === 'danger' ? '#FFFFFF' : colors.tealAction;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      style={({ pressed }) => [s.button, { backgroundColor: bg, borderColor: variant === 'secondary' ? colors.tealAction : bg }, off && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, hint, ...input }: TextInputProps & { label: string; error?: string | undefined; hint?: string }) {
  return (
    <View style={{ gap: spacing.xxs }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.textMuted} style={[s.input, error && { borderColor: colors.errorText }]} accessibilityLabel={label} {...input} />
      {hint && !error ? <Text style={s.hint}>{hint}</Text> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

/** Single-choice list (pickers for city, tower, plan, ...). */
export function Choice<T extends string>({ options, value, onChange }: { options: { value: T; label: string; detail?: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <View style={{ gap: spacing.xs }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[s.choice, on && { borderColor: colors.tealAction, backgroundColor: '#E5F3F1' }]}>
            <Text style={[s.p, on && { fontWeight: '600' }]}>{o.label}</Text>
            {o.detail ? <Text style={s.hint}>{o.detail}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'success' | 'warning' | 'error' | 'info' | 'neutral' }) {
  const map = {
    success: [colors.successSurface, colors.successText],
    warning: [colors.warningSurface, colors.warningText],
    error: [colors.errorSurface, colors.errorText],
    info: [colors.infoSurface, colors.infoText],
    neutral: [colors.surfaceSubtle, colors.textSecondary],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function Banner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'error' | 'success' }) {
  const bg = { info: colors.infoSurface, warning: colors.warningSurface, error: colors.errorSurface, success: colors.successSurface }[tone];
  const fg = { info: colors.infoText, warning: colors.warningText, error: colors.errorText, success: colors.successText }[tone];
  return (
    <View style={[s.banner, { backgroundColor: bg }]} accessibilityRole={tone === 'error' ? 'alert' : undefined}>
      <Text style={{ color: fg }}>{children}</Text>
    </View>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <Banner tone="error">{error instanceof Error ? error.message : 'Something went wrong.'}</Banner>;
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={{ padding: spacing.lg, alignItems: 'center', gap: spacing.xs }}>
      <ActivityIndicator color={colors.tealAction} />
      <Text style={s.hint}>{label}…</Text>
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={{ padding: spacing.lg, alignItems: 'center', gap: spacing.xs }}>
      <Text style={[s.p, { fontWeight: '600' }]}>{title}</Text>
      {body ? <Text style={[s.hint, { textAlign: 'center' }]}>{body}</Text> : null}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }, style]}>{children}</View>;
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  h1: { fontSize: 26, fontWeight: '700', color: colors.charcoal },
  h2: { fontSize: 19, fontWeight: '700', color: colors.charcoal },
  p: { fontSize: 16, color: colors.textPrimary, lineHeight: 22 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  hint: { fontSize: 13, color: colors.textSecondary },
  error: { fontSize: 13, color: colors.errorText },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  button: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  buttonText: { fontSize: 16, fontWeight: '600' },
  input: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, fontSize: 16, color: colors.textPrimary },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface, gap: 2 },
  badge: { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  banner: { borderRadius: radius.md, padding: spacing.sm },
});
