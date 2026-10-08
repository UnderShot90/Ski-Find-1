const express = require('express');
const https = require('https');

const router = express.Router();
const API_HOST = 'ski-resorts-and-conditions.p.rapidapi.com';
const HERE_GEOCODING_URL = 'https://geocode.search.hereapi.com/v1/geocode';
const HERE_MATRIX_URL = 'https://matrix.router.hereapi.com/v8/matrix';
const MAX_MATRIX_DESTINATIONS = 25;

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
            return Number.isFinite(distanceMeters) && Number.isFinite(durationSeconds) ? [{
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

        return res.json({ origin: formattedOrigin, resorts: distances });
    } catch (error) {
        return res.status(502).json({ error: error.message || 'Unable to reach HERE services.' });
    }
});

function proxyRapidApi(pathForRequest) {
    return (req, res) => {
        const apiKey = process.env.RAPIDAPI_KEY;
        if (!apiKey) {
            return res.status(503).json({ error: 'Ski resort API is not configured.' });
        }

        const apiPath = pathForRequest(req);
        const request = https.get(`https://${API_HOST}${apiPath}`, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': apiKey
            }
        }, (upstreamResponse) => {
            const chunks = [];
            upstreamResponse.on('data', (chunk) => chunks.push(chunk));
            upstreamResponse.on('end', () => {
                res.status(upstreamResponse.statusCode || 502);
                res.set('Content-Type', upstreamResponse.headers['content-type'] || 'application/json');
                return res.send(Buffer.concat(chunks));
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

router.get('/', proxyRapidApi(() => '/'));
router.get('/v1/resort', proxyRapidApi(() => '/v1/resort'));
router.get('/v1/resort/:slug', (req, res, next) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(req.params.slug)) {
        return res.status(400).json({ error: 'Invalid resort slug.' });
    }
    return proxyRapidApi((request) => `/v1/resort/${encodeURIComponent(request.params.slug)}`)(req, res, next);
});

module.exports = router;