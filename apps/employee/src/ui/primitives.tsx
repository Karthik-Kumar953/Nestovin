import { useState, type ReactNode, type Ref } from 'react';
import { ActivityIndicator, Platform, Pressable, Text as RNText, TextInput, View, type TextInputInstance, type TextInputProps, type TextProps, type ViewProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { c, toneColors, type Tone } from './theme';

/*
 * Worker app primitives on Nestovin tokens. Local copies until the shared
 * packages/ui-native exists (TEAM_PLAN): same names so the swap is mechanical.
 * Sentence case, no emoji, 48+ targets, labels always visible.
 */

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

// ---------------------------------------------------------------- text

const SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl|\[\d+px\])$/;
const ALIGN = /^text-(left|center|right|justify)$/;
const FAMILY = /^font-(display|heading|title|body|medium|semibold)$/;

/**
 * Default body text (Inter 16/24, ink) where each default is dropped when the
 * caller sets that property, because NativeWind applies conflicting classes by
 * stylesheet order, not by the order in className.
 */
export function textClass(className?: string) {
  const parts = (className ?? '').split(/\s+/).filter(Boolean);
  const hasSize = parts.some((p) => SIZE.test(p));
  const hasLeading = parts.some((p) => p.startsWith('leading-'));
  const hasFamily = parts.some((p) => FAMILY.test(p));
  const hasColor = parts.some((p) => p.startsWith('text-') && !SIZE.test(p) && !ALIGN.test(p));
  return cx(!hasFamily && 'font-body', !hasSize && 'text-base', !hasSize && !hasLeading && 'leading-6', !hasColor && 'text-ink', className);
}

export function Text({ className, ...props }: TextProps & { className?: string }) {
  return <RNText allowFontScaling className={textClass(className)} {...props} />;
}
export function Title({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <RNText accessibilityRole="header" allowFontScaling className={cx('font-heading text-[30px] leading-[38px] text-charcoal', Platform.OS === 'android' && 'font-title text-[28px] leading-9', className)}>
      {children}
    </RNText>
  );
}
export function Heading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <RNText accessibilityRole="header" allowFontScaling className={cx('font-heading text-xl leading-7 text-charcoal', className)}>
      {children}
    </RNText>
  );
}
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <RNText allowFontScaling className={cx('font-semibold text-[13px] uppercase tracking-wider text-ink-secondary', className)}>{children}</RNText>;
}
export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  const sized = (className ?? '').split(/\s+/).some((p) => SIZE.test(p));
  return <RNText allowFontScaling className={textClass(cx(!sized && 'text-[15px] leading-[22px]', 'text-ink-secondary', className))}>{children}</RNText>;
}

// ---------------------------------------------------------------- press feedback

/** Subtle 0.97 press scale (HIG/MD) without moving neighbours. Reduce Motion: opacity only. */
export function PressScale({
  children,
  onPress,
  disabled,
  className,
  containerClassName,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  accessibilityState,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
  /** Classes for the animated wrapper (layout: flex-1, width, margins). */
  containerClassName?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link' | 'radio' | 'checkbox' | 'tab';
  accessibilityState?: { selected?: boolean; checked?: boolean; disabled?: boolean; busy?: boolean };
  style?: ViewProps['style'];
}) {
  const scale = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <View className={containerClassName} style={style}>
      <Animated.View style={a}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => (scale.value = withTiming(0.97, { duration: 90 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 15, stiffness: 260 }))}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
        android_ripple={{ color: 'rgba(0,105,92,0.08)', foreground: true }}
        className={className}
      >
        {children}
      </Pressable>
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------- buttons

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light' | 'onDark';
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  busy,
  disabled,
  icon: Icon,
  accessibilityHint,
  className,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: 'lg' | 'md';
  busy?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  accessibilityHint?: string;
  className?: string;
}) {
  const off = !!(disabled || busy);
  const shape = Platform.OS === 'android' ? 'rounded-full' : 'rounded-md';
  const h = size === 'lg' ? 'min-h-[56px] px-6' : 'min-h-[48px] px-5';
  const v = {
    primary: 'bg-teal-action',
    secondary: 'bg-surface border-[1.5px] border-teal-action',
    ghost: 'bg-transparent',
    danger: 'bg-error-text',
    light: 'bg-white',
    onDark: 'bg-transparent border-[1.5px] border-white/50',
  }[variant];
  const fg = variant === 'primary' || variant === 'danger' || variant === 'onDark' ? c.white : variant === 'light' ? c.tealDeep : c.tealAction;
  return (
    <PressScale onPress={onPress} disabled={off} accessibilityLabel={title} accessibilityHint={accessibilityHint} accessibilityState={{ busy: !!busy }} containerClassName={className} className={cx('flex-row items-center justify-center gap-2.5', shape, h, v, off && 'opacity-50')}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {Icon ? <Icon size={size === 'lg' ? 22 : 20} color={fg} strokeWidth={2} /> : null}
          <RNText allowFontScaling style={{ color: fg }} className={cx('font-semibold', size === 'lg' ? 'text-[17px]' : 'text-base')}>
            {title}
          </RNText>
        </>
      )}
    </PressScale>
  );
}

/** 48 × 48 icon-only button with an accessible name. */
export function IconButton({ icon: Icon, label, onPress, tone = 'default' }: { icon: LucideIcon; label: string; onPress: () => void; tone?: 'default' | 'onDark' }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={label} className={cx('h-12 w-12 items-center justify-center rounded-full', tone === 'onDark' ? 'bg-white/15' : 'bg-surface border border-line')}>
      <Icon size={22} color={tone === 'onDark' ? c.white : c.textPrimary} strokeWidth={2} />
    </PressScale>
  );
}

