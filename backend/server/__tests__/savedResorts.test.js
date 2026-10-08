const express = require('express');
const request = require('supertest');

jest.mock('../models/savedResortModel', () => ({
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOneAndDelete: jest.fn()
}));

const SavedResort = require('../models/savedResortModel');
const savedResortsRoute = require('../routes/savedResorts');

const app = express();
app.use(express.json());
app.use('/resorts', savedResortsRoute);

describe('saved resort routes', () => {
    const previousSecret = process.env.ACCESS_TOKEN_SECRET;
    let token;

    beforeEach(() => {
        process.env.ACCESS_TOKEN_SECRET = 'test-secret';
        token = require('jsonwebtoken').sign({ id: '64b000000000000000000001' }, process.env.ACCESS_TOKEN_SECRET);
        jest.clearAllMocks();
    });

    afterAll(() => {
        if (previousSecret === undefined) {
            delete process.env.ACCESS_TOKEN_SECRET;
        } else {
            process.env.ACCESS_TOKEN_SECRET = previousSecret;
        }
    });

    test('requires a valid bearer token', async () => {
        const response = await request(app).get('/resorts');

        expect(response.status).toBe(401);
        expect(SavedResort.find).not.toHaveBeenCalled();
    });

    test('lists only the authenticated user’s resorts', async () => {
        const saved = [{ slug: 'whistler-blackcomb' }];
        SavedResort.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(saved) });

        const response = await request(app).get('/resorts').set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(saved);
        expect(SavedResort.find).toHaveBeenCalledWith({ userId: '64b000000000000000000001' });
    });

    test('saves a resort for the authenticated user', async () => {
        SavedResort.findOneAndUpdate.mockResolvedValue({ slug: 'whistler-blackcomb', name: 'Whistler Blackcomb' });

        const response = await request(app)
            .post('/resorts')
            .set('Authorization', `Bearer ${token}`)
            .send({ slug: 'Whistler-Blackcomb', name: ' Whistler Blackcomb ' });

        expect(response.status).toBe(201);
        expect(SavedResort.findOneAndUpdate).toHaveBeenCalledWith(
            { userId: '64b000000000000000000001', slug: 'whistler-blackcomb' },
            { $set: { name: 'Whistler Blackcomb', country: '', region: '' } },
            expect.objectContaining({ upsert: true, new: true })
        );
    });

    test('rejects malformed resort data', async () => {
        const response = await request(app)
            .post('/resorts')
            .set('Authorization', `Bearer ${token}`)
            .send({ slug: '../private', name: 'Not a resort' });

        expect(response.status).toBe(400);
        expect(SavedResort.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('removes only a resort belonging to the authenticated user', async () => {
        SavedResort.findOneAndDelete.mockResolvedValue({ slug: 'whistler-blackcomb' });

        const response = await request(app)
            .delete('/resorts/whistler-blackcomb')
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(SavedResort.findOneAndDelete).toHaveBeenCalledWith({
            userId: '64b000000000000000000001',
            slug: 'whistler-blackcomb'
        });
    });
});