import RESORT_CATALOG from '../data/resortCatalog';
import { formatLocation, isEastCoast, mergeResorts, normalizeResort, parseConditions } from './resorts';

describe('mergeResorts', () => {
    test('keeps every catalog resort when the live list is unavailable', () => {
        const resorts = mergeResorts(null);

        expect(resorts).toHaveLength(RESORT_CATALOG.length);
        // Without a live list the page should still try the catalog slug for conditions.
        expect(resorts.find((resort) => resort.slug === 'killington').liveSlug).toBe('killington');
    });

    test('links catalog entries to live resorts by slug or by name', () => {
        const resorts = mergeResorts([
            { slug: 'killington', name: 'Killington', region: 'VT', country: 'US', latitude: 1, longitude: 2 },
            { slug: 'stowe-mountain-resort', name: 'Stowe', region: 'VT', country: 'US', latitude: 1, longitude: 2 },
            { slug: 'alta', name: 'Alta', region: 'UT', country: 'US', latitude: 40.5, longitude: -111.6 }
        ]);

        const killington = resorts.find((resort) => resort.slug === 'killington');
        expect(killington.website).toBe('https://www.killington.com');
        // Catalog coordinates win over the live ones.
        expect(killington.latitude).toBeCloseTo(43.62);

        expect(resorts.find((resort) => resort.slug === 'stowe').liveSlug).toBe('stowe-mountain-resort');
        expect(resorts.some((resort) => resort.slug === 'stowe-mountain-resort')).toBe(false);

        // Non-catalog resorts are still included, and catalog resorts missing
        // from a loaded live list are marked as having no live data.
        expect(resorts.find((resort) => resort.slug === 'alta').curated).toBe(false);
        expect(resorts.find((resort) => resort.slug === 'sugarloaf').liveSlug).toBeNull();
    });
});

test('catalog slugs are unique and every entry is on the East Coast', () => {
    const slugs = RESORT_CATALOG.map((resort) => resort.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    RESORT_CATALOG.forEach((resort) => {
        expect(isEastCoast(resort)).toBe(true);
        expect(resort.website).toMatch(/^https:\/\//);
    });
});

test('normalizeResort reads the API location object', () => {
    expect(normalizeResort({ slug: 'jay-peak', name: 'Jay Peak', country: 'US', region: 'VT', location: { latitude: 44.9, longitude: -72.5 } }))
        .toEqual({ slug: 'jay-peak', name: 'Jay Peak', country: 'US', region: 'VT', latitude: 44.9, longitude: -72.5 });
});

test('formatLocation spells out East Coast states', () => {
    expect(formatLocation({ region: 'VT', country: 'US' })).toBe('Vermont');
    expect(formatLocation({ region: 'BC', country: 'CA' })).toBe('BC, CA');
});

test('parseConditions extracts lift counts, lifts, and the report link', () => {
    const conditions = parseConditions({
        data: {
            slug: 'killington',
            href: 'https://www.killington.com/report',
            lifts: {
                status: { 'K-1 Gondola': 'open', 'Superstar': 'closed' },
                stats: { open: 1, hold: 0, scheduled: 0, closed: 1 }
            }
        }
    });

    expect(conditions.liftStats).toEqual({ open: 1, hold: 0, scheduled: 0, closed: 1 });
    expect(conditions.lifts).toEqual([{ name: 'K-1 Gondola', status: 'open' }, { name: 'Superstar', status: 'closed' }]);
    expect(conditions.reportUrl).toBe('https://www.killington.com/report');
    expect(conditions.facts).toEqual([]);
});