// ---------------------------------------------------------------- surfaces

export function Card({ children, className, ...rest }: ViewProps & { className?: string }) {
  return (
    <View className={cx('rounded-xl border border-line/70 bg-surface p-5', className)} style={shadow.card} {...rest}>
      {children}
    </View>
  );
}

export const shadow = {
  card: Platform.select({
    ios: { shadowColor: '#0F3D37', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    default: { elevation: 1 },
  }),
  float: Platform.select({
    ios: { shadowColor: '#0F3D37', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
    default: { elevation: 6 },
  }),
};

export function Divider({ className }: { className?: string }) {
  return <View className={cx('h-px bg-line', className)} />;
}

/** Status pill: colour + dot + words (never colour alone). */
export function Pill({ label, tone = 'neutral', icon: Icon, className }: { label: string; tone?: Tone; icon?: LucideIcon; className?: string }) {
  const t = toneColors[tone];
  return (
    <View className={cx('flex-row items-center gap-1.5 self-start rounded-full px-3 py-1.5', className)} style={{ backgroundColor: t.bg }}>
      {Icon ? <Icon size={14} color={t.fg} strokeWidth={2.25} /> : <View className="h-2 w-2 rounded-full" style={{ backgroundColor: t.dot }} />}
      <RNText allowFontScaling className="font-semibold text-[13px]" style={{ color: t.fg }}>
        {label}
      </RNText>
    </View>
  );
}

/** Selectable chip (radio / checkbox semantics). */
export function Chip({ label, selected, onPress, icon: Icon, role = 'checkbox' }: { label: string; selected: boolean; onPress: () => void; icon?: LucideIcon; role?: 'checkbox' | 'radio' }) {
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      className={cx('min-h-[52px] flex-row items-center gap-2 rounded-lg border-[1.5px] px-4', selected ? 'border-teal-action bg-mint' : 'border-line bg-surface')}
    >
      {Icon ? <Icon size={20} color={selected ? c.tealDeep : c.textSecondary} strokeWidth={2} /> : null}
      <RNText allowFontScaling className={cx('text-base', selected ? 'font-semibold text-teal-deep' : 'font-medium text-ink')}>
        {label}
      </RNText>
    </PressScale>
  );
}

// ---------------------------------------------------------------- inputs

/** React 19: `ref` is a plain prop (no forwardRef). */
export function Field({
  ref,
  label,
  error,
  hint,
  optional,
  secureTextEntry,
  multiline,
  ...input
}: TextInputProps & { ref?: Ref<TextInputInstance>; label: string; error?: string | undefined; hint?: string; optional?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  const isSecret = !!secureTextEntry;
  return (
    <View className="gap-1.5">
      <RNText allowFontScaling className="font-medium text-[15px] text-ink">
        {label}
        {optional ? <RNText className="font-body text-ink-secondary"> (optional)</RNText> : null}
      </RNText>
      <View
        className={cx(
          'flex-row items-center rounded-md border-[1.5px] bg-surface',
          multiline ? 'min-h-[112px] items-start' : 'min-h-[56px]',
          error ? 'border-error-text' : focused ? 'border-teal-action' : 'border-line',
        )}
      >
        <TextInput
          ref={ref}
          allowFontScaling
          placeholderTextColor={c.textSecondary}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          secureTextEntry={isSecret && !reveal}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          className={cx('flex-1 px-4 font-body text-[17px] text-ink', multiline && 'py-3.5')}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          {...input}
        />
        {isSecret ? (
          <Pressable onPress={() => setReveal((r) => !r)} accessibilityRole="button" accessibilityLabel={reveal ? 'Hide password' : 'Show password'} className="h-14 w-14 items-center justify-center">
            {reveal ? <EyeOff size={22} color={c.textSecondary} /> : <Eye size={22} color={c.textSecondary} />}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <RNText accessibilityLiveRegion="polite" allowFontScaling className="font-medium text-sm text-error-text">
          {error}
        </RNText>
      ) : hint ? (
        <RNText allowFontScaling className="font-body text-sm text-ink-secondary">
          {hint}
        </RNText>
      ) : null}
    </View>
  );
}

/** Row with a leading icon tile, used in lists and settings. */
export function ListRow({
  icon: Icon,
  title,
  detail,
  trailing,
  onPress,
  tint = c.tealDeep,
  tileClass = 'bg-mint',
}: {
  icon: LucideIcon;
  title: string;
  detail?: string | null;
  trailing?: ReactNode;
  onPress?: () => void;
  tint?: string;
  tileClass?: string;
}) {
  const body = (
    <View className="min-h-[64px] flex-row items-center gap-4 py-3">
      <View className={cx('h-11 w-11 items-center justify-center rounded-md', tileClass)}>
        <Icon size={22} color={tint} strokeWidth={2} />
      </View>
      <View className="flex-1 gap-0.5">
        <RNText allowFontScaling className="font-semibold text-base text-ink">
          {title}
        </RNText>
        {detail ? (
          <RNText allowFontScaling className="font-body text-sm text-ink-secondary">
            {detail}
          </RNText>
        ) : null}
      </View>
      {trailing}
    </View>
  );
  return onPress ? (
    <PressScale onPress={onPress} accessibilityLabel={detail ? `${title}, ${detail}` : title}>
      {body}
    </PressScale>
  ) : (
    body
  );
}
