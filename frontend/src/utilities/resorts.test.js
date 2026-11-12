import RESORT_CATALOG from '../data/resortCatalog';
import { formatLocation, formatOpenCount, getDifficulty, isEastCoast, mergeResorts, normalizeResort, parseConditions, recommendForSkill, skillFit, sortByConditions, timeAgo, withTerrain } from './resorts';

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

describe('difficulty and skill recommendations', () => {
    test('getDifficulty rates resorts by vertical drop', () => {
        expect(getDifficulty({ verticalFt: 740 }).id).toBe('beginner');
        expect(getDifficulty({ verticalFt: 1500 }).id).toBe('intermediate');
        expect(getDifficulty({ verticalFt: 2360 }).id).toBe('advanced');
        expect(getDifficulty({ verticalFt: 3050 }).id).toBe('expert');
        expect(getDifficulty({ verticalFt: null })).toBeNull();
        expect(getDifficulty({ verticalFt: 500, difficulty: 'expert' }).id).toBe('expert');
    });

    test('getDifficulty weighs the trail mix with vertical drop', () => {
        const mostlyGreen = { beginnerPct: 50, intermediatePct: 35, advancedPct: 15 };
        const mostlyBlack = { beginnerPct: 15, intermediatePct: 30, advancedPct: 55 };

        // Same 2,100 ft vertical (advanced on its own), very different trails.
        expect(getDifficulty({ verticalFt: 2100, terrain: mostlyGreen }).id).toBe('intermediate');
        expect(getDifficulty({ verticalFt: 2100, terrain: mostlyBlack }).id).toBe('advanced');
        expect(getDifficulty({ verticalFt: 3050, terrain: mostlyBlack }).id).toBe('expert');
        // Trail mix alone is enough when vertical is unknown.
        expect(getDifficulty({ terrain: mostlyGreen }).id).toBe('beginner');
        expect(getDifficulty({ verticalFt: 2100, terrain: mostlyGreen }).reason).toMatch(/50% green/);
    });

    test('withTerrain fills in looked-up trail mixes without replacing catalog ones', () => {
        const catalogMix = { beginnerPct: 20, intermediatePct: 40, advancedPct: 40 };
        const lookedUp = { beginnerPct: 30, intermediatePct: 40, advancedPct: 30 };
        const [withCatalog, withLookup, without] = withTerrain(
            [{ slug: 'a', terrain: catalogMix }, { slug: 'b' }, { slug: 'c' }],
            { a: lookedUp, b: lookedUp }
        );

        expect(withCatalog.terrain).toBe(catalogMix);
        expect(withLookup.terrain).toBe(lookedUp);
        expect(without.terrain).toBeUndefined();
    });

    test('every catalog resort gets a suggested level', () => {
        RESORT_CATALOG.forEach((resort) => expect(getDifficulty(resort)).not.toBeNull());
    });

    test('skillFit compares the resort to the skier', () => {
        const advanced = getDifficulty({ verticalFt: 2360 });
        expect(skillFit(advanced, 'advanced')).toBe('match');
        expect(skillFit(advanced, 'expert')).toBe('easier');
        expect(skillFit(advanced, 'beginner')).toBe('harder');
        expect(skillFit(advanced, '')).toBeNull();
    });

    test('recommendForSkill returns matching resorts, closest first', () => {
        const from = { slug: 'home', latitude: 44, longitude: -72, verticalFt: 3000 };
        const resorts = [
            from,
            { slug: 'far', latitude: 40, longitude: -75, verticalFt: 800 },
            { slug: 'near', latitude: 44.1, longitude: -72.1, verticalFt: 900 },
            { slug: 'hard', latitude: 44, longitude: -72.2, verticalFt: 3000 }
        ];

        expect(recommendForSkill(resorts, 'beginner', from).map((resort) => resort.slug)).toEqual(['near', 'far']);
        expect(recommendForSkill(resorts, 'expert', from).map((resort) => resort.slug)).toEqual(['hard']);
        expect(recommendForSkill(resorts, 'unknown', from)).toEqual([]);
    });
});

describe('conditions sorting', () => {
    const resorts = [{ slug: 'a', name: 'Alpha' }, { slug: 'b', name: 'Bravo' }, { slug: 'c', name: 'Charlie' }, { slug: 'd', name: 'Delta' }];
    const conditions = {
        a: { found: true, newSnowIn: 2, adultTicketUsd: 120, tempF: 10 },
        b: { found: true, newSnowIn: 8, adultTicketUsd: null, tempF: 25 },
        c: { found: false },
        d: { found: true, newSnowIn: 8, adultTicketUsd: 89, tempF: 10 }
    };
    const order = (sortId) => sortByConditions(resorts, sortId, conditions).map((resort) => resort.slug);

    test('sorts high-to-low with ties by name and missing values last', () => {
        expect(order('newSnow')).toEqual(['b', 'd', 'a', 'c']);
    });

    test('sorts cheapest ticket first and leaves unknown prices last', () => {
        expect(order('ticket')).toEqual(['d', 'a', 'b', 'c']);
    });

    test('sorts by temperature in both directions', () => {
        expect(order('warmest')).toEqual(['b', 'a', 'd', 'c']);
        expect(order('coldest')).toEqual(['a', 'd', 'b', 'c']);
    });

    test('falls back to name order for an unknown sort', () => {
        expect(order('name')).toEqual(['a', 'b', 'c', 'd']);
    });

    test('formats open counts and report ages', () => {
        expect(formatOpenCount(12, 21)).toBe('12 / 21');
        expect(formatOpenCount(12, null)).toBe('12 open');
        expect(formatOpenCount(null, 21)).toBe('');
        const now = Date.parse('2026-01-15T12:00:00Z');
        expect(timeAgo('2026-01-15T11:59:45Z', now)).toBe('just now');
        expect(timeAgo('2026-01-15T09:00:00Z', now)).toBe('3 hours ago');
        expect(timeAgo('2026-01-13T12:00:00Z', now)).toBe('2 days ago');
    });
});
