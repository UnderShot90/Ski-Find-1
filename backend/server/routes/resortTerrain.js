const express = require('express');
const ResortTerrain = require('../models/resortTerrainModel');
const requireAuth = require('../utilities/requireAuth');
const terrainResearch = require('../utilities/terrainResearch');

// ---------------------------------------------------------------------------
// Trail difficulty breakdowns, mounted at /terrain
//   GET  /terrain         every breakdown looked up so far (used for recommendations)
//   GET  /terrain/:slug   one resort's breakdown
//   POST /terrain/:slug   signed-in users ask Claude to look one up
//
// Each lookup costs an Anthropic API call, so results are stored in MongoDB
// and only signed-in users can start a new one, up to a daily limit.
// ---------------------------------------------------------------------------
const router = express.Router();
const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const DAILY_LIMIT = Number(process.env.AI_DAILY_LOOKUP_LIMIT) || 50;
const FIELDS = 'resortSlug found beginnerPct intermediatePct advancedPct summary sources updatedAt';

// Lookups started today, and lookups still running (so two visitors asking
// for the same resort share one API call).
let usage = { day: '', count: 0 };
const inFlight = new Map();

function startLookup() {
    const today = new Date().toISOString().slice(0, 10);
    if (usage.day !== today) usage = { day: today, count: 0 };
    if (usage.count >= DAILY_LIMIT) return false;
    usage.count += 1;
    return true;
}

function cleanText(value, maxLength) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

router.param('slug', (req, res, next, slug) => {
    if (!validSlug.test(slug)) {
        return res.status(400).json({ message: 'Invalid resort slug.' });
    }
    req.resortSlug = slug.toLowerCase();
    return next();
});

router.get('/', async (req, res) => {
    try {
        return res.json(await ResortTerrain.find({ found: true }).select(FIELDS));
    } catch (error) {
        return res.status(500).json({ message: 'Unable to load trail breakdowns.' });
    }
});

router.get('/:slug', async (req, res) => {
    try {
        const terrain = await ResortTerrain.findOne({ resortSlug: req.resortSlug }).select(FIELDS);
        if (!terrain) return res.status(404).json({ message: 'No trail breakdown yet.' });
        return res.json(terrain);
    } catch (error) {
        return res.status(500).json({ message: 'Unable to load the trail breakdown.' });
    }
});

router.post('/:slug', requireAuth, async (req, res) => {
    const name = cleanText(req.body?.name, 100);
    const region = cleanText(req.body?.region, 60);
    const website = cleanText(req.body?.website, 200);
    if (!name) {
        return res.status(400).json({ message: 'A resort name is required.' });
    }

    try {
        const existing = await ResortTerrain.findOne({ resortSlug: req.resortSlug }).select(FIELDS);
        if (existing) return res.json(existing);

        if (!terrainResearch.isConfigured()) {
            return res.status(503).json({ message: 'AI lookups are not set up. Add ANTHROPIC_API_KEY to the backend .env file.' });
        }

        if (!inFlight.has(req.resortSlug)) {
            if (!startLookup()) {
                return res.status(429).json({ message: 'The daily limit for AI lookups has been reached. Try again tomorrow.' });
            }
            const lookup = terrainResearch.researchTerrain({ name, region, website: /^https?:\/\//.test(website) ? website : '' })
                .then((terrain) => ResortTerrain.findOneAndUpdate(
                    { resortSlug: req.resortSlug },
                    { ...terrain, resortSlug: req.resortSlug, model: terrainResearch.MODEL },
                    { upsert: true, new: true, projection: FIELDS }
                ))
                .finally(() => inFlight.delete(req.resortSlug));
            inFlight.set(req.resortSlug, lookup);
        }

        return res.status(201).json(await inFlight.get(req.resortSlug));
    } catch (error) {
        return res.status(502).json({ message: 'The AI lookup failed. Try again in a few minutes.' });
    }
});

// Exposed so tests can start each case with a fresh daily count.
router.resetUsage = () => {
    usage = { day: '', count: 0 };
    inFlight.clear();
};

module.exports = router;
