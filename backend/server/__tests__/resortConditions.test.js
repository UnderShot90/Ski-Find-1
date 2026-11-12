const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../models/resortConditionsModel', () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndReplace: jest.fn()
}));
jest.mock('../models/userModel', () => ({ findById: jest.fn() }));
jest.mock('../utilities/conditionsResearch', () => ({
    ...jest.requireActual('../utilities/conditionsResearch'),
    isConfigured: jest.fn(),
    researchConditions: jest.fn()
}));

const ResortConditions = require('../models/resortConditionsModel');
const userModel = require('../models/userModel');
const conditionsResearch = require('../utilities/conditionsResearch');
const resortConditionsRoute = require('../routes/resortConditions');

const app = express();
app.use(express.json());
app.use('/conditions', resortConditionsRoute);

const HOUR = 60 * 60 * 1000;
const REPORT = { found: true, operatingStatus: 'open', newSnowIn: 4, liftsOpen: 12, liftsTotal: 21 };

// Mongoose queries are chained with .select(); this returns a query that resolves to `value`.
const query = (value) => ({ select: jest.fn().mockResolvedValue(value) });
const hoursAgo = (hours) => new Date(Date.now() - hours * HOUR).toISOString();
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('resort conditions routes', () => {
    const previousSecret = process.env.ACCESS_TOKEN_SECRET;
    let token;

    beforeEach(() => {
        process.env.ACCESS_TOKEN_SECRET = 'test-secret';
        token = `Bearer ${jwt.sign({ id: '64b000000000000000000001', username: 'powderday' }, process.env.ACCESS_TOKEN_SECRET)}`;
        jest.clearAllMocks();
        resortConditionsRoute.resetUsage();
        conditionsResearch.isConfigured.mockReturnValue(true);
    });

    afterAll(() => {
        if (previousSecret === undefined) {
            delete process.env.ACCESS_TOKEN_SECRET;
        } else {
            process.env.ACCESS_TOKEN_SECRET = previousSecret;
        }
    });

    test('lists stored reports and marks old ones stale', async () => {
        ResortConditions.find.mockReturnValue(query([
            { resortSlug: 'killington', ...REPORT, updatedAt: hoursAgo(1) },
            { resortSlug: 'stowe', ...REPORT, updatedAt: hoursAgo(30) }
        ]));

        const response = await request(app).get('/conditions');

        expect(response.status).toBe(200);
        expect(ResortConditions.find).toHaveBeenCalledWith({ found: true });
        expect(response.body.map((report) => report.stale)).toEqual([false, true]);
    });

    test('requires a login to refresh a resort', async () => {
        const response = await request(app).post('/conditions/killington').send({ name: 'Killington' });

        expect(response.status).toBe(401);
        expect(conditionsResearch.researchConditions).not.toHaveBeenCalled();
    });

    test('returns a fresh stored report without calling Claude', async () => {
        ResortConditions.findOne.mockReturnValue(query({ resortSlug: 'killington', ...REPORT, updatedAt: hoursAgo(1) }));

        const response = await request(app).post('/conditions/killington').set('Authorization', token).send({ name: 'Killington' });

        expect(response.status).toBe(200);
        expect(response.body.stale).toBe(false);
        expect(conditionsResearch.researchConditions).not.toHaveBeenCalled();
    });

    test('researches a stale report and replaces it', async () => {
        ResortConditions.findOne.mockReturnValue(query({ resortSlug: 'killington', ...REPORT, updatedAt: hoursAgo(12) }));
        conditionsResearch.researchConditions.mockResolvedValue(REPORT);
        ResortConditions.findOneAndReplace.mockResolvedValue({ resortSlug: 'killington', ...REPORT, updatedAt: new Date().toISOString() });

        const response = await request(app)
            .post('/conditions/Killington')
            .set('Authorization', token)
            .send({ name: 'Killington', region: 'VT', website: 'javascript:alert(1)' });

        expect(response.status).toBe(201);
        expect(response.body.stale).toBe(false);
        expect(conditionsResearch.researchConditions).toHaveBeenCalledWith({ slug: 'killington', name: 'Killington', region: 'VT', website: '' });
        expect(ResortConditions.findOneAndReplace.mock.calls[0][1]).toMatchObject({ ...REPORT, resortSlug: 'killington' });
    });

    test('shares one lookup between simultaneous requests', async () => {
        ResortConditions.findOne.mockReturnValue(query(null));
        let finish;
        conditionsResearch.researchConditions.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
        ResortConditions.findOneAndReplace.mockResolvedValue({ resortSlug: 'killington', ...REPORT, updatedAt: new Date().toISOString() });

        const send = () => request(app).post('/conditions/killington').set('Authorization', token).send({ name: 'Killington' });
        const pending = [send(), send()].map((test) => test.then((response) => response));
        await new Promise((resolve) => setTimeout(resolve, 50));
        finish(REPORT);
        const responses = await Promise.all(pending);

        expect(responses.map((response) => response.status)).toEqual([201, 201]);
        expect(conditionsResearch.researchConditions).toHaveBeenCalledTimes(1);
    });

    test('explains when the API key is missing', async () => {
        ResortConditions.findOne.mockReturnValue(query(null));
        conditionsResearch.isConfigured.mockReturnValue(false);

        const response = await request(app).post('/conditions/killington').set('Authorization', token).send({ name: 'Killington' });

        expect(response.status).toBe(503);
        expect(conditionsResearch.researchConditions).not.toHaveBeenCalled();
    });

    describe('bulk refresh', () => {
        const resorts = [
            { slug: 'killington', name: 'Killington', region: 'VT' },
            { slug: 'stowe', name: 'Stowe', region: 'VT' },
            { slug: 'bad slug!', name: 'Nope' }
        ];

        test('is admin only', async () => {
            userModel.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ isAdmin: false }) });

            const response = await request(app).post('/conditions/refresh').set('Authorization', token).send({ resorts });

            expect(response.status).toBe(403);
        });

        test('skips fresh reports and researches the rest in the background', async () => {
            userModel.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ isAdmin: true }) });
            ResortConditions.find.mockReturnValue(query([{ resortSlug: 'killington', updatedAt: hoursAgo(1) }]));
            conditionsResearch.researchConditions.mockResolvedValue(REPORT);
            ResortConditions.findOneAndReplace.mockResolvedValue({ resortSlug: 'stowe', ...REPORT });

            const response = await request(app).post('/conditions/refresh').set('Authorization', token).send({ resorts });

            expect(response.status).toBe(202);
            expect(response.body).toMatchObject({ running: true, total: 1, alreadyFresh: 1 });
            await flush();
            expect(conditionsResearch.researchConditions).toHaveBeenCalledTimes(1);
            expect(conditionsResearch.researchConditions.mock.calls[0][0].slug).toBe('stowe');

            const status = await request(app).get('/conditions/refresh').set('Authorization', token);
            expect(status.body).toMatchObject({ running: false, done: 1, failed: 0 });
        });
    });
});

