// Funnel analytics with an allowlist (spec §8.5, Appendix D). Never sends answers, exact age, results,
// free text, "what brought you", the gate answer or `display` – only the events and properties below.
// Off by default (config.ts). When on, events go to PostHog EU over plain fetch, no cookies, no SDK.
import { PILOT } from './config';

const ALLOWED: Record<string, string[]> = {
  landing_viewed: [],
  quiz_started: [],
  underage_blocked: [],
  consent_given: ['version'],
  question_viewed: ['id', 'index'],
  question_answered: ['id', 'index', 'ms'],
  gate_answered: [],
  quiz_completed: [],
  pre_reveal_choice: ['choice'],
  result_revealed: ['display_group', 'range_width'],
  number_hidden: [],
  whatif_used: [],
  how_calculated_opened: [],
  trust_rating: ['value'],
  actions_viewed: [],
  smoking_topic_choice: ['choice'],
  action_selected: ['action_id', 'rank'],
  plan_set: ['slot', 'with_someone'],
  whatsapp_join_tapped: [],
  invite_sent: [],
};

const sessionId = Math.random().toString(36).slice(2, 12);

export function track(event: string, props: Record<string, string | number | boolean> = {}) {
  const allowed = ALLOWED[event];
  if (!allowed) throw new Error(`track(): event "${event}" is not in the allowlist`);
  const clean: Record<string, string | number | boolean> = {};
  for (const k of Object.keys(props)) {
    if (!allowed.includes(k)) throw new Error(`track(): property "${k}" is not allowed on "${event}"`);
    clean[k] = props[k];
  }
  if (!PILOT.analytics.enabled || !PILOT.analytics.posthogKey) return;
  const body = JSON.stringify({
    api_key: PILOT.analytics.posthogKey,
    event,
    distinct_id: sessionId,
    properties: { ...clean, $process_person_profile: false, app: 'pilot', engine_version: '4.1.0' },
  });
  try {
    void fetch(`${PILOT.analytics.host}/capture/`, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    /* analytics must never break the page */
  }
}
