import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './Button';
import { Text } from './Text';
import { colors } from './tokens';

/**
 * Bottom sheet on a solid surface (never glass: sheets hold codes and inputs).
 * Slides up with a spring; fades under Reduce Motion. Backdrop tap, close button and Android back dismiss.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  dismissable = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  dismissable?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const t = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      t.value = reduce ? withTiming(1, { duration: 160 }) : withSpring(1, { damping: 22, stiffness: 220, mass: 0.9 });
    } else if (mounted) {
      t.value = withTiming(0, { duration: reduce ? 120 : 200, easing: Easing.in(Easing.quad) }, (done) => {
        if (done) scheduleOnRN(setMounted, false);
      });
    }
  }, [visible, reduce, mounted, t]);

  const backdrop = useAnimatedStyle(() => ({ opacity: t.value }));
  const panel = useAnimatedStyle(() => (reduce ? { opacity: t.value } : { transform: [{ translateY: (1 - t.value) * 600 }] }));
  const close = () => {
    if (dismissable) onClose();
  };

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, backdrop]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
          <Animated.View style={[panel, { paddingBottom: Math.max(insets.bottom, 16), maxHeight: '92%' }]} className="bg-white rounded-t-2xl" accessibilityViewIsModal>
            <View className="items-center pt-2.5 pb-1" accessible={false}>
              <View className="h-1.5 w-10 rounded-full bg-line" />
            </View>
            {title ? (
              <View className="flex-row items-start gap-3 px-gutter pt-2 pb-3">
                <View className="flex-1 gap-1">
                  <Text variant="h3">{title}</Text>
                  {subtitle ? <Text variant="sm" tone="muted">{subtitle}</Text> : null}
                </View>
                {dismissable ? <IconButton icon="close" label="Close" onPress={onClose} tone="plain" /> : null}
              </View>
            ) : null}
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: 16 }} keyboardShouldPersistTaps="handled" bounces={false}>
              {children}
            </ScrollView>
            {footer ? <View className="px-gutter pt-3 gap-2">{footer}</View> : null}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
