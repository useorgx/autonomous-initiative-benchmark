import { digest } from './evidence-integrity.mjs';
const CATEGORIES = new Set(['briefing','monitoring','question','approval','review','repair','rebriefing','recovery']);
// Count measured human effort once even when agent sessions overlap.
export function measureHumanAttention({sessions, expectedSessions}) {
  if (!Array.isArray(sessions) || !sessions.length || !Array.isArray(expectedSessions) || !expectedSessions.length) throw new Error('Real, preregistered human sessions required');
  const wanted = new Set(expectedSessions), seen = new Set(), operators = new Map();
  for (const s of sessions) {
    if (!wanted.has(s.session_id) || seen.has(s.session_id)) throw new Error('Unexpected or duplicate session');
    seen.add(s.session_id);
    if (s.source !== 'timed_human' || !s.consent_record_id || !s.operator_id || !Array.isArray(s.intervals)) throw new Error('Timed human provenance/consent required');
    if (!['completed','abandoned'].includes(s.status)) throw new Error('Nonterminal session');
    for (const x of s.intervals) {
      if (!CATEGORIES.has(x.category) || !['startup','steady_state'].includes(x.phase)) throw new Error('Invalid operational interval category');
      if (!Number.isFinite(x.start_ms) || !Number.isFinite(x.end_ms) || x.start_ms < 0 || x.end_ms <= x.start_ms) throw new Error('Invalid measured interval');
      const rows = operators.get(s.operator_id) ?? []; rows.push(x); operators.set(s.operator_id,rows);
    }
  }
  if (seen.size !== wanted.size) throw new Error('Missing planned human sessions; attrition must be recorded');
  const union = rows => {
    const ranges=rows.map(x=>[x.start_ms,x.end_ms]).sort((a,b)=>a[0]-b[0]); let total=0,start=null,end=null;
    for(const [a,b] of ranges) { if(start===null){start=a;end=b;}else if(a<=end)end=Math.max(end,b);else{total+=end-start;start=a;end=b;} }
    return total+(start===null?0:end-start);
  };
  const rows=[...operators].map(([operator_id,intervals])=>({operator_id,active_minutes:union(intervals)/60000,startup_minutes:union(intervals.filter(x=>x.phase==='startup'))/60000,steady_state_minutes:union(intervals.filter(x=>x.phase==='steady_state'))/60000}));
  return {schema:'orgx.human-attention/v1',source:'timed_human',sessions:sessions.length,abandoned:sessions.filter(s=>s.status==='abandoned').length,active_minutes:rows.reduce((s,r)=>s+r.active_minutes,0),operators:rows,raw_digest:digest(sessions),note:'Phase subtotals may overlap; overall active_minutes is the nonduplicated measure. Offline research grading must be reported separately.'};
}
