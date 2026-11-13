// Phase A pilot page (docs/phase-a-runbook.md §1.2). One static page; the engine runs here, in the browser.
// Answers live only in this page's memory. Nothing about the answers is stored or sent anywhere.
import '@fontsource-variable/rubik/index.css';
import './style.css';
import {
  CATALOG,
  createEngine,
  gainBucket,
  pickActions,
  toEngineAnswers,
  type ActionCard,
  type Assessment,
  type CatalogId,
  type EngineAnswers,
  type QuestionnaireAnswers,
} from '@longevity/engine';
import { PILOT } from './config';
import { ACTION_TEXT, M } from './messages';
import { bdi, esc, hoursText, yearsHtml, yearsText } from './format';
import { icon } from './icons';
import { track } from './track';

const engine = createEngine();
const app = document.getElementById('app')!;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- device-only ids (no answers)
function stored(key: string, make: () => string) {
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
    const n = make();
    localStorage.setItem(key, n);
    return n;
  } catch {
    return make();
  }
}
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomId = () => {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALPHA[x % ALPHA.length]).join('');
};
const ID6 = stored('pilot.id6', randomId);
/** H = "שעות חיים", G = "שעות של הרגל טוב" – random 50/50 in the browser (runbook §1.4). */
const COHORT = stored('pilot.cohort', () => (crypto.getRandomValues(new Uint8Array(1))[0] < 128 ? 'H' : 'G')) as 'H' | 'G';
const REF = (() => {
  const r = new URLSearchParams(location.search).get('ref');
  return r && /^[A-Z0-9]{6}$/.test(r) ? r : null;
})();

// ---------------------------------------------------------------- state
type Screen =
  | 'landing' | 'before' | 'age' | 'sex' | 'gate' | 'gateNote' | 'activity' | 'stairs' | 'echo' | 'strength'
  | 'smoking' | 'hookah' | 'diet' | 'processed' | 'body' | 'sleep' | 'alcohol' | 'social' | 'block'
  | 'pre' | 'reveal' | 'how' | 'actions' | 'plan';

const QNUM: Partial<Record<Screen, number>> = {
  age: 1, sex: 2, gate: 3, activity: 4, stairs: 5, strength: 6, smoking: 7, hookah: 7, diet: 8, processed: 9, body: 10, sleep: 11, alcohol: 12, social: 13,
};

interface State {
  screen: Screen;
  history: Screen[];
  consent: boolean;
  detailsOpen: boolean;
  why: Set<string>;
  a: Partial<QuestionnaireAnswers> & { ageText?: string; bodyText?: { h: string; w: string; waist: string } };
  ageError: string | null;
  bodyError: string | null;
  ans: EngineAnswers | null;
  res: Assessment | null;
  hideNumber: boolean;
  revealAnimated: boolean;
  whatIf: number | null;
  trust: number | null;
  smokingTalk: boolean | null;
  selected: CatalogId | null;
  variant: 'f' | 'e' | 'a';
  slot: string | null;
  withWho: 'alone' | 'someone';
  chosen: ActionCard | null;
}
const fresh = (): State => ({
  screen: 'landing',
  history: [],
  consent: false,
  detailsOpen: false,
  why: new Set(),
  a: {},
  ageError: null,
  bodyError: null,
  ans: null,
  res: null,
  hideNumber: false,
  revealAnimated: false,
  whatIf: null,
  trust: null,
  smokingTalk: null,
  selected: null,
  variant: 'f',
  slot: null,
  withWho: 'alone',
  chosen: null,
});
let S = fresh();
let timers: number[] = [];
const clearTimers = () => {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
};

// ---------------------------------------------------------------- navigation
const isCurrentSmoker = () => ['<10', '10-19', '20+'].includes(S.a.smoking ?? '');

function nextScreen(s: Screen): Screen {
  switch (s) {
    case 'landing': return 'before';
    case 'before': return 'age';
    case 'age': return 'sex';
    case 'sex': return 'gate';
    case 'gate': return S.a.gate === 'yes' ? 'gateNote' : 'activity';
    case 'gateNote': return 'activity';
    case 'activity': return 'stairs';
    case 'stairs': return 'echo';
    case 'echo': return 'strength';
    case 'strength': return 'smoking';
    case 'smoking': return isCurrentSmoker() ? 'diet' : 'hookah';
    case 'hookah': return 'diet';
    case 'diet': return 'processed';
    case 'processed': return 'body';
    case 'body': return 'sleep';
    case 'sleep': return 'alcohol';
    case 'alcohol': return 'social';
    case 'social': return 'pre';
    default: return s;
  }
}

function go(to: Screen, push = true) {
  clearTimers();
  if (push && S.screen !== to) S.history.push(S.screen);
  S.screen = to;
  if (QNUM[to]) track('question_viewed', { id: to, index: QNUM[to]! });
  render(true);
}
function back() {
  const prev = S.history.pop();
  if (!prev) return;
  clearTimers();
  S.screen = prev;
  render(true);
}
function advance() {
  if (S.screen === 'social') compute();
  go(nextScreen(S.screen));
}

function compute() {
  const q = S.a as QuestionnaireAnswers;
  S.ans = toEngineAnswers(q);
  S.res = engine.assess(S.ans, q.age, q.sex, q.gate);
  S.revealAnimated = false;
  S.smokingTalk = null;
  S.selected = null;
  S.chosen = null;
  track('quiz_completed');
}

