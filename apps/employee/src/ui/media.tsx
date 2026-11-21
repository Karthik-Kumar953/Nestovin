import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import type { LucideIcon } from 'lucide-react-native';
import {
  Building2,
  CalendarHeart,
  CalendarX2,
  ChefHat,
  ClipboardCheck,
  ClipboardPen,
  CloudOff,
  FileClock,
  FileX2,
  GraduationCap,
  HandHeart,
  QrCode,
  ReceiptIndianRupee,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Users,
} from 'lucide-react-native';
import { imageSource, serviceKind, type ImageName } from '../assets/images';
import { c, gradients } from './theme';

/*
 * Every image goes through BrandImage: the real file when the owner has added
 * it, otherwise a designed fallback (brand gradient, soft rings, icon) so a
 * screen never shows a broken image or an empty grey box.
 */

type Fallback = { icon: LucideIcon; colors: readonly [string, string, ...string[]]; tint: string };

const FALLBACKS: Record<ImageName, Fallback> = {
  'wrk-onboarding-hero': { icon: Building2, colors: gradients.hero, tint: c.white },
  'wrk-team': { icon: Users, colors: gradients.hero, tint: c.white },
  'wrk-training-1': { icon: GraduationCap, colors: ['#E3F2EF', '#C9E8E1'], tint: c.tealDeep },
  'wrk-training-2': { icon: ChefHat, colors: ['#EAF5E4', '#D3ECC8'], tint: c.greenAction },
  'wrk-training-3': { icon: HandHeart, colors: ['#E6F0F7', '#CFE2EF'], tint: '#1E5A7A' },
  'svc-maid': { icon: Sparkles, colors: ['#E3F2EF', '#BFE3DB'], tint: c.tealDeep },
  'svc-cook': { icon: ChefHat, colors: ['#FFF5E1', '#FBE3B4'], tint: '#9A5B00' },
  'svc-caretaker': { icon: HandHeart, colors: ['#EAF5E4', '#CDE8C1'], tint: c.greenAction },
  'community-towers': { icon: Building2, colors: gradients.hero, tint: c.white },
  'ill-verify-review': { icon: FileClock, colors: gradients.warning, tint: c.warningText },
  'ill-verified': { icon: ShieldCheck, colors: gradients.success, tint: c.successText },
  'ill-rejected': { icon: FileX2, colors: gradients.error, tint: c.errorText },
  'ill-offline': { icon: CloudOff, colors: gradients.mint, tint: c.tealDeep },
  'ill-empty-visits': { icon: CalendarX2, colors: gradients.mint, tint: c.tealDeep },
  'ill-checkin-phone': { icon: QrCode, colors: gradients.mint, tint: c.tealDeep },
  'ill-visit-done': { icon: ClipboardCheck, colors: gradients.success, tint: c.successText },
  'ill-overtime': { icon: TimerReset, colors: gradients.warning, tint: c.warningText },
  'ill-leave': { icon: CalendarHeart, colors: gradients.mint, tint: c.tealDeep },
  'ill-payslip': { icon: ReceiptIndianRupee, colors: gradients.mint, tint: c.tealDeep },
  'ill-training': { icon: GraduationCap, colors: gradients.mint, tint: c.tealDeep },
  'ill-applicant': { icon: ClipboardPen, colors: gradients.mint, tint: c.tealDeep },
};

/** Soft concentric rings: the "geometric brand pattern, used sparingly". */
export function Rings({ color = c.white, opacity = 0.12, size = 320 }: { color?: string; opacity?: number; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 320 320" pointerEvents="none">
      <Circle cx="160" cy="160" r="70" stroke={color} strokeOpacity={opacity * 1.4} strokeWidth="1.5" fill="none" />
      <Circle cx="160" cy="160" r="112" stroke={color} strokeOpacity={opacity} strokeWidth="1.5" fill="none" />
      <Circle cx="160" cy="160" r="154" stroke={color} strokeOpacity={opacity * 0.7} strokeWidth="1.5" fill="none" />
    </Svg>
  );
}

/**
 * Photo or illustration by shot-list name. `variant="illustration"` is a
 * centred object on transparent background; "photo" fills and crops.
 */
export function BrandImage({
  name,
  className,
  variant = 'photo',
  iconSize,
  accessibilityLabel,
}: {
  name: ImageName;
  className?: string;
  variant?: 'photo' | 'illustration';
  iconSize?: number;
  accessibilityLabel?: string;
}) {
  const src = imageSource(name);
  const a11y = accessibilityLabel ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel } : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };
  if (src) {
    return (
      <View className={className} {...a11y}>
        <Image source={src as number} contentFit={variant === 'photo' ? 'cover' : 'contain'} transition={250} style={{ width: '100%', height: '100%' }} />
      </View>
    );
  }
  const f = FALLBACKS[name];
  const Icon = f.icon;
  if (variant === 'illustration') {
    return (
      <View className={`${className ?? ''} items-center justify-center`} {...a11y}>
        <View className="items-center justify-center">
          <View className="absolute">
            <Rings color={f.tint} opacity={0.1} size={(iconSize ?? 56) * 3.4} />
          </View>
          <LinearGradient colors={f.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: (iconSize ?? 56) * 2, height: (iconSize ?? 56) * 2, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={iconSize ?? 56} color={f.tint} strokeWidth={1.6} />
          </LinearGradient>
        </View>
      </View>
    );
  }
  return (
    <View className={`${className ?? ''} overflow-hidden`} {...a11y}>
      <LinearGradient colors={f.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View className="absolute -right-16 -top-16">
          <Rings color={f.tint} opacity={0.14} />
        </View>
        <Icon size={iconSize ?? 44} color={f.tint} strokeWidth={1.5} style={{ opacity: 0.9 }} />
      </LinearGradient>
    </View>
  );
}

const SERVICE_ICON: Record<'maid' | 'cook' | 'caretaker', { icon: LucideIcon; bg: string; fg: string }> = {
  maid: { icon: Sparkles, bg: '#E0F2EF', fg: c.tealDeep },
  cook: { icon: ChefHat, bg: '#FFF1D6', fg: '#8A5200' },
  caretaker: { icon: HandHeart, bg: '#E4F3DE', fg: c.greenAction },
};

export function ServiceIcon({ serviceName, size = 'md' }: { serviceName: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = SERVICE_ICON[serviceKind(serviceName)];
  const box = { sm: 'h-9 w-9 rounded-md', md: 'h-12 w-12 rounded-lg', lg: 'h-14 w-14 rounded-xl' }[size];
  const Icon = s.icon;
  return (
    <View className={`${box} items-center justify-center`} style={{ backgroundColor: s.bg }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Icon size={size === 'sm' ? 18 : size === 'md' ? 24 : 28} color={s.fg} strokeWidth={2} />
    </View>
  );
}

export function Avatar({ initials, size = 64 }: { initials: string; size?: number }) {
  return (
    <LinearGradient colors={[c.tealAction, c.tealDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <View accessible={false} style={{ position: 'absolute', top: 0, left: 0, borderRadius: size / 2, overflow: 'hidden' }}>
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Path d="M0 44 C 18 34, 40 58, 64 40 L64 64 L0 64 Z" fill="#FFFFFF" fillOpacity={0.08} />
        </Svg>
      </View>
      <Text allowFontScaling={false} className="font-heading text-white" style={{ fontSize: size * 0.36 }}>
        {initials}
      </Text>
    </LinearGradient>
  );
}