describe('normalizeConditions', () => {
    const { normalizeConditions } = jest.requireActual('../utilities/conditionsResearch');

    test('keeps plausible values and drops impossible ones', () => {
        const conditions = normalizeConditions({
            found: true,
            operatingStatus: 'open',
            reportDate: '2026-01-15',
            tempF: 18.26,
            weatherSummary: ' Light snow ',
            forecast: '',
            newSnowIn: -3,
            baseDepthIn: 40,
            liftsOpen: 25,
            liftsTotal: 21,
            trailsOpen: 100,
            trailsTotal: 155,
            adultTicketUsd: 0,
            ticketNote: 'Window price',
            webcams: [{ label: 'Summit', url: 'https://example.com/cam' }, { label: 'Bad', url: 'javascript:alert(1)' }],
            summary: 'Good day.',
            sources: ['https://example.com', 'not a url']
        });

        expect(conditions).toMatchObject({
            found: true,
            tempF: 18.3,
            weatherSummary: 'Light snow',
            newSnowIn: null,
            baseDepthIn: 40,
            // More lifts open than exist is a bad reading, so both are dropped.
            liftsOpen: null,
            liftsTotal: null,
            trailsOpen: 100,
            trailsTotal: 155,
            adultTicketUsd: null,
            webcams: [{ label: 'Summit', url: 'https://example.com/cam' }],
            sources: ['https://example.com']
        });
    });

    test('returns found: false when nothing was found', () => {
        expect(normalizeConditions({ found: false, tempF: 20 })).toEqual({ found: false });
    });
});