// ---------------------------------------------------------------- shared pieces
const banner = () => `
  <div class="banner" role="note">
    <details>
      <summary>${icon('sun', 'sm')} ${esc(M.banner)}</summary>
      <p>${esc(M.bannerMore)}</p>
    </details>
  </div>`;

function topbar() {
  const n = QNUM[S.screen];
  const canBack = S.history.length > 0 && !['block', 'landing'].includes(S.screen);
  return `
  <header class="topbar">
    ${canBack ? `<button class="iconbtn" data-act="back" aria-label="${esc(M.back)}">${icon('arrow', 'flip')}</button>` : '<span class="iconbtn-space"></span>'}
    <div class="topbar-mid">
      ${n ? `<div class="progress-label">${M.progress(n, 13).replace(/\d+/g, (d) => bdi(d))}</div>
        <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="13" aria-valuenow="${n}" aria-label="${esc(M.progress(n, 13))}"><span style="inline-size:${(n / 13) * 100}%"></span></div>` : ''}
    </div>
    <span class="iconbtn-space"></span>
  </header>`;
}

const shortDisclaimer = () => `<p class="disclaimer">${esc(M.disclaimerShort)} <button class="link" data-act="how">${esc(M.reveal.how)}</button></p>`;

function optionCards(field: string, opts: Record<string, string>, current: string | undefined, labelledBy: string) {
  return `<div class="options" role="group" aria-labelledby="${labelledBy}">
    ${Object.entries(opts)
      .map(
        ([v, label]) =>
          `<button class="opt" data-pick="${field}" data-val="${esc(v)}" aria-pressed="${current === v}">${esc(label)}<span class="tick">${icon('check', 'sm')}</span></button>`,
      )
      .join('')}
  </div>`;
}

function questionScreen(id: Screen, title: string, help: string | undefined, body: string, ready: boolean, extra = '') {
  return `
  ${topbar()}
  <main class="screen q">
    <h1 id="h-${id}" tabindex="-1">${esc(title)}</h1>
    ${help ? `<p class="help">${esc(help)}</p>` : ''}
    ${extra}
    ${body}
  </main>
  <footer class="cta-bar">
    <button class="btn primary" data-act="next" ${ready ? '' : 'disabled'}>${esc(M.next)}</button>
  </footer>`;
}

// ---------------------------------------------------------------- screens
function landing() {
  track('landing_viewed');
  return `
  ${banner()}
  <main class="screen landing">
    <div class="brand">${icon('sprout', 'lg')}<span>${esc(PILOT.productName)}</span></div>
    <h1 tabindex="-1">${esc(M.landing.h1)}</h1>
    <p class="lead">${esc(M.landing.sub)}</p>
    <div class="sample" aria-hidden="true"><span>${bdi(84)} · ${bdi(90)}</span></div>
    <ul class="chips">${M.landing.chips.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <p class="slogan">${esc(M.landing.slogan)}</p>
  </main>
  <footer class="cta-bar"><button class="btn primary" data-act="start">${esc(M.landing.cta)}</button></footer>`;
}

function before() {
  const B = M.before;
  return `
  ${banner()}
  ${topbar()}
  <main class="screen before">
    <h1 tabindex="-1">${esc(B.h1)}</h1>
    <ul class="bullets">
      <li>${esc(B.operator(PILOT.operator, PILOT.email))}</li>
      <li>${esc(B.local)}</li>
      ${PILOT.analytics.enabled ? `<li>${esc(B.analytics)}</li>` : ''}
      <li>${esc(B.whatsapp)}</li>
      <li>${esc(B.noTransfer)}</li>
      <li>${esc(B.rights(PILOT.deletionDate))}</li>
    </ul>
    <details class="acc" ${S.detailsOpen ? 'open' : ''} data-details>
      <summary>${esc(B.details)}</summary>
      <ul class="bullets small">${B.detailsBody.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </details>

    <section class="card">
      <h2 id="h-why">${esc(B.whyTitle)}</h2>
      <div class="chips selectable" role="group" aria-labelledby="h-why">
        ${Object.entries(B.why).map(([k, v]) => `<button class="chip" data-why="${k}" aria-pressed="${S.why.has(k)}">${esc(v)}</button>`).join('')}
      </div>
      <p class="note">${esc(B.whyNote)}</p>
    </section>

    <section class="card soft">
      <h2>${esc(B.notForTitle)}</h2>
      <ul class="bullets">${B.notFor.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <p>${esc(B.chronic)}</p>
    </section>

    <label class="consent">
      <input type="checkbox" data-consent ${S.consent ? 'checked' : ''} />
      <span>${esc(B.consent)}</span>
    </label>
  </main>
  <footer class="cta-bar"><button class="btn primary" data-act="consent-go" ${S.consent ? '' : 'disabled'}>${esc(B.cta)}</button></footer>`;
}

function ageScreen() {
  const Q = M.q.age;
  return questionScreen(
    'age',
    Q.title,
    Q.help,
    `<div class="field">
      <bdi dir="ltr"><input id="age" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="3"
        aria-labelledby="h-age" aria-describedby="age-err" value="${esc(S.a.ageText ?? '')}" data-input="age" /></bdi>
      <p id="age-err" class="error" role="alert">${S.ageError ? esc(S.ageError) : ''}</p>
    </div>`,
    !!(S.a.ageText && S.a.ageText.trim()),
  );
}

