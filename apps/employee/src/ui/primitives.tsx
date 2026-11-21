import { useState, type ReactNode, type Ref } from 'react';
import { ActivityIndicator, Platform, Pressable, Text as RNText, TextInput, View, type TextInputInstance, type TextInputProps, type TextProps, type ViewProps } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
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

const SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl|caption|label|body-sm|lead|stat|headline|title|title-android|metric|hero|\[\d+px\])$/;
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
    <RNText accessibilityRole="header" allowFontScaling className={cx('font-display text-title text-charcoal', className)}>
      {children}
    </RNText>
  );
}
export function Heading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <RNText accessibilityRole="header" allowFontScaling className={cx('font-heading text-lg leading-6 text-charcoal', className)}>
      {children}
    </RNText>
  );
}
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <RNText accessibilityRole="header" allowFontScaling className={cx('font-semibold text-label text-ink-secondary', className)}>{children}</RNText>;
}
export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  const sized = (className ?? '').split(/\s+/).some((p) => SIZE.test(p));
  return <RNText allowFontScaling className={textClass(cx(!sized && 'text-body-sm', 'text-ink-secondary', className))}>{children}</RNText>;
}

// ---------------------------------------------------------------- press feedback

/** Teal-deep at 8% for Android ripples on light surfaces. */
const RIPPLE = `${c.tealDeep}14`;

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
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  return (
    <View className={containerClassName} style={style}>
      <Animated.View style={a}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        // Reduce Motion: an instant opacity change instead of the scale spring.
        onPressIn={() => (reduce ? (opacity.value = 0.7) : (scale.value = withTiming(0.97, { duration: 90 })))}
        onPressOut={() => (reduce ? (opacity.value = 1) : (scale.value = withSpring(1, { damping: 15, stiffness: 260 })))}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
        android_ripple={{ color: RIPPLE, foreground: true }}
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
  // Direction C: 12 px corners on both platforms, 52 / 48 dp tall.
  const h = size === 'lg' ? 'min-h-[52px] px-5' : 'min-h-[48px] px-4';
  const v = {
    primary: 'bg-teal-action',
    secondary: 'bg-surface border border-line',
    ghost: 'bg-transparent',
    danger: 'bg-error-text',
    light: 'bg-white',
    onDark: 'bg-transparent border border-white/50',
  }[variant];
  const fg = variant === 'primary' || variant === 'danger' || variant === 'onDark' ? c.white : variant === 'light' ? c.tealDeep : variant === 'secondary' ? c.textPrimary : c.tealAction;
  return (
    <PressScale onPress={onPress} disabled={off} accessibilityLabel={title} accessibilityHint={accessibilityHint} accessibilityState={{ busy: !!busy }} containerClassName={className} className={cx('flex-row items-center justify-center gap-2 rounded-md', h, v, off && 'opacity-50')}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {Icon ? <Icon size={20} color={fg} strokeWidth={2} /> : null}
          <RNText allowFontScaling style={{ color: fg }} className="shrink text-center font-semibold text-base">
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
    <PressScale onPress={onPress} accessibilityLabel={label} className={cx('h-12 w-12 items-center justify-center rounded-md', tone === 'onDark' ? 'bg-white/15' : 'bg-surface border border-line')}>
      <Icon size={22} color={tone === 'onDark' ? c.white : c.textPrimary} strokeWidth={2} />
    </PressScale>
  );
}

// ---------------------------------------------------------------- surfaces

/**
 * Hairline card. `pad`: 'card' (16 all round), 'list' (16 sides, 4 top/bottom, for ListRow stacks) or
 * 'none' (caller lays out). A prop, not a className, because NativeWind resolves conflicting
 * padding classes by stylesheet order, not by the order they are written.
 */
