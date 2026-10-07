// Vocabulary: picks the words the speech recogniser is most likely to get wrong
// (acronyms, technical terms, long words) from a question and its reference answer.
// The recogniser can be told to expect them. No page code here, so it is easy to test.

// Everyday words that never need help.
const COMMON = new Set((
  'about above after again all also always and any are because been before being between both but can could did does doing done down during each ' +
  'even every first for from further get give given goes going good great had has have having her here him his how however into its just keep know ' +
  'like made make many may might more most much must need never next not now off often once only other our out over own part people really right ' +
  'same should show since some such take than that their them then there these they thing things think this those through time too under until upon ' +
  'use used using very want was way well were what when where whether which while who whom why will with within without would you your ' +
  'team teams work working works role help helps ensure ensuring across around process processes approach approaches example examples important ' +
  'different together create created based provide provided clear clearly understand understanding become become make making makes'
).split(/\s+/));

// Returns [{ term, boost }]: the strongest candidates first, at most `limit`.
export function keyTerms(text, limit = 60) {
  const found = new Map(); // lowercase term -> { term, boost, count }
  for (const raw of String(text || '').match(/[A-Za-z0-9][A-Za-z0-9+#'-]*/g) || []) {
    const term = raw.replace(/['-]+$/, '');
    const lower = term.toLowerCase();
    if (/^\d+$/.test(term) || COMMON.has(lower)) continue;

    let boost = 0;
    if (/^[A-Z][A-Z0-9]{1,5}s?$/.test(term)) boost = 6; //         API, SLA, OKR, OKRs
    else if (/^[a-z]+[A-Z]|[A-Z][a-z]+[A-Z]/.test(term)) boost = 5; // CamelCase, iOS
    else if (term.includes('-') && term.length >= 6) boost = 4; //   cross-functional
    else if (term.length >= 7) boost = 3; //                         stakeholder, retrospective
    else continue; // short ordinary words are not worth listing

    const seen = found.get(lower);
    if (seen) seen.count++;
    else found.set(lower, { term, boost, count: 1 });
  }
  return [...found.values()]
    .sort((a, b) => b.boost - a.boost || b.count - a.count)
    .slice(0, limit)
    .map(({ term, boost }) => ({ term, boost }));
}
