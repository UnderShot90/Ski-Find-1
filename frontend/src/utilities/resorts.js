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