export function Card({ children, className, raised, pad = 'card', ...rest }: ViewProps & { className?: string; raised?: boolean; pad?: 'card' | 'list' | 'none' }) {
  return (
    <View className={cx('rounded-lg border border-line bg-surface', pad === 'card' ? 'p-4' : pad === 'list' ? 'px-4 py-1' : null, className)} style={raised ? shadow.float : shadow.card} {...rest}>
      {children}
    </View>
  );
}

/** Direction C depth: hairline cards; only the card that holds the next action floats. */
export const shadow = {
  card: Platform.select({
    ios: { shadowColor: c.shadow, shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
    default: { elevation: 0 },
  }),
  float: Platform.select({
    ios: { shadowColor: c.shadow, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 3 },
    default: { boxShadow: '0 8px 24px -16px rgba(11,59,54,0.45)' },
  }),
};

export function Divider({ className }: { className?: string }) {
  return <View className={cx('h-px bg-line', className)} />;
}

/** Status pill: colour + dot + words (never colour alone). */
export function Pill({ label, tone = 'neutral', icon: Icon, className }: { label: string; tone?: Tone; icon?: LucideIcon; className?: string }) {
  const t = toneColors[tone];
  return (
    <View className={cx('min-h-[28px] flex-row items-center gap-1 self-start rounded-full px-2.5 py-1', className)} style={{ backgroundColor: t.bg }}>
      {Icon ? <Icon size={14} color={t.fg} strokeWidth={2.25} /> : <View className="h-2 w-2 rounded-full" style={{ backgroundColor: t.dot }} />}
      <RNText allowFontScaling className="font-semibold text-label" style={{ color: t.fg }}>
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
      className={cx('min-h-[48px] flex-row items-center gap-2 rounded-md border px-4', selected ? 'border-teal-action bg-mint' : 'border-line bg-surface')}
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
      <RNText allowFontScaling className="font-semibold text-sm text-ink">
        {label}
        {optional ? <RNText className="font-body text-ink-secondary"> (optional)</RNText> : null}
      </RNText>
      <View
        className={cx(
          'flex-row items-center rounded-md border-[1.5px] bg-surface',
          multiline ? 'min-h-[112px] items-start' : 'min-h-[52px]',
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
          className={cx('flex-1 self-stretch px-4 font-body text-base text-ink', multiline ? 'min-h-[108px] py-3.5' : 'min-h-[48px]')}
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
          <Pressable onPress={() => setReveal((r) => !r)} accessibilityRole="button" accessibilityLabel={reveal ? 'Hide password' : 'Show password'} className="h-12 w-12 items-center justify-center">
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
    <View className="min-h-[60px] flex-row items-center gap-3 py-3">
      <View className={cx('h-10 w-10 items-center justify-center rounded-md', tileClass)}>
        <Icon size={20} color={tint} strokeWidth={2} />
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

// ---------------------------------------------------------------- direction C pieces

/**
 * Segmented control (Today / Upcoming / Completed, Enter code / Scan QR):
 * subtle track, white selected segment with a hairline. Tab semantics.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; icon?: LucideIcon; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View className="flex-row rounded-md bg-subtle p-1" accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.count !== undefined ? `${o.label}, ${o.count}` : o.label}
            android_ripple={{ color: RIPPLE }}
            className={cx('min-h-[44px] flex-1 flex-row items-center justify-center gap-1.5 rounded-sm border px-2', on ? 'border-line bg-surface' : 'border-transparent')}
            style={({ pressed }) => (pressed && !on ? { opacity: 0.7 } : undefined)}
          >
            {o.icon ? <o.icon size={18} color={on ? c.charcoal : c.textSecondary} strokeWidth={2} /> : null}
            <RNText allowFontScaling numberOfLines={1} className={cx('shrink font-semibold text-sm', on ? 'text-charcoal' : 'text-ink-secondary')}>
              {o.label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Thin 4 dp progress bar; always paired with words that say the same thing. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <View className="h-1 overflow-hidden rounded-full bg-line" accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      <View className="h-full rounded-full bg-primary" style={{ width: `${v * 100}%` }} />
    </View>
  );
}