function single(id: Screen, field: keyof QuestionnaireAnswers, q: { title: string; help?: string; opts: Record<string, string> }, extra = '') {
  const cur = S.a[field] as string | undefined;
  return questionScreen(id, q.title, q.help, optionCards(field, q.opts, cur, `h-${id}`), cur != null, extra);
}

function diet() {
  const D = M.q.diet;
  const va = S.a.veg;
  const vb = S.a.whole;
  const opts = (arr: string[]) => Object.fromEntries(arr.map((t, i) => [String(i), t]));
  return questionScreen(
    'diet',
    D.title,
    undefined,
    `<section class="sub"><h2 id="h-diet-a">${esc(D.a)}</h2><p class="help">${esc(D.aHelp)}</p>${optionCards('veg', opts(D.aOpts), va == null ? undefined : String(va), 'h-diet-a')}</section>
     <section class="sub"><h2 id="h-diet-b">${esc(D.b)}</h2>${optionCards('whole', opts(D.bOpts), vb == null ? undefined : String(vb), 'h-diet-b')}</section>`,
    va != null && vb != null,
  );
}

function body() {
  const B = M.q.body;
  const t = S.a.bodyText ?? { h: '', w: '', waist: '' };
  const num = (id: string, label: string, val: string, req = true, desc = '') => `
    <label class="numfield" for="${id}"><span>${esc(label)}</span>
      <bdi dir="ltr"><input id="${id}" type="text" inputmode="decimal" autocomplete="off" maxlength="5" value="${esc(val)}" data-input="${id}" ${req ? 'aria-required="true"' : ''} ${desc ? `aria-describedby="${desc}"` : ''}/></bdi>
    </label>`;
  return questionScreen(
    'body',
    B.title,
    undefined,
    `<div class="numgrid">
      ${num('h', B.height, t.h)}
      ${num('w', B.weight, t.w)}
      ${num('waist', B.waist, t.waist, false, 'waist-help')}
      <p id="waist-help" class="help">${icon('rings', 'sm')} ${esc(B.waistHelp)}</p>
    </div>
    <p class="error" role="alert">${S.bodyError ? esc(S.bodyError) : ''}</p>
    <button class="btn secondary" data-act="body-dk">${esc(B.dk)}</button>`,
    !!(t.h.trim() && t.w.trim()),
  );
}

function sleepScreen() {
  const Q = M.q.sleep;
  const reg = S.a.regular == null ? undefined : S.a.regular ? 'yes' : 'no';
  return questionScreen(
    'sleep',
    Q.title,
    undefined,
    `<p class="hint">${esc(M.almost)}</p>
     <section class="sub"><h2 id="h-sleep-a">${esc(Q.a)}</h2>${optionCards('sleep', Q.aOpts, S.a.sleep, 'h-sleep-a')}</section>
     <section class="sub"><h2 id="h-sleep-b">${esc(Q.b)}</h2>${optionCards('regular', Q.bOpts, reg, 'h-sleep-b')}</section>`,
    S.a.sleep != null && reg != null,
  );
}

function social() {
  const Q = M.q.social;
  return questionScreen(
    'social',
    Q.title,
    undefined,
    `<section class="sub"><h2 id="h-soc-a">${esc(Q.a)}</h2>${optionCards('contact', Q.aOpts, S.a.contact, 'h-soc-a')}</section>
     <section class="sub"><h2 id="h-soc-b">${esc(Q.b)}</h2>${optionCards('lonely', Q.bOpts, S.a.lonely, 'h-soc-b')}</section>`,
    S.a.contact != null && S.a.lonely != null,
  );
}

function echo() {
  const active = ['75-149', '150-299', '300+'].includes(S.a.activity ?? '') || S.a.stairs === 'easy';
  return `
  ${topbar()}
  <main class="screen center">
    <div class="echo-art">${icon('sprout', 'xl')}</div>
    <h1 tabindex="-1" class="echo">${esc(active ? M.echo.active : M.echo.inactive)}</h1>
  </main>
  <footer class="cta-bar"><button class="btn primary" data-act="next">${esc(M.cont)}</button></footer>`;
}

function gateNote() {
  return `
  ${topbar()}
  <main class="screen center">
    <div class="echo-art">${icon('sun', 'xl')}</div>
    <h1 tabindex="-1" class="echo">${esc(M.q.gate.note)}</h1>
  </main>
  <footer class="cta-bar"><button class="btn primary" data-act="next">${esc(M.cont)}</button></footer>`;
}

function block() {
  track('underage_blocked');
  return `
  <main class="screen center">
    <div class="echo-art">${icon('sprout', 'xl')}</div>
    <h1 tabindex="-1">${esc(M.block.title)}</h1>
    <p class="lead">${esc(M.block.body)}</p>
  </main>`;
}

function pre() {
  const r = S.res!;
  const sick = S.why.has('sick');
  if (r.display === 'gain-only') {
    return `
    ${banner()}
    <main class="screen center">
      <div class="echo-art">${icon('sprout', 'xl')}</div>
      <h1 tabindex="-1">${esc(M.pre.stepsReady)}</h1>
    </main>
    <footer class="cta-bar"><button class="btn primary" data-act="pre-show">${esc(M.cont)}</button></footer>`;
  }
  const show = `<button class="btn ${sick ? 'link-btn' : 'primary'}" data-act="pre-show">${esc(M.pre.show)}</button>`;
  const acts = `<button class="btn ${sick ? 'primary' : 'link-btn'}" data-act="pre-actions">${esc(M.pre.actionsFirst)}</button>`;
  return `
  ${banner()}
  <main class="screen center">
    <div class="echo-art">${icon('rings', 'xl')}</div>
    <h1 tabindex="-1">${esc(M.pre.ready)}</h1>
  </main>
  <footer class="cta-bar stack">${sick ? show + acts : acts + show}</footer>`;
}

