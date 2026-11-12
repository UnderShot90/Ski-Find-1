const express = require('express');
const request = require('supertest');

jest.mock('../models/resortTerrainModel', () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn()
}));
jest.mock('../utilities/terrainResearch', () => ({
    ...jest.requireActual('../utilities/terrainResearch'),
    isConfigured: jest.fn(),
    researchTerrain: jest.fn()
}));

const ResortTerrain = require('../models/resortTerrainModel');
const terrainResearch = require('../utilities/terrainResearch');
const resortTerrainRoute = require('../routes/resortTerrain');

const app = express();
app.use(express.json());
app.use('/terrain', resortTerrainRoute);

const BREAKDOWN = { found: true, beginnerPct: 28, intermediatePct: 33, advancedPct: 39, summary: 'Big mountain.', sources: [] };

// Mongoose queries are chained with .select(); this returns a query that resolves to `value`.
const query = (value) => ({ select: jest.fn().mockResolvedValue(value) });

describe('resort terrain routes', () => {
    const previousSecret = process.env.ACCESS_TOKEN_SECRET;
    let token;

    beforeEach(() => {
        process.env.ACCESS_TOKEN_SECRET = 'test-secret';
        token = require('jsonwebtoken').sign({ id: '64b000000000000000000001', username: 'powderday' }, process.env.ACCESS_TOKEN_SECRET);
        jest.clearAllMocks();
        resortTerrainRoute.resetUsage();
        terrainResearch.isConfigured.mockReturnValue(true);
    });

    afterAll(() => {
        if (previousSecret === undefined) {
            delete process.env.ACCESS_TOKEN_SECRET;
        } else {
            process.env.ACCESS_TOKEN_SECRET = previousSecret;
        }
    });

    test('lists every breakdown that was found', async () => {
        ResortTerrain.find.mockReturnValue(query([{ resortSlug: 'killington', ...BREAKDOWN }]));

        const response = await request(app).get('/terrain');

        expect(response.status).toBe(200);
        expect(response.body[0].resortSlug).toBe('killington');
        expect(ResortTerrain.find).toHaveBeenCalledWith({ found: true });
    });

    test('requires a login to start a lookup', async () => {
        const response = await request(app).post('/terrain/killington').send({ name: 'Killington' });

        expect(response.status).toBe(401);
        expect(terrainResearch.researchTerrain).not.toHaveBeenCalled();
    });

    test('returns a stored breakdown without calling Claude', async () => {
        ResortTerrain.findOne.mockReturnValue(query({ resortSlug: 'killington', ...BREAKDOWN }));

        const response = await request(app)
            .post('/terrain/killington')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Killington' });

        expect(response.status).toBe(200);
        expect(terrainResearch.researchTerrain).not.toHaveBeenCalled();
    });

    test('looks up and stores a new breakdown', async () => {
        ResortTerrain.findOne.mockReturnValue(query(null));
        terrainResearch.researchTerrain.mockResolvedValue(BREAKDOWN);
        ResortTerrain.findOneAndUpdate.mockImplementation(async (filter, doc) => doc);

        const response = await request(app)
            .post('/terrain/killington')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Killington', region: 'VT', website: 'javascript:alert(1)' });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ resortSlug: 'killington', beginnerPct: 28 });
        // Non-http websites are dropped before they reach the prompt.
        expect(terrainResearch.researchTerrain).toHaveBeenCalledWith({ name: 'Killington', region: 'VT', website: '' });
    });

    test('explains when no API key is configured', async () => {
        ResortTerrain.findOne.mockReturnValue(query(null));
        terrainResearch.isConfigured.mockReturnValue(false);

        const response = await request(app)
            .post('/terrain/killington')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Killington' });

        expect(response.status).toBe(503);
        expect(terrainResearch.researchTerrain).not.toHaveBeenCalled();
    });

    test('rejects invalid slugs and missing names', async () => {
        const badSlug = await request(app).get('/terrain/not_valid!');
        const noName = await request(app)
            .post('/terrain/killington')
            .set('Authorization', `Bearer ${token}`)
            .send({});

        expect(badSlug.status).toBe(400);
        expect(noName.status).toBe(400);
    });
});

describe('normalizeTerrain', () => {
    const { normalizeTerrain } = jest.requireActual('../utilities/terrainResearch');

    test('rescales percentages to total 100 and keeps only web links', () => {
        expect(normalizeTerrain({ ...BREAKDOWN, beginnerPct: 30, intermediatePct: 35, advancedPct: 40, sources: ['https://a.com', 'not a url'] }))
            .toEqual({ found: true, beginnerPct: 29, intermediatePct: 33, advancedPct: 38, summary: 'Big mountain.', sources: ['https://a.com'] });
    });

    test('treats missing or nonsensical numbers as not found', () => {
        expect(normalizeTerrain({ ...BREAKDOWN, found: false })).toEqual({ found: false });
        expect(normalizeTerrain({ ...BREAKDOWN, advancedPct: 0, intermediatePct: 0 })).toEqual({ found: false });
        expect(normalizeTerrain(null)).toEqual({ found: false });
    });
});
