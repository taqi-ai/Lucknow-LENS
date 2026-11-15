import React from 'react';
import GlareHover from '../../reactbits/GlareHover';
import { CREDITS, DATA_CREDITS, TEAM, TEAM_AFFILIATION, photoSm } from '../content';
import { H2, Kicker, PageHero, Wrap } from '../ui';
import type { TabProps } from '../Landing';

export default function About(_: TabProps) {
  const rows = Object.entries(CREDITS).sort((a, b) => a[1].title.localeCompare(b[1].title));
  return (
    <>
      <PageHero
        kicker="The people and the credits" title="About" hi="हमारे बारे में"
        intro="Terralyt Lucknow is built by second-year students. We made it because we wanted to see our own city the way it deserves to be seen, and to prove that open data can make a serious city tool."
      />

      <Wrap className="pb-24">
        <div className="mb-10 max-w-[640px]"><Kicker>Team</Kicker><H2>Who built it</H2></div>
        <div className="grid gap-4 md:grid-cols-3">
          {TEAM.map((m) => (
            <div key={m.name} className="contents"><GlareHover width="100%" height="100%" background={m.lead ? 'var(--color-slate)' : 'var(--color-terrain)'} borderColor={m.lead ? 'rgba(154,100,40,.55)' : 'rgba(42,26,16,.12)'} borderRadius="24px" glareColor="#ffffff" glareOpacity={0.25} style={{ display: 'block' }}>
              <div className="p-8 text-left">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-sand/15 font-display text-[1.4rem] text-sand" aria-hidden>{m.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
                <h3 className="mt-6 font-display text-[1.45rem] font-light leading-tight">{m.name}</h3>
                <p className={`mt-2 text-[13px] font-medium ${m.lead ? 'text-amber' : 'text-sage'}`}>{m.role}</p>
                <p className="mt-1 text-[12.5px] text-paper/50">{TEAM_AFFILIATION}</p>
              </div>
            </GlareHover></div>
          ))}
        </div>
      </Wrap>

      <Wrap className="pb-24">
        <div className="rounded-[28px] border border-sand/12 bg-terrain/50 p-8 sm:p-10">
          <h3 className="font-display text-[1.6rem] font-light">An independent project</h3>
          <p className="mt-4 max-w-[48rem] text-[15px] leading-[1.8] text-paper/65">Terralyt Lucknow is not an official website, and no government department has reviewed, endorsed or published it. It uses publicly available data and describes public services for the convenience of visitors. For official information, use the departments' own websites.</p>
        </div>
      </Wrap>

      <Wrap className="pb-24">
        <div className="mb-10 max-w-[640px]"><Kicker>Data and software</Kicker><H2>Standing on open shoulders</H2></div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DATA_CREDITS.map((d) => (
            <li key={d.name}><a href={d.url} target="_blank" rel="noreferrer noopener" className="block h-full rounded-[20px] border border-sand/12 bg-terrain/40 p-6 transition-colors hover:border-sand/40">
              <p className="text-[15px] font-semibold">{d.name}</p><p className="mt-1 text-[13px] text-paper/55">{d.use}</p>
            </a></li>
          ))}
        </ul>
      </Wrap>

      <Wrap className="pb-28" id="credits">
        <div className="mb-8 max-w-[640px]"><Kicker>Photographs</Kicker><H2>Photo credits</H2></div>
        <p className="mb-6 max-w-[46rem] text-[14px] leading-[1.7] text-paper/60">Photographs are from Wikimedia Commons under the licences shown. The monument and food pictures on the Heritage, History and Food pages are AI illustrations we made with Google Flow, each drawn from the real photograph listed here as its reference. The line drawings on the home page are drawn by hand in code.</p>
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map(([slug, c]) => (
            <li key={slug} className="flex items-center gap-4 rounded-[16px] border border-sand/10 p-3">
              <img src={photoSm(slug)} alt="" loading="lazy" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 text-[12.5px] leading-[1.5]">
                <a href={c.page} target="_blank" rel="noreferrer noopener" className="block truncate font-medium text-paper/85 underline-offset-2 hover:underline">{c.title}</a>
                <p className="truncate text-paper/50">{c.author}, {c.licence}</p>
              </div>
            </li>
          ))}
        </ul>
      </Wrap>
    </>
  );
}