function leverLine(r: Assessment) {
  const b = r.biggestLever;
  if (!b) return '';
  if (b.kind === 'smoking') return `<p class="lever">${icon('sprout', 'sm')}<span>${esc(M.reveal.leverSmoking)}</span></p>`;
  const name = ACTION_TEXT[b.actionId as CatalogId]?.lever ?? ACTION_TEXT[b.actionId as CatalogId]?.name ?? '';
  return `<p class="lever">${icon('sprout', 'sm')}<span>${M.reveal.lever(esc(name), yearsHtml(b.gainYears))}</span></p>`;
}

function rangeBlock(r: Assessment, anim: boolean) {
  if (S.hideNumber) {
    return `<div class="range hidden-num"><p>${esc(M.reveal.hidden)}</p><button class="btn secondary" data-act="unhide">${esc(M.reveal.showNumber)}</button></div>`;
  }
  const base = Math.round(r.baseline);
  const n = (v: number) => `<bdi dir="ltr" class="num big" data-count="${v}" data-from="${anim ? base : v}">${anim ? base : v}</bdi>`;
  return `
  <div class="range">
    <p class="range-lead">${esc(M.reveal.lead)}</p>
    <p class="range-nums"><span class="fade d1">${esc(M.reveal.avg)}</span> ${M.reveal.between(n(r.low), n(r.high))}</p>
  </div>`;
}

function whatIfBlock(r: Assessment) {
  if (r.display !== 'full' || S.hideNumber) return '';
  const levels = ['0', '1-74', '75-149', '150-299', '300+'] as const;
  const idx = S.whatIf ?? levels.indexOf(S.ans!.act as (typeof levels)[number]);
  const wr = engine.assess({ ...S.ans!, act: levels[idx] }, S.a.age!, S.a.sex!, S.a.gate!);
  const label = M.q.activity.opts[levels[idx]];
  return `
  <details class="acc whatif" ${S.whatIf != null ? 'open' : ''}>
    <summary>${esc(M.reveal.whatIfTitle)}</summary>
    <label class="slider">
      <span class="sr-only">${esc(M.q.activity.title)}</span>
      <input type="range" min="0" max="4" step="1" value="${idx}" data-whatif aria-valuetext="${esc(label)}" />
    </label>
    <p class="whatif-level">${esc(label)}</p>
    <p class="whatif-out" aria-live="polite">${esc(M.reveal.whatIfLead)} ${esc(M.reveal.avg)} ${M.reveal.between(bdi(wr.low), bdi(wr.high))}</p>
  </details>`;
}

function reveal() {
  const r = S.res!;
  const anim = !S.revealAnimated && !reducedMotion();
  const animCls = anim ? 'anim' : 'no-anim';
  if (!S.revealAnimated) {
    track('result_revealed', { display_group: r.display === 'full' ? 'full' : 'limited', range_width: r.high - r.low });
  }
  const unknown = `
    <details class="acc fade d4">
      <summary>${esc(M.reveal.unknownTitle)}</summary>
      <ul class="bullets">${M.reveal.unknown.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <p>${esc(M.reveal.unknownNote)}</p>
    </details>`;
  const trust = `
    <section class="card trust ${S.trust == null ? 'later' : ''}" data-trust-card ${S.revealAnimated || S.trust != null ? '' : 'hidden'}>
      ${S.trust != null ? `<p>${esc(M.reveal.trustThanks)}</p>` : `
      <h2 id="h-trust">${esc(M.reveal.trustQ)}</h2>
      <div class="scale" role="group" aria-labelledby="h-trust">
        ${[1, 2, 3, 4, 5].map((v) => `<button class="scale-btn" data-trust="${v}" aria-label="${v} מתוך 5">${bdi(v)}</button>`).join('')}
      </div>
      <div class="scale-ends"><span>${esc(M.reveal.trustLow)}</span><span>${esc(M.reveal.trustHigh)}</span></div>`}
    </section>`;

  let main: string;
  if (r.display === 'gain-only') {
    const why = S.a.age! >= 75 ? M.reveal.gainOnly75 : M.reveal.gainOnlyGate;
    main = `
      <h1 tabindex="-1">${esc(M.reveal.gainOnlyTitle)}</h1>
      <p>${esc(why)}</p>
      ${leverLine(r)}
      <p class="potential">${M.reveal.potential(yearsHtml(r.potentialGain))}</p>
      ${shortDisclaimer()}
      ${unknown}`;
  } else {
    main = `
      <h1 class="sr-only" tabindex="-1">${esc(M.pre.ready)}</h1>
      <div class="loading fade-out" aria-hidden="true">
        <p>${esc(M.reveal.loading)}</p>
        <ol>${M.reveal.steps.map((s, i) => `<li class="step s${i + 1}">${icon('check', 'sm')} ${esc(s)}</li>`).join('')}</ol>
      </div>
      <div class="result">
        ${rangeBlock(r, anim)}
        ${S.a.age! <= 24 && !S.hideNumber ? `<p class="note fade d2">${esc(M.reveal.young)}</p>` : ''}
        <div class="fade d2">${shortDisclaimer()}</div>
        ${r.display === 'maintenance' ? `<p class="lever fade d3">${esc(M.reveal.maintenance)}</p><p class="note fade d3">${esc(M.reveal.maintenanceNote)}</p>` : `<div class="fade d3">${leverLine(r)}</div>`}
        ${unknown}
        <div class="fade d5">
          ${whatIfBlock(r)}
          <label class="switch"><input type="checkbox" role="switch" data-hide ${S.hideNumber ? 'checked' : ''}/> <span>${esc(M.reveal.hide)}</span></label>
        </div>
      </div>`;
  }
  return `
  ${banner()}
  <main class="screen reveal ${animCls}">
    ${main}
    ${trust}
    <p class="sr-only" aria-live="polite" data-announce></p>
  </main>
  <footer class="cta-bar ${anim ? 'fade d5' : ''}"><button class="btn primary" data-act="to-actions">${esc(M.reveal.cta)}</button></footer>`;
}

