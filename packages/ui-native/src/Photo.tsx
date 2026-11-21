import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, gradients } from './tokens';

/**
 * Photo with a designed fallback. When the file is missing (not generated yet) or fails to load,
 * it renders the brand gradient with soft rings and an icon, never a broken image or a grey box.
 */
export function Photo({
  source,
  fallbackIcon = 'home-outline',
  fallbackTone = 'brand',
  className = '',
  style,
  children,
  scrim = false,
  alt,
  contentPosition = 'center',
}: {
  source: ImageSource | number | null | undefined;
  fallbackIcon?: IconName;
  fallbackTone?: 'brand' | 'mint' | 'dusk' | 'sage';
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Bottom gradient so white text on top stays readable (4.5:1). */
  scrim?: boolean;
  alt?: string;
  contentPosition?: 'center' | 'top' | 'right' | 'left';
}) {
  const [failed, setFailed] = useState(false);
  const show = source != null && !failed;
  return (
    <View
      className={`overflow-hidden ${className}`}
      style={style}
      accessible={Boolean(alt)}
      accessibilityRole={alt ? 'image' : undefined}
      accessibilityLabel={alt}
    >
      {show ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={contentPosition}
          transition={250}
          onError={() => setFailed(true)}
          accessible={false}
        />
      ) : (
        <Fallback icon={fallbackIcon} tone={fallbackTone} />
      )}
      {scrim ? (
        <LinearGradient
          colors={gradients.scrimBottom}
          start={{ x: 0.5, y: 0.25 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </View>
  );
}

function Fallback({ icon, tone }: { icon: IconName; tone: 'brand' | 'mint' | 'dusk' | 'sage' }) {
  const light = tone === 'mint';
  return (
    <View style={StyleSheet.absoluteFill} accessible={false}>
      <LinearGradient
        colors={gradients[tone]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.ring,
          {
            width: 220,
            height: 220,
            right: -60,
            top: -70,
            borderColor: light ? 'rgba(0,121,107,0.10)' : 'rgba(255,255,255,0.14)',
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: 140,
            height: 140,
            right: -10,
            top: -20,
            borderColor: light ? 'rgba(0,121,107,0.12)' : 'rgba(255,255,255,0.18)',
          },
        ]}
      />
      <View
        style={[
          styles.blob,
          {
            left: -40,
            bottom: -50,
            backgroundColor: light ? 'rgba(67,160,71,0.10)' : 'rgba(67,160,71,0.28)',
          },
        ]}
      />
      <View style={styles.icon}>
        <Icon name={icon} size={40} color={light ? colors.tealAction : 'rgba(255,255,255,0.9)'} />
      </View>
    </View>
  );
}

/** Round avatar: photo when available, else initials on mint. */
export function Avatar({
  source,
  name,
  size = 48,
}: {
  source?: ImageSource | number | null;
  name?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="overflow-hidden bg-teal-100 items-center justify-center border-2 border-white"
      accessible={false}
    >
      {source != null && !failed ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onError={() => setFailed(true)}
        />
      ) : initials ? (
        <Text
          variant="label"
          tone="brand"
          style={{ fontSize: size * 0.36, lineHeight: size * 0.44 }}
        >
          {initials}
        </Text>
      ) : (
        <Icon name="person" color={colors.tealAction} size={size * 0.5} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 18 },
  blob: { position: 'absolute', width: 200, height: 200, borderRadius: 999 },
  // Centre-right, clear of header actions (top-right) and titles (bottom-left).
  icon: { position: 'absolute', right: 28, top: '34%', opacity: 0.95 },
});
