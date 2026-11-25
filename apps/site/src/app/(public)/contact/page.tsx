import { Clock3, Mail, MapPin, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import { site } from '@/site/content';
import { EnquiryForm } from '@/site/EnquiryForm';
import { Container, EmblemWatermark } from '@/site/ui';

export const metadata = {
  title: 'Contact and enquiry',
  description: 'Send Nestovin an enquiry: home help for your flat, bringing Nestovin to your community, or working with us.',
  alternates: { canonical: '/contact' },
};

const next = [
  { title: 'A person reads it', body: 'Every enquiry goes to someone on our team, not an auto-reply.' },
  { title: 'We call you', body: 'On the number you give us, during working hours.' },
  { title: 'You get a straight answer', body: 'Whether Nestovin runs in your community yet, and what happens next.' },
];

export default function ContactPage() {
  const { email, phone, whatsapp, address, hours } = site.contact;
  return (
    <section className="relative isolate bg-canvas pt-8 pb-16 md:pt-12 md:pb-24">
      <Container className="grid gap-6 lg:grid-cols-[0.92fr_1.3fr] lg:items-start lg:gap-8">
        <aside className="hero-in relative isolate overflow-hidden rounded-2xl p-7 text-white md:p-10 lg:sticky lg:top-[96px]">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(150deg,var(--nv-teal-deep)_0%,var(--nv-teal-action)_75%,var(--nv-green-action)_140%)]" aria-hidden />
          <EmblemWatermark onDark className="absolute -right-16 -bottom-16 -z-10 w-[380px]" />
          <h1 className="text-[34px] leading-[40px] font-bold tracking-[-0.02em] text-white md:text-[46px] md:leading-[52px]">Let&rsquo;s talk about your home</h1>
          <p className="mt-4 max-w-[440px] text-[17px] leading-7 text-white/90">
            Help at home, Nestovin for your community, or a job with us. Start here and tell us a little about it.
          </p>

          <h2 className="mt-10 text-[15px] font-semibold tracking-[0.02em] text-white">What happens after you send it</h2>
          <ol className="mt-4 space-y-5">
            {next.map((n, i) => (
              <li key={n.title} className="grid grid-cols-[36px_1fr] gap-3.5">
                <span className="grid size-9 place-items-center rounded-full bg-white font-display text-[15px] font-bold text-teal-deep tabular-nums">{i + 1}</span>
                <div className="pt-1">
                  <p className="font-display text-[18px] font-semibold text-white">{n.title}</p>
                  <p className="mt-0.5 text-[15px] leading-6 text-white">{n.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <ul className="mt-10 space-y-3 border-t border-white/20 pt-6 text-[15px] text-white">
            <li className="flex items-center gap-3">
              <Clock3 size={18} aria-hidden /> {hours}
            </li>
            {phone && (
              <li className="flex items-center gap-3">
                <Phone size={18} aria-hidden />
                <a href={`tel:${phone}`} className="underline-offset-4 hover:underline">{phone}</a>
              </li>
            )}
            {whatsapp && (
              <li className="flex items-center gap-3">
                <MessageCircle size={18} aria-hidden />
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">WhatsApp us</a>
              </li>
            )}
            {email && (
              <li className="flex items-center gap-3">
                <Mail size={18} aria-hidden />
                <a href={`mailto:${email}`} className="underline-offset-4 hover:underline">{email}</a>
              </li>
            )}
            {address && (
              <li className="flex items-start gap-3">
                <MapPin size={18} className="mt-0.5 shrink-0" aria-hidden /> {address}
              </li>
            )}
          </ul>

          <p className="mt-6 flex gap-3 rounded-lg bg-[rgb(0_0_0/0.2)] p-4 text-[14px] leading-6 text-white">
            <ShieldCheck size={20} className="mt-0.5 shrink-0" aria-hidden />
            Nestovin never takes payment over the phone and never charges a fee to apply for a job. Plans and payments happen only in the Nestovin app.
          </p>
        </aside>

        <div className="hero-in">
          <EnquiryForm />
        </div>
      </Container>
    </section>
  );
}