function how() {
  const r = S.res!;
  const H = M.how;
  const contrib = engine
    .contributions(S.ans!, S.a.age!, S.a.sex!)
    .filter((c) => c.years >= 0.1)
    .sort((x, y) => y.years - x.years);
  const max = Math.max(...contrib.map((c) => c.years), 1);
  const showNumbers = r.display !== 'gain-only' && !S.hideNumber;
  const grades = Array.from(new Set(cardsFor().map((c) => CATALOG[c.id].grade).filter(Boolean))) as string[];
  const currency = COHORT === 'H' ? 'שעות חיים' : 'שעות של הרגל טוב';
  return `
  ${banner()}
  <header class="topbar"><button class="iconbtn" data-act="back" aria-label="${esc(H.close)}">${icon('arrow', 'flip')}</button><div class="topbar-mid"></div><span class="iconbtn-space"></span></header>
  <main class="screen how">
    <h1 tabindex="-1">${esc(H.title)}</h1>
    ${showNumbers ? `<section><h2>${esc(H.s1t)}</h2><p>${H.s1(bdi(Math.round(r.baseline)))}</p></section>` : ''}
    <section><h2>${esc(H.s2t)}</h2>
      ${contrib.length ? `<ul class="bars">${contrib
        .map((c) => `<li><span class="bar-label">${esc(H.factor[c.factor])}</span><span class="bar"><span style="inline-size:${Math.max(6, (c.years / max) * 100)}%"></span></span><span class="bar-val">${yearsHtml(c.years)}</span></li>`)
        .join('')}</ul><p class="note">${esc(H.s2note)}</p>` : `<p>${esc(H.s2empty)}</p>`}
    </section>
    <section><h2>${esc(H.s3t)}</h2><p>${H.s3(yearsHtml(r.potentialGain))}</p><p>${esc(H.s4)}</p></section>
    ${showNumbers ? `<section><h2>${esc(H.s5t)}</h2><p>${esc(H.s5)}</p></section>` : ''}
    <section><h2>${esc(H.s6t)} "${esc(currency)}"?</h2><p>${esc(H.s6)}</p><p>${esc(H.s7)}</p></section>
    ${grades.length ? `<section><h2>${esc(H.s8t)}</h2><ul class="bullets">${cardsFor()
      .filter((c) => CATALOG[c.id].grade)
      .map((c) => `<li>${esc(ACTION_TEXT[c.id].name)}: ${dots(CATALOG[c.id].grade!)}</li>`)
      .join('')}</ul></section>` : ''}
    <section><h2>${esc(H.s9t)}</h2><p class="small">${esc(H.sources)}</p><p class="small">${esc(H.advisor(PILOT.advisorName))}</p>
      <p class="small">${esc(M.disclaimerFull)}</p><p class="small strong">${esc(H.placeholder)}</p></section>
  </main>
  <footer class="cta-bar"><button class="btn secondary" data-act="back">${esc(H.close)}</button></footer>`;
}

function dots(g: string) {
  const n = g === 'A' ? 3 : g === 'B' ? 2 : 1;
  return `<span class="dots" aria-label="${esc(M.actions.evidence(M.grade[g]))}">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span> <span>${esc(M.grade[g])}</span>`;
}

function cardsFor(): ActionCard[] {
  const r = S.res!;
  return pickActions(r, S.ans!, { age: S.a.age!, gateYes: S.a.gate === 'yes', smokingTalk: !!S.smokingTalk, isCurrentSmoker: isCurrentSmoker() });
}

