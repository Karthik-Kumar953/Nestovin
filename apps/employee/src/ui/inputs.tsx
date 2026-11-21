import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputInstance } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { addDays, isoDay, pad, parseDay } from '../lib/format';
import { haptic } from '../lib/haptics';
import { IconButton } from './primitives';
import { c } from './theme';

/**
 * Six large digit boxes over one hidden input (paste and SMS autofill work).
 * Read digit by digit by screen readers.
 */
export function CodeInput({ value, onChange, error, autoFocus }: { value: string; onChange: (v: string) => void; error?: boolean; autoFocus?: boolean }) {
  const ref = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');
  return (
    <Pressable onPress={() => ref.current?.focus()} accessible={false} className="items-center">
      <View className="flex-row gap-2.5">
        {digits.map((d, i) => {
          const active = focused && i === Math.min(value.length, 5);
          return (
            <View
              key={i}
              className={`h-[64px] w-[48px] items-center justify-center rounded-md border-2 bg-surface ${error ? 'border-error-text' : active ? 'border-teal-action' : d.trim() ? 'border-teal-action/40' : 'border-line'}`}
            >
              <Text allowFontScaling={false} className="font-heading text-[30px] text-charcoal">
                {d.trim()}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus={autoFocus}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={`Resident's 6-digit code${value ? `, entered ${value.split('').join(' ')}` : ''}`}
        style={{ position: 'absolute', opacity: 0.01, width: '100%', height: '100%' }}
        caretHidden
      />
    </Pressable>
  );
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const monthName = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
const dayA11y = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Month calendar for a date range (leave). Tap a start day, then an end day.
 * Days before `min` are disabled. 44 pt cells, Monday first.
 */
export function RangeCalendar({ start, end, onChange, min = isoDay() }: { start: string | null; end: string | null; onChange: (start: string | null, end: string | null) => void; min?: string }) {
  const [month, setMonth] = useState(() => {
    const d = parseDay(start ?? min);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  });
  const cells = useMemo(() => {
    const first = parseDay(month);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => addDays(month, i))];
  }, [month]);
  const shift = (n: number) => {
    const d = parseDay(month);
    d.setMonth(d.getMonth() + n);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`);
  };
  const canBack = month.slice(0, 7) > min.slice(0, 7);
  const pick = (day: string) => {
    haptic.select();
    if (!start || (start && end) || day < start) onChange(day, null);
    else onChange(start, day);
  };
  return (
    <View className="gap-3 rounded-xl border border-line bg-surface p-4">
      <View className="flex-row items-center justify-between">
        {canBack ? <IconButton icon={ChevronLeft} label="Previous month" onPress={() => shift(-1)} /> : <View className="h-12 w-12" />}
        <Text accessibilityRole="header" className="font-heading text-lg text-charcoal">
          {monthName.format(parseDay(month))}
        </Text>
        <IconButton icon={ChevronRight} label="Next month" onPress={() => shift(1)} />
      </View>
      <View className="flex-row">
        {WEEKDAYS.map((w, i) => (
          <Text key={i} className="flex-1 text-center font-semibold text-[13px] text-ink-secondary" accessible={false}>
            {w}
          </Text>
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {cells.map((day, i) => {
          if (!day) return <View key={`b${i}`} style={{ width: `${100 / 7}%`, height: 46 }} />;
          const disabled = day < min;
          const isStart = day === start;
          const isEnd = day === end;
          const inRange = !!start && !!end && day > start && day < end;
          const edge = isStart || isEnd;
          return (
            <View key={day} style={{ width: `${100 / 7}%`, height: 46 }} className={`items-center justify-center ${inRange ? 'bg-mint' : ''} ${isStart && end ? 'rounded-l-full bg-mint' : ''} ${isEnd ? 'rounded-r-full bg-mint' : ''}`}>
              <Pressable
                disabled={disabled}
                onPress={() => pick(day)}
                accessibilityRole="button"
                accessibilityLabel={dayA11y.format(parseDay(day))}
                accessibilityState={{ selected: edge || inRange, disabled }}
                className={`h-11 w-11 items-center justify-center rounded-full ${edge ? 'bg-teal-action' : ''}`}
              >
                <Text className={`text-base ${edge ? 'font-semibold text-white' : disabled ? 'text-ink-muted' : day === isoDay() ? 'font-semibold text-teal-action' : 'text-ink'}`}>{Number(day.slice(8))}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Circular progress (readiness, training). */
export function ProgressRing({ value, size = 72, stroke = 7, label, color = c.tealAction, track = c.mintStrong }: { value: number; size?: number; stroke?: number; label?: string; color?: string; track?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${circ}`} strokeDashoffset={circ * (1 - v)} />
      </Svg>
      {label ? <Text className="font-heading text-base text-charcoal">{label}</Text> : null}
    </View>
  );
}
