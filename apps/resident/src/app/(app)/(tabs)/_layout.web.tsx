import { useEffect, useRef, type ComponentProps, type ComponentRef } from 'react';
import { View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBar, type BottomTabBarProps } from 'expo-router/tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts } from '@nestovin/ui-native';

type IconName = ComponentProps<typeof Ionicons>['name'];
const icon = (outline: IconName, filled: IconName) =>
  function TabIcon({
    focused,
    color,
    size,
  }: {
    focused: boolean;
    color: ColorValue;
    size: number;
  }) {
    // The icon font's glyph must not become part of the tab's accessible name (BUG-QA-025).
    return (
      <View aria-hidden>
        <Ionicons name={focused ? filled : outline} color={String(color)} size={size} aria-hidden />
      </View>
    );
  };

/**
 * The bar's tab list gets the accessible name "Main" (BUG-QA-025). BottomTabBar renders the
 * role="tablist" element itself with no label prop, so on web the label is set on that element.
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
 * Web build only (E2E and design review): a standard bottom tab bar. NativeTabs renders a floating
 * bar over the top of the screen on web, covering header buttons (BUG-QA-020). iOS and Android
 * keep the native tab bar from _layout.tsx.
 */
export default function TabsLayoutWeb() {
  return (
    <Tabs
      tabBar={(props) => <NamedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tealAction,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home',
          tabBarIcon: icon('home-outline', 'home'),
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book',
          tabBarAccessibilityLabel: 'Book',
          tabBarIcon: icon('add-circle-outline', 'add-circle'),
        }}
      />
      <Tabs.Screen
        name="visits"
        options={{
          title: 'Visits',
          tabBarAccessibilityLabel: 'Visits',
          tabBarIcon: icon('calendar-outline', 'calendar'),
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: 'Support',
          tabBarAccessibilityLabel: 'Support',
          tabBarIcon: icon('chatbubbles-outline', 'chatbubbles'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile',
          tabBarIcon: icon('person-circle-outline', 'person-circle'),
        }}
      />
    </Tabs>
  );
}