function actionCard(c: ActionCard, rank: number) {
  const t = ACTION_TEXT[c.id];
  const sel = S.selected === c.id;
  const cat = CATALOG[c.id];
  const lines: string[] = [];
  if (c.hoursPerDay != null) {
    const h = hoursText(c.hoursPerDay);
    lines.push(esc(COHORT === 'H' ? M.actions.perDayH(h) : M.actions.perDayG(h)));
  } else if (c.id === 'smk_quit_date') lines.push(esc(M.actions.smokeDays));
  else lines.push(esc(M.actions.days));
  if (c.gainYears != null) lines.push(M.actions.longTerm(yearsHtml(c.gainYears)));
  const variants = sel
    ? `<fieldset class="variants"><legend>${esc(M.actions.variantTitle)}</legend>
        <label><input type="radio" name="variant" value="f" ${S.variant === 'f' ? 'checked' : ''}/> ${esc(M.actions.variantFull)}</label>
        ${cat.hasEasy && t.easy ? `<label><input type="radio" name="variant" value="e" ${S.variant === 'e' ? 'checked' : ''}/> ${esc(M.actions.variantEasy(t.easy))}</label>` : ''}
        ${cat.hasAccessible && t.accessible ? `<label><input type="radio" name="variant" value="a" ${S.variant === 'a' ? 'checked' : ''}/> ${esc(M.actions.variantAcc(t.accessible))}</label>` : ''}
       </fieldset>
       <button class="btn primary" data-act="choose" data-rank="${rank}">${esc(M.actions.choose)}</button>`
    : '';
  return `
  <li class="action ${sel ? 'selected' : ''}">
    <button class="action-head" data-select="${c.id}" aria-expanded="${sel}">
      <span class="action-ic">${icon(t.icon)}</span>
      <span class="action-body">
        <span class="action-name">${esc(t.name)}</span>
        ${lines.map((l) => `<span class="action-line">${l}</span>`).join('')}
        ${cat.grade ? `<span class="action-line muted">${dots(cat.grade)}</span>` : ''}
        ${c.medicalNote ? `<span class="action-line note">${esc(M.actions.medical)}</span>` : ''}
        ${!sel && cat.hasAccessible && t.accessible && c.id !== 'connect' ? `<span class="action-line muted">${esc(M.actions.accessible(t.accessible))}</span>` : ''}
      </span>
      <span class="tick">${icon('check', 'sm')}</span>
    </button>
    ${variants}
  </li>`;
}

function actions() {
  const r = S.res!;
  if (isCurrentSmoker() && S.smokingTalk == null && r.display !== 'maintenance') {
    return `
    ${banner()}
    ${topbar()}
    <main class="screen center">
      <h1 tabindex="-1">${esc(M.actions.smokingQ)}</h1>
    </main>
    <footer class="cta-bar stack">
      <button class="btn primary" data-act="smk-yes">${esc(M.actions.smokingYes)}</button>
      <button class="btn secondary" data-act="smk-no">${esc(M.actions.smokingNo)}</button>
    </footer>`;
  }
  const cards = cardsFor();
  return `
  ${banner()}
  ${topbar()}
  <main class="screen actions">
    <h1 tabindex="-1">${esc(r.display === 'maintenance' ? M.actions.titleMaint : M.actions.title)}</h1>
    ${r.display === 'gain-only' && S.a.gate === 'yes' ? `<p class="note">${esc(M.reveal.gainOnlyGate)}</p>` : ''}
    <ol class="action-list">${cards.map((c, i) => actionCard(c, i + 1)).join('')}</ol>
    ${shortDisclaimer()}
    ${S.hideNumber && r.display !== 'gain-only' ? `<button class="link" data-act="show-estimate">${esc(M.reveal.showNumber)}</button>` : ''}
  </main>`;
}

function pCode(c: ActionCard) {
  const dg = S.res!.display === 'full' ? 'F' : 'L';
  const h = c.hoursPerDay ?? 0;
  const parts = [ID6, c.id, S.variant, COHORT, String(h), dg];
  if (dg === 'F' && c.gainYears != null) parts.push(gainBucket(c.gainYears));
  return parts.join('-');
}

function plan() {
  const c = S.chosen!;
  const P = M.plan;
  const t = ACTION_TEXT[c.id];
  const actionName = S.variant === 'e' && t.easy ? `${t.name} (${t.easy})` : S.variant === 'a' && t.accessible ? t.accessible : t.name;
  let join = '';
  if (S.slot) {
    const code = pCode(c);
    const lines = [P.joinText(code), P.joinSlot(P.slots[S.slot])];
    if (S.withWho === 'someone') lines.push(P.joinWith);
    if (REF) lines.push(P.joinRef(REF));
    const wa = `https://wa.me/${PILOT.whatsappNumber}?text=${encodeURIComponent(lines.join('\n'))}`;
    const inviteUrl = `${location.origin}${location.pathname}?ref=${ID6}`;
    const inv = `https://wa.me/?text=${encodeURIComponent(P.inviteText(inviteUrl))}`;
    join = `
    <p class="summary">${esc(P.summary(P.slots[S.slot], actionName))}</p>
    <section class="card">
      <h2>${esc(P.joinTitle)}</h2>
      <p>${esc(P.joinBody)}</p>
      <p class="small">${esc(P.codeLabel)} <bdi dir="ltr" class="code">${esc(code)}</bdi></p>
      <a class="btn primary" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" data-track="whatsapp_join_tapped">${esc(P.joinCta)}</a>
    </section>
    <section class="card soft">
      <h2>${esc(P.inviteTitle)}</h2>
      <a class="btn secondary" href="${esc(inv)}" target="_blank" rel="noopener noreferrer" data-track="invite_sent">${esc(P.inviteCta)}</a>
    </section>`;
  }
  return `
  ${banner()}
  ${topbar()}
  <main class="screen plan">
    <h1 id="h-slot" tabindex="-1">${esc(P.title)}</h1>
    <div class="options" role="group" aria-labelledby="h-slot">
      ${Object.entries(P.slots).map(([k, v]) => `<button class="opt" data-slot="${k}" aria-pressed="${S.slot === k}">${esc(v)}<span class="tick">${icon('check', 'sm')}</span></button>`).join('')}
    </div>
    <h2 id="h-with">${esc(P.withTitle)}</h2>
    <div class="chips selectable" role="group" aria-labelledby="h-with">
      ${Object.entries(P.with).map(([k, v]) => `<button class="chip" data-with="${k}" aria-pressed="${S.withWho === k}">${esc(v)}</button>`).join('')}
    </div>
    ${join}
    <p class="row"><button class="link" data-act="change-action">${esc(P.changeAction)}</button></p>
    <p class="row"><button class="link" data-act="restart">${esc(P.restart)}</button> <span class="small muted">${esc(P.restartNote)}</span></p>
  </main>`;
}

