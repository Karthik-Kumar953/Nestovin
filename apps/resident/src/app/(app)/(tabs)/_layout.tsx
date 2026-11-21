import { Platform } from 'react-native';
import { NativeTabs } from 'expo-router/native-tabs';
import { colors } from '@nestovin/ui-native';

/**
 * Native tab bar: system Liquid Glass on iOS 26 (minimises on scroll, SF Symbols),
 * Material 3 on Android (mint indicator, labels always visible).
 */
export default function TabsLayout() {
  return (
    <NativeTabs
      tintColor={colors.tealAction}
      iconColor={{ default: colors.textSecondary, selected: colors.tealAction }}
      labelStyle={{
        default: { color: colors.textSecondary },
        selected: { color: colors.tealDeep },
      }}
      indicatorColor={colors.teal100}
      labelVisibilityMode="labeled"
      minimizeBehavior="onScrollDown"
      backgroundColor={Platform.OS === 'android' ? colors.white : undefined}
      rippleColor={colors.teal100}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="book">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'plus.square.on.square', selected: 'plus.square.fill.on.square.fill' }}
          md="add_box"
        />
        <NativeTabs.Trigger.Label>Book</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="visits">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'calendar', selected: 'calendar' }}
          md="calendar_month"
        />
        <NativeTabs.Trigger.Label>Visits</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="support">
        <NativeTabs.Trigger.Icon
          sf={{
            default: 'bubble.left.and.bubble.right',
            selected: 'bubble.left.and.bubble.right.fill',
          }}
          md="support_agent"
        />
        <NativeTabs.Trigger.Label>Support</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="account_circle"
        />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
