const express = require('express');
const ResortConditions = require('../models/resortConditionsModel');
const requireAuth = require('../utilities/requireAuth');
const requireAdmin = require('../utilities/requireAdmin');
const conditionsResearch = require('../utilities/conditionsResearch');

// ---------------------------------------------------------------------------
// Current resort conditions researched by Claude, mounted at /conditions
//   GET  /conditions           every stored report (used to sort the directory)
//   GET  /conditions/refresh   admins: progress of the last bulk refresh
//   POST /conditions/refresh   admins: refresh a list of resorts in the background
//   GET  /conditions/:slug     one resort's stored report
//   POST /conditions/:slug     signed-in users refresh one resort's report
//
// Each lookup costs an Anthropic API call, so reports are stored in MongoDB
// and reused for CONDITIONS_CACHE_HOURS, and new lookups share a daily limit.
// ---------------------------------------------------------------------------
const router = express.Router();
const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const CACHE_MS = (Number(process.env.CONDITIONS_CACHE_HOURS) || 6) * 60 * 60 * 1000;
const DAILY_LIMIT = Number(process.env.AI_DAILY_CONDITIONS_LIMIT) || 150;
const MAX_BULK_RESORTS = 100;
const BULK_CONCURRENCY = 3;
const FIELDS = '-_id -__v -createdAt -model';

// Lookups started today, lookups still running (so two visitors asking for
// the same resort share one API call), and the last bulk refresh.
let usage = { day: '', count: 0 };
const inFlight = new Map();
let bulkJob = null;

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

// The resort fields Claude is given, or null when there is no usable name.
function cleanResort(body) {
    const slug = cleanText(body?.slug, 80).toLowerCase();
    const name = cleanText(body?.name, 100);
    const website = cleanText(body?.website, 200);
    if (!name) return null;
    return { slug, name, region: cleanText(body?.region, 60), website: /^https?:\/\//.test(website) ? website : '' };
}

const isFresh = (report) => Boolean(report) && Date.now() - new Date(report.updatedAt).getTime() < CACHE_MS;

// Adds `stale` so the frontend knows when a refresh is due.
function present(report) {
    const plain = typeof report.toObject === 'function' ? report.toObject() : report;
    return { ...plain, stale: !isFresh(plain) };
}

class LimitReachedError extends Error {}

// Researches one resort and stores the result. Concurrent calls for the same
// resort share one lookup.
function refreshResort(resort) {
    if (!inFlight.has(resort.slug)) {
        if (!startLookup()) return Promise.reject(new LimitReachedError());
        const lookup = conditionsResearch.researchConditions(resort)
            // Replaced rather than updated, so nothing from an older report lingers.
            .then((conditions) => ResortConditions.findOneAndReplace(
                { resortSlug: resort.slug },
                { ...conditions, resortSlug: resort.slug, model: conditionsResearch.MODEL },
                { upsert: true, new: true, projection: FIELDS }
            ))
            .finally(() => inFlight.delete(resort.slug));
        inFlight.set(resort.slug, lookup);
    }
    return inFlight.get(resort.slug);
}

router.get('/', async (req, res) => {
    try {
        const reports = await ResortConditions.find({ found: true }).select(FIELDS);
        return res.json(reports.map(present));
    } catch (error) {
        return res.status(500).json({ message: 'Unable to load conditions.' });
    }
});

router.get('/refresh', requireAuth, requireAdmin, (req, res) => {
    res.json(bulkJob || { running: false });
});

router.post('/refresh', requireAuth, requireAdmin, async (req, res) => {
    if (!conditionsResearch.isConfigured()) {
        return res.status(503).json({ message: 'AI lookups are not set up. Add ANTHROPIC_API_KEY to the backend .env file.' });
    }
    if (bulkJob?.running) {
        return res.status(409).json({ message: 'A refresh is already running.', ...bulkJob });
    }

    const resorts = (Array.isArray(req.body?.resorts) ? req.body.resorts : [])
        .map(cleanResort)
        .filter((resort) => resort && validSlug.test(resort.slug))
        .slice(0, MAX_BULK_RESORTS);
    if (!resorts.length) {
        return res.status(400).json({ message: 'Send a list of resorts to refresh.' });
    }

    let existing;
    try {
        existing = await ResortConditions.find({ resortSlug: { $in: resorts.map((resort) => resort.slug) } }).select('resortSlug updatedAt');
    } catch (error) {
        return res.status(500).json({ message: 'Unable to start the refresh.' });
    }
    const freshSlugs = new Set(existing.filter(isFresh).map((report) => report.resortSlug));
    const queue = resorts.filter((resort) => !freshSlugs.has(resort.slug));

    const job = {
        running: true,
        total: queue.length,
        done: 0,
        failed: 0,
        alreadyFresh: freshSlugs.size,
        limitReached: false,
        startedAt: new Date().toISOString(),
        finishedAt: null
    };
    bulkJob = job;

    // A few lookups at a time; each worker takes the next resort off the queue.
    const worker = async () => {
        while (queue.length && !job.limitReached) {
            const resort = queue.shift();
            try {
                await refreshResort(resort);
                job.done += 1;
            } catch (error) {
                if (error instanceof LimitReachedError) job.limitReached = true;
                else job.failed += 1;
            }
        }
    };
    Promise.all(Array.from({ length: BULK_CONCURRENCY }, worker)).finally(() => {
        job.running = false;
        job.finishedAt = new Date().toISOString();
    });

    return res.status(202).json(job);
});

router.param('slug', (req, res, next, slug) => {
    if (!validSlug.test(slug)) {
        return res.status(400).json({ message: 'Invalid resort slug.' });
    }
    req.resortSlug = slug.toLowerCase();
    return next();
});

router.get('/:slug', async (req, res) => {
    try {
        const report = await ResortConditions.findOne({ resortSlug: req.resortSlug }).select(FIELDS);
        if (!report) return res.status(404).json({ message: 'No conditions report yet.' });
        return res.json(present(report));
    } catch (error) {
        return res.status(500).json({ message: 'Unable to load the conditions report.' });
    }
});

router.post('/:slug', requireAuth, async (req, res) => {
    const resort = cleanResort({ ...req.body, slug: req.resortSlug });
    if (!resort) {
        return res.status(400).json({ message: 'A resort name is required.' });
    }

    try {
        const existing = await ResortConditions.findOne({ resortSlug: req.resortSlug }).select(FIELDS);
        if (isFresh(existing)) return res.json(present(existing));

        if (!conditionsResearch.isConfigured()) {
            return res.status(503).json({ message: 'AI lookups are not set up. Add ANTHROPIC_API_KEY to the backend .env file.' });
        }

        return res.status(201).json(present(await refreshResort(resort)));
    } catch (error) {
        if (error instanceof LimitReachedError) {
            return res.status(429).json({ message: 'The daily limit for AI conditions lookups has been reached. Try again tomorrow.' });
        }
        return res.status(502).json({ message: 'The AI lookup failed. Try again in a few minutes.' });
    }
});

// Exposed so tests can start each case with a fresh daily count.
router.resetUsage = () => {
    usage = { day: '', count: 0 };
    inFlight.clear();
    bulkJob = null;
};

module.exports = router;