// ---------------------------------------------------------------- render
function view(): string {
  switch (S.screen) {
    case 'landing': return landing();
    case 'before': return before();
    case 'age': return ageScreen();
    case 'sex': return single('sex', 'sex', M.q.sex);
    case 'gate': return single('gate', 'gate', M.q.gate);
    case 'gateNote': return gateNote();
    case 'activity': return single('activity', 'activity', M.q.activity);
    case 'stairs': return single('stairs', 'stairs', M.q.stairs);
    case 'echo': return echo();
    case 'strength': return single('strength', 'strength', M.q.strength);
    case 'smoking': return single('smoking', 'smoking', M.q.smoking);
    case 'hookah': return single('hookah', 'hookah', M.q.hookah);
    case 'diet': return diet();
    case 'processed': return single('processed', 'processed', M.q.processed);
    case 'body': return body();
    case 'sleep': return sleepScreen();
    case 'alcohol': return single('alcohol', 'alcohol', M.q.alcohol);
    case 'social': return social();
    case 'block': return block();
    case 'pre': return pre();
    case 'reveal': return reveal();
    case 'how': return how();
    case 'actions': return actions();
    case 'plan': return plan();
  }
}

function render(focus = false) {
  app.innerHTML = view();
  if (focus) {
    window.scrollTo(0, 0);
    (app.querySelector('h1') as HTMLElement | null)?.focus({ preventScroll: true });
  }
  if (S.screen === 'reveal') afterReveal();
}

function afterReveal() {
  const r = S.res!;
  if (S.revealAnimated) return;
  S.revealAnimated = true;
  const animate = !reducedMotion() && r.display !== 'gain-only';
  const leverName = r.biggestLever && r.biggestLever.kind !== 'smoking' ? ACTION_TEXT[r.biggestLever.actionId as CatalogId]?.lever ?? null : null;
  const announce = () => {
    const el = app.querySelector('[data-announce]');
    if (!el) return;
    if (r.display === 'gain-only') el.textContent = `${M.reveal.gainOnlyTitle}. ${M.reveal.potential(yearsText(r.potentialGain))}`;
    else if (!S.hideNumber) el.textContent = M.reveal.announce(r.low, r.high, leverName);
  };
  if (animate) {
    timers.push(window.setTimeout(countUp, 1600));
    timers.push(window.setTimeout(announce, 3400));
  } else announce();
  // trust question after 10 seconds (spec §6.2)
  timers.push(
    window.setTimeout(() => {
      const t = app.querySelector<HTMLElement>('[data-trust-card]');
      if (t) t.hidden = false;
    }, 10000),
  );
}

function countUp() {
  const els = Array.from(app.querySelectorAll<HTMLElement>('[data-count]'));
  const t0 = performance.now();
  const dur = 1000;
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    for (const el of els) {
      const from = Number(el.dataset.from);
      const to = Number(el.dataset.count);
      el.textContent = String(Math.round(from + (to - from) * e));
    }
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- events
const PICK_NUMERIC = new Set(['veg', 'whole']);
let qStart = performance.now();

app.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('button, a, [data-pick]');
  if (!el) return;
  const d = el.dataset;
  if (d.track) track(d.track);

  if (d.pick) {
    const field = d.pick;
    const raw = d.val!;
    const val: unknown = PICK_NUMERIC.has(field) ? Number(raw) : field === 'regular' ? raw === 'yes' : raw;
    (S.a as Record<string, unknown>)[field] = val;
    if (field === 'smoking' && isCurrentSmoker()) delete S.a.hookah;
    if (field === 'gate') track('gate_answered');
    const n = QNUM[S.screen];
    if (n) track('question_answered', { id: field, index: n, ms: Math.round(performance.now() - qStart) });
    render();
    (app.querySelector(`[data-pick="${field}"][data-val="${CSS.escape(raw)}"]`) as HTMLElement | null)?.focus();
    const composite = ['diet', 'sleep', 'social'].includes(S.screen);
    if (!composite && !reducedMotion()) {
      const at = S.screen;
      timers.push(window.setTimeout(() => S.screen === at && advance(), 300));
    }
    return;
  }
  if (d.why) {
    S.why.has(d.why) ? S.why.delete(d.why) : S.why.add(d.why);
    el.setAttribute('aria-pressed', String(S.why.has(d.why)));
    return;
  }
  if (d.slot) {
    S.slot = d.slot;
    track('plan_set', { slot: d.slot, with_someone: S.withWho === 'someone' });
    render();
    (app.querySelector(`[data-slot="${d.slot}"]`) as HTMLElement | null)?.focus();
    return;
  }
  if (d.with) {
    S.withWho = d.with as State['withWho'];
    render();
    (app.querySelector(`[data-with="${d.with}"]`) as HTMLElement | null)?.focus();
    return;
  }
  if (d.select) {
    S.selected = S.selected === d.select ? null : (d.select as CatalogId);
    S.variant = 'f';
    render();
    (app.querySelector(`[data-select="${d.select}"]`) as HTMLElement | null)?.focus();
    return;
  }
  if (d.trust) {
    S.trust = Number(d.trust);
    track('trust_rating', { value: S.trust });
    const card = app.querySelector('[data-trust-card]');
    if (card) card.innerHTML = `<p>${esc(M.reveal.trustThanks)}</p>`;
    return;
  }

  switch (d.act) {
    case 'back': return back();
    case 'start':
      track('quiz_started');
      return go('before');
    case 'consent-go':
      if (!S.consent) return;
      track('consent_given', { version: 'T2-pilot-1' });
      qStart = performance.now();
      return go('age');
    case 'next':
      if (S.screen === 'age') return submitAge();
      if (S.screen === 'body') return submitBody();
      qStart = performance.now();
      return advance();
    case 'body-dk':
      S.a.body = null;
      S.a.bodyText = { h: '', w: '', waist: '' };
      S.bodyError = null;
      return advance();
    case 'pre-show':
      track('pre_reveal_choice', { choice: 'show' });
      S.hideNumber = false;
      return go('reveal');
    case 'pre-actions':
      track('pre_reveal_choice', { choice: 'actions' });
      S.hideNumber = true;
      track('actions_viewed');
      return go('actions');
    case 'unhide':
    case 'show-estimate':
      S.hideNumber = false;
      if (S.screen === 'actions') return go('reveal');
      return render();
    case 'how':
      track('how_calculated_opened');
      return go('how');
    case 'to-actions':
      track('actions_viewed');
      return go('actions');
    case 'smk-yes':
    case 'smk-no':
      S.smokingTalk = d.act === 'smk-yes';
      track('smoking_topic_choice', { choice: S.smokingTalk ? 'yes' : 'no' });
      return render(true);
    case 'choose': {
      const c = cardsFor().find((x) => x.id === S.selected);
      if (!c) return;
      S.chosen = c;
      S.slot = null;
      track('action_selected', { action_id: c.id, rank: Number(d.rank) });
      return go('plan');
    }
    case 'change-action':
      S.selected = null;
      return go('actions');
    case 'restart':
      clearTimers();
      S = fresh();
      return render(true);
  }
});

