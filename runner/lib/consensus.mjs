// Self-consistency consensus for the best-of-N null arm.
//
// best-of-N must NOT peek at the deterministic validator (that would be the
// oracle leaking into the agent). So selection is by majority vote over N
// independent submissions — classic self-consistency. This isolates "spend more
// compute by sampling + voting" from "spend compute on an orchestration policy".

// Stable stringify so {a:1,b:2} and {b:2,a:1} hash equal.
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

// submissions: array of submission objects (one per independent run).
// Returns the modal submission, its vote count, and the agreement ratio.
export function majorityVote(submissions) {
  const present = submissions.filter((s) => s != null);
  if (!present.length) return { submission: null, votes: 0, n: submissions.length, agreement: 0 };

  const buckets = new Map();
  for (const s of present) {
    const key = canonicalize(s);
    const b = buckets.get(key) ?? { key, submission: s, votes: 0 };
    b.votes += 1;
    buckets.set(key, b);
  }
  // Highest votes wins; ties broken by first-seen order (stable).
  let best = null;
  for (const s of present) {
    const b = buckets.get(canonicalize(s));
    if (!best || b.votes > best.votes) best = b;
  }
  return {
    submission: best.submission,
    votes: best.votes,
    n: submissions.length,
    agreement: Number((best.votes / present.length).toFixed(4)),
  };
}
