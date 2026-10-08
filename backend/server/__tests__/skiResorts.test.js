const express = require('express');
const EventEmitter = require('events');
const { PassThrough } = require('stream');

jest.mock('https', () => ({ get: jest.fn(), request: jest.fn() }));

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

function mockHereResponses({ get = [], post = [] }) {
    https.get.mockImplementation((url, callback) => {
        const response = new PassThrough();
        response.statusCode = 200;
        response.headers = { 'content-type': 'application/json' };
        process.nextTick(() => {
            callback(response);
            response.end(JSON.stringify(get.shift()));
        });

        const request = new EventEmitter();
        request.setTimeout = jest.fn();
        request.destroy = jest.fn();
        return request;
    });

    https.request.mockImplementation((url, options, callback) => {
        let requestBody = '';
        const request = new EventEmitter();
        request.setTimeout = jest.fn();
        request.destroy = jest.fn();
        request.write = jest.fn((chunk) => { requestBody += chunk; });
        request.end = jest.fn(() => {
            const response = new PassThrough();
            response.statusCode = 200;
            process.nextTick(() => {
                callback(response);
                response.end(JSON.stringify(post.shift()));
            });
        });
        request.url = url;
        request.options = options;
        request.getBody = () => JSON.parse(requestBody);
        return request;
    });
}

describe('ski resort API proxy', () => {
    const originalApiKey = process.env.RAPIDAPI_KEY;

    beforeEach(() => {
        process.env.RAPIDAPI_KEY = 'test-api-key';
        https.get.mockReset();
        https.request.mockReset();
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
    const originalHereKey = process.env.HERE_API_KEY;

    beforeEach(() => {
        process.env.HERE_API_KEY = 'test-here-key';
        https.get.mockReset();
        https.request.mockReset();
    });

    afterAll(() => {
        if (originalHereKey === undefined) {
            delete process.env.HERE_API_KEY;
        } else {
            process.env.HERE_API_KEY = originalHereKey;
        }
    });

    test('geocodes a city and returns HERE matrix distances sorted by route length', async () => {
        mockHereResponses({
            get: [{
                items: [{ title: 'Denver, CO, United States', position: { lat: 39.7, lng: -105 } }]
            }],
            post: [{
                matrix: {
                    numOrigins: 1,
                    numDestinations: 2,
                    distances: [80467, 160934],
                    travelTimes: [3600, 7200]
                }
            }]
        });

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
        expect(response.body.origin).toBe('Denver, CO, United States');
        expect(response.body.resorts.map((resort) => resort.slug)).toEqual(['near', 'far']);
        expect(response.body.resorts[0].distance).toEqual({ text: '50.0 mi', value: 80467 });
        expect(response.body.resorts[0].duration).toEqual({ text: '1 hr', value: 3600 });
        expect(https.get).toHaveBeenCalledTimes(1);
        expect(String(https.get.mock.calls[0][0])).toContain('https://geocode.search.hereapi.com/v1/geocode');
        expect(String(https.get.mock.calls[0][0])).toContain('q=Denver%2C+CO');
        expect(https.request).toHaveBeenCalledTimes(1);
        const matrixRequest = https.request.mock.results[0].value;
        expect(String(matrixRequest.url)).toContain('https://matrix.router.hereapi.com/v8/matrix');
        expect(matrixRequest.getBody().origins).toEqual([{ lat: 39.7, lng: -105 }]);
        expect(matrixRequest.getBody().destinations).toHaveLength(2);
    });

    test('returns 503 when the HERE API key is not configured', async () => {
        delete process.env.HERE_API_KEY;

        const response = await require('supertest')(app)
            .post('/ski/nearby')
            .send({ origin: { latitude: 39.7, longitude: -105 }, resorts: [] });

        expect(response.status).toBe(503);
        expect(https.get).not.toHaveBeenCalled();
        expect(https.request).not.toHaveBeenCalled();
    });

    test('returns a clear error when HERE cannot geocode the location', async () => {
        mockHereResponses({ get: [{ items: [] }] });

        const response = await require('supertest')(app)
            .post('/ski/nearby')
            .send({
                origin: { address: '98101' },
                resorts: [{ slug: 'alta', name: 'Alta', latitude: 40.583828, longitude: -111.63726 }]
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Could not find that city or ZIP code. Try a more specific location.');
        expect(https.get).toHaveBeenCalledTimes(1);
        expect(https.request).not.toHaveBeenCalled();
    });
});