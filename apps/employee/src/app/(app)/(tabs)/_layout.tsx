import { NativeTabs } from 'expo-router/native-tabs';
import { useInbox } from '../../../lib/queries';
import { c } from '../../../ui';

/**
 * Four tabs, worker-first. iOS 26: system Liquid Glass tab bar that minimises
 * on scroll. Android: Material 3 bar with a teal-tint pill indicator and labels always on.
 */
export default function TabsLayout() {
  const inbox = useInbox();
  const unread = inbox.data?.unread ?? 0;
  return (
    <NativeTabs
      tintColor={c.tealAction}
      iconColor={{ default: c.textSecondary, selected: c.tealAction }}
      indicatorColor={c.teal100}
      labelVisibilityMode="labeled"
      minimizeBehavior="onScrollDown"
      labelStyle={{ default: { color: c.textSecondary }, selected: { color: c.tealDeep } }}
      backgroundColor={c.surface}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'sun.max', selected: 'sun.max.fill' }} md="today" />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule">
        <NativeTabs.Trigger.Icon sf={{ default: 'calendar', selected: 'calendar' }} md="calendar_month" />
        <NativeTabs.Trigger.Label>Schedule</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="updates">
        <NativeTabs.Trigger.Icon sf={{ default: 'bell', selected: 'bell.fill' }} md="notifications" />
        <NativeTabs.Trigger.Label>Updates</NativeTabs.Trigger.Label>
        {unread ? <NativeTabs.Trigger.Badge>{unread > 9 ? '9+' : String(unread)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="person" />
        <NativeTabs.Trigger.Label>Me</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
