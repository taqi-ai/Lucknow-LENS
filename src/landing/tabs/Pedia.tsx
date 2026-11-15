import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import SpotlightCard from '../../reactbits/SpotlightCard';
import { H2, Kicker, PageHero, Photo, Wrap } from '../ui';
import { prefersReducedMotion } from '../bits';
import type { TabProps } from '../Landing';

/*
 * Lucknowpedia. Every entry below comes from a source we read, and each section
 * links to it. Where sources disagree, the page says so instead of picking one.
 */

const NAWABS = [
  { name: 'Saadat Khan (Burhan-ul-Mulk)', years: '1722 to 1739', note: 'First Nawab of Awadh, appointed governor of the province under the Mughals. Some sources give 1732 as his start; most give 1722.' },
  { name: 'Safdarjung (Abu Mansur Khan)', years: 'about 1739 to 1754', note: 'His nephew and successor. The court kept its Mughal ties while building its own power.' },
  { name: 'Shuja-ud-Daula', years: 'about 1754 to 1775', note: 'Ruled from Faizabad. His reign ends in the year the court moves to Lucknow.' },
  { name: 'Asaf-ud-Daula', years: 'about 1775 to 1797', note: 'Moved the capital to Lucknow, and built Bara Imambara and Rumi Darwaza as a famine-relief project.' },
  { name: 'Wajid Ali Shah', years: 'last Nawab; exiled after the 1856 annexation', note: 'A poet and patron of music and dance. The state was formally abolished in 1858 (Wikipedia-derived lists give 3 March 1858).' },
];

const OUTLETS = [
  { name: 'Tunday Kababi', since: '1905', story: 'Most accounts credit Haji Murad Ali, a one-armed kebab maker. The accounts differ on how he lost the arm (a fall from a terrace while flying a kite, or a battle) and on the first location (Chowk, behind Akbari Gate, or Aminabad). A grandson runs the business today, and it has opened a branch in Dubai.', art: 'tunday' },
  { name: 'Idris Biryani', since: '1968', story: 'Founded by Mohammad Idris on Raja Bazar in Chowk and now run by his sons Abu Bakr and Abu Hamza. Known for mutton biryani, and best as takeaway.', art: 'biryani' },
  { name: 'Mubeen\'s', since: 'founding year not confirmed', story: 'Started by Mohd Mubeen and carried on by his son Mohd Rizwan Mubeen, with branches in Chowk and near Hazratganj.', art: 'nihari' },
];

const CMS = [
  { name: 'Yogi Adityanath', years: 'March 2017 to now', note: 'Sworn in on 25 March 2017. Sources call him the longest-serving chief minister in the state\'s history. Numbering of chief ministers differs between lists, so we do not number him.' },
  { name: 'Akhilesh Yadav', years: '2012 to 2017', note: '' },
  { name: 'Mayawati', years: '1995, 1997, 2002 to 2003, 2007 to 2012', note: 'Four terms; some lists call her the first woman chief minister of the state, others name Sucheta Kripalani (1963 to 1967).' },
];

const SOURCES = {
  nawabs: [{ t: 'List of Nawabs of Awadh', u: 'https://en.wikipedia.org/wiki/Nawab_of_Awadh' }, { t: 'Harvard timeline: Mughal disintegration, c. 1707 to 1766', u: 'https://timelinesouthasianhistory.hsites.harvard.edu/mughal-disintegration-and-rise-regional-powers-c-1707-ce-1766-ce' }],
  food: [{ t: 'Incredible India: where to eat in Lucknow', u: 'https://incredibleindia.gov.in/en/uttar-pradesh/lucknow/food-guide-what-and-where-to-eat-in-lucknow' }, { t: 'Esquire India: the toothless Nawab and the kebab', u: 'https://www.esquireindia.co.in/amp/story/food-and-drinks/what-to-eat/the-toothless-nawab-who-gave-india-its-greatest-kebab' }, { t: 'Outlook Traveller: feast like a Nawab', u: 'https://www.outlooktraveller.com/explore/food-and-drink/feast-like-a-nawab-at-these-restaurants-in-lucknow' }],
  gov: [{ t: 'List of former chief ministers of Uttar Pradesh', u: 'https://currentaffairs.adda247.com/list-of-former-chief-ministers-of-uttar-pradesh/' }],
  metro: [{ t: 'Lucknow Metro Phase 1B approved (The Metro Rail Guy)', u: 'https://themetrorailguy.com/2025/08/13/lucknow-metros-phase-1b-line-2-approved-by-central-government/' }, { t: 'UP Budget 2026-27: ₹550 crore for Phase 1B', u: 'https://www.nativeplanet.com/news/up-budget-2026-27-allocates-550-crore-to-lucknow-metro-phase-1b-fast-tracking-11-16-km-corridor-019377.html' }, { t: 'Afcons lowest bidder, underground section', u: 'https://psuwatch.com/amp/story/newsupdates/with-rs-1632-cr-bid-afcons-infra-lowest-bidder-for-construction-of-part-of-lucknow-metro' }],
};

