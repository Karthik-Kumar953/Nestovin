import { useEffect, useRef, type ComponentRef } from 'react';
import { View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBar, type BottomTabBarProps } from 'expo-router/tabs';
import type { LucideIcon } from 'lucide-react-native';
import { Bell, CalendarDays, Sun, UserRound } from 'lucide-react-native';
import { useInbox } from '../../../lib/queries';
import { c } from '../../../ui';

const icon = (Icon: LucideIcon) =>
  function TabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    // Decorative: the tab's accessible name comes from its label.
    return (
      <View aria-hidden>
        <Icon color={String(color)} size={size} strokeWidth={focused ? 2.5 : 2} aria-hidden />
      </View>
    );
  };

/**
 * The tab list gets the accessible name "Main". BottomTabBar renders the
 * role="tablist" element itself with no label prop, so it is set on that element.
 */
function NamedTabBar(props: BottomTabBarProps) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    el?.querySelector('[role="tablist"]')?.setAttribute('aria-label', 'Main');
  });
  return (
    <View ref={ref}>
      <BottomTabBar {...props} />
    </View>
  );
}

/**
 * Web build only (E2E and design review): a standard bottom tab bar, because
 * NativeTabs floats over the top of the screen on web. iOS and Android keep
 * the native tab bar from _layout.tsx. Same four tabs, labels always on.
 */
export default function TabsLayoutWeb() {
  const unread = useInbox().data?.unread ?? 0;
  return (
    <Tabs
      tabBar={(props) => <NamedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.tealAction,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
        tabBarItemStyle: { minHeight: 56, paddingVertical: 4 },
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 64 },
        sceneStyle: { backgroundColor: c.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarAccessibilityLabel: 'Today', tabBarIcon: icon(Sun) }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarAccessibilityLabel: 'Schedule', tabBarIcon: icon(CalendarDays) }} />
      <Tabs.Screen
        name="updates"
        options={{
          title: 'Updates',
          tabBarAccessibilityLabel: unread ? `Updates, ${unread} new` : 'Updates',
          tabBarIcon: icon(Bell),
          tabBarBadge: unread ? (unread > 9 ? '9+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: c.errorText, color: c.white, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Me', tabBarAccessibilityLabel: 'Me', tabBarIcon: icon(UserRound) }} />
    </Tabs>
  );
}
