const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const API_HOST = 'ski-resorts-and-conditions.p.rapidapi.com';
const HERE_GEOCODING_URL = 'https://geocode.search.hereapi.com/v1/geocode';
const HERE_MATRIX_URL = 'https://matrix.router.hereapi.com/v8/matrix';
const HERE_MAP_TILE_URL = 'https://maps.hereapi.com/v3/base/mc';
const MAX_MATRIX_DESTINATIONS = 25;

router.get('/tiles/:zoom/:x/:y.png', (req, res) => {
    const apiKey = process.env.HERE_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'HERE is not configured. Set HERE_API_KEY on the backend.' });
    }

    const zoom = Number(req.params.zoom);
    const x = Number(req.params.x);
    const y = Number(req.params.y);
    const tileCount = 2 ** zoom;
    if (!Number.isInteger(zoom) || zoom < 0 || zoom > 20
        || !Number.isInteger(x) || !Number.isInteger(y)
        || x < 0 || y < 0 || x >= tileCount || y >= tileCount) {
        return res.status(400).json({ error: 'Invalid map tile coordinates.' });
    }

    const tileUrl = new URL(`${HERE_MAP_TILE_URL}/${zoom}/${x}/${y}/png`);
    tileUrl.searchParams.set('style', 'explore.day');
    tileUrl.searchParams.set('size', '512');
    tileUrl.searchParams.set('apiKey', apiKey);
    const request = https.get(tileUrl, (upstreamResponse) => {
        if (upstreamResponse.statusCode >= 400) {
            upstreamResponse.resume();
            return res.status(502).json({ error: 'HERE could not load the map tiles.' });
        }

        res.set('Content-Type', upstreamResponse.headers['content-type'] || 'image/png');
        res.set('Cache-Control', 'public, max-age=86400');
        return upstreamResponse.pipe(res);
    });

    request.setTimeout(10000, () => request.destroy(new Error('HERE map tile request timed out.')));
    request.on('error', () => {
        if (!res.headersSent) res.status(502).json({ error: 'Unable to reach HERE map tiles.' });
    });
});

function parseJsonResponse(response, chunks, resolve, reject) {
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => {
        try {
            const body = Buffer.concat(chunks).toString('utf8');
            const data = body ? JSON.parse(body) : {};
            if (response.statusCode >= 400) {
                reject(new Error(data.cause || data.title || `HERE returned HTTP ${response.statusCode}.`));
                return;
            }
            resolve(data);
        } catch (error) {
            reject(new Error('HERE returned an invalid response.'));
        }
    });
}

function requestHereGet(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, (response) => {
            const chunks = [];
            parseJsonResponse(response, chunks, resolve, reject);
        });

        request.setTimeout(10000, () => request.destroy(new Error('HERE request timed out.')));
        request.on('error', reject);
    });
}

function requestHerePost(url, payload) {
    return new Promise((resolve, reject) => {
        const request = https.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        }, (response) => {
            const chunks = [];
            parseJsonResponse(response, chunks, resolve, reject);
        });

        request.setTimeout(15000, () => request.destroy(new Error('HERE request timed out.')));
        request.on('error', reject);
        request.write(JSON.stringify(payload));
        request.end();
    });
}

function isValidCoordinate(latitude, longitude) {
    return Number.isFinite(latitude) && Number.isFinite(longitude)
        && latitude >= -90 && latitude <= 90
        && longitude >= -180 && longitude <= 180;
}

