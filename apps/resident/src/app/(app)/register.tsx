import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { MAX_DOCUMENT_BYTES, RESIDENCE_DOC_LABELS, type ResidenceDocType, type ResidenceRegistrationResult, type ResidentMe } from '@nestovin/contracts';
import { Banner, Button, Card, ChoiceTile, Entrance, Field, Icon, IconTile, PressScale, Screen, Sheet, Skeleton, Text, colors, haptics, type IconName } from '@nestovin/ui-native';
import { api, errorMessage } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { keys, useMe } from '../../lib/queries';
import { bytes } from '../../lib/format';
import { rejectedFlat, rememberFlat, requestReupload } from '../../lib/residence';
import { Progress } from '../../components/common';

const BUCKET = 'resident-documents';
type Picked = { uri: string; name: string; mimeType: 'application/pdf' | 'image/jpeg' | 'image/png'; size: number };
type Opt = { id: string; label: string; detail?: string | null };
type Level = 'city' | 'community' | 'tower' | 'flat';
const DOC_ICON: Record<ResidenceDocType, IconName> = { OWNERSHIP_PROOF: 'key-outline', RENT_AGREEMENT: 'document-text-outline', ELECTRICITY_BILL: 'flash-outline', SOCIETY_ID: 'id-card-outline' };

/**
 * RES-03: register one flat with one proof (manual review, ADR-012), in three steps.
 * `?step=proof` returns straight to the proof step: re-upload a failed upload, or a new document after a rejection.
 */
