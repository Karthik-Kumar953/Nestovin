/**
 * Public website copy. One place for every word on the site.
 * Sources: PRD v1.1 (§2, §5, §9, §10, §12), Final module workflows, the Subscriptions
 * example sheet (task structure only, never prices or plan names), Brand Kit v1.0.
 * Rules: sentence case, plain English, no emoji, no prices, no invented numbers,
 * testimonials or client names. Anything marked OWNER is waiting on the owner.
 */

export const site = {
  name: 'Nestovin',
  tagline: 'A home that brings people together.',
  promise: 'Your home. Our priority.',
  description:
    'Trained, verified maids, cooks and caretakers for gated communities. Employed by Nestovin, assigned to your flat, and checked in at your door on every visit.',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.nestovin.com',
  /** OWNER: real contact details. Empty values are hidden on the site. */
  contact: {
    email: '',
    phone: '',
    /** OWNER: WhatsApp number in international form without + (e.g. 9198xxxxxxxx). Empty = hidden. */
    whatsapp: '',
    address: '',
    hours: 'Monday to Saturday, 9 am to 7 pm',
  },
};

/**
 * Home hero film (owner-generated from docs/Design/Website_Image_Prompts.md, Film A).
 * Drop the files in public/site/ and fill mp4 (and webm). Empty mp4 = poster still only.
 */
export const heroFilm = {
  mp4: '',
  webm: '',
  poster: '/site/community-dawn.jpg',
};