function distanceBetween(first, second) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const latitudeDelta = radians(second.latitude - first.latitude);
    const longitudeDelta = radians(second.longitude - first.longitude);
    const value = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
        * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function formatDuration(seconds) {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

router.post('/nearby', async (req, res) => {
    const apiKey = process.env.HERE_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'HERE is not configured. Set HERE_API_KEY on the backend.' });
    }

    const originInput = req.body?.origin;
    const resortsInput = req.body?.resorts;
    if (!originInput || !Array.isArray(resortsInput)) {
        return res.status(400).json({ error: 'Provide an origin and a resort list.' });
    }

    const resorts = resortsInput.filter((resort) => resort
        && typeof resort.slug === 'string'
        && typeof resort.name === 'string'
        && isValidCoordinate(Number(resort.latitude), Number(resort.longitude)))
        .map((resort) => ({
            slug: resort.slug,
            name: resort.name,
            latitude: Number(resort.latitude),
            longitude: Number(resort.longitude)
        }));
    if (!resorts.length) {
        return res.status(400).json({ error: 'No resorts with valid coordinates are available.' });
    }

    try {
        let origin;
        let formattedOrigin;
        if (typeof originInput.address === 'string' && originInput.address.trim()) {
            const geocodeUrl = new URL(HERE_GEOCODING_URL);
            geocodeUrl.searchParams.set('q', originInput.address.trim());
            geocodeUrl.searchParams.set('apiKey', apiKey);
            const geocode = await requestHereGet(geocodeUrl);
            const firstResult = geocode.items?.[0];
            if (!firstResult?.position) {
                return res.status(400).json({ error: 'Could not find that city or ZIP code. Try a more specific location.' });
            }
            origin = {
                latitude: Number(firstResult.position.lat),
                longitude: Number(firstResult.position.lng)
            };
            formattedOrigin = firstResult.title || firstResult.address?.label || originInput.address.trim();
        } else {
            origin = {
                latitude: Number(originInput.latitude),
                longitude: Number(originInput.longitude)
            };
            if (!isValidCoordinate(origin.latitude, origin.longitude)) {
                return res.status(400).json({ error: 'The supplied location coordinates are invalid.' });
            }
            formattedOrigin = 'Your current location';
        }

        const nearestResorts = resorts
            .map((resort) => ({ ...resort, approximateDistance: distanceBetween(origin, resort) }))
            .sort((first, second) => first.approximateDistance - second.approximateDistance)
            .slice(0, MAX_MATRIX_DESTINATIONS);
        const matrixUrl = new URL(HERE_MATRIX_URL);
        matrixUrl.searchParams.set('async', 'false');
        matrixUrl.searchParams.set('apiKey', apiKey);
        const matrixResponse = await requestHerePost(matrixUrl, {
            origins: [{ lat: origin.latitude, lng: origin.longitude }],
            destinations: nearestResorts.map((resort) => ({ lat: resort.latitude, lng: resort.longitude })),
            regionDefinition: { type: 'world' },
            matrixAttributes: ['distances', 'travelTimes']
        });
        const matrix = matrixResponse.matrix;
        if (!matrix || !Array.isArray(matrix.distances) || !Array.isArray(matrix.travelTimes)) {
            return res.status(502).json({ error: matrixResponse.cause || matrixResponse.title || 'HERE could not calculate resort distances.' });
        }

        const distances = nearestResorts.flatMap((resort, index) => {
            const distanceMeters = matrix.distances[index];
            const durationSeconds = matrix.travelTimes[index];
            const isAtOrigin = resort.approximateDistance < 0.1;
            const hasRoute = distanceMeters > 0 && durationSeconds > 0;
            const isExactOrigin = isAtOrigin && distanceMeters === 0 && durationSeconds === 0;
            return Number.isFinite(distanceMeters) && Number.isFinite(durationSeconds) && (hasRoute || isExactOrigin) ? [{
                slug: resort.slug,
                name: resort.name,
                distance: {
                    text: `${(distanceMeters / 1609.344).toFixed(1)} mi`,
                    value: distanceMeters
                },
                duration: {
                    text: formatDuration(durationSeconds),
                    value: durationSeconds
                }
            }] : [];
        }).sort((first, second) => first.distance.value - second.distance.value);

        return res.json({
            origin: formattedOrigin,
            originPosition: origin,
            resorts: distances
        });
    } catch (error) {
        return res.status(502).json({ error: error.message || 'Unable to reach HERE services.' });
    }
});

// ---------------------------------------------------------------------------
// RapidAPI ski resort data
//
// The BASIC RapidAPI plan has a small daily request quota, so responses are
// cached here instead of being fetched on every page view:
//   - live conditions for a single resort are cached in memory for 10 minutes
//   - the full resort directory (8+ paginated requests) is cached in memory and
//     on disk for 24 hours, and a stale copy is served if the quota runs out
// ---------------------------------------------------------------------------
const CONDITIONS_CACHE_MS = 10 * 60 * 1000;
const DIRECTORY_CACHE_MS = 24 * 60 * 60 * 1000;
const DIRECTORY_CACHE_FILE = process.env.RESORT_DIRECTORY_CACHE_FILE
    || path.join(__dirname, '..', 'cache', 'resortDirectory.json');
const conditionsCache = new Map();
let directoryCache = null;

function requestRapidApi(apiPath, apiKey, callback) {
    return https.get(`https://${API_HOST}${apiPath}`, {
        headers: {
            'x-rapidapi-host': API_HOST,
            'x-rapidapi-key': apiKey
        }
    }, callback);
}