export default function Register() {
  const params = useLocalSearchParams<{ step?: string }>();
  const qc = useQueryClient();
  const me = useMe();
  const pending = me.data?.membership?.status === 'PENDING' && me.data.verification?.documentUploaded === false;
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState<Partial<Record<Level, Opt>>>({});
  const [occupancy, setOccupancy] = useState<'OWNER' | 'TENANT' | null>(null);
  const [docType, setDocType] = useState<ResidenceDocType | null>(null);
  const [file, setFile] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<Level | null>(null);
  const [prefilled, setPrefilled] = useState<'none' | 'pending' | 'rejected' | 'missing'>('none');

  // Proof-step entry: prefill from the pending membership, the server's rejected flat, or this device's last submission.
  useEffect(() => {
    if (params.step !== 'proof' || !me.data || prefilled !== 'none') return;
    if (pending && me.data.membership) {
      const m = me.data.membership;
      setSel({ community: { id: m.communityId, label: m.communityName }, tower: { id: '', label: m.towerName }, flat: { id: m.flatId, label: `Flat ${m.flatNumber}` } });
      setOccupancy(m.occupancy === 'OWNER' ? 'OWNER' : 'TENANT');
      setStep(2);
      setPrefilled('pending');
      return;
    }
    void (async () => {
      const f = await rejectedFlat(me.data);
      if (!f) return setPrefilled('missing');
      setSel({
        ...(f.cityId && f.cityName ? { city: { id: f.cityId, label: f.cityName } } : {}),
        community: { id: f.communityId, label: f.communityName },
        tower: { id: f.towerId ?? '', label: f.towerName },
        flat: { id: f.flatId, label: `Flat ${f.flatNumber}` },
      });
      // A family member's registration has no owner/tenant choice to reuse; ask again.
      if (f.occupancy === 'OWNER' || f.occupancy === 'TENANT') {
        setOccupancy(f.occupancy);
        setStep(2);
      } else setStep(1);
      setPrefilled('rejected');
    })();
  }, [params.step, me.data, pending, prefilled]);

  const cities = useQuery({ queryKey: ['cities'], queryFn: () => api<{ items: { id: string; name: string; state: string }[] }>('/v1/resident/cities') });
  const communities = useQuery({ queryKey: ['communities', sel.city?.id], enabled: Boolean(sel.city?.id), queryFn: () => api<{ items: { id: string; name: string; addressLine: string | null }[] }>(`/v1/resident/cities/${sel.city!.id}/communities`) });
  const towers = useQuery({ queryKey: ['towers', sel.community?.id], enabled: Boolean(sel.community?.id) && step === 0, queryFn: () => api<{ items: { id: string; name: string }[] }>(`/v1/resident/communities/${sel.community!.id}/towers`) });
  const flats = useQuery({ queryKey: ['flats', sel.tower?.id], enabled: Boolean(sel.tower?.id) && step === 0, queryFn: () => api<{ items: { id: string; flatNumber: string; floor: number | null }[] }>(`/v1/resident/towers/${sel.tower!.id}/flats`) });

  const optionsFor: Record<Level, { q: { isLoading: boolean; error: unknown }; items: Opt[] }> = {
    city: { q: cities, items: (cities.data?.items ?? []).map((c) => ({ id: c.id, label: c.name, detail: c.state })) },
    community: { q: communities, items: (communities.data?.items ?? []).map((c) => ({ id: c.id, label: c.name, detail: c.addressLine })) },
    tower: { q: towers, items: (towers.data?.items ?? []).map((t) => ({ id: t.id, label: t.name })) },
    flat: { q: flats, items: (flats.data?.items ?? []).map((f) => ({ id: f.id, label: `Flat ${f.flatNumber}`, detail: f.floor !== null ? `Floor ${f.floor}` : null })) },
  };
  const order: Level[] = ['city', 'community', 'tower', 'flat'];
  const choose = (level: Level, o: Opt) => {
    const idx = order.indexOf(level);
    const next: Partial<Record<Level, Opt>> = {};
    for (const l of order.slice(0, idx)) next[l] = sel[l];
    next[level] = o;
    setSel(next);
    setPicking(null);
  };

  const accept = (f: Picked) => {
    setError(null);
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.mimeType)) return setError('Use a PDF, JPEG or PNG file.');
    if (f.size > MAX_DOCUMENT_BYTES) return setError('The file must be smaller than 5 MB. Try a photo instead of a scan.');
    haptics.select();
    setFile(f);
  };
  const pickFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    accept({ uri: a.uri, name: a.name, mimeType: (a.mimeType ?? 'application/pdf') as Picked['mimeType'], size: a.size ?? 0 });
  };
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError('Camera access is off. Allow it in Settings, or choose a file instead.');
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    accept({ uri: a.uri, name: a.fileName ?? 'document.jpg', mimeType: a.mimeType === 'image/png' ? 'image/png' : 'image/jpeg', size: a.fileSize ?? 0 });
  };

  const submit = useMutation({
    mutationFn: async (): Promise<ResidentMe> => {
      if (!sel.flat || !occupancy || !docType || !file) throw new Error('Complete every step first');
      const data = await (await fetch(file.uri)).arrayBuffer();
      const document = { docType, fileName: file.name.slice(0, 255), mimeType: file.mimeType, sizeBytes: file.size || data.byteLength };
      let reg: ResidenceRegistrationResult;
      if (prefilled === 'pending') {
        reg = await requestReupload(document);
      } else {
        reg = await api<ResidenceRegistrationResult>('/v1/resident/residence', { method: 'POST', body: { flatId: sel.flat.id, occupancy, document } });
        if (sel.community && sel.tower) {
          void rememberFlat({ cityId: sel.city?.id, cityName: sel.city?.label, communityId: sel.community.id, communityName: sel.community.label, towerId: sel.tower.id, towerName: sel.tower.label, flatId: sel.flat.id, flatNumber: sel.flat.label.replace(/^Flat /, ''), occupancy });
        }
      }
      const { error: upErr } = await supabase.storage.from(BUCKET).uploadToSignedUrl(reg.upload.path, reg.upload.token, data, { contentType: file.mimeType });
      if (upErr) throw new Error('The document could not be uploaded. Check your connection and try again; your flat is saved.');
      return api<ResidentMe>(`/v1/resident/documents/${reg.upload.documentId}/complete`, { method: 'POST' });
    },
    onSuccess: async (r) => {
      haptics.success();
      qc.setQueryData(keys.me, r);
      await qc.invalidateQueries({ queryKey: keys.options });
      router.replace('/');
    },
    onError: (e) => {
      haptics.error();
      setError(errorMessage(e));
    },
  });

  const flatDone = Boolean(sel.flat);
  const titles = ['Your flat', 'You are the', 'Proof of residence'];
  const canNext = step === 0 ? flatDone : step === 1 ? Boolean(occupancy) : Boolean(docType && file);
  const lockedFlat = prefilled === 'pending';
  const back = () => (step > 0 && !(lockedFlat && step === 2) ? setStep(step - 1) : router.back());

  return (
    <Screen
      title={pending && params.step === 'proof' ? 'Upload your document' : 'Register your flat'}
      onBack={back}
      footer={
        <>
          {error ? <Banner tone="error">{error}</Banner> : null}
          {step < 2 ? (
            <Button title="Continue" iconRight="arrow-forward" disabled={!canNext} onPress={() => setStep(step + 1)} />
          ) : (
            <Button title={submit.isPending ? 'Uploading securely' : 'Submit for verification'} icon="shield-checkmark-outline" disabled={!canNext} loading={submit.isPending} onPress={() => submit.mutate()} />
          )}
        </>
      }
    >
      <View className="gap-2">
        <View className="flex-row justify-between">
          <Text variant="label" tone="brand">{`Step ${step + 1} of 3`}</Text>
          <Text variant="label" tone="muted">{titles[step]}</Text>
        </View>
        <Progress value={(step + 1) / 3} label={`Step ${step + 1} of 3`} />
      </View>

      {prefilled === 'rejected' && step === 2 ? <Banner tone="info" title="Same flat, new document">Choose a clearer or different document. Go back to change the flat.</Banner> : null}
      {prefilled === 'missing' ? <Banner tone="info">Choose your flat again, then add a new document.</Banner> : null}

      {step === 0 ? (
        <Entrance key="s0" className="gap-3">
          {order.map((level, i) => {
            const enabled = i === 0 || Boolean(sel[order[i - 1]!]);
            const value = sel[level];
            const label = { city: 'City', community: 'Community', tower: 'Tower', flat: 'Flat' }[level];
            const icon: IconName = { city: 'location-outline', community: 'business-outline', tower: 'layers-outline', flat: 'home-outline' }[level] as IconName;
            return (
              <PressScale key={level} disabled={!enabled} onPress={() => setPicking(level)} haptic="tap" scaleTo={0.985} accessibilityRole="button" accessibilityLabel={`${label}: ${value?.label ?? 'not chosen'}`} accessibilityState={{ disabled: !enabled }}>
                <Card className={`flex-row items-center gap-3 ${enabled ? '' : 'opacity-45'}`}>
                  <IconTile icon={icon} tone={value ? 'teal' : 'info'} size={40} />
                  <View className="flex-1">
                    <Text variant="caption" tone="muted">{label}</Text>
                    <Text variant="bodyStrong" tone={value ? 'default' : 'muted'}>{value?.label ?? `Choose ${label.toLowerCase()}`}</Text>
                  </View>
                  {value ? <Icon name="checkmark-circle" color={colors.greenAction} /> : <Icon name="chevron-forward" size="sm" color={colors.textSecondary} />}
                </Card>
              </PressScale>
            );
          })}
          <Button title="My city or community is not listed" variant="tertiary" icon="megaphone-outline" onPress={() => router.push('/vote')} />
        </Entrance>
      ) : null}

      {step === 1 ? (
        <Entrance key="s1" className="gap-3">
          <Text variant="body" tone="muted">{`${sel.community?.label ?? ''} · ${sel.tower?.label ?? ''} · ${sel.flat?.label ?? ''}`}</Text>
          <ChoiceTile icon="key-outline" title="Owner" description="You own this flat" selected={occupancy === 'OWNER'} onPress={() => setOccupancy('OWNER')} />
          <ChoiceTile icon="document-text-outline" title="Tenant" description="You rent this flat" selected={occupancy === 'TENANT'} onPress={() => setOccupancy('TENANT')} />
          <Text variant="sm" tone="muted">Family members join later through the Primary resident; they do not register separately.</Text>
        </Entrance>
      ) : null}

      {step === 2 ? (
        <Entrance key="s2" className="gap-4">
          <Card tone="mint" className="flex-row items-center gap-3">
            <Icon name="home" color={colors.tealDeep} />
            <Text variant="bodyStrong" className="flex-1">{[sel.community?.label, sel.tower?.label, sel.flat?.label].filter(Boolean).join(' · ')}</Text>
            <Text variant="sm" tone="muted">{occupancy === 'OWNER' ? 'Owner' : 'Tenant'}</Text>
          </Card>
          <Text variant="h3">Document type</Text>
          {(Object.keys(RESIDENCE_DOC_LABELS) as ResidenceDocType[])
            .filter((k) => occupancy !== 'TENANT' || k !== 'OWNERSHIP_PROOF')
            .map((k) => (
              <ChoiceTile key={k} compact icon={DOC_ICON[k]} title={RESIDENCE_DOC_LABELS[k]} selected={docType === k} onPress={() => setDocType(k)} />
            ))}
          {docType ? (
            file ? (
              <Card className="flex-row items-center gap-3">
                <IconTile icon={file.mimeType === 'application/pdf' ? 'document-outline' : 'image-outline'} tone="success" />
                <View className="flex-1">
                  <Text variant="bodyStrong" numberOfLines={1}>{file.name}</Text>
                  <Text variant="sm" tone="muted">{file.size ? bytes(file.size) : 'Ready to upload'}</Text>
                </View>
                <Button title="Change" variant="tertiary" size="sm" block={false} onPress={() => setFile(null)} />
              </Card>
            ) : (
              <View className="flex-row gap-3">
                <View className="flex-1"><Button title="Choose file" variant="secondary" icon="folder-open-outline" onPress={() => void pickFile()} /></View>
                <View className="flex-1"><Button title="Take photo" variant="secondary" icon="camera-outline" onPress={() => void takePhoto()} /></View>
              </View>
            )
          ) : null}
          <View className="flex-row items-start gap-2">
            <Icon name="lock-closed-outline" size="sm" color={colors.textSecondary} />
            <Text variant="sm" tone="muted" className="flex-1">PDF, JPEG or PNG up to 5 MB. Stored privately; only our verification team can see it.</Text>
          </View>
        </Entrance>
      ) : null}

      <PickerSheet level={picking} options={picking ? optionsFor[picking] : null} selected={picking ? sel[picking]?.id : undefined} onClose={() => setPicking(null)} onChoose={(o) => picking && choose(picking, o)} />
    </Screen>
  );
}

