import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { RESIDENCE_DOC_LABELS, type ResidenceDocType, type ResidenceRegistrationResult, type ResidentMe } from '@nestovin/contracts';
import { api, errorMessage } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { Banner, Button, Card, Choice, H1, H2, Loading, P, Row, Screen } from '../../components/ui';

const BUCKET = 'resident-documents';
const MAX_BYTES = 5 * 1024 * 1024;
type Picked = { uri: string; name: string; mimeType: 'application/pdf' | 'image/jpeg' | 'image/png'; size: number };

/** RES-03: register one flat with one proof document (manual review, ADR-012). */
export default function Register() {
  const qc = useQueryClient();
  const [cityId, setCityId] = useState<string | null>(null);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [towerId, setTowerId] = useState<string | null>(null);
  const [flatId, setFlatId] = useState<string | null>(null);
  const [occupancy, setOccupancy] = useState<'OWNER' | 'TENANT' | null>(null);
  const [docType, setDocType] = useState<ResidenceDocType | null>(null);
  const [file, setFile] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cities = useQuery({ queryKey: ['cities'], queryFn: () => api<{ items: { id: string; name: string; state: string }[] }>('/v1/resident/cities') });
  const communities = useQuery({ queryKey: ['communities', cityId], enabled: Boolean(cityId), queryFn: () => api<{ items: { id: string; name: string; addressLine: string | null }[] }>(`/v1/resident/cities/${cityId}/communities`) });
  const towers = useQuery({ queryKey: ['towers', communityId], enabled: Boolean(communityId), queryFn: () => api<{ items: { id: string; name: string }[] }>(`/v1/resident/communities/${communityId}/towers`) });
  const flats = useQuery({ queryKey: ['flats', towerId], enabled: Boolean(towerId), queryFn: () => api<{ items: { id: string; flatNumber: string; floor: number | null }[] }>(`/v1/resident/towers/${towerId}/flats`) });

  const pickPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    accept({ uri: a.uri, name: a.name, mimeType: (a.mimeType ?? 'application/pdf') as Picked['mimeType'], size: a.size ?? 0 });
  };
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError('Allow camera access to take a photo of your document.');
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    accept({ uri: a.uri, name: a.fileName ?? 'document.jpg', mimeType: a.mimeType === 'image/png' ? 'image/png' : 'image/jpeg', size: a.fileSize ?? 0 });
  };
  const accept = (f: Picked) => {
    setError(null);
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.mimeType)) return setError('Use a PDF, JPEG or PNG file.');
    if (f.size > MAX_BYTES) return setError('The file must be smaller than 5 MB.');
    setFile(f);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!flatId || !occupancy || !docType || !file) throw new Error('Complete every step first');
      const bytes = await (await fetch(file.uri)).arrayBuffer();
      const size = file.size || bytes.byteLength;
      const reg = await api<ResidenceRegistrationResult>('/v1/resident/residence', {
        method: 'POST',
        body: { flatId, occupancy, document: { docType, fileName: file.name.slice(0, 255), mimeType: file.mimeType, sizeBytes: size } },
      });
      const { error: upErr } = await supabase.storage.from(BUCKET).uploadToSignedUrl(reg.upload.path, reg.upload.token, bytes, { contentType: file.mimeType });
      if (upErr) throw new Error('The document could not be uploaded. Check your connection and try again from Home.');
      return api<ResidentMe>(`/v1/resident/documents/${reg.upload.documentId}/complete`, { method: 'POST' });
    },
    onSuccess: async (me) => {
      qc.setQueryData(['me'], me);
      router.replace('/');
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Screen>
      <H1>Register your flat</H1>
      <Card>
        <H2>1. City</H2>
        {cities.isLoading ? <Loading /> : <Choice options={(cities.data?.items ?? []).map((c) => ({ value: c.id, label: c.name, detail: c.state }))} value={cityId} onChange={(v) => { setCityId(v); setCommunityId(null); setTowerId(null); setFlatId(null); }} />}
        {cities.data?.items.length === 0 ? <P muted>Nestovin is not available in any city yet.</P> : null}
        <Button title="My city or community is not listed" variant="ghost" onPress={() => router.push('/vote')} />
      </Card>
      {cityId ? (
        <Card>
          <H2>2. Community</H2>
          {communities.isLoading ? <Loading /> : <Choice options={(communities.data?.items ?? []).map((c) => ({ value: c.id, label: c.name, detail: c.addressLine ?? undefined }))} value={communityId} onChange={(v) => { setCommunityId(v); setTowerId(null); setFlatId(null); }} />}
        </Card>
      ) : null}
      {communityId ? (
        <Card>
          <H2>3. Tower</H2>
          {towers.isLoading ? <Loading /> : <Choice options={(towers.data?.items ?? []).map((t) => ({ value: t.id, label: t.name }))} value={towerId} onChange={(v) => { setTowerId(v); setFlatId(null); }} />}
        </Card>
      ) : null}
      {towerId ? (
        <Card>
          <H2>4. Flat</H2>
          {flats.isLoading ? <Loading /> : <Choice options={(flats.data?.items ?? []).map((f) => ({ value: f.id, label: `Flat ${f.flatNumber}`, detail: f.floor !== null ? `Floor ${f.floor}` : undefined }))} value={flatId} onChange={setFlatId} />}
        </Card>
      ) : null}
      {flatId ? (
        <Card>
          <H2>5. You are the</H2>
          <Choice options={[{ value: 'OWNER', label: 'Owner' }, { value: 'TENANT', label: 'Tenant' }]} value={occupancy} onChange={setOccupancy} />
        </Card>
      ) : null}
      {occupancy ? (
        <Card>
          <H2>6. Proof of residence</H2>
          <P muted>Upload one document. Only our verification team can see it.</P>
          <Choice options={(Object.keys(RESIDENCE_DOC_LABELS) as ResidenceDocType[]).map((k) => ({ value: k, label: RESIDENCE_DOC_LABELS[k] }))} value={docType} onChange={setDocType} />
          {docType ? (
            <Row>
              <Button title="Choose file" variant="secondary" onPress={() => void pickPdf()} />
              <Button title="Take photo" variant="secondary" onPress={() => void takePhoto()} />
            </Row>
          ) : null}
          {file ? <Banner tone="success">Selected: {file.name}</Banner> : null}
        </Card>
      ) : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button title="Submit for verification" disabled={!file || !docType} busy={submit.isPending} onPress={() => submit.mutate()} />
    </Screen>
  );
}
