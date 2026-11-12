// ---------------------------------------------------------------------------
// Resort data helpers shared by the directory page and the resort detail page.
// These are plain functions (no React) so they are easy to test and reuse.
// ---------------------------------------------------------------------------
import RESORT_CATALOG, { EAST_COAST_REGIONS, REGION_NAMES } from '../data/resortCatalog';

export function slugify(text) {
    return String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// The ski API has wrapped its list in a few different shapes over time
// (array, { data }, { resorts }, ...). Dig until we find the array.
export function extractResorts(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    for (const key of ['resorts', 'data', 'results', 'result']) {
        const items = extractResorts(payload[key]);
        if (items.length) return items;
    }

    return Object.values(payload).filter((item) => item && typeof item === 'object');
}

// Converts one raw API resort into the shape the UI uses:
// { slug, name, country, region, latitude, longitude }
export function normalizeResort(source) {
    const name = source.name || source.resortName || source.title || source.resort;
    if (typeof name !== 'string' || !name.trim()) return null;

    const slug = source.slug || source.id || slugify(name);
    const country = typeof source.country === 'object' ? source.country?.name : source.country;
    const region = typeof source.region === 'object' ? source.region?.name : source.region;
    const coordinates = source.coordinates || source.location || {};
    let latitude = Number(source.latitude ?? source.lat ?? coordinates.latitude ?? coordinates.lat ?? (Array.isArray(coordinates) ? coordinates[1] : undefined));
    let longitude = Number(source.longitude ?? source.lng ?? source.lon ?? coordinates.longitude ?? coordinates.lng ?? coordinates.lon ?? (Array.isArray(coordinates) ? coordinates[0] : undefined));
    // Some Italian entries in the API have latitude and longitude swapped.
    if (String(country).toUpperCase() === 'IT' && Math.abs(latitude) < 20 && Math.abs(longitude) >= 35 && Math.abs(longitude) <= 55) {
        [latitude, longitude] = [longitude, latitude];
    }

    return {
        slug: String(slug).toLowerCase(),
        name: name.trim(),
        country: typeof country === 'string' ? country : '',
        region: typeof region === 'string' ? region : (source.state || source.province || ''),
        latitude: Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 ? latitude : null,
        longitude: Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? longitude : null
    };
}

// Combines the curated catalog with the live API list.
//   - Catalog resorts always appear, even when the API is down or out of quota.
//   - A live resort that matches a catalog entry (same slug or same name) is
//     merged into it; `liveSlug` remembers which API slug has its conditions.
//   - Live resorts with no catalog entry are added as-is.
// Pass liveResorts = null when the live list could not be loaded at all.
export function mergeResorts(liveResorts) {
    const liveList = liveResorts || [];
    const bySlug = new Map(liveList.map((resort) => [resort.slug, resort]));
    const byName = new Map(liveList.map((resort) => [slugify(resort.name), resort]));
    const matched = new Set();

    const curated = RESORT_CATALOG.map((entry) => {
        const live = bySlug.get(entry.slug) || byName.get(slugify(entry.name));
        if (live) matched.add(live.slug);
        return {
            ...live,
            ...entry,
            curated: true,
            // Without a live list we cannot know, so optimistically try the catalog slug.
            liveSlug: live ? live.slug : (liveResorts ? null : entry.slug)
        };
    });

    const extras = liveList
        .filter((resort) => !matched.has(resort.slug))
        .map((resort) => ({ ...resort, curated: false, liveSlug: resort.slug }));

    return [...curated, ...extras];
}

export function isEastCoast(resort) {
    return resort.country === 'US' && EAST_COAST_REGIONS.includes(resort.region);
}

export function hasCoordinates(resort) {
    return Number.isFinite(resort.latitude) && Number.isFinite(resort.longitude);
}

// "Stowe, Vermont" style label; falls back to whatever region/country exist.
export function formatLocation(resort, separator = ', ') {
    const region = REGION_NAMES[resort.region] || resort.region;
    const country = resort.country === 'US' && REGION_NAMES[resort.region] ? '' : resort.country;
    return [region, country].filter(Boolean).join(separator) || 'Location unavailable';
}

// Straight-line distance in miles (haversine). Used for "nearby resorts" on a
// resort page, where an exact driving distance is not worth an API call.
export function milesBetween(first, second) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const latitudeDelta = radians(second.latitude - first.latitude);
    const longitudeDelta = radians(second.longitude - first.longitude);
    const value = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
        * Math.sin(longitudeDelta / 2) ** 2;
    return 3958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function flattenDetails(value, prefix = '') {
    if (!value || typeof value !== 'object') return [];

    return Object.entries(value).flatMap(([key, item]) => {
        const label = prefix ? `${prefix} / ${key}` : key;
        if (item === null || item === undefined || /^(id|slug|name|resort|href|url|units|location|country|region)$/i.test(key)) return [];
        if (Array.isArray(item)) {
            if (item.every((entry) => ['string', 'number', 'boolean'].includes(typeof entry))) {
                return [{ label, value: item.slice(0, 5).join(', ') }];
            }
            return item.slice(0, 5).flatMap((entry, index) => flattenDetails(entry, `${label} ${index + 1}`));
        }
        if (typeof item === 'object') return flattenDetails(item, label);
        return [{ label, value: String(item) }];
    });
}

// Turns a live conditions response into something the resort page can render:
//   liftStats  { open, hold, scheduled, closed } counts, if provided
//   lifts      [{ name, status }] for individual lifts
//   facts      any other fields, flattened into label/value pairs
//   reportUrl  the resort's own lift and trail report, if the API has one
export function parseConditions(payload) {
    let details = payload;
    for (const key of ['data', 'result', 'resort']) {
        if (details && !Array.isArray(details) && details[key] && typeof details[key] === 'object') {
            details = details[key];
        }
    }
    if (!details || typeof details !== 'object') return { liftStats: null, lifts: [], facts: [], reportUrl: '' };

    const { lifts, ...rest } = details;
    const stats = lifts?.stats;
    const liftStats = stats && ['open', 'hold', 'scheduled', 'closed'].some((key) => Number.isFinite(stats[key]))
        ? { open: stats.open || 0, hold: stats.hold || 0, scheduled: stats.scheduled || 0, closed: stats.closed || 0 }
        : null;
    const liftList = lifts?.status && typeof lifts.status === 'object'
        ? Object.entries(lifts.status).map(([name, status]) => ({ name, status: String(status) }))
        : [];

    return {
        liftStats,
        lifts: liftList,
        facts: flattenDetails(rest).slice(0, 24),
        reportUrl: typeof details.href === 'string' && /^https?:\/\//.test(details.href) ? details.href : ''
    };
}

// ---------------------------------------------------------------------------
// Suggested difficulty and skill-level recommendations
//
// A mountain's suggested level combines two things:
//   - its trail mix (`terrain`: percent green / blue / black trails), from the
//     catalog or looked up by Claude through the backend, when known
//   - its vertical drop, which says how long and sustained the runs are
// With no trail mix the level comes from vertical drop alone. A catalog entry
// can set `difficulty` to one of the level ids below to override both.
// ---------------------------------------------------------------------------
export const SKILL_LEVELS = [
    { id: 'beginner', label: 'Beginner', rank: 1, maxVerticalFt: 1100, summary: 'Short, gentle runs that are good for learning.' },
    { id: 'intermediate', label: 'Intermediate', rank: 2, maxVerticalFt: 1800, summary: 'Mostly cruising blues with some steeper pitches.' },
    { id: 'advanced', label: 'Advanced', rank: 3, maxVerticalFt: 2800, summary: 'Long, sustained runs with plenty of black diamonds.' },
    { id: 'expert', label: 'Expert', rank: 4, maxVerticalFt: Infinity, summary: 'Big vertical, steeps, and glades for strong skiers.' }
];

export function getSkillLevel(id) {
    return SKILL_LEVELS.find((level) => level.id === id) || null;
}

// How much the trail mix counts versus vertical drop when both are known.
const TERRAIN_WEIGHT = 0.6;
// Combined scores below each cutoff map to beginner, intermediate, advanced;
// anything higher is expert.
const SCORE_CUTOFFS = [1.75, 2.4, 3.0];

export function hasTerrain(resort) {
    const terrain = resort.terrain;
    return Boolean(terrain) && ['beginnerPct', 'intermediatePct', 'advancedPct'].every((key) => Number.isFinite(terrain[key]));
}

// Adds looked-up trail mixes ({ [slug]: terrain }) to resorts that lack one.
export function withTerrain(resorts, terrainBySlug) {
    return resorts.map((resort) => (hasTerrain(resort) || !terrainBySlug[resort.slug]
        ? resort
        : { ...resort, terrain: terrainBySlug[resort.slug] }));
}

// Returns { ...level, score, reason } or null when there is not enough data.
export function getDifficulty(resort) {
    const override = getSkillLevel(resort.difficulty);
    if (override) return { ...override, score: override.rank, reason: 'Rated by Ski Find.' };

    const hasVertical = Number.isFinite(resort.verticalFt);
    const verticalRank = hasVertical ? SKILL_LEVELS.find((item) => resort.verticalFt < item.maxVerticalFt).rank : null;
    const vertical = hasVertical ? `${resort.verticalFt.toLocaleString()} ft vertical drop` : '';

    if (!hasTerrain(resort)) {
        if (!hasVertical) return null;
        return { ...SKILL_LEVELS[verticalRank - 1], score: verticalRank, reason: `Estimated from its ${vertical}.` };
    }

    // Blacks weigh extra because double blacks are folded into them.
    const { beginnerPct, intermediatePct, advancedPct } = resort.terrain;
    const terrainScore = (beginnerPct * 1 + intermediatePct * 2 + advancedPct * 3.5) / 100;
    const score = hasVertical ? TERRAIN_WEIGHT * terrainScore + (1 - TERRAIN_WEIGHT) * verticalRank : terrainScore;
    const index = SCORE_CUTOFFS.findIndex((cutoff) => score < cutoff);
    const mix = `${beginnerPct}% green, ${intermediatePct}% blue, and ${advancedPct}% black trails`;

    return {
        ...SKILL_LEVELS[index === -1 ? SKILL_LEVELS.length - 1 : index],
        score,
        reason: `Based on its ${mix}${hasVertical ? `, plus its ${vertical}` : ''}.`
    };
}

// How well a resort suits a skier: 'match', 'easier', or 'harder'.
export function skillFit(difficulty, skillId) {
    const skill = getSkillLevel(skillId);
    if (!difficulty || !skill) return null;
    if (difficulty.rank === skill.rank) return 'match';
    return difficulty.rank < skill.rank ? 'easier' : 'harder';
}

// Resorts rated at the skier's level, closest to `fromResort` first.
// `fromResort` itself is left out. Call withTerrain first so known trail
// mixes are counted.
export function recommendForSkill(resorts, skillId, fromResort, count = 6) {
    if (!getSkillLevel(skillId)) return [];

    return resorts
        .filter((resort) => resort.slug !== fromResort?.slug && getDifficulty(resort)?.id === skillId)
        .map((resort) => ({
            ...resort,
            miles: fromResort && hasCoordinates(fromResort) && hasCoordinates(resort) ? milesBetween(fromResort, resort) : null
        }))
        .sort((first, second) => (first.miles ?? Infinity) - (second.miles ?? Infinity))
        .slice(0, count);
}

// ---------------------------------------------------------------------------
// Current conditions (researched by Claude through the backend)
//
// Each sort reads one number from a resort's conditions report. Resorts
// without that number go last, so a missing report never ranks first.
// Webcams are links, not numbers, so they have no sort.
// ---------------------------------------------------------------------------
export const CONDITION_SORTS = [
    { id: 'newSnow', label: 'Most new snow', value: (report) => report.newSnowIn, descending: true },
    { id: 'baseDepth', label: 'Deepest base', value: (report) => report.baseDepthIn, descending: true },
    { id: 'liftsOpen', label: 'Most lifts open', value: (report) => report.liftsOpen, descending: true },
    { id: 'trailsOpen', label: 'Most trails open', value: (report) => report.trailsOpen, descending: true },
    { id: 'ticket', label: 'Cheapest lift ticket', value: (report) => report.adultTicketUsd, descending: false },
    { id: 'warmest', label: 'Warmest', value: (report) => report.tempF, descending: true },
    { id: 'coldest', label: 'Coldest', value: (report) => report.tempF, descending: false }
];

// Sorts resorts by one of CONDITION_SORTS, falling back to name order for
// ties and for resorts with no value. Unknown sort ids sort by name.
export function sortByConditions(resorts, sortId, conditionsBySlug) {
    const sort = CONDITION_SORTS.find((option) => option.id === sortId);
    const valueOf = (resort) => {
        const report = conditionsBySlug[resort.slug];
        const value = sort && report?.found ? sort.value(report) : null;
        return Number.isFinite(value) ? value : null;
    };

    return [...resorts].sort((first, second) => {
        const [a, b] = [valueOf(first), valueOf(second)];
        if (a !== b) {
            if (a === null) return 1;
            if (b === null) return -1;
            return sort.descending ? b - a : a - b;
        }
        return first.name.localeCompare(second.name);
    });
}

// "12 / 21", "12 open", or '' when the report has neither number.
export function formatOpenCount(open, total) {
    if (Number.isFinite(open) && Number.isFinite(total)) return `${open} / ${total}`;
    if (Number.isFinite(open)) return `${open} open`;
    return '';
}

// "just now", "3 hours ago", "2 days ago".
export function timeAgo(isoDate, now = Date.now()) {
    const minutes = Math.max(0, Math.round((now - new Date(isoDate).getTime()) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Display strings for a found conditions report; '' for anything not reported.
export function formatConditions(report) {
    const number = (value, format) => (Number.isFinite(value) ? format(value) : '');
    return {
        temp: number(report.tempF, (value) => `${Math.round(value)}°F`),
        newSnow: number(report.newSnowIn, (value) => `${value}"`),
        baseDepth: number(report.baseDepthIn, (value) => `${value}"`),
        lifts: formatOpenCount(report.liftsOpen, report.liftsTotal),
        trails: formatOpenCount(report.trailsOpen, report.trailsTotal),
        ticket: number(report.adultTicketUsd, (value) => `$${Math.round(value)}`)
    };
}
