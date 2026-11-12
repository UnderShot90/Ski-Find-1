// ---------------------------------------------------------------------------
// Curated resort catalog
//
// This is the single place to add or edit a mountain. Every entry here gets its
// own page at /resorts/<slug> automatically; no new components or routes needed.
//
// Field guide:
//   slug        URL id. Use the ski API's slug when the resort exists there so
//               the detail page can show live lift conditions.
//   website     Official resort site, linked from the resort page.
//   summitFt / verticalFt / trails / lifts
//               Approximate published figures; resorts change these yearly,
//               so leave a value null rather than guessing.
//   description One or two sentences shown on the resort page.
//   terrain     Optional { beginnerPct, intermediatePct, advancedPct }: percent
//               of green, blue, and black (incl. double black) trails from the
//               resort's trail map. Without it, signed-in users can have
//               Claude look it up from the resort page (needs ANTHROPIC_API_KEY
//               on the backend).
//   difficulty  Optional 'beginner' | 'intermediate' | 'advanced' | 'expert'
//               to override the suggested level entirely.
//
// Resorts in the live API that are not listed here still show up under
// "All regions", just without the extra details.
// ---------------------------------------------------------------------------

// States treated as "East Coast" for the default directory view.
export const EAST_COAST_REGIONS = ['ME', 'NH', 'VT', 'MA', 'CT', 'RI', 'NY', 'NJ', 'PA', 'MD', 'WV', 'VA', 'NC'];

export const REGION_NAMES = {
    ME: 'Maine',
    NH: 'New Hampshire',
    VT: 'Vermont',
    MA: 'Massachusetts',
    CT: 'Connecticut',
    RI: 'Rhode Island',
    NY: 'New York',
    NJ: 'New Jersey',
    PA: 'Pennsylvania',
    MD: 'Maryland',
    WV: 'West Virginia',
    VA: 'Virginia',
    NC: 'North Carolina'
};

