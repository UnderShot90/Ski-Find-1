const express = require('express');
const https = require('https');

const router = express.Router();
const API_HOST = 'ski-resorts-and-conditions.p.rapidapi.com';
const GOOGLE_MAPS_HOST = 'maps.googleapis.com';
const MAX_MATRIX_DESTINATIONS = 25;

function requestGoogle(path) {
    return new Promise((resolve, reject) => {
        const request = https.get(`https://${GOOGLE_MAPS_HOST}${path}`, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                } catch (error) {
                    reject(new Error('Google Maps returned an invalid response.'));
                }
            });
        });

        request.setTimeout(10000, () => request.destroy(new Error('Google Maps request timed out.')));
        request.on('error', reject);
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

function googleServiceError(response, serviceName) {
    if (response.status === 'REQUEST_DENIED') {
        if (/billing/i.test(response.error_message || '')) {
            return `${serviceName} is unavailable because Google Cloud billing is not enabled.`;
        }
        return `${serviceName} request was denied. Check that the API is enabled and the key restrictions allow it.`;
    }
    return `${serviceName} failed with status ${response.status || 'unknown'}.`;
}

router.post('/nearby', async (req, res) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'Google Maps is not configured. Set GOOGLE_MAPS_API_KEY on the backend.' });
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
            const geocodePath = `/maps/api/geocode/json?address=${encodeURIComponent(originInput.address.trim())}&key=${encodeURIComponent(apiKey)}`;
            const geocode = await requestGoogle(geocodePath);
            if (geocode.status === 'ZERO_RESULTS') {
                return res.status(400).json({ error: 'Could not find that city or ZIP code. Try a more specific location.' });
            }
            if (geocode.status !== 'OK' || !geocode.results?.[0]?.geometry?.location) {
                return res.status(503).json({ error: googleServiceError(geocode, 'Google Geocoding') });
            }
            origin = {
                latitude: Number(geocode.results[0].geometry.location.lat),
                longitude: Number(geocode.results[0].geometry.location.lng)
            };
            formattedOrigin = geocode.results[0].formatted_address || originInput.address.trim();
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
        const destinations = nearestResorts.map((resort) => `${resort.latitude},${resort.longitude}`).join('|');
        const matrixPath = `/maps/api/distancematrix/json?origins=${encodeURIComponent(`${origin.latitude},${origin.longitude}`)}&destinations=${encodeURIComponent(destinations)}&units=imperial&key=${encodeURIComponent(apiKey)}`;
        const matrix = await requestGoogle(matrixPath);
        if (matrix.status !== 'OK' || !matrix.rows?.[0]?.elements) {
            return res.status(503).json({ error: googleServiceError(matrix, 'Google Distance Matrix') });
        }

        const distances = nearestResorts.flatMap((resort, index) => {
            const element = matrix.rows[0].elements[index];
            return element?.status === 'OK' ? [{
                slug: resort.slug,
                name: resort.name,
                distance: element.distance,
                duration: element.duration
            }] : [];
        }).sort((first, second) => first.distance.value - second.distance.value);

        return res.json({ origin: formattedOrigin, resorts: distances });
    } catch (error) {
        return res.status(502).json({ error: 'Unable to reach Google Maps.' });
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