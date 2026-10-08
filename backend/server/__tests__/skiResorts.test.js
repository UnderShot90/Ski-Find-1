const express = require('express');
const EventEmitter = require('events');
const { PassThrough } = require('stream');

jest.mock('https', () => ({ get: jest.fn() }));

const https = require('https');
const skiResortsRoute = require('../routes/skiResorts');

const app = express();
app.use(express.json());
app.use('/ski', skiResortsRoute);

function mockRapidApiResponse(statusCode = 200, body = '{"ok":true}') {
    https.get.mockImplementation((url, options, callback) => {
        const upstreamResponse = new PassThrough();
        upstreamResponse.statusCode = statusCode;
        upstreamResponse.headers = { 'content-type': 'application/json' };
        process.nextTick(() => {
            callback(upstreamResponse);
            upstreamResponse.end(body);
        });

        const request = new EventEmitter();
        request.setTimeout = jest.fn();
        request.destroy = jest.fn();
        return request;
    });
}

function mockGoogleResponses(payloads) {
    https.get.mockImplementation((url, options, callback) => {
        const respond = typeof options === 'function' ? options : callback;
        const response = new PassThrough();
        response.statusCode = 200;
        response.headers = { 'content-type': 'application/json' };
        process.nextTick(() => {
            respond(response);
            response.end(JSON.stringify(payloads.shift()));
        });

        const request = new EventEmitter();
        request.setTimeout = jest.fn();
        request.destroy = jest.fn();
        return request;
    });
}

describe('ski resort API proxy', () => {
    const originalApiKey = process.env.RAPIDAPI_KEY;

    beforeEach(() => {
        process.env.RAPIDAPI_KEY = 'test-api-key';
        https.get.mockReset();
    });

    afterAll(() => {
        if (originalApiKey === undefined) {
            delete process.env.RAPIDAPI_KEY;
        } else {
            process.env.RAPIDAPI_KEY = originalApiKey;
        }
    });

    test.each([
        ['/ski/', '/'],
        ['/ski/v1/resort', '/v1/resort'],
        ['/ski/v1/resort/whistler-blackcomb', '/v1/resort/whistler-blackcomb']
    ])('forwards %s to RapidAPI', async (requestPath, upstreamPath) => {
        mockRapidApiResponse();

        const response = await require('supertest')(app).get(requestPath);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ok: true });
        expect(https.get).toHaveBeenCalledWith(
            `https://ski-resorts-and-conditions.p.rapidapi.com${upstreamPath}`,
            { headers: {
                'x-rapidapi-host': 'ski-resorts-and-conditions.p.rapidapi.com',
                'x-rapidapi-key': 'test-api-key'
            } },
            expect.any(Function)
        );
    });

    test('returns 503 when the API key is not configured', async () => {
        delete process.env.RAPIDAPI_KEY;

        const response = await require('supertest')(app).get('/ski/v1/resort');

        expect(response.status).toBe(503);
        expect(https.get).not.toHaveBeenCalled();
    });

    test('preserves upstream error status and payload', async () => {
        mockRapidApiResponse(429, '{"message":"Rate limit exceeded"}');

        const response = await require('supertest')(app).get('/ski/v1/resort');

        expect(response.status).toBe(429);
        expect(response.body).toEqual({ message: 'Rate limit exceeded' });
    });

    test('rejects malformed resort slugs', async () => {
        const response = await require('supertest')(app).get('/ski/v1/resort/bad%2Fslug');

        expect(response.status).toBe(400);
        expect(https.get).not.toHaveBeenCalled();
    });
});

describe('nearby resort distances', () => {
    const originalGoogleMapsKey = process.env.GOOGLE_MAPS_API_KEY;

    beforeEach(() => {
        process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
        https.get.mockReset();
    });

    afterAll(() => {
        if (originalGoogleMapsKey === undefined) {
            delete process.env.GOOGLE_MAPS_API_KEY;
        } else {
            process.env.GOOGLE_MAPS_API_KEY = originalGoogleMapsKey;
        }
    });

    test('geocodes a city and returns resorts sorted by driving distance', async () => {
        mockGoogleResponses([
            {
                status: 'OK',
                results: [{ formatted_address: 'Denver, CO, USA', geometry: { location: { lat: 39.7, lng: -105 } } }]
            },
            {
                status: 'OK',
                rows: [{ elements: [
                    { status: 'OK', distance: { text: '50 mi', value: 80467 }, duration: { text: '1 hour', value: 3600 } },
                    { status: 'OK', distance: { text: '100 mi', value: 160934 }, duration: { text: '2 hours', value: 7200 } }
                ] }]
            }
        ]);

        const response = await require('supertest')(app)
            .post('/ski/nearby')
            .send({
                origin: { address: 'Denver, CO' },
                resorts: [
                    { slug: 'far', name: 'Far Resort', latitude: 40, longitude: -106 },
                    { slug: 'near', name: 'Near Resort', latitude: 39.8, longitude: -105.1 }
                ]
            });

        expect(response.status).toBe(200);
        expect(response.body.origin).toBe('Denver, CO, USA');
        expect(response.body.resorts.map((resort) => resort.slug)).toEqual(['near', 'far']);
        expect(https.get).toHaveBeenCalledTimes(2);
        expect(https.get.mock.calls[0][0]).toContain('/maps/api/geocode/json');
        expect(https.get.mock.calls[1][0]).toContain('/maps/api/distancematrix/json');
    });

    test('returns 503 when the Google Maps key is not configured', async () => {
        delete process.env.GOOGLE_MAPS_API_KEY;

        const response = await require('supertest')(app)
            .post('/ski/nearby')
            .send({ origin: { latitude: 39.7, longitude: -105 }, resorts: [] });

        expect(response.status).toBe(503);
        expect(https.get).not.toHaveBeenCalled();
    });

    test('reports when Google Cloud billing blocks geocoding', async () => {
        mockGoogleResponses([{
            status: 'REQUEST_DENIED',
            error_message: 'You must enable Billing on the Google Cloud Project.'
        }]);

        const response = await require('supertest')(app)
            .post('/ski/nearby')
            .send({
                origin: { address: '98101' },
                resorts: [{ slug: 'alta', name: 'Alta', latitude: 40.583828, longitude: -111.63726 }]
            });

        expect(response.status).toBe(503);
        expect(response.body.error).toBe('Google Geocoding is unavailable because Google Cloud billing is not enabled.');
        expect(https.get).toHaveBeenCalledTimes(1);
    });
});