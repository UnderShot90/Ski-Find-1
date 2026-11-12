const Anthropic = require('@anthropic-ai/sdk');

// ---------------------------------------------------------------------------
// Looks up a resort's trail difficulty breakdown with Claude.
//
// Claude searches the web for the resort's published trail stats, then calls
// the `report_terrain` tool with the percentages it found. The tool is never
// actually run; its strict schema just guarantees the answer comes back as
// clean JSON.
// ---------------------------------------------------------------------------
const MODEL = 'claude-opus-5-5';
const MAX_REQUESTS = 4;

const SYSTEM_PROMPT = `You research ski resorts for Ski Find, a site that helps skiers pick a mountain that suits their ability.

Find the resort's published trail difficulty breakdown: the percentage of trails rated green circle (easiest), blue square (intermediate), and black diamond (including double black diamond). Prefer the resort's own website or trail map; well-known ski guides are fine when the resort does not publish it. If sources only give trail counts, convert them to percentages.

When you have the numbers, call report_terrain once. If you cannot find a published breakdown, call report_terrain with found set to false and all percentages set to 0, rather than estimating.`;

const REPORT_TOOL = {
    name: 'report_terrain',
    description: 'Report the resort\'s trail difficulty breakdown. Call this exactly once, after researching.',
    strict: true,
    input_schema: {
        type: 'object',
        properties: {
            found: { type: 'boolean', description: 'False when no published breakdown could be found.' },
            beginnerPct: { type: 'number', description: 'Percent of trails rated green circle.' },
            intermediatePct: { type: 'number', description: 'Percent of trails rated blue square.' },
            advancedPct: { type: 'number', description: 'Percent of trails rated black or double black diamond.' },
            summary: { type: 'string', description: 'One or two sentences on what kind of skier the mountain suits best.' },
            sources: { type: 'array', items: { type: 'string' }, description: 'URLs the percentages came from.' }
        },
        required: ['found', 'beginnerPct', 'intermediatePct', 'advancedPct', 'summary', 'sources'],
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

// Checks Claude's tool input and rescales the percentages to total exactly 100.
// Returns { found: false } for anything that does not add up.
function normalizeTerrain(input) {
    const percents = [input?.beginnerPct, input?.intermediatePct, input?.advancedPct].map(Number);
    const total = percents.reduce((sum, value) => sum + value, 0);
    if (!input?.found || percents.some((value) => !Number.isFinite(value) || value < 0) || total < 90 || total > 110) {
        return { found: false };
    }

    const [beginnerPct, intermediatePct] = percents.map((value) => Math.round(value * 100 / total));
    return {
        found: true,
        beginnerPct,
        intermediatePct,
        advancedPct: 100 - beginnerPct - intermediatePct,
        summary: String(input.summary || '').trim().slice(0, 500),
        sources: (Array.isArray(input.sources) ? input.sources : [])
            .filter((url) => typeof url === 'string' && /^https?:\/\//.test(url))
            .slice(0, 5)
    };
}

// resort: { name, region, website }. Resolves with the normalized terrain.
async function researchTerrain(resort) {
    const details = [
        `Resort: ${resort.name}`,
        resort.region && `State or region: ${resort.region}`,
        resort.website && `Official website: ${resort.website}`
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
            tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }, REPORT_TOOL],
            messages
        });

        if (response.stop_reason === 'refusal') return { found: false };

        const report = response.content.find((block) => block.type === 'tool_use' && block.name === 'report_terrain');
        if (report) return normalizeTerrain(report.input);

        // A long web search can pause mid-turn; sending the turn back resumes it.
        if (response.stop_reason !== 'pause_turn') return { found: false };
        messages.push({ role: 'assistant', content: response.content });
    }

    return { found: false };
}

module.exports = { MODEL, isConfigured, normalizeTerrain, researchTerrain };
