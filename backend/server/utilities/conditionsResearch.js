const Anthropic = require('@anthropic-ai/sdk');

// ---------------------------------------------------------------------------
// Looks up a resort's current conditions with Claude.
//
// Claude searches the web for today's snow report, weather, lift and trail
// counts, lift ticket price, and webcams, then calls the `report_conditions`
// tool with what it found. The tool is never actually run; its strict schema
// just guarantees the answer comes back as clean JSON. Anything Claude cannot
// find comes back as null rather than a guess.
// ---------------------------------------------------------------------------
const MODEL = 'claude-opus-5-5';
const MAX_REQUESTS = 4;

const SYSTEM_PROMPT = `You research current ski conditions for Ski Find, a site that helps skiers compare mountains before they go.

Find the resort's most recent conditions: whether it is open, today's weather and temperature, new snow in the last 24 hours, base depth, how many lifts and trails are open out of the total, the price of a one-day adult lift ticket for the next ski day, and links to its live webcams. Prefer the resort's own snow report, lift status, ticket, and webcam pages; use well-known snow report and weather sites for anything the resort does not publish.

Only report numbers you found in a source. Use null for anything you could not find, and never estimate.

Skiers also use this between seasons, so a closed resort still gets a full report: the current weather and temperature at the mountain (from a weather forecast for its location), lifts and trails open as 0 out of the resort's published totals, its webcams, and ticket prices for the upcoming season. Ticket prices change by date and by how early you buy; report the lowest current price anyone can buy for a single adult day, not a resident, student, group, or season-pass rate, and say what it applies to in ticketNote. Use null when only discounted rates are published.

When you have researched, call report_conditions once. If you cannot find any current information about the resort, call it with found set to false.`;

const nullable = (type, description) => ({ anyOf: [{ type }, { type: 'null' }], description });

const REPORT_TOOL = {
    name: 'report_conditions',
    description: 'Report the resort\'s current conditions. Call this exactly once, after researching.',
    strict: true,
    input_schema: {
        type: 'object',
        properties: {
            found: { type: 'boolean', description: 'False when no current information could be found.' },
            operatingStatus: { type: 'string', enum: ['open', 'closed', 'unknown'], description: 'Whether the resort is open for skiing today.' },
            reportDate: nullable('string', 'Date of the conditions report, as YYYY-MM-DD.'),
            tempF: nullable('number', 'Current or today\'s high temperature at the mountain, in Fahrenheit.'),
            weatherSummary: { type: 'string', description: 'A short description of today\'s weather, e.g. "Light snow, winds 10 mph". Empty if unknown.' },
            forecast: { type: 'string', description: 'One sentence on the next few days\' forecast. Empty if unknown.' },
            newSnowIn: nullable('number', 'New snow in the last 24 hours, in inches.'),
            baseDepthIn: nullable('number', 'Base depth, in inches. Use the midpoint if a range is given.'),
            liftsOpen: nullable('integer', 'Number of lifts open.'),
            liftsTotal: nullable('integer', 'Total number of lifts.'),
            trailsOpen: nullable('integer', 'Number of trails open.'),
            trailsTotal: nullable('integer', 'Total number of trails.'),
            adultTicketUsd: nullable('number', 'Price of a one-day adult lift ticket in US dollars.'),
            ticketNote: { type: 'string', description: 'What the ticket price applies to, e.g. "Weekday, bought online 7 days ahead". Empty if unknown.' },
            webcams: {
                type: 'array',
                description: 'Links to the resort\'s live webcams.',
                items: {
                    type: 'object',
                    properties: {
                        label: { type: 'string', description: 'Where the camera points, e.g. "Summit".' },
                        url: { type: 'string', description: 'The webcam page URL.' }
                    },
                    required: ['label', 'url'],
                    additionalProperties: false
                }
            },
            summary: { type: 'string', description: 'One or two sentences on what skiing is like there right now.' },
            sources: { type: 'array', items: { type: 'string' }, description: 'URLs the conditions came from.' }
        },
        required: [
            'found', 'operatingStatus', 'reportDate', 'tempF', 'weatherSummary', 'forecast', 'newSnowIn', 'baseDepthIn',
            'liftsOpen', 'liftsTotal', 'trailsOpen', 'trailsTotal', 'adultTicketUsd', 'ticketNote', 'webcams', 'summary', 'sources'
        ],
        additionalProperties: false
    }
};

