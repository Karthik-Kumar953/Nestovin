import { useEffect, useRef, type ComponentRef } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Text } from './Text';
import { colors } from './tokens';

/**
 * One-time code entry: one hidden input (so SMS autofill and paste work) drawn as digit boxes.
 * iOS `oneTimeCode`, Android `sms-otp`. `error` shakes the row (crossfade under Reduce Motion) and is announced.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  error,
  autoFocus = true,
  onComplete,
  label = 'Verification code',
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  error?: string | null;
  autoFocus?: boolean;
  onComplete?: (v: string) => void;
  label?: string;
}) {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const reduce = useReducedMotion();
  const shake = useSharedValue(0);
  const caret = useSharedValue(1);
  useEffect(() => {
    if (!error || reduce) return;
    shake.value = withSequence(withTiming(-8, { duration: 50 }), withTiming(8, { duration: 50 }), withTiming(-5, { duration: 50 }), withTiming(0, { duration: 50 }));
  }, [error, reduce, shake]);
  useEffect(() => {
    if (reduce) return;
    caret.value = withRepeat(withSequence(withTiming(0, { duration: 500 }), withTiming(1, { duration: 500 })), -1);
  }, [reduce, caret]);
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }));
  const digits = value.split('');

  return (
    <View className="gap-2">
      <Pressable onPress={() => ref.current?.focus()} accessibilityRole="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Animated.View style={[{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, row]}>
          {Array.from({ length }).map((_, i) => {
            const active = i === digits.length;
            const filled = i < digits.length;
            const border = error ? colors.errorText : active ? colors.tealAction : filled ? colors.teal200 : colors.border;
            return (
              <View key={i} style={{ borderColor: border, borderWidth: active ? 2 : 1.5 }} className={`flex-1 h-[60px] max-w-[56px] rounded-md items-center justify-center ${filled ? 'bg-teal-50' : 'bg-white'}`}>
                {filled ? (
                  <Text variant="h2" className="text-charcoal">
                    {digits[i]}
                  </Text>
                ) : active ? (
                  <Animated.View style={[caretStyle, { width: 2, height: 26, backgroundColor: colors.tealAction, borderRadius: 1 }]} />
                ) : null}
              </View>
            );
          })}
        </Animated.View>
      </Pressable>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => {
          const v = t.replace(/\D/g, '').slice(0, length);
          onChange(v);
          if (v.length === length) onComplete?.(v);
        }}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        maxLength={length}
        accessibilityLabel={`${label}, ${length} digits`}
        accessibilityHint={error ?? undefined}
        style={{ position: 'absolute', opacity: 0.02, height: 60, width: '100%', top: 0 }}
        caretHidden
      />
      {error ? (
        <Text variant="sm" tone="error" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
