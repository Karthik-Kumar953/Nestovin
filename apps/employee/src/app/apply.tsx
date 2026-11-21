import { useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { ChefHat, HandHeart, Send, Sparkles } from 'lucide-react-native';
import { createApplicantSchema } from '@nestovin/contracts';
import { ApiError, api, errorMessage } from '../lib/api';
import { haptic } from '../lib/haptics';
import { Banner, BrandImage, Button, Chip, Field, Muted, Screen, Stagger, Text, c } from '../ui';

type Input = z.input<typeof createApplicantSchema>;
type Output = z.output<typeof createApplicantSchema>;

const SERVICES = [
  { value: 'MAID', label: 'Maid', icon: Sparkles },
  { value: 'COOK', label: 'Cook', icon: ChefHat },
  { value: 'CARETAKER', label: 'Caretaker', icon: HandHeart },
] as const;

/** EMP-01: public applicant interest. Submitting never creates a login. */
export default function Apply() {
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(createApplicantSchema),
    defaultValues: { fullName: '', phone: '', city: '', services: [], experienceNote: '', website: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api('/v1/public/applicants', {
        method: 'POST',
        auth: false,
        body: { ...values, city: values.city || undefined, experienceNote: values.experienceNote || undefined, website: undefined },
      });
      // The confirmation screen plays the success haptic.
      router.replace('/applied');
    } catch (e) {
      haptic.error();
      if (e instanceof ApiError && e.fields.length) {
        for (const f of e.fields) setFieldError(f.path.split('.')[0] as keyof Input, { message: f.message });
      }
      setError(e instanceof ApiError && e.code === 'RATE_LIMITED' ? 'Too many applications from this network. Please try again later.' : errorMessage(e));
    }
  }, () => haptic.error());

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Apply', headerBackTitle: 'Back', headerTintColor: c.tealAction, headerShadowVisible: false, headerStyle: { backgroundColor: c.background } }} />
      <Screen edges={['bottom', 'left', 'right']} footer={<Button title="Send my application" icon={Send} busy={isSubmitting} onPress={() => void onSubmit()} />}>
        <Stagger index={0}>
          <View className="flex-row items-center gap-3 rounded-lg border border-mint-strong bg-mint-soft p-4">
            <BrandImage name="ill-applicant" variant="illustration" className="h-20 w-20" iconSize={28} />
            <View className="flex-1 gap-1">
              <Text accessibilityRole="header" className="font-display text-headline text-charcoal">Work with Nestovin</Text>
              <Muted>Tell us about yourself. HR will call you about the next steps.</Muted>
            </View>
          </View>
        </Stagger>
        <Stagger index={1}>
          <View className="gap-4">
            <Controller
              control={control}
              name="fullName"
              render={({ field }) => <Field label="Full name" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} autoComplete="name" textContentType="name" autoCapitalize="words" error={errors.fullName ? 'Enter your full name' : undefined} />}
            />
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <Field label="Mobile number" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="98765 43210" error={errors.phone?.message ? 'Enter a valid 10-digit mobile number' : undefined} hint="HR will call you on this number" maxLength={16} />
              )}
            />
            <Controller
              control={control}
              name="city"
              render={({ field }) => <Field label="City or area" optional value={field.value ?? ''} onChangeText={field.onChange} onBlur={field.onBlur} autoCapitalize="words" error={errors.city ? 'Keep this under 80 characters' : undefined} />}
            />
          </View>
        </Stagger>
        <Stagger index={2}>
          <View className="gap-2.5">
            <Text className="font-medium text-body-sm">
              Work you can do <Text className="text-ink-secondary">(choose any)</Text>
            </Text>
            <Controller
              control={control}
              name="services"
              render={({ field }) => {
                const value = field.value ?? [];
                return (
                  <View className="flex-row flex-wrap gap-2.5">
                    {SERVICES.map((s) => (
                      <Chip
                        key={s.value}
                        label={s.label}
                        icon={s.icon}
                        selected={value.includes(s.value)}
                        onPress={() => {
                          haptic.select();
                          field.onChange(value.includes(s.value) ? value.filter((v) => v !== s.value) : [...value, s.value]);
                        }}
                      />
                    ))}
                  </View>
                );
              }}
            />
          </View>
        </Stagger>
        <Stagger index={3}>
          <Controller
            control={control}
            name="experienceNote"
            render={({ field }) => (
              <Field label="Your experience" optional multiline value={field.value ?? ''} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="For example: 3 years cooking for families in Whitefield" maxLength={1000} error={errors.experienceNote ? 'Keep this under 1000 characters' : undefined} />
            )}
          />
        </Stagger>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Muted className="text-sm">Sending this form does not create an account. If HR selects you, they will verify your details and give you an Employee ID.</Muted>
      </Screen>
    </>
  );
}