export const nav = [
  { href: '/services', label: 'Services' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/trust', label: 'Trust and safety' },
  { href: '/communities', label: 'For communities' },
  { href: '/careers', label: 'Careers' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
] as const;

export type ServiceSlug = 'maid' | 'cook' | 'caretaker';

export interface Service {
  slug: ServiceSlug;
  name: string;
  line: string;
  short: string;
  image: string;
  imageAlt: string;
  summary: string;
  uniform: string;
  rhythm: { name: string; body: string }[];
  tasks: { group: string; items: string[] }[];
  notIncluded: string[];
  note?: string;
}

/**
 * Task structure follows the Subscriptions example sheet (visit patterns and task
 * frequencies). Exact tasks, frequencies and time windows are set per community plan.
 */
export const services: Service[] = [
  {
    slug: 'maid',
    name: 'Maid',
    line: 'Clean homes.',
    short: 'Daily cleaning and upkeep of your home, on a fixed schedule.',
    image: '/site/maid.jpg',
    imageAlt: 'A Nestovin housekeeper wiping a glass dining table in a bright living room',
    summary:
      'The same trained housekeeper keeps your home in order at the same time every day. Daily work is done on every visit; deeper cleaning follows the plan your community offers.',
    uniform: 'Teal tunic with a mint apron and a Nestovin photo ID.',
    rhythm: [
      { name: 'Morning visit', body: 'One visit a day in the morning window.' },
      { name: 'Morning and evening', body: 'Two visits a day, so the home stays in order through the day.' },
      { name: 'Full day', body: 'A housekeeper with your home through the working day, where offered.' },
    ],
    tasks: [
      { group: 'Every visit', items: ['Washing utensils', 'Sweeping', 'Mopping', 'Kitchen counter and sink wipe-down', 'Taking out the trash'] },
      { group: 'On fuller plans', items: ['Sweeping and utensils twice a day', 'Folding clothes', 'Washing clothes in your washing machine', 'Watering plants'] },
      { group: 'Washroom deep cleaning', items: ['Monthly, weekly or daily, depending on the plan'] },
    ],
    notIncluded: ['Work outside your flat', 'Lifting heavy furniture', 'Cleaning with hazardous chemicals'],
  },
  {
    slug: 'cook',
    name: 'Cook',
    line: 'Healthy meals.',
    short: 'Home-style meals, cooked fresh in your kitchen.',
    image: '/site/cook.jpg',
    imageAlt: 'A Nestovin cook stirring a pot of dal in a bright apartment kitchen',
    summary:
      "A trained cook prepares your family's everyday meals in your kitchen, to your taste, with the ingredients you keep at home.",
    uniform: 'White chef coat with a teal apron and a Nestovin photo ID.',
    rhythm: [
      { name: 'One meal', body: 'A morning visit to prepare one meal for the day.' },
      { name: 'Two meals', body: 'Tiffin and lunch in the morning, dinner in the evening.' },
      { name: 'Full day', body: 'A cook through the day, where offered.' },
    ],
    tasks: [
      { group: 'Every visit', items: ['Cutting vegetables and preparation', 'Cooking the meals you plan', 'Kitchen wipe-down after cooking'] },
      { group: 'On fuller plans', items: ['Tiffin and lunch preparation in the morning', 'Dinner preparation in the evening', 'Planning the week\'s menu with you'] },
    ],
    notIncluded: ['Grocery shopping', 'Cooking for large events', 'Washing all household utensils (part of the maid service)'],
  },
  {
    slug: 'caretaker',
    name: 'Caretaker',
    line: 'Caring people.',
    short: 'Company and everyday help for elders at home.',
    image: '/site/caretaker.jpg',
    imageAlt: 'A Nestovin caretaker handing a cup of tea to an elderly woman in a sunlit living room',
    summary:
      'A caretaker spends set hours with an elder at home: company, small daily help, and a calm presence while the family is at work or away.',
    uniform: 'Grey polo with a teal collar, a teal cap and a Nestovin photo ID.',
    rhythm: [{ name: 'Set hours', body: 'Hours added to a maid or cook plan, agreed when you choose it.' }],
    tasks: [
      { group: 'During the visit', items: ['Company and conversation', 'Help with tea, snacks and meals', 'Reminders for routine medicines', 'Short walks within the community'] },
    ],
    notIncluded: ['Medical or nursing care', 'Injections or treatment', 'Overnight stays'],
    note: 'Caretaker hours are added to a maid or cook plan. They are not sold on their own.',
  },
];

/** "A day at flat 1204". Sample, illustrative. */
export const day = [
  {
    time: '07:00',
    title: 'Your cook arrives',
    body: 'Assigned to your flat by Nestovin: the same person, at the same time, for your whole plan.',
    image: '/site/cook.jpg',
    alt: 'A Nestovin cook preparing breakfast in a home kitchen',
    state: 'Arriving',
  },
  {
    time: '07:02',
    title: 'The visit starts with your code',
    body: 'You share a one-time code from the app at the door. The visit is recorded, with the time and place of check-in.',
    image: '/site/door-checkin.jpg',
    alt: 'A resident at the door of flat 1204 showing a check-in code to a Nestovin cook',
    state: 'Checked in',
  },
  {
    time: '09:00',
    title: 'Your maid, or her trained replacement',
    body: "If your usual person is on leave, Nestovin arranges a replacement from your community's trained team. You never have to find someone.",
    image: '/site/maid.jpg',
    alt: 'A Nestovin housekeeper cleaning a dining table',
    state: 'Checked in',
  },
  {
    time: '18:00',
    title: 'Evening hours for your parents',
    body: 'A caretaker spends set hours with the elders at home. After each visit you can confirm it and leave feedback.',
    image: '/site/caretaker.jpg',
    alt: 'A Nestovin caretaker bringing tea to an elderly woman',
    state: 'Scheduled',
  },
] as const;

export const paths = [
  { who: 'I live in a gated community', what: 'What Nestovin does for your home', href: '/how-it-works' },
  { who: 'I help run a community', what: 'Bring Nestovin to every tower', href: '/communities' },
  { who: 'I want to work with Nestovin', what: 'Steady, salaried work near home', href: '/careers' },
] as const;

export const difference = {
  title: 'You choose the service. We take care of the rest.',
  body: 'On a marketplace you browse profiles, negotiate, and manage the person yourself. With Nestovin you choose a service, a plan and a time. Nestovin employs, trains, assigns and replaces the staff.',
  rows: [
    { topic: 'Who employs the worker', us: 'Nestovin, on a monthly salary', them: 'You, informally' },
    { topic: 'Checks before day one', us: 'Identity, documents and police verification, then training', them: 'Rarely done' },
    { topic: 'When someone is on leave', us: 'A replacement from the same trained team', them: 'You find someone' },
    { topic: 'Proof of each visit', us: 'Checked in with your code', them: 'Nothing on record' },
    { topic: 'Paying', us: 'In the app, to Nestovin', them: 'Cash, to the person' },
    { topic: 'When something goes wrong', us: 'A request with an owner and a deadline', them: 'Sorted out between you and the worker' },
  ],
};

export const steps = [
  {
    n: '01',
    title: 'Your community joins',
    body: "Nestovin maps your community's towers and flats, agrees service time windows with the committee, and publishes the plans offered there.",
    tower: 'mapped',
  },
  {
    n: '02',
    title: 'You sign in and register your flat',
    body: 'Sign in to the Nestovin app with your phone number, choose your tower and flat, and share proof that you live there. Services open once your flat is verified. Family members can be added after a check by our team.',
    tower: 'registered',
  },
  {
    n: '03',
    title: 'You choose a service and plan',
    body: 'The app shows the services, plans and time windows for your home. Your community opens in one of two ways, explained below.',
    tower: 'lit',
  },
  {
    n: '04',
    title: 'Nestovin assigns your person',
    body: "A verified, trained employee from your community's team is assigned to your flat and time. You don't pick from profiles; we match the right person to the work.",
    tower: 'team',
  },
  {
    n: '05',
    title: 'Every visit is checked in',
    body: 'The visit starts when you share your one-time code at the door. Start and finish are recorded, and you can confirm the visit and leave feedback.',
    tower: 'visit',
  },
  {
    n: '06',
    title: 'Help when you need it',
    body: 'Raise a request in the app. Each request has an owner and a deadline, and moves up to a senior manager if it is late.',
    tower: 'visit',
  },
] as const;

export const modes = [
  {
    name: 'Book an open time slot',
    body: 'Time slots are already available. Choose one and pay for the plan in the app; the booking is confirmed once payment is verified.',
  },
  {
    name: 'Sign up in an interest round',
    body: 'Residents register what they need during a short interest round, with part of the amount paid up front. When the round closes, Nestovin staffs the community and publishes time slots, and you pay the balance to start. A request is not a booking until then.',
  },
] as const;

export const trust = [
  { step: 'Before joining', title: 'Identity, documents and police verification', body: "Each person's identity and documents are checked and police verification is completed before they join. Our HR team reviews every check." },
  { step: 'Before the first visit', title: 'Trained for the work and the home', body: 'Training covers the service, hygiene, conduct in a family home and the check-in app.' },
  { step: 'Every day', title: 'In uniform, with a photo ID', body: 'Every staff member wears the Nestovin uniform for their role and carries a Nestovin photo ID.' },
  { step: 'Every month', title: 'Employed and paid by Nestovin', body: "Staff are on Nestovin's monthly payroll, not paid in cash by the visit." },
  { step: 'Every visit', title: 'Checked in at your door', body: 'A one-time code or QR from your app starts the visit; time and location are recorded at that moment.' },
  { step: 'Always', title: 'Your details stay private', body: 'Staff see only what the visit needs: your first name, tower and flat.' },
  { step: 'Whenever you need', title: 'Concerns go to a person', body: 'Every request has an owner and a deadline, and moves up to a senior manager if it is late.' },
] as const;

export const communities = {
  title: 'Bring Nestovin to your community',
  body: 'One accountable provider for home help across every tower, with staff who are verified, uniformed and checked in at each flat. Residents decide; the committee is not asked to buy anything.',
  benefits: [
    { title: 'One accountable provider', body: 'No more unknown workers moving between flats. Every Nestovin staff member is employed, identified and on record.' },
    { title: 'Less load on the gate', body: 'Staff are scheduled to specific flats and times, and each visit is checked in, so security knows who is expected.' },
    { title: 'Residents decide', body: 'We collect interest from residents and staff the community to match it. Each household chooses for itself.' },
    { title: 'Local, steady jobs', body: 'Staff are hired and trained to work in your area on a monthly salary.' },
  ],
  /** Brand Kit p.15, community onboarding process. */
  onboarding: [
    { title: 'Discussion with the committee', body: 'We meet the committee or facility manager and understand the community.' },
    { title: 'Review and proposal', body: 'We map towers and flats and propose services and time windows.' },
    { title: 'Agreement and onboarding', body: 'We set up the community in Nestovin and plan the team.' },
    { title: 'Resident communication', body: 'Residents hear about Nestovin and register their interest in the app.' },
    { title: 'Go live and ongoing support', body: 'Service starts flat by flat, with support for every resident.' },
  ],
};

export const careers = {
  title: 'Steady work, close to home',
  body: 'Nestovin hires maids, cooks and caretakers on a monthly salary, trains them, and assigns them to homes in communities near where they live.',
  points: [
    { title: 'A monthly salary', body: 'Paid by Nestovin every month, not in cash by the visit.' },
    { title: 'Training before you start', body: 'Learn the work, the check-in app and how we look after homes.' },
    { title: 'Work near home', body: 'You are assigned within one area, so travel stays short.' },
    { title: 'Respect and support', body: 'A uniform, a photo ID, a fixed schedule and a team to call when something goes wrong.' },
  ],
  roles: ['Maid (housekeeping)', 'Cook', 'Caretaker for elders'],
  how: 'Send your details through the enquiry form and choose "I want to work with Nestovin". Our HR team will call you to arrange a meeting and the verification steps.',
};

export const about = {
  title: 'Why Nestovin',
  /** OWNER: replace with the founders' own words. */
  story: [
    "In most Indian homes, finding reliable help still depends on a neighbour's recommendation, and managing it is a second job: absences, replacements, payments and trust.",
    'Nestovin was started to run home help the way a good service is run. We employ our staff, verify and train them, build a team for each community, and stand behind every visit.',
  ],
  beliefs: [
    { title: 'Dignity for the people who work in our homes', body: 'Salaried, trained and respected staff do better work and stay longer.' },
    { title: 'Trust shown, not promised', body: 'Every visit is checked in and every concern has a named owner.' },
    { title: 'Communities first', body: 'We grow one community at a time, with the residents who live there.' },
  ],
};

export const faq = [
  {
    group: 'For residents',
    items: [
      { q: 'Is Nestovin available in my community?', a: 'We work in selected gated communities and add new ones as residents ask for us. Send an enquiry with your community name and we will tell you where things stand.' },
      { q: 'Why are there no prices on the website?', a: 'Plans and prices are set for each community and home size, and shown in the Nestovin app once your community is live and your flat is verified.' },
      { q: 'Can I choose who comes to my home?', a: "Nestovin assigns a trained person from your community's team. You get the same person for your plan, and a replacement from the same team when needed." },
      { q: 'How do I know the visit happened?', a: 'Each visit starts with a one-time code you share at the door, and the start and finish are recorded in your app.' },
      { q: 'Do I pay the worker directly?', a: 'No. You pay Nestovin in the app, and Nestovin pays its staff a monthly salary.' },
      { q: 'What is an interest round?', a: 'In some communities, residents first register what they need during a short interest round, with part of the amount paid up front. Nestovin then staffs the community and publishes time slots, and you pay the balance to start. Your request is not a booking until that is done.' },
      { q: 'What if my parent is at home alone?', a: 'Add them as a family member in the Nestovin app. At the door they simply show the visit QR code on their phone, and the visit starts. No code to read out or remember.' },
      { q: 'What if something goes missing from my home?', a: 'Tell us straight away through the app or by contacting us. A person takes up every report, and Nestovin takes action against theft.' },
      { q: 'Is a caretaker a nurse?', a: 'No. Caretakers give company and everyday help to elders. They do not give medical or nursing care.' },
    ],
  },
  {
    group: 'For communities',
    items: [
      { q: 'Does the committee have to buy anything?', a: "No. We need the committee's agreement to operate; residents choose individually." },
      { q: 'How long does it take to start?', a: 'It depends on resident demand and hiring. We share a plan after the first conversation.' },
    ],
  },
  {
    group: 'For job seekers',
    items: [
      { q: 'Do I need experience?', a: 'It helps, but everyone is trained before their first visit.' },
      { q: 'How do I apply?', a: 'Send an enquiry and choose "I want to work with Nestovin". Our HR team will call you.' },
    ],
  },
];

export const enquiryTypes = [
  { value: 'resident', label: 'I want Nestovin at home' },
  { value: 'community', label: 'I represent a community' },
  { value: 'careers', label: 'I want to work with Nestovin' },
  { value: 'other', label: 'Something else' },
] as const;
export type EnquiryType = (typeof enquiryTypes)[number]['value'];