const RESORT_CATALOG = [
    // --- Vermont ---
    {
        slug: 'killington', name: 'Killington', region: 'VT', country: 'US',
        latitude: 43.619675, longitude: -72.802879, website: 'https://www.killington.com',
        summitFt: 4241, verticalFt: 3050, trails: 155, lifts: 21,
        description: 'The "Beast of the East" spans six peaks and has one of the longest seasons in the eastern United States.'
    },
    {
        slug: 'stowe', name: 'Stowe', region: 'VT', country: 'US',
        latitude: 44.5303, longitude: -72.7814, website: 'https://www.stowe.com',
        summitFt: 3625, verticalFt: 2360, trails: 116, lifts: 12,
        description: 'Classic New England skiing on Mount Mansfield, Vermont\'s highest peak, with a historic village nearby.'
    },
    {
        slug: 'sugarbush', name: 'Sugarbush', region: 'VT', country: 'US',
        latitude: 44.1359, longitude: -72.8944, website: 'https://www.sugarbush.com',
        summitFt: 4083, verticalFt: 2600, trails: 111, lifts: 16,
        description: 'Two connected mountains in the Mad River Valley with a mix of groomers, glades, and steeps.'
    },
    {
        slug: 'jay-peak', name: 'Jay Peak', region: 'VT', country: 'US',
        latitude: 44.928837, longitude: -72.501701, website: 'https://jaypeakresort.com',
        summitFt: 3968, verticalFt: 2153, trails: 81, lifts: 9,
        description: 'Near the Canadian border and known for receiving more natural snow than almost anywhere in the East.'
    },
    {
        slug: 'mountsnow', name: 'Mount Snow', region: 'VT', country: 'US',
        latitude: 42.968166, longitude: -72.8936, website: 'https://www.mountsnow.com',
        summitFt: 3600, verticalFt: 1700, trails: 86, lifts: 20,
        description: 'The closest major Vermont resort to Boston and New York, with a large terrain park program.'
    },
    {
        slug: 'stratton', name: 'Stratton', region: 'VT', country: 'US',
        latitude: 43.1134, longitude: -72.9081, website: 'https://www.stratton.com',
        summitFt: 3875, verticalFt: 2003, trails: 99, lifts: 11,
        description: 'The tallest peak in southern Vermont, with a pedestrian village at the base.'
    },
    {
        slug: 'okemo', name: 'Okemo', region: 'VT', country: 'US',
        latitude: 43.4017, longitude: -72.717, website: 'https://www.okemo.com',
        summitFt: 3344, verticalFt: 2200, trails: 121, lifts: 20,
        description: 'Known for consistent grooming and a family-friendly layout across several base areas.'
    },
    {
        slug: 'mad-river-glen', name: 'Mad River Glen', region: 'VT', country: 'US',
        latitude: 44.201653, longitude: -72.919006, website: 'https://www.madriverglen.com',
        summitFt: 3637, verticalFt: 2037, trails: 45, lifts: 5,
        description: 'A skier-owned cooperative with natural-snow terrain and the famous single chair. Skiers only.'
    },
    {
        slug: 'smugglers-notch', name: "Smugglers' Notch", region: 'VT', country: 'US',
        latitude: 44.5885, longitude: -72.79, website: 'https://www.smuggs.com',
        summitFt: 3640, verticalFt: 2610, trails: 78, lifts: 8,
        description: 'A family-focused resort across three mountains, including some of the steepest terrain in the East.'
    },
    {
        slug: 'bolton-valley', name: 'Bolton Valley', region: 'VT', country: 'US',
        latitude: 44.421673, longitude: -72.84948, website: 'https://www.boltonvalley.com',
        summitFt: 3150, verticalFt: 1704, trails: 71, lifts: 6,
        description: 'A smaller resort near Burlington with night skiing and extensive backcountry access.'
    },
    {
        slug: 'bromley-mountain', name: 'Bromley Mountain', region: 'VT', country: 'US',
        latitude: 43.213402, longitude: -72.935013, website: 'https://www.bromley.com',
        summitFt: 3284, verticalFt: 1334, trails: 47, lifts: 9,
        description: 'A south-facing "Sun Mountain" that is a relaxed choice for families and beginners.'
    },
    {
        slug: 'burke-mountain', name: 'Burke Mountain', region: 'VT', country: 'US',
        latitude: 44.587898, longitude: -71.91745, website: 'https://skiburke.com',
        summitFt: 3267, verticalFt: 2011, trails: 50, lifts: 5,
        description: 'A quiet Northeast Kingdom mountain with long, uncrowded runs and a ski academy.'
    },

    // --- New Hampshire ---
    {
        slug: 'loon', name: 'Loon Mountain', region: 'NH', country: 'US',
        latitude: 44.056583, longitude: -71.625809, website: 'https://www.loonmtn.com',
        summitFt: 3050, verticalFt: 2100, trails: 61, lifts: 10,
        description: 'A White Mountains favorite off I-93 with a gondola and three connected peaks.'
    },
    {
        slug: 'cannon', name: 'Cannon Mountain', region: 'NH', country: 'US',
        latitude: 44.156452, longitude: -71.698418, website: 'https://www.cannonmt.com',
        summitFt: 4080, verticalFt: 2180, trails: 97, lifts: 10,
        description: 'A state-owned mountain in Franconia Notch with an aerial tram and the most vertical in New Hampshire.'
    },
    {
        slug: 'brettonwoods', name: 'Bretton Woods', region: 'NH', country: 'US',
        latitude: 44.077122, longitude: -71.340408, website: 'https://www.brettonwoods.com',
        summitFt: 3100, verticalFt: 1500, trails: 62, lifts: 10,
        description: 'New Hampshire\'s largest ski area, with views of Mount Washington and the Omni Mount Washington Hotel.'
    },
    {
        slug: 'waterville-valley', name: 'Waterville Valley', region: 'NH', country: 'US',
        latitude: 43.9655, longitude: -71.5285, website: 'https://www.waterville.com',
        summitFt: 4004, verticalFt: 2020, trails: 62, lifts: 11,
        description: 'A self-contained resort valley with wide cruisers and a walkable town square.'
    },
    {
        slug: 'attitash', name: 'Attitash', region: 'NH', country: 'US',
        latitude: 44.077778, longitude: -71.282776, website: 'https://www.attitash.com',
        summitFt: 2350, verticalFt: 1750, trails: 68, lifts: 9,
        description: 'Two peaks, Attitash and Bear Peak, in the Mount Washington Valley near North Conway.'
    },
    {
        slug: 'wildcat', name: 'Wildcat Mountain', region: 'NH', country: 'US',
        latitude: 44.264, longitude: -71.239, website: 'https://www.skiwildcat.com',
        summitFt: 4062, verticalFt: 2112, trails: 48, lifts: 5,
        description: 'Steep, wind-swept runs facing Tuckerman Ravine and Mount Washington.'
    },
    {
        slug: 'cranmore-mountain', name: 'Cranmore', region: 'NH', country: 'US',
        latitude: 44.055382, longitude: -71.116783, website: 'https://www.cranmore.com',
        summitFt: 2000, verticalFt: 1200, trails: 57, lifts: 7,
        description: 'A historic mountain right in North Conway village, popular with families.'
    },
    {
        slug: 'gunstock', name: 'Gunstock', region: 'NH', country: 'US',
        latitude: 43.551796, longitude: -71.360092, website: 'https://www.gunstock.com',
        summitFt: 2267, verticalFt: 1340, trails: 49, lifts: 8,
        description: 'A county-owned mountain overlooking Lake Winnipesaukee with night skiing.'
    },
    {
        slug: 'mount-sunapee', name: 'Mount Sunapee', region: 'NH', country: 'US',
        latitude: 43.341194, longitude: -72.075394, website: 'https://www.mountsunapee.com',
        summitFt: 2743, verticalFt: 1510, trails: 67, lifts: 10,
        description: 'An easy drive from Boston, with lake views and a strong learn-to-ski program.'
    },
    {
        slug: 'king-pine', name: 'King Pine', region: 'NH', country: 'US',
        latitude: 43.86063, longitude: -71.088127, website: 'https://www.kingpine.com',
        summitFt: null, verticalFt: 350, trails: 17, lifts: 6,
        description: 'A small, affordable family mountain at Purity Spring Resort.'
    },

    // --- Maine ---
    {
        slug: 'sunday-river', name: 'Sunday River', region: 'ME', country: 'US',
        latitude: 44.4734, longitude: -70.8566, website: 'https://www.sundayriver.com',
        summitFt: 3140, verticalFt: 2340, trails: 135, lifts: 18,
        description: 'Eight connected peaks and a big snowmaking system make this one of New England\'s largest resorts.'
    },
    {
        slug: 'sugarloaf', name: 'Sugarloaf', region: 'ME', country: 'US',
        latitude: 45.0314, longitude: -70.3131, website: 'https://www.sugarloaf.com',
        summitFt: 4237, verticalFt: 2820, trails: 162, lifts: 13,
        description: 'The only lift-served above-treeline skiing in the East, on the snowfields of Sugarloaf Mountain.'
    },

    // --- New York ---
    {
        slug: 'whiteface', name: 'Whiteface', region: 'NY', country: 'US',
        latitude: 44.3659, longitude: -73.9026, website: 'https://whiteface.com',
        summitFt: 4650, verticalFt: 3430, trails: 94, lifts: 11,
        description: 'Host of the 1980 Lake Placid Olympic alpine events, with the greatest vertical drop in the East.'
    },
    {
        slug: 'gore-mountain', name: 'Gore Mountain', region: 'NY', country: 'US',
        latitude: 43.672653, longitude: -74.007172, website: 'https://goremountain.com',
        summitFt: 3600, verticalFt: 2537, trails: 110, lifts: 14,
        description: 'A large state-run Adirondack mountain with long cruisers and tree skiing.'
    },
    {
        slug: 'hunter', name: 'Hunter Mountain', region: 'NY', country: 'US',
        latitude: 42.205029, longitude: -74.20874, website: 'https://www.huntermtn.com',
        summitFt: 3200, verticalFt: 1600, trails: 67, lifts: 13,
        description: 'A Catskills mountain about two and a half hours from New York City.'
    },
    {
        slug: 'windham', name: 'Windham Mountain', region: 'NY', country: 'US',
        latitude: 42.2965, longitude: -74.2564, website: 'https://www.windhammountain.com',
        summitFt: 3100, verticalFt: 1600, trails: 54, lifts: 11,
        description: 'A polished Catskills resort with strong snowmaking and night skiing.'
    },

    // --- Massachusetts ---
    {
        slug: 'jiminypeak', name: 'Jiminy Peak', region: 'MA', country: 'US',
        latitude: 42.556477, longitude: -73.291328, website: 'https://www.jiminypeak.com',
        summitFt: 2380, verticalFt: 1150, trails: 45, lifts: 9,
        description: 'The largest ski resort in southern New England, in the Berkshires.'
    },
    {
        slug: 'wachusett', name: 'Wachusett Mountain', region: 'MA', country: 'US',
        latitude: 42.5031, longitude: -71.8867, website: 'https://www.wachusett.com',
        summitFt: 2006, verticalFt: 1000, trails: 27, lifts: 8,
        description: 'About an hour from Boston, with night skiing and a ski train in season.'
    },

    // --- Mid-Atlantic & South ---
    {
        slug: 'camelback', name: 'Camelback Mountain', region: 'PA', country: 'US',
        latitude: 41.051389, longitude: -75.355, website: 'https://www.skicamelback.com',
        summitFt: 2133, verticalFt: 800, trails: 39, lifts: 16,
        description: 'The biggest ski area in the Poconos, within easy reach of New York and Philadelphia.'
    },
    {
        slug: 'seven-springs', name: 'Seven Springs', region: 'PA', country: 'US',
        latitude: 40.0228, longitude: -79.2973, website: 'https://www.7springs.com',
        summitFt: 2994, verticalFt: 750, trails: 33, lifts: 10,
        description: 'Pennsylvania\'s largest resort, in the Laurel Highlands southeast of Pittsburgh.'
    },
    {
        slug: 'snowshoe', name: 'Snowshoe Mountain', region: 'WV', country: 'US',
        latitude: 38.4097, longitude: -79.9939, website: 'https://www.snowshoemtn.com',
        summitFt: 4848, verticalFt: 1500, trails: 61, lifts: 14,
        description: 'The largest resort in the Southeast, with a village at the summit instead of the base.'
    },
    {
        slug: 'cataloochee', name: 'Cataloochee', region: 'NC', country: 'US',
        latitude: 35.562656, longitude: -83.090027, website: 'https://cataloochee.com',
        summitFt: 5400, verticalFt: 740, trails: 18, lifts: 5,
        description: 'North Carolina\'s first ski area, in the Smoky Mountains near Maggie Valley.'
    }
];

export default RESORT_CATALOG;