const Src: React.FC<{ items: { t: string; u: string }[] }> = ({ items }) => (
  <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-paper/55">
    <span className="font-semibold text-paper/70">Sources</span>
    {items.map((s) => <a key={s.u} href={s.u} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline-offset-4 hover:text-paper hover:underline">{s.t}<ArrowUpRight className="h-3 w-3" /></a>)}
  </p>
);

const Reveal: React.FC<{ children: React.ReactNode; i?: number }> = ({ children, i = 0 }) => (
  <motion.div initial={prefersReducedMotion() ? false : { opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-8% 0px' }} transition={{ duration: 0.7, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>
);

export default function Pedia(_: TabProps) {
  return (
    <>
      <PageHero kicker="Lucknowpedia" title="Lucknowpedia" hi="लखनऊ ज्ञानकोश" art="nawabs" backdrop="particles"
        intro="Who built the city, who feeds it and who runs it today. Each entry is drawn from a source we link to, and where sources disagree we say so. This page is a living reference, and it grows as we check more." />

      <Wrap className="pb-24">
        <div className="mb-10 max-w-[640px]"><Kicker>The Nawabs of Awadh</Kicker><H2>Five rulers, one city</H2></div>
        <ol className="relative space-y-4 border-l border-sand/30 pl-6 sm:pl-10">
          {NAWABS.map((n, i) => (
            <li key={n.name} className="relative">
              <span aria-hidden className="absolute -left-[31px] top-5 h-3 w-3 rounded-full bg-sand sm:-left-[47px]" />
              <Reveal i={i}>
                <SpotlightCard spotlightColor="color-mix(in srgb, var(--color-amber) 18%, transparent)" className="!rounded-[22px] !border-paper/10 !bg-terrain p-6">
                  <p className="text-[13px] font-semibold text-sand">{n.years}</p>
                  <h3 className="font-display text-[1.6rem] leading-tight text-paper">{n.name}</h3>
                  <p className="mt-2 max-w-[44rem] text-[15px] leading-[1.7] text-paper/70">{n.note}</p>
                </SpotlightCard>
              </Reveal>
            </li>
          ))}
        </ol>
        <Src items={SOURCES.nawabs} />
      </Wrap>

      <Wrap className="pb-24">
        <div className="mb-10 max-w-[640px]"><Kicker>The famous kitchens</Kicker><H2>Three names every Lucknowi will argue about</H2></div>
        <div className="grid gap-5 md:grid-cols-3">
          {OUTLETS.map((o, i) => (
            <Reveal key={o.name} i={i}>
              <article className="h-full overflow-hidden rounded-[26px] border border-paper/10 bg-terrain">
                <div className="relative aspect-[4/3]"><Photo slug={o.art} alt="" className="absolute inset-0 h-full w-full object-cover" sizes="400px" /></div>
                <div className="p-6">
                  <p className="text-[13px] font-semibold text-sand">Since {o.since}</p>
                  <h3 className="font-display text-[1.5rem] leading-tight text-paper">{o.name}</h3>
                  <p className="mt-3 text-[14.5px] leading-[1.7] text-paper/70">{o.story}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
        <Src items={SOURCES.food} />
      </Wrap>

      <Wrap className="pb-24">
        <div className="mb-10 max-w-[640px]"><Kicker>Who runs Uttar Pradesh</Kicker><H2>Chief ministers, recent and current</H2></div>
        <div className="grid gap-4 md:grid-cols-3">
          {CMS.map((c, i) => (
            <Reveal key={c.name} i={i}>
              <div className="h-full rounded-[22px] border border-paper/10 bg-terrain p-6">
                <p className="text-[13px] font-semibold text-sand">{c.years}</p>
                <h3 className="font-display text-[1.5rem] leading-tight text-paper">{c.name}</h3>
                {c.note && <p className="mt-2 text-[14.5px] leading-[1.65] text-paper/65">{c.note}</p>}
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-5 max-w-[46rem] text-[14px] leading-[1.7] text-paper/60">We have not listed the current cabinet yet. Ministers change often, so check the state's official website for the live list rather than trust a copy here.</p>
        <Src items={SOURCES.gov} />
      </Wrap>

      <Wrap className="pb-28">
        <div className="mb-10 max-w-[640px]"><Kicker>Being built now</Kicker><H2>Lucknow Metro, Phase 1B</H2></div>
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="grid grid-cols-2 gap-4">
            {[
              { v: '11.2 km', l: 'Charbagh to Vasant Kunj, an east-west line' },
              { v: '12', l: 'stations: seven underground, five elevated' },
              { v: '₹5,801 cr', l: 'approved by the Union Cabinet in August 2025' },
              { v: '₹550 cr', l: 'set aside in the UP Budget 2026-27' },
            ].map((s) => (
              <Reveal key={s.l}><div className="h-full rounded-[22px] border border-paper/10 bg-terrain p-5"><p className="font-display text-[clamp(1.6rem,2.6vw,2.2rem)] leading-none text-paper">{s.v}</p><p className="mt-3 text-[13.5px] leading-[1.55] text-paper/65">{s.l}</p></div></Reveal>
            ))}
          </div>
          <Reveal>
            <div className="rounded-[26px] border border-paper/10 bg-terrain p-7">
              <h3 className="font-display text-[1.4rem] text-paper">Where it stands</h3>
              <ul className="mt-4 space-y-3 text-[14.5px] leading-[1.65] text-paper/70">
                <li>Contracts are awarded. Afcons Infrastructure was the lowest bidder, at ₹1,632 crore, for the 6.52 km underground section from Charbagh to Chowk. Ranjit Buildcon was awarded the elevated section between Thakurganj and Vasant Kunj, for ₹383.98 crore.</li>
                <li>Reports say construction began in June 2026. One report describes that start only as expected, so treat the date as likely but not confirmed.</li>
                <li>The line is planned for completion within five years of approval.</li>
              </ul>
              <p className="mt-4 text-[13px] text-paper/50">Flyovers, expressways and road projects are not covered here yet; we have not found a source we trust for them.</p>
            </div>
          </Reveal>
        </div>
        <Src items={SOURCES.metro} />
      </Wrap>
    </>
  );
}
