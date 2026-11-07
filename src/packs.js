// Curated question packs, and the link from Study Hub (pilot). Pure: no page, no storage, so it can be tested on its own.
//
// A pack is a small set of questions that ships with InterviewPal, identified by a STABLE KEY (not its display
// name, which can change). When a pack is added to the library it becomes a normal set that remembers the key
// (`packKey`), so renaming the set or editing its questions never breaks the link.
//
// The link looks like  <InterviewPal address>/?pack=system-design-week-1&plan=<Study Hub plan ID>
//   pack  which pack to open setup with (must be one of the keys below)
//   plan  the Study Hub plan to go back to (must look like a UUID; used only to build the "Back to study plan"
//         address from the configured Study Hub origin: a web address is never taken from the link)
import { normalize } from './sets.js';

// Where "Back to study plan" goes. Only these two origins are ever used (trusted configuration, never taken from a link):
//   local   Study Hub's Vite dev server
//   hosted  Study Hub's deployed front end
// Which one is chosen depends on where THIS page is running (see studyHubOrigin): a local InterviewPal goes back to local
// Study Hub, a hosted InterviewPal to hosted Study Hub. Change a value here when Study Hub is somewhere else.
export const STUDY_HUB_ORIGINS = {
  local: 'http://localhost:5173',
  hosted: 'https://study-hub.mehul-patankar.workers.dev',
};
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];
export function studyHubOrigin(hostname = typeof location === 'undefined' ? 'localhost' : location.hostname) {
  return LOCAL_HOSTS.includes(hostname) ? STUDY_HUB_ORIGINS.local : STUDY_HUB_ORIGINS.hosted;
}

const q = (question, answer, topic, level) => ({ question, answer, topic, level });

export const PACKS = {
  'system-design-week-1': {
    key: 'system-design-week-1',
    name: 'System Design — Week 1',
    questions: [
      q('Explain consistent hashing and why distributed systems use it.',
        'Consistent hashing places both nodes and keys on a circular hash space, and each key belongs to the first node clockwise from it. When a node joins or leaves, only the keys in the neighbouring range move, roughly 1/N of them, instead of almost everything as with hash(key) mod N. Caches, sharded databases and load balancers use it so the cluster can grow or shrink without a mass reshuffle.',
        'Consistent hashing', 'easy'),
      q('Why do consistent hashing implementations use virtual nodes?',
        'With one point per server, the ring splits unevenly and one server can take a much larger share of keys, and when a server dies all of its load lands on a single neighbour. Giving each server many virtual points spreads its keys around the ring, so load evens out and a failure is shared across many nodes. The trade-off is a bigger ring to store and update, and more metadata to keep consistent.',
        'Consistent hashing', 'hard'),
      q('Your cache cluster uses hash(key) mod N and has 10 nodes. You add an 11th and the database is flooded with misses. What happened, and how do you fix it?',
        'Changing N changes the result of the modulo for most keys, so about 90 percent of keys suddenly map to a different node and miss the cache. The fix is consistent hashing, where adding a node only moves the keys that fall in its new range, roughly 1/11 of them. You can also warm the new node gradually and let the database be protected by request coalescing or rate limits during the change.',
        'Consistent hashing', 'hard'),
      q('State the CAP theorem and what partition tolerance means.',
        'When a network partition separates nodes of a distributed data store, it can stay consistent, meaning every read sees the latest write, or stay available, meaning every request gets a response, but not both. Partition tolerance means the system keeps working despite messages being lost or delayed between nodes. Because partitions cannot be ruled out in real networks, the practical choice is between consistency and availability while a partition lasts.',
        'CAP theorem', 'easy'),
      q('A shopping service runs in two regions and the link between them goes down. Would you choose consistency or availability for the cart, and for payments?',
        'For the cart I would favour availability: let shoppers keep adding items in each region and merge the carts afterwards, because a stale or briefly diverged cart is a small cost and a refused request loses a sale. For payments I would favour consistency: reject or delay the charge rather than risk charging twice or overspending, because correctness matters more than answering immediately. Different parts of one product can make different choices.',
        'CAP theorem', 'hard'),
      q('Compare a CP and an AP system, and how you would decide between them for a new service.',
        'A CP system refuses or delays some requests during a partition to keep data correct, which suits money, inventory and anything that must not conflict. An AP system keeps answering and reconciles later, using ideas such as last-write-wins, vector clocks or CRDTs, which suits feeds, carts and caches where temporary staleness is acceptable. I would decide by asking what a wrong answer costs compared with no answer, and remember that outside a partition the real trade-off is latency against consistency.',
        'CAP theorem', 'hard'),
    ],
  },
};

export const PACK_KEYS = Object.keys(PACKS);

// A pack key is valid only if it is exactly one we ship (no matching by prefix, no inherited object keys).
export const isValidPackKey = (key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(PACKS, key);
export const getPack = (key) => (isValidPackKey(key) ? PACKS[key] : null);

// A Study Hub plan ID is a UUID. Anything else is not used.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isValidPlanId = (id) => typeof id === 'string' && UUID.test(id);

// Where "Back to study plan" goes. Built from the trusted origin for this environment and a validated plan ID: nothing else.
export function studyHubPlanUrl(planId, origin = studyHubOrigin()) {
  return isValidPlanId(planId) ? `${origin}/plans/${planId.toLowerCase()}` : null;
}

// Read a link's query string. Returns:
//   { status: 'none' }                                   no pack in the link (ordinary standalone visit)
//   { status: 'unknown-pack', packKey }                  a pack key we do not have
//   { status: 'ok', pack, planId }                       planId is a valid lower-case UUID, or '' if missing or invalid
//   (and `planProblem: true` when a plan value was given but is not a valid UUID)
export function parseLink(search) {
  let params;
  try { params = new URLSearchParams(search); } catch { return { status: 'none' }; }
  if (!params.has('pack')) return { status: 'none' };
  const packKey = params.get('pack') || '';
  const pack = getPack(packKey);
  if (!pack) return { status: 'unknown-pack', packKey: packKey.slice(0, 60) };
  const rawPlan = params.get('plan');
  const valid = isValidPlanId(rawPlan);
  return { status: 'ok', pack, planId: valid ? rawPlan.toLowerCase() : '', planProblem: Boolean(rawPlan) && !valid };
}

// Which of the user's sets is this pack? By its key first (survives renaming); otherwise a set that has the
// pack's name and no key yet (made by hand or by an import) so it is not duplicated. Returns the set or undefined.
export function findPackSet(sets, pack) {
  return sets.find((s) => s.packKey === pack.key) || sets.find((s) => !s.packKey && normalize(s.name) === normalize(pack.name));
}
