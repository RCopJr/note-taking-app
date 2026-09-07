const ESV_API_URL = 'https://api.esv.org/v3/passage/text/';
const CACHE_TTL_MS = 60 * 60 * 1_000;
const MAX_CACHED_VERSES = 500;

export interface BiblePassage {
  reference: string;
  canonical: string;
  version: 'ESV';
  text: string;
}

interface EsvPassageResponse {
  canonical?: string;
  passages?: string[];
}

interface CacheEntry {
  passage: BiblePassage;
  verseCount: number;
  expiresAt: number;
}

export class BiblePassageError extends Error {
  readonly status: 400 | 502 | 503;

  constructor(message: string, status: 400 | 502 | 503) {
    super(message);
    this.status = status;
  }
}

const passageCache = new Map<string, CacheEntry>();
let cachedVerseCount = 0;

export function getBibleStatus() {
  return {
    configured: Boolean(process.env.ESV_API_KEY?.trim()),
    supportedVersions: ['ESV'] as const,
  };
}

function pruneExpiredEntries(now: number): void {
  for (const [key, entry] of passageCache) {
    if (entry.expiresAt > now) continue;
    passageCache.delete(key);
    cachedVerseCount -= entry.verseCount;
  }
}

function readFromCache(key: string, now: number): BiblePassage | null {
  pruneExpiredEntries(now);
  const entry = passageCache.get(key);
  if (!entry) return null;

  // Refresh insertion order so eviction removes the least recently used entry.
  passageCache.delete(key);
  passageCache.set(key, entry);
  return entry.passage;
}

function cachePassage(key: string, passage: BiblePassage, now: number): void {
  const verseCount = passage.text.match(/\[\d+\]/g)?.length ?? 0;
  if (verseCount < 1 || verseCount > MAX_CACHED_VERSES) return;

  const existing = passageCache.get(key);
  if (existing) {
    passageCache.delete(key);
    cachedVerseCount -= existing.verseCount;
  }

  while (cachedVerseCount + verseCount > MAX_CACHED_VERSES) {
    const oldest = passageCache.entries().next().value as [string, CacheEntry] | undefined;
    if (!oldest) break;
    passageCache.delete(oldest[0]);
    cachedVerseCount -= oldest[1].verseCount;
  }

  passageCache.set(key, {
    passage,
    verseCount,
    expiresAt: now + CACHE_TTL_MS,
  });
  cachedVerseCount += verseCount;
}

export async function fetchBiblePassage(
  rawReference: string | undefined,
  rawVersion: string | undefined,
): Promise<BiblePassage> {
  const reference = rawReference?.trim() ?? '';
  const version = (rawVersion?.trim() || 'ESV').toUpperCase();

  if (!reference) {
    throw new BiblePassageError('A Bible passage reference is required.', 400);
  }
  if (reference.length > 200 || reference.includes(';')) {
    throw new BiblePassageError('Use one Bible passage reference at a time.', 400);
  }
  if (version !== 'ESV') {
    throw new BiblePassageError(`Bible version “${version}” is not supported yet.`, 400);
  }

  const apiKey = process.env.ESV_API_KEY?.trim();
  if (!apiKey) {
    throw new BiblePassageError(
      'ESV_API_KEY is not configured. Add it to the server environment and restart the app.',
      503,
    );
  }

  const cacheKey = `${version}:${reference.toLowerCase()}`;
  const now = Date.now();
  const cached = readFromCache(cacheKey, now);
  if (cached) return cached;

  const params = new URLSearchParams({
    q: reference,
    'include-passage-references': 'false',
    'include-verse-numbers': 'true',
    'include-first-verse-numbers': 'true',
    'include-footnotes': 'false',
    'include-footnote-body': 'false',
    'include-headings': 'false',
    'include-short-copyright': 'false',
    'indent-paragraphs': '0',
    'line-length': '0',
  });

  let response: Response;
  try {
    response = await fetch(`${ESV_API_URL}?${params}`, {
      headers: { Authorization: `Token ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new BiblePassageError('The ESV service could not be reached.', 502);
  }

  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'The ESV API rejected ESV_API_KEY.'
      : `The ESV service returned HTTP ${response.status}.`;
    throw new BiblePassageError(message, 502);
  }

  let data: EsvPassageResponse;
  try {
    data = await response.json() as EsvPassageResponse;
  } catch {
    throw new BiblePassageError('The ESV service returned an invalid response.', 502);
  }

  const canonical = data.canonical?.trim();
  const text = data.passages?.join('\n\n').trim();
  if (!canonical || !text) {
    throw new BiblePassageError(`The ESV service could not resolve “${reference}”.`, 400);
  }

  const passage: BiblePassage = {
    reference,
    canonical,
    version: 'ESV',
    text,
  };
  cachePassage(cacheKey, passage, now);
  return passage;
}
