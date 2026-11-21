import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts } from '@nestovin/ui-native';

type IconName = ComponentProps<typeof Ionicons>['name'];
const icon = (outline: IconName, filled: IconName) =>
  function TabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Ionicons name={focused ? filled : outline} color={String(color)} size={size} />;
  };

/**
 * Web build only (E2E and design review): a standard bottom tab bar. NativeTabs renders a floating
 * bar over the top of the screen on web, covering header buttons (BUG-QA-020). iOS and Android
 * keep the native tab bar from _layout.tsx.
 */
export default function TabsLayoutWeb() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tealAction,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="book" options={{ title: 'Book', tabBarIcon: icon('add-circle-outline', 'add-circle') }} />
      <Tabs.Screen name="visits" options={{ title: 'Visits', tabBarIcon: icon('calendar-outline', 'calendar') }} />
      <Tabs.Screen name="support" options={{ title: 'Support', tabBarIcon: icon('chatbubbles-outline', 'chatbubbles') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