let client = null;

function isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient() {
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
}

// A number within [min, max], or null. Rejects anything that is not a real reading.
function numberIn(value, min, max) {
    const number = typeof value === 'number' ? value : NaN;
    return Number.isFinite(number) && number >= min && number <= max ? Math.round(number * 10) / 10 : null;
}

function text(value, maxLength) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

const isWebUrl = (url) => typeof url === 'string' && /^https?:\/\//.test(url);

// An "open of total" pair, dropping both when they contradict each other.
function openOfTotal(open, total, max) {
    const pair = { open: numberIn(open, 0, max), total: numberIn(total, 0, max) };
    if (pair.total === 0) pair.total = null;
    if (pair.open !== null && pair.total !== null && pair.open > pair.total) return { open: null, total: null };
    return pair;
}

// Checks Claude's tool input and keeps only plausible values.
function normalizeConditions(input) {
    if (!input?.found) return { found: false };

    const lifts = openOfTotal(input.liftsOpen, input.liftsTotal, 100);
    const trails = openOfTotal(input.trailsOpen, input.trailsTotal, 500);
    return {
        found: true,
        operatingStatus: ['open', 'closed'].includes(input.operatingStatus) ? input.operatingStatus : 'unknown',
        reportDate: /^\d{4}-\d{2}-\d{2}$/.test(input.reportDate || '') ? input.reportDate : '',
        tempF: numberIn(input.tempF, -60, 120),
        weatherSummary: text(input.weatherSummary, 200),
        forecast: text(input.forecast, 300),
        newSnowIn: numberIn(input.newSnowIn, 0, 120),
        baseDepthIn: numberIn(input.baseDepthIn, 0, 600),
        liftsOpen: lifts.open,
        liftsTotal: lifts.total,
        trailsOpen: trails.open,
        trailsTotal: trails.total,
        adultTicketUsd: numberIn(input.adultTicketUsd, 1, 1000),
        ticketNote: text(input.ticketNote, 200),
        webcams: (Array.isArray(input.webcams) ? input.webcams : [])
            .filter((camera) => isWebUrl(camera?.url))
            .map((camera) => ({ label: text(camera.label, 60) || 'Webcam', url: camera.url.slice(0, 500) }))
            .slice(0, 6),
        summary: text(input.summary, 500),
        sources: (Array.isArray(input.sources) ? input.sources : []).filter(isWebUrl).slice(0, 6)
    };
}

// resort: { name, region, website }. Resolves with the normalized conditions.
async function researchConditions(resort) {
    const details = [
        `Resort: ${resort.name}`,
        resort.region && `State or region: ${resort.region}`,
        resort.website && `Official website: ${resort.website}`,
        `Today's date: ${new Date().toISOString().slice(0, 10)}`
    ].filter(Boolean).join('\n');
    const messages = [{ role: 'user', content: details }];

    for (let request = 0; request < MAX_REQUESTS; request += 1) {
        const response = await getClient().beta.messages.create({
            model: MODEL,
            max_tokens: 16000,
            // If a safety classifier declines, the API retries on its recommended fallback model.
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'medium' },
            system: SYSTEM_PROMPT,
            tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 10 }, REPORT_TOOL],
            messages
        });

        if (response.stop_reason === 'refusal') return { found: false };

        const report = response.content.find((block) => block.type === 'tool_use' && block.name === 'report_conditions');
        if (report) return normalizeConditions(report.input);

        // A long web search can pause mid-turn; sending the turn back resumes it.
        if (response.stop_reason !== 'pause_turn') return { found: false };
        messages.push({ role: 'assistant', content: response.content });
    }

    return { found: false };
}

module.exports = { MODEL, isConfigured, normalizeConditions, researchConditions };
