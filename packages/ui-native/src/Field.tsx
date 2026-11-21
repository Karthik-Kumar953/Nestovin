import { forwardRef, useState, type ComponentRef, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors, fonts } from './tokens';

export type FieldProps = TextInputProps & {
  label: string;
  helper?: string;
  error?: string | null;
  prefix?: ReactNode;
  optional?: boolean;
};

/** Text input with a persistent label, helper text and a field-level error (announced). 52 tall; multiline grows. */
export const Field = forwardRef<ComponentRef<typeof TextInput>, FieldProps>(function Field({ label, helper, error, prefix, optional, multiline, onFocus, onBlur, style, ...input }, ref) {
  const [focused, setFocused] = useState(false);
  const border = error ? 'border-error-text' : focused ? 'border-teal' : 'border-line';
  return (
    <View className="gap-1.5">
      <Text variant="label">
        {label}
        {optional ? <Text variant="sm" tone="muted"> (optional)</Text> : null}
      </Text>
      <View className={`flex-row items-center rounded-md border-[1.5px] bg-white ${border} ${multiline ? 'items-start' : ''}`} style={focused && !error ? { shadowColor: colors.tealAction, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } } : undefined}>
        {prefix ? <View className="pl-4 pr-1">{prefix}</View> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? helper}
          placeholderTextColor={colors.textSecondary}
          multiline={multiline}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            { flex: 1, minHeight: multiline ? 120 : 52, paddingHorizontal: 16, paddingVertical: multiline ? 14 : 0, fontFamily: fonts.body, fontSize: 16, color: colors.textPrimary, textAlignVertical: multiline ? 'top' : 'center' },
            style,
          ]}
        />
      </View>
      {error ? (
        <View className="flex-row items-center gap-1.5" accessibilityLiveRegion="polite" accessibilityRole="alert">
          <Icon name="alert-circle" size={16} color={colors.errorText} />
          <Text variant="sm" tone="error" className="flex-1">
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text variant="sm" tone="muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
});