function PickerSheet({ level, options, selected, onClose, onChoose }: { level: Level | null; options: { q: { isLoading: boolean; error: unknown }; items: Opt[] } | null; selected?: string; onClose: () => void; onChoose: (o: Opt) => void }) {
  const [query, setQuery] = useState('');
  const items = useMemo(() => (options?.items ?? []).filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())), [options, query]);
  const title = level ? `Choose your ${level}` : '';
  return (
    <Sheet visible={Boolean(level)} onClose={() => { setQuery(''); onClose(); }} title={title}>
      {(options?.items.length ?? 0) > 8 ? <Field label="Search" value={query} onChangeText={setQuery} placeholder={`Search ${level}`} autoCorrect={false} /> : null}
      {options?.q.isLoading ? (
        <View className="gap-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={56} radius={16} />)}
        </View>
      ) : null}
      {options?.q.error ? <Banner tone="error">{errorMessage(options.q.error)}</Banner> : null}
      {!options?.q.isLoading && !items.length ? <Text variant="body" tone="muted" className="text-center py-4">{query ? 'No matches.' : 'Nothing to choose here yet.'}</Text> : null}
      {items.map((o) => (
        <ChoiceTile key={o.id} compact title={o.label} description={o.detail} selected={selected === o.id} onPress={() => { setQuery(''); onChoose(o); }} />
      ))}
    </Sheet>
  );
}