function proxyRapidApi(pathForRequest, { cacheMs = 0 } = {}) {
    return (req, res) => {
        const apiKey = process.env.RAPIDAPI_KEY;
        if (!apiKey) {
            return res.status(503).json({ error: 'Ski resort API is not configured.' });
        }

        const apiPath = pathForRequest(req);
        const cached = cacheMs && conditionsCache.get(apiPath);
        if (cached && cached.expiresAt > Date.now()) {
            res.set('Content-Type', cached.contentType);
            return res.send(cached.body);
        }

        const request = requestRapidApi(apiPath, apiKey, (upstreamResponse) => {
            const chunks = [];
            upstreamResponse.on('data', (chunk) => chunks.push(chunk));
            upstreamResponse.on('end', () => {
                const statusCode = upstreamResponse.statusCode || 502;
                const contentType = upstreamResponse.headers['content-type'] || 'application/json';
                const body = Buffer.concat(chunks);
                // Only successful responses are cached so errors can be retried right away.
                if (cacheMs && statusCode === 200) {
                    conditionsCache.set(apiPath, { body, contentType, expiresAt: Date.now() + cacheMs });
                }
                res.status(statusCode);
                res.set('Content-Type', contentType);
                return res.send(body);
            });
        });

        request.setTimeout(10000, () => request.destroy(new Error('RapidAPI request timed out.')));
        request.on('error', () => {
            if (!res.headersSent) {
                res.status(502).json({ error: 'Unable to reach the ski resort API.' });
            }
        });
    };
}

// Fetches one page of the directory and resolves with the parsed JSON body.
function fetchDirectoryPage(page, apiKey) {
    return new Promise((resolve, reject) => {
        const request = requestRapidApi(`/v1/resort?page=${page}`, apiKey, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                try {
                    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    if (response.statusCode >= 400 || !Array.isArray(data.data)) {
                        const error = new Error(data.message || `Ski resort API returned HTTP ${response.statusCode}.`);
                        error.statusCode = response.statusCode;
                        reject(error);
                        return;
                    }
                    resolve(data);
                } catch (error) {
                    reject(new Error('Ski resort API returned an invalid response.'));
                }
            });
        });

        request.setTimeout(10000, () => request.destroy(new Error('RapidAPI request timed out.')));
        request.on('error', reject);
    });
}

// Walks every page of the directory one request at a time.
async function fetchFullDirectory(apiKey) {
    const firstPage = await fetchDirectoryPage(1, apiKey);
    const resorts = [...firstPage.data];
    const totalPages = Math.min(Number(firstPage.total_pages) || 1, 50);
    for (let page = 2; page <= totalPages; page += 1) {
        const nextPage = await fetchDirectoryPage(page, apiKey);
        resorts.push(...nextPage.data);
    }
    return resorts;
}

function readDirectoryFromDisk() {
    try {
        return JSON.parse(fs.readFileSync(DIRECTORY_CACHE_FILE, 'utf8'));
    } catch (error) {
        return null;
    }
}

function writeDirectoryToDisk(cache) {
    try {
        fs.mkdirSync(path.dirname(DIRECTORY_CACHE_FILE), { recursive: true });
        fs.writeFileSync(DIRECTORY_CACHE_FILE, JSON.stringify(cache));
    } catch (error) {
        // A failed disk write only means the next server restart refetches the list.
    }
}

// Full resort directory: { data: [...resorts], fetchedAt, stale }
router.get('/resorts', async (req, res) => {
    directoryCache = directoryCache || readDirectoryFromDisk();
    if (directoryCache && Date.now() - directoryCache.fetchedAt < DIRECTORY_CACHE_MS) {
        return res.json({ ...directoryCache, stale: false });
    }

    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'Ski resort API is not configured.' });
    }

    try {
        directoryCache = { data: await fetchFullDirectory(apiKey), fetchedAt: Date.now() };
        writeDirectoryToDisk(directoryCache);
        return res.json({ ...directoryCache, stale: false });
    } catch (error) {
        // Quota exhausted or API down: an old list is better than no list.
        if (directoryCache) return res.json({ ...directoryCache, stale: true });
        return res.status(error.statusCode || 502).json({ error: error.message || 'Unable to load the resort directory.' });
    }
});

router.get('/', proxyRapidApi(() => '/'));
router.get('/v1/resort', proxyRapidApi(() => '/v1/resort'));
router.get('/v1/resort/:slug', (req, res, next) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(req.params.slug)) {
        return res.status(400).json({ error: 'Invalid resort slug.' });
    }
    return proxyRapidApi(
        (request) => `/v1/resort/${encodeURIComponent(request.params.slug)}`,
        { cacheMs: CONDITIONS_CACHE_MS }
    )(req, res, next);
});

// Exposed so tests can start each case with an empty cache.
router.clearCaches = () => {
    conditionsCache.clear();
    directoryCache = null;
};

module.exports = router;