app.addEventListener('change', (ev) => {
  const t = ev.target as HTMLInputElement;
  if (t.matches('[data-consent]')) {
    S.consent = t.checked;
    const b = app.querySelector<HTMLButtonElement>('[data-act="consent-go"]');
    if (b) b.disabled = !S.consent;
  } else if (t.matches('[data-hide]')) {
    S.hideNumber = t.checked;
    if (t.checked) track('number_hidden');
    render();
    app.querySelector<HTMLElement>('[data-hide]')?.focus();
  } else if (t.name === 'variant') {
    S.variant = t.value as State['variant'];
  }
});

app.addEventListener('input', (ev) => {
  const t = ev.target as HTMLInputElement;
  if (t.matches('[data-whatif]')) {
    if (S.whatIf == null) track('whatif_used');
    S.whatIf = Number(t.value);
    render();
    app.querySelector<HTMLElement>('[data-whatif]')?.focus();
    return;
  }
  const k = t.dataset.input;
  if (!k) return;
  if (k === 'age') S.a.ageText = t.value;
  else {
    const bt = (S.a.bodyText ??= { h: '', w: '', waist: '' });
    (bt as Record<string, string>)[k] = t.value;
  }
  const next = app.querySelector<HTMLButtonElement>('[data-act="next"]');
  if (next) next.disabled = k === 'age' ? !t.value.trim() : !(S.a.bodyText?.h.trim() && S.a.bodyText?.w.trim());
});

app.addEventListener('keydown', (ev) => {
  const t = ev.target as HTMLElement;
  if (ev.key === 'Enter' && t.matches('input[type="text"]')) {
    ev.preventDefault();
    app.querySelector<HTMLButtonElement>('[data-act="next"]')?.click();
  }
});
app.addEventListener('toggle', (ev) => {
  const t = ev.target as HTMLElement;
  if (t.matches('[data-details]')) S.detailsOpen = (t as HTMLDetailsElement).open;
}, true);

const toNum = (s: string | undefined) => Number(String(s ?? '').trim().replace(',', '.'));

function submitAge() {
  const raw = (S.a.ageText ?? '').trim();
  const n = Number(raw);
  if (!/^\d{1,3}$/.test(raw)) {
    S.ageError = M.q.age.invalid;
    return render();
  }
  if (n > 100) {
    S.ageError = M.q.age.tooHigh;
    return render();
  }
  S.ageError = null;
  if (n < 18) {
    // Nothing is kept, and there is no way back to change the age in this session (spec §13).
    S = { ...fresh(), screen: 'block' };
    return render(true);
  }
  S.a.age = n;
  track('question_answered', { id: 'age', index: 1, ms: Math.round(performance.now() - qStart) });
  return advance();
}

function submitBody() {
  const t = S.a.bodyText ?? { h: '', w: '', waist: '' };
  const h = toNum(t.h);
  const w = toNum(t.w);
  const waist = t.waist.trim() ? toNum(t.waist) : undefined;
  const B = M.q.body;
  if (!(h >= 120 && h <= 230)) S.bodyError = B.errHeight;
  else if (!(w >= 30 && w <= 300)) S.bodyError = B.errWeight;
  else if (waist !== undefined && !(waist >= 40 && waist <= 200)) S.bodyError = B.errWaist;
  else S.bodyError = null;
  if (S.bodyError) return render();
  S.a.body = { heightCm: h, weightKg: w, ...(waist ? { waistCm: waist } : {}) };
  return advance();
}

render(true);
