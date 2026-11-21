import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BookingView, ResidentDemandRequest, ResidentMe, ResidentVisit } from '@nestovin/contracts';
import {
  Avatar,
  Banner,
  Button,
  Card,
  Entrance,
  IconButton,
  IconTile,
  Icon,
  Illustration,
  Photo,
  PressScale,
  Screen,
  SectionHeader,
  SkeletonCard,
  SkeletonList,
  StatusChip,
  Text,
  colors,
  type IconName,
} from '@nestovin/ui-native';
import { useBookings, useMe, useRequests, useUnread, useUpcomingVisits } from '../../../lib/queries';
import { dateTime, dayLabel, firstName, greeting, longDate, rupees, time, today } from '../../../lib/format';
import { visitStatus } from '../../../lib/status';
import { SERVICE_VISUAL, img, serviceIcon, type ServiceKind } from '../../../assets/images';
import { ErrorState, FloatingAction, OfflineNotice, Timeline } from '../../../components/common';
import { VisitRow } from '../../../components/VisitRow';

/** Home: today first (the visit, who is coming, the check-in code), then what needs attention, then the week. */
export default function Home() {
  const me = useMe();
  const unread = useUnread(Boolean(me.data));
  const verified = me.data?.membership?.status === 'VERIFIED';
  const visits = useUpcomingVisits(verified, 14);
  const bookings = useBookings(verified);
  const requests = useRequests(verified);

  if (me.isLoading) return <HomeSkeleton />;
  if (!me.data) return <Screen title="Home"><ErrorState error={me.error} onRetry={() => void me.refetch()} /></Screen>;

  const m = me.data.membership;
  const bell = <IconButton icon="notifications-outline" label="Updates" badge={unread.data} onPress={() => router.push('/notifications')} tone="inverse" />;
  if (!m) return <HomeNew me={me.data} bell={bell} />;
  if (m.status === 'PENDING') return <HomePending me={me.data} bell={bell} onRefresh={() => void me.refetch()} refreshing={me.isRefetching} />;

  const list = visits.data ?? [];
  const t = today();
  const todays = list.filter((v) => v.scheduledDate === t && !['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(v.status));
  const focus = todays[0] ?? list.find((v) => !['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(v.status));
  const coming = list.filter((v) => v !== focus && !['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(v.status)).slice(0, 4);
  const codeVisit = list.find((v) => v.canShowCode);
  const refresh = () => Promise.all([me.refetch(), visits.refetch(), bookings.refetch(), requests.refetch(), unread.refetch()]);

  return (
    <View className="flex-1">
      <Screen
        title="Home"
        hero={<HomeHero me={me.data} bell={bell} />}
        onRefresh={() => void refresh()}
        refreshing={visits.isRefetching}
        bottomInset={codeVisit ? 76 : 0}
      >
        <View className="-mt-16">
          {visits.isLoading ? <SkeletonCard lines={3} /> : <TodayCard focus={focus} isToday={Boolean(todays[0])} bookings={bookings.data ?? []} />}
        </View>
        <OfflineNotice />
        <Attention bookings={bookings.data ?? []} requests={requests.data ?? []} />

        {coming.length ? (
          <View className="gap-3">
            <SectionHeader title="Coming up" action="All visits" onAction={() => router.push('/visits')} />
            {coming.map((v, i) => (
              <Entrance key={v.occurrenceId} index={i}>
                <VisitRow v={v} />
              </Entrance>
            ))}
          </View>
        ) : null}

        <ServicesRail title="Book a service" />
        <CommunityCard me={me.data} />
      </Screen>
      {codeVisit ? <FloatingAction label="Show check-in code" icon="qr-code-outline" onPress={() => router.push({ pathname: '/check-in/[id]', params: { id: codeVisit.occurrenceId } })} /> : null}
    </View>
  );
}

function HomeHero({ me, bell }: { me: ResidentMe; bell: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const m = me.membership;
  const name = firstName(me.fullName);
  return (
    <Photo source={img('res-home-hero.jpg')} scrim contentPosition="right" style={{ height: 300 + insets.top }} alt="A Nestovin cook preparing breakfast in a sunlit kitchen">
      <View style={{ paddingTop: insets.top + 8 }} className="flex-1 justify-between px-gutter pb-24">
        <View className="flex-row items-center justify-between">
          {m ? (
            <View className="flex-row items-center gap-1.5 rounded-full bg-black/25 px-3 py-1.5">
              <Icon name="location" size={14} color={colors.white} />
              <Text variant="label" tone="inverse" numberOfLines={1}>
                {m.communityName} · {m.towerName} {m.flatNumber}
              </Text>
            </View>
          ) : (
            <View />
          )}
          {bell}
        </View>
        <Entrance className="gap-1">
          <Text variant="label" tone="inverseMuted">
            {longDate(today())}
          </Text>
          <Text variant="display" tone="inverse">
            {name ? `${greeting()}, ${name}` : greeting()}
          </Text>
        </Entrance>
      </View>
    </Photo>
  );
}

/** The "Today" card: the next visit with who is coming and the code action. */
function TodayCard({ focus, isToday, bookings }: { focus?: ResidentVisit; isToday: boolean; bookings: BookingView[] }) {
  if (!focus) {
    const starting = bookings.filter((b) => b.status === 'CONFIRMED' && b.startDate > today()).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    return (
      <Entrance>
        <Card raised className="gap-4">
          <View className="flex-row items-center gap-3">
            <IconTile icon={starting ? 'calendar-outline' : 'sunny-outline'} />
            <View className="flex-1">
              <Text variant="overline" tone="brand">Today</Text>
              <Text variant="h3">{starting ? `Service starts ${dayLabel(starting.startDate)}` : 'No visits scheduled'}</Text>
            </View>
          </View>
          <Text variant="body" tone="muted">
            {starting ? `${starting.planName} · ${starting.selectionLabel}. We show who is coming once a worker is assigned.` : 'Choose a plan for your flat and we will schedule trained staff for your slot.'}
          </Text>
          {!starting ? <Button title="Explore plans" icon="add" onPress={() => router.push('/book')} /> : null}
        </Card>
      </Entrance>
    );
  }
  const st = visitStatus(focus.status, focus.noShow);
  const at = focus.startsAt ? time(focus.startsAt) : null;
  return (
    <Entrance>
      <Card raised onPress={() => router.push({ pathname: '/visit/[id]', params: { id: focus.occurrenceId } })} accessibilityLabel={`${isToday ? 'Today' : dayLabel(focus.scheduledDate)}: ${focus.serviceName}${at ? ` at ${at}` : ''}, ${st.label}`}>
        <View className="flex-row items-center justify-between">
          <Text variant="overline" tone="brand">{isToday ? 'Today' : `Next · ${dayLabel(focus.scheduledDate)}`}</Text>
          <StatusChip label={st.label} tone={st.tone} icon={st.icon} />
        </View>
        <View className="flex-row items-center gap-3">
          <IconTile icon={serviceIcon(focus.serviceName)} size={52} />
          <View className="flex-1">
            <Text variant="h2" className="text-[22px] leading-[30px]">{focus.serviceName}</Text>
            <Text variant="body" tone="muted">{at ? `Starts ${at}` : 'Time to be confirmed'}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-3 rounded-lg bg-teal-50 p-3">
          <Avatar name={focus.workerName} size={44} />
          <View className="flex-1">
            <Text variant="bodyStrong">{focus.workerName ?? 'Assigning your worker'}</Text>
            <Text variant="sm" tone="muted">
              {focus.workerName ? (focus.checkedInAt ? `Checked in at ${time(focus.checkedInAt)}` : 'Nestovin staff, assigned for this visit') : 'You will see their name here before the visit'}
            </Text>
          </View>
          {focus.checkedInAt ? <Icon name="checkmark-circle" color={colors.greenAction} label="Checked in" /> : null}
        </View>
        {isToday && focus.canShowCode ? <Text variant="sm" tone="muted">When they arrive, show your check-in code. Do not share it on the phone.</Text> : null}
      </Card>
    </Entrance>
  );
}

/** Money that needs action, as tappable banners that open the booking. */
function Attention({ bookings, requests }: { bookings: BookingView[]; requests: ResidentDemandRequest[] }) {
  const due = bookings.filter((b) => b.status === 'PENDING_PAYMENT' && b.outstandingPaise > 0);
  const unpaid = requests.filter((r) => r.status === 'AWAITING_PAYMENT');
  if (!due.length && !unpaid.length) return null;
  return (
    <View className="gap-2">
      {due.map((b) => (
        <Banner key={b.id} tone="warning" title={`${b.planName}: ${rupees(b.outstandingPaise)} due`} onPress={() => router.push({ pathname: '/bookings/[id]', params: { id: b.id, kind: 'booking' } })}>
          {b.balanceDueAt ? `Pay by ${dateTime(b.balanceDueAt)} to keep your slot.` : 'Pay to confirm your booking.'}
        </Banner>
      ))}
      {unpaid.map((r) => (
        <Banner key={r.id} tone="warning" title={`Finish joining ${r.cycleName}`} onPress={() => router.push({ pathname: '/bookings/[id]', params: { id: r.id, kind: 'request' } })}>
          {`Pay ${rupees(r.initialDuePaise)} to hold your place in the booking round.`}
        </Banner>
      ))}
    </View>
  );
}

/** Photo cards for the three V1 services. */
export function ServicesRail({ title }: { title: string }) {
  const kinds: ServiceKind[] = ['maid', 'cook', 'caretaker'];
  const blurb: Record<ServiceKind, string> = { maid: 'Cleaning and upkeep', cook: 'Home-style meals', caretaker: 'Care for elders', other: '' };
  return (
    <View className="gap-3">
      <SectionHeader title={title} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20 }}>
        {kinds.map((k, i) => {
          const v = SERVICE_VISUAL[k];
          return (
            <Entrance key={k} index={i}>
              <PressScale onPress={() => router.push({ pathname: '/book', params: { service: k } })} haptic="tap" accessibilityRole="button" accessibilityLabel={`${v.label}, ${blurb[k]}. See plans`} className="rounded-xl overflow-hidden">
                <Photo source={v.photo ? img(v.photo) : null} fallbackIcon={v.icon as IconName} fallbackTone={v.tone} scrim style={{ width: 168, height: 208 }} className="rounded-xl">
                  <View className="flex-1 justify-end p-4 gap-0.5">
                    <Text variant="h3" tone="inverse">{v.label}</Text>
                    <Text variant="sm" tone="inverseMuted">{blurb[k]}</Text>
                  </View>
                </Photo>
              </PressScale>
            </Entrance>
          );
        })}
      </ScrollView>
    </View>
  );
}

function CommunityCard({ me }: { me: ResidentMe }) {
  const m = me.membership!;
  return (
    <Card padded={false} onPress={() => router.push('/household')} accessibilityLabel={`${m.communityName}, ${m.towerName} flat ${m.flatNumber}. Household`}>
      <Photo source={img('community-towers.jpg')} fallbackIcon="business-outline" style={{ height: 120 }} scrim>
        <View className="flex-1 justify-end px-5 pb-3">
          <Text variant="h3" tone="inverse">{m.communityName}</Text>
        </View>
      </Photo>
      <View className="flex-row items-center gap-3 px-5 pb-5">
        <View className="flex-1 gap-1">
          <Text variant="bodyStrong">{m.towerName} · Flat {m.flatNumber}</Text>
          <StatusChip label={m.kind === 'PRIMARY' ? 'Verified · Primary resident' : 'Verified · Family member'} tone="success" icon="shield-checkmark" />
        </View>
        <Icon name="chevron-forward" size="sm" color={colors.textSecondary} />
      </View>
    </Card>
  );
}

/** Not registered yet: what Nestovin is and the one next step. Rejected registrations get a direct way back to the proof step. */
function HomeNew({ me, bell }: { me: ResidentMe; bell: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const v = me.verification;
  const steps: { icon: IconName; title: string; body: string }[] = [
    { icon: 'business-outline', title: 'Choose your flat', body: 'City, community, tower and flat' },
    { icon: 'document-text-outline', title: 'Add one proof of residence', body: 'Only our verification team sees it' },
    { icon: 'calendar-outline', title: 'Book a plan', body: 'Once your residence is verified' },
  ];
  return (
    <Screen
      title="Welcome"
      hero={
        <Photo source={img('res-onboarding-hero.jpg')} scrim contentPosition="top" style={{ height: 340 + insets.top }} alt="A family at home with a Nestovin housekeeper">
          <View style={{ paddingTop: insets.top + 8 }} className="flex-1 justify-between px-gutter pb-20">
            <View className="flex-row justify-end">{bell}</View>
            <Entrance className="gap-1">
              <Text variant="display" tone="inverse">{firstName(me.fullName) ? `Welcome, ${firstName(me.fullName)}` : 'Welcome to Nestovin'}</Text>
              <Text variant="lead" tone="inverseMuted">Managed home help for gated communities.</Text>
            </Entrance>
          </View>
        </Photo>
      }
    >
      <View className="-mt-12 gap-4">
        {v?.decision === 'REJECTED' ? (
          <Entrance>
            <Card raised className="gap-4">
              <View className="flex-row items-center gap-4">
                <Illustration source={img('ill-rejected.png')} icon="document-text-outline" tone="error" size={88} />
                <View className="flex-1 gap-1">
                  <StatusChip label="Not approved" tone="error" />
                  <Text variant="h3">We could not verify your document</Text>
                </View>
              </View>
              {v.reason ? <Banner tone="error" title="Reason">{v.reason}</Banner> : null}
              <Button title="Upload a new document" icon="cloud-upload-outline" onPress={() => router.push({ pathname: '/register', params: { step: 'proof' } })} />
              <Button title="Start again with a different flat" variant="tertiary" onPress={() => router.push('/register')} />
            </Card>
          </Entrance>
        ) : (
          <Entrance>
            <Card raised className="gap-5">
              <View className="gap-1">
                <Text variant="h2">Register your flat</Text>
                <Text variant="body" tone="muted">Three quick steps. Our team verifies every residence before services start.</Text>
              </View>
              {steps.map((s, i) => (
                <View key={s.title} className="flex-row items-center gap-3">
                  <View className="h-11 w-11 rounded-full bg-teal-100 items-center justify-center">
                    <Text variant="bodyStrong" tone="brand">{String(i + 1)}</Text>
                  </View>
                  <View className="flex-1">
                    <Text variant="bodyStrong">{s.title}</Text>
                    <Text variant="sm" tone="muted">{s.body}</Text>
                  </View>
                  <Icon name={s.icon} color={colors.tealAction} />
                </View>
              ))}
              <Button title="Register my flat" iconRight="arrow-forward" onPress={() => router.push('/register')} />
            </Card>
          </Entrance>
        )}
        <Button title="My community is not listed" variant="tertiary" icon="megaphone-outline" onPress={() => router.push('/vote')} />
        <ServicesRail title="What you can book" />
        <Card tone="mint" className="gap-3">
          {[
            ['shield-checkmark-outline', 'Staff employed and trained by Nestovin'],
            ['people-outline', 'Assigned to your slot; no marketplace browsing'],
            ['qr-code-outline', 'Every visit checked in with your code'],
          ].map(([icon, text]) => (
            <View key={text} className="flex-row items-center gap-3">
              <Icon name={icon as IconName} color={colors.tealDeep} />
              <Text variant="body" className="flex-1">{text}</Text>
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  );
}

/** Under review: what happens next, and a direct fix when the document did not upload. */
function HomePending({ me, bell, onRefresh, refreshing }: { me: ResidentMe; bell: React.ReactNode; onRefresh: () => void; refreshing: boolean }) {
  const insets = useSafeAreaInsets();
  const m = me.membership!;
  const uploaded = me.verification?.documentUploaded !== false;
  return (
    <Screen
      title="Verification"
      onRefresh={onRefresh}
      refreshing={refreshing}
      hero={
        <Photo source={img('community-towers.jpg')} scrim fallbackIcon="business-outline" style={{ height: 260 + insets.top }} alt={`${m.communityName} community`}>
          <View style={{ paddingTop: insets.top + 8 }} className="flex-1 justify-between px-gutter pb-20">
            <View className="flex-row justify-end">{bell}</View>
            <View className="gap-1">
              <Text variant="label" tone="inverseMuted">{m.towerName} · Flat {m.flatNumber}</Text>
              <Text variant="display" tone="inverse">{m.communityName}</Text>
            </View>
          </View>
        </Photo>
      }
    >
      <View className="-mt-12 gap-4">
        <Entrance>
          <Card raised className="gap-5">
            <View className="items-center gap-3">
              <Illustration source={img('ill-verify-review.png')} icon="time-outline" size={120} />
              <StatusChip label={uploaded ? 'Under review' : 'Upload incomplete'} tone={uploaded ? 'info' : 'warning'} align="center" />
              <Text variant="h2" className="text-center">{uploaded ? 'We are checking your document' : 'Your document did not upload'}</Text>
              <Text variant="body" tone="muted" className="text-center">
                {uploaded ? 'You will get an update here and by notification. Booking opens as soon as your residence is verified.' : 'Upload it again to send your registration for review.'}
              </Text>
            </View>
            {!uploaded ? <Button title="Upload document again" icon="cloud-upload-outline" onPress={() => router.push({ pathname: '/register', params: { step: 'proof' } })} /> : null}
            <Timeline
              steps={[
                { title: 'Flat registered', detail: `${m.towerName} · Flat ${m.flatNumber} · ${m.occupancy === 'OWNER' ? 'Owner' : 'Tenant'}`, state: 'done' },
                { title: 'Proof of residence', detail: uploaded ? 'Received' : 'Upload needed', state: uploaded ? 'done' : 'current', tone: uploaded ? undefined : 'warning' },
                { title: 'Verification by our team', state: uploaded ? 'current' : 'todo' },
                { title: 'Book services', state: 'todo' },
              ]}
            />
          </Card>
        </Entrance>
        <ServicesRail title="What you can book" />
      </View>
    </Screen>
  );
}

function HomeSkeleton() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-mint" style={{ paddingTop: insets.top + 20 }}>
      <View className="px-gutter">
        <SkeletonList count={3} media />
      </View>
    </View>
  );
}
