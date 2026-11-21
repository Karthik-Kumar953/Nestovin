import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  BookingView,
  ResidentDemandRequest,
  ResidentMe,
  ResidentVisit,
} from '@nestovin/contracts';
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
import {
  useBookings,
  useMe,
  useRequests,
  useUnread,
  useUpcomingVisits,
} from '../../../lib/queries';
import {
  dateTime,
  dayLabel,
  firstName,
  greeting,
  longDate,
  rupees,
  time,
  today,
} from '../../../lib/format';
import { visitStatus } from '../../../lib/status';
import { errorMessage } from '../../../lib/api';
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
  if (!me.data)
    return (
      <Screen title="Home">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </Screen>
    );

  const m = me.data.membership;
  const bellFor = (tone: 'inverse' | 'default') => (
    <IconButton
      icon="notifications-outline"
      label="Updates"
      badge={unread.data}
      onPress={() => router.push('/notifications')}
      tone={tone}
    />
  );
  const bell = bellFor('inverse');
  if (!m) return <HomeNew me={me.data} bell={bell} />;
  if (m.status === 'PENDING')
    return (
      <HomePending
        me={me.data}
        bell={bell}
        onRefresh={() => void me.refetch()}
        refreshing={me.isRefetching}
      />
    );

  const list = visits.data ?? [];
  const t = today();
  const todays = list.filter(
    (v) => v.scheduledDate === t && !['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(v.status),
  );
  const focus =
    todays[0] ?? list.find((v) => !['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(v.status));
  const coming = list
    .filter((v) => v !== focus && !['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(v.status))
    .slice(0, 4);
  const codeVisit = list.find((v) => v.canShowCode);
  // The Today card carries the code button for its own visit; the floating action covers any other visit.
  const floating = codeVisit && codeVisit !== focus ? codeVisit : undefined;
  const refresh = () =>
    Promise.all([
      me.refetch(),
      visits.refetch(),
      bookings.refetch(),
      requests.refetch(),
      unread.refetch(),
    ]);

  return (
    <View className="flex-1">
      <Screen
        title="Home"
        hero={<HomeHeader me={me.data} bell={bellFor('default')} />}
        onRefresh={() => void refresh()}
        refreshing={visits.isRefetching}
        bottomInset={floating ? 76 : 0}
      >
        <View>
          {visits.isLoading ? (
            <SkeletonCard lines={3} />
          ) : visits.error && !visits.data ? (
            <Card>
              <ErrorState error={visits.error} onRetry={() => void visits.refetch()} compact />
            </Card>
          ) : (
            <TodayCard focus={focus} isToday={Boolean(todays[0])} bookings={bookings.data ?? []} />
          )}
        </View>
        <OfflineNotice />
        {(bookings.error && !bookings.data) || (requests.error && !requests.data) ? (
          <Banner
            tone="error"
            title="Your bookings did not load"
            action="Try again"
            onAction={() => void Promise.all([bookings.refetch(), requests.refetch()])}
          >
            {errorMessage(bookings.error ?? requests.error)}
          </Banner>
        ) : null}
        <Attention bookings={bookings.data ?? []} requests={requests.data ?? []} />

        {coming.length ? (
          <View className="gap-3">
            <SectionHeader
              title="Coming up"
              action="All visits"
              onAction={() => router.push('/visits')}
            />
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
      {floating ? (
        <FloatingAction
          label="Show check-in code"
          icon="qr-code-outline"
          onPress={() =>
            router.push({ pathname: '/check-in/[id]', params: { id: floating.occurrenceId } })
          }
        />
      ) : null}
    </View>
  );
}

/** Worker-app family header: avatar, greeting with the flat, name, and the updates bell. */
function HomeHeader({ me, bell }: { me: ResidentMe; bell: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const m = me.membership;
  const name = firstName(me.fullName);
  return (
    <View style={{ paddingTop: insets.top + 12 }} className="px-gutter pb-5 gap-4">
      <View className="flex-row items-center gap-3">
        <Avatar name={me.fullName} size={48} />
        <View className="flex-1">
          <Text variant="sm" tone="muted" numberOfLines={1}>
            {m ? `${greeting()} · ${m.towerName} ${m.flatNumber}` : greeting()}
          </Text>
          <Text variant="h2" numberOfLines={1}>
            {name ?? 'Welcome'}
          </Text>
        </View>
        {bell}
      </View>
      {m ? (
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-row items-center gap-1.5 flex-1">
            <Icon name="location-outline" size={16} color={colors.tealAction} />
            <Text variant="sm" tone="muted" numberOfLines={1} className="flex-1">
              {m.communityName}
            </Text>
          </View>
          <Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>
            {longDate(today())}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** The "Today" card: the next visit with who is coming and the code action. */
function TodayCard({
  focus,
  isToday,
  bookings,
}: {
  focus?: ResidentVisit;
  isToday: boolean;
  bookings: BookingView[];
}) {
  if (!focus) {
    const starting = bookings
      .filter((b) => b.status === 'CONFIRMED' && b.startDate > today())
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    return (
      <Entrance>
        <Card raised className="gap-4">
          <View className="flex-row items-center gap-3">
            <IconTile icon={starting ? 'calendar-outline' : 'sunny-outline'} />
            <View className="flex-1">
              <Text variant="h3">
                {starting
                  ? `Service starts ${dayLabel(starting.startDate)}`
                  : 'No visits scheduled'}
              </Text>
            </View>
          </View>
          <Text variant="body" tone="muted">
            {starting
              ? `${starting.planName} · ${starting.selectionLabel}. We show who is coming once a worker is assigned.`
              : 'Choose a plan for your flat and we will schedule trained staff for your slot.'}
          </Text>
          {!starting ? (
            <Button title="Explore plans" icon="add" onPress={() => router.push('/book')} />
          ) : null}
        </Card>
      </Entrance>
    );
  }
  const st = visitStatus(focus.status, focus.noShow);
  const at = focus.startsAt ? time(focus.startsAt) : null;
  const open = () => router.push({ pathname: '/visit/[id]', params: { id: focus.occurrenceId } });
  return (
    <Entrance>
      <Card raised className="gap-4">
        <PressScale
          onPress={open}
          haptic="tap"
          scaleTo={0.985}
          accessibilityRole="button"
          accessibilityLabel={`${isToday ? 'Today' : dayLabel(focus.scheduledDate)}: ${focus.serviceName}${at ? ` at ${at}` : ''}, ${st.label}. Open visit`}
          className="gap-4"
        >
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-row items-center gap-1.5 flex-1">
              <Icon name={serviceIcon(focus.serviceName)} size={16} color={colors.tealAction} />
              <Text variant="label" tone="brand" numberOfLines={1}>
                {`${focus.serviceName} · ${isToday ? 'Today' : dayLabel(focus.scheduledDate)}`}
              </Text>
            </View>
            <StatusChip label={st.label} tone={st.tone} icon={st.icon} />
          </View>
          <View className="gap-1">
            <Text variant="h2" style={{ fontVariant: ['tabular-nums'] }}>
              {at ? `Starts ${at}` : 'Time to be confirmed'}
            </Text>
            <View className="flex-row items-center gap-1.5">
              <Icon name="person-outline" size={16} color={colors.textSecondary} />
              <Text variant="body" tone="muted" className="flex-1">
                {focus.workerName
                  ? focus.checkedInAt
                    ? `${focus.workerName} · checked in at ${time(focus.checkedInAt)}`
                    : `${focus.workerName} · Nestovin staff`
                  : 'Worker to be assigned. You will see their name here.'}
              </Text>
            </View>
          </View>
        </PressScale>
        {isToday && focus.canShowCode ? (
          <View className="gap-3 border-t border-line pt-4">
            <Button
              title="Show check-in code"
              icon="qr-code-outline"
              onPress={() =>
                router.push({ pathname: '/check-in/[id]', params: { id: focus.occurrenceId } })
              }
            />
            <Text variant="sm" tone="muted">
              Show it when they arrive. Never share it on the phone.
            </Text>
          </View>
        ) : null}
      </Card>
    </Entrance>
  );
}

/** Money that needs action, as tappable banners that open the booking. */
function Attention({
  bookings,
  requests,
}: {
  bookings: BookingView[];
  requests: ResidentDemandRequest[];
}) {
  const due = bookings.filter((b) => b.status === 'PENDING_PAYMENT' && b.outstandingPaise > 0);
  const unpaid = requests.filter((r) => r.status === 'AWAITING_PAYMENT');
  if (!due.length && !unpaid.length) return null;
  return (
    <View className="gap-2">
      {due.map((b) => (
        <Banner
          key={b.id}
          tone="warning"
          title={`${b.planName}: ${rupees(b.outstandingPaise)} due`}
          onPress={() =>
            router.push({ pathname: '/bookings/[id]', params: { id: b.id, kind: 'booking' } })
          }
        >
          {b.balanceDueAt
            ? `Pay by ${dateTime(b.balanceDueAt)} to keep your slot.`
            : 'Pay to confirm your booking.'}
        </Banner>
      ))}
      {unpaid.map((r) => (
        <Banner
          key={r.id}
          tone="warning"
          title={`Finish joining ${r.cycleName}`}
          onPress={() =>
            router.push({ pathname: '/bookings/[id]', params: { id: r.id, kind: 'request' } })
          }
        >
          {`Pay ${rupees(r.initialDuePaise)} to hold your place in the booking round.`}
        </Banner>
      ))}
    </View>
  );
}

/** Photo cards for the three V1 services. */
export function ServicesRail({ title }: { title: string }) {
  const kinds: ServiceKind[] = ['maid', 'cook', 'caretaker'];
  const blurb: Record<ServiceKind, string> = {
    maid: 'Cleaning and upkeep',
    cook: 'Home-style meals',
    caretaker: 'Care for elders',
    other: '',
  };
  return (
    <View className="gap-3">
      <SectionHeader title={title} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingRight: 20 }}
        style={{ marginHorizontal: -20, paddingLeft: 20 }}
      >
        {kinds.map((k, i) => {
          const v = SERVICE_VISUAL[k];
          return (
            <Entrance key={k} index={i}>
              <PressScale
                onPress={() =>
                  router.push({ pathname: '/book', params: { service: k, at: String(Date.now()) } })
                }
                haptic="tap"
                accessibilityRole="button"
                accessibilityLabel={`${v.label}, ${blurb[k]}. See plans`}
                className="rounded-lg overflow-hidden"
              >
                <Photo
                  source={v.photo ? img(v.photo) : null}
                  fallbackIcon={v.icon as IconName}
                  fallbackTone={v.tone}
                  scrim
                  style={{ width: 168, height: 208 }}
                  className="rounded-lg"
                >
                  <View className="flex-1 justify-end p-4 gap-0.5">
                    <Text variant="h3" tone="inverse">
                      {v.label}
                    </Text>
                    <Text variant="sm" tone="inverseMuted">
                      {blurb[k]}
                    </Text>
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
    <Card
      padded={false}
      onPress={() => router.push('/household')}
      accessibilityLabel={`${m.communityName}, ${m.towerName} flat ${m.flatNumber}. Household`}
    >
      <Photo
        source={img('community-towers.jpg')}
        fallbackIcon="business-outline"
        style={{ height: 120 }}
        scrim
      >
        <View className="flex-1 justify-end px-5 pb-3">
          <Text variant="h3" tone="inverse">
            {m.communityName}
          </Text>
        </View>
      </Photo>
      <View className="flex-row items-center gap-3 px-5 pb-5">
        <View className="flex-1 gap-1">
          <Text variant="bodyStrong">
            {m.towerName} · Flat {m.flatNumber}
          </Text>
          <StatusChip
            label={
              m.kind === 'PRIMARY' ? 'Verified · Primary resident' : 'Verified · Family member'
            }
            tone="success"
            icon="shield-checkmark"
          />
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
    {
      icon: 'business-outline',
      title: 'Choose your flat',
      body: 'City, community, tower and flat',
    },
    {
      icon: 'document-text-outline',
      title: 'Add one proof of residence',
      body: 'Only our verification team sees it',
    },
    { icon: 'calendar-outline', title: 'Book a plan', body: 'Once your residence is verified' },
  ];
  return (
    <Screen
      title="Welcome"
      hero={
        <Photo
          source={img('res-onboarding-hero.jpg')}
          scrim
          contentPosition="top"
          style={{ height: 340 + insets.top }}
          alt="A family at home with a Nestovin housekeeper"
        >
          <View
            style={{ paddingTop: insets.top + 8 }}
            className="flex-1 justify-between px-gutter pb-20"
          >
            <View className="flex-row justify-end">{bell}</View>
            <Entrance className="gap-1">
              <Text variant="display" tone="inverse">
                {firstName(me.fullName)
                  ? `Welcome, ${firstName(me.fullName)}`
                  : 'Welcome to Nestovin'}
              </Text>
              <Text variant="lead" tone="inverseMuted">
                Managed home help for gated communities.
              </Text>
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
                <Illustration
                  source={img('ill-rejected.png')}
                  icon="document-text-outline"
                  tone="error"
                  size={88}
                />
                <View className="flex-1 gap-1">
                  <StatusChip label="Not approved" tone="error" />
                  <Text variant="h3">We could not verify your document</Text>
                </View>
              </View>
              {v.reason ? (
                <Banner tone="error" title="Reason">
                  {v.reason}
                </Banner>
              ) : null}
              <Button
                title="Upload a new document"
                icon="cloud-upload-outline"
                onPress={() => router.push({ pathname: '/register', params: { step: 'proof' } })}
              />
              <Button
                title="Start again with a different flat"
                variant="tertiary"
                onPress={() => router.push('/register')}
              />
            </Card>
          </Entrance>
        ) : (
          <Entrance>
            <Card raised className="gap-5">
              <View className="gap-1">
                <Text variant="h2">Register your flat</Text>
                <Text variant="body" tone="muted">
                  Three quick steps. Our team verifies every residence before services start.
                </Text>
              </View>
              {steps.map((s, i) => (
                <View key={s.title} className="flex-row items-center gap-3">
                  <View className="h-11 w-11 rounded-full bg-teal-100 items-center justify-center">
                    <Text variant="bodyStrong" tone="brand">
                      {String(i + 1)}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text variant="bodyStrong">{s.title}</Text>
                    <Text variant="sm" tone="muted">
                      {s.body}
                    </Text>
                  </View>
                  <Icon name={s.icon} color={colors.tealAction} />
                </View>
              ))}
              <Button
                title="Register my flat"
                iconRight="arrow-forward"
                onPress={() => router.push('/register')}
              />
            </Card>
          </Entrance>
        )}
        <Button
          title="My community is not listed"
          variant="tertiary"
          icon="megaphone-outline"
          onPress={() => router.push('/vote')}
        />
        <ServicesRail title="What you can book" />
        <Card tone="mint" className="gap-3">
          {[
            ['shield-checkmark-outline', 'Staff employed and trained by Nestovin'],
            ['people-outline', 'Assigned to your slot; no marketplace browsing'],
            ['qr-code-outline', 'Every visit checked in with your code'],
          ].map(([icon, text]) => (
            <View key={text} className="flex-row items-center gap-3">
              <Icon name={icon as IconName} color={colors.tealDeep} />
              <Text variant="body" className="flex-1">
                {text}
              </Text>
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  );
}

/** Under review: what happens next, and a direct fix when the document did not upload. */
function HomePending({
  me,
  bell,
  onRefresh,
  refreshing,
}: {
  me: ResidentMe;
  bell: React.ReactNode;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const insets = useSafeAreaInsets();
  const m = me.membership!;
  const uploaded = me.verification?.documentUploaded !== false;
  return (
    <Screen
      title="Verification"
      onRefresh={onRefresh}
      refreshing={refreshing}
      hero={
        <Photo
          source={img('community-towers.jpg')}
          scrim
          fallbackIcon="business-outline"
          style={{ height: 260 + insets.top }}
          alt={`${m.communityName} community`}
        >
          <View
            style={{ paddingTop: insets.top + 8 }}
            className="flex-1 justify-between px-gutter pb-20"
          >
            <View className="flex-row justify-end">{bell}</View>
            <View className="gap-1">
              <Text variant="label" tone="inverseMuted">
                {m.towerName} · Flat {m.flatNumber}
              </Text>
              <Text variant="display" tone="inverse">
                {m.communityName}
              </Text>
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
              <StatusChip
                label={uploaded ? 'Under review' : 'Upload incomplete'}
                tone={uploaded ? 'info' : 'warning'}
                align="center"
              />
              <Text variant="h2" className="text-center">
                {uploaded ? 'We are checking your document' : 'Your document did not upload'}
              </Text>
              <Text variant="body" tone="muted" className="text-center">
                {uploaded
                  ? 'You will get an update here and by notification. Booking opens as soon as your residence is verified.'
                  : 'Upload it again to send your registration for review.'}
              </Text>
            </View>
            {!uploaded ? (
              <Button
                title="Upload document again"
                icon="cloud-upload-outline"
                onPress={() => router.push({ pathname: '/register', params: { step: 'proof' } })}
              />
            ) : null}
            <Timeline
              steps={[
                {
                  title: 'Flat registered',
                  detail: `${m.towerName} · Flat ${m.flatNumber} · ${m.occupancy === 'OWNER' ? 'Owner' : 'Tenant'}`,
                  state: 'done',
                },
                {
                  title: 'Proof of residence',
                  detail: uploaded ? 'Received' : 'Upload needed',
                  state: uploaded ? 'done' : 'current',
                  tone: uploaded ? undefined : 'warning',
                },
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
