const express = require('express');
const request = require('supertest');

jest.mock('../models/resortCommentModel', () => ({
    find: jest.fn(),
    create: jest.fn(),
    findOneAndDelete: jest.fn()
}));

const ResortComment = require('../models/resortCommentModel');
const resortCommentsRoute = require('../routes/resortComments');

const app = express();
app.use(express.json());
app.use('/comments', resortCommentsRoute);

const USER_ID = '64b000000000000000000001';
const COMMENT_ID = '64b0000000000000000000aa';

describe('resort comment routes', () => {
    const previousSecret = process.env.ACCESS_TOKEN_SECRET;
    let token;

    beforeEach(() => {
        process.env.ACCESS_TOKEN_SECRET = 'test-secret';
        token = require('jsonwebtoken').sign({ id: USER_ID, username: 'powderday', email: 'p@example.com' }, process.env.ACCESS_TOKEN_SECRET);
        jest.clearAllMocks();
    });

    afterAll(() => {
        if (previousSecret === undefined) {
            delete process.env.ACCESS_TOKEN_SECRET;
        } else {
            process.env.ACCESS_TOKEN_SECRET = previousSecret;
        }
    });

    test('lists a resort’s comments newest first without signing in', async () => {
        const comments = [{ body: 'Great glades' }];
        const limit = jest.fn().mockResolvedValue(comments);
        const sort = jest.fn().mockReturnValue({ limit });
        ResortComment.find.mockReturnValue({ sort });

        const response = await request(app).get('/comments/Killington');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(comments);
        expect(ResortComment.find).toHaveBeenCalledWith({ resortSlug: 'killington' });
        expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    test('requires a login to post', async () => {
        const response = await request(app).post('/comments/killington').send({ body: 'Hello' });

        expect(response.status).toBe(401);
        expect(ResortComment.create).not.toHaveBeenCalled();
    });

    test('creates a comment with the username from the token', async () => {
        ResortComment.create.mockImplementation(async (doc) => ({ _id: COMMENT_ID, ...doc }));

        const response = await request(app)
            .post('/comments/killington')
            .set('Authorization', `Bearer ${token}`)
            .send({ body: '  Fresh corduroy all morning.  ', username: 'impostor' });

        expect(response.status).toBe(201);
        expect(ResortComment.create).toHaveBeenCalledWith({
            resortSlug: 'killington',
            userId: USER_ID,
            username: 'powderday',
            body: 'Fresh corduroy all morning.'
        });
    });

    test.each([
        ['empty', '   '],
        ['too long', 'x'.repeat(1001)]
    ])('rejects %s comments', async (label, body) => {
        const response = await request(app)
            .post('/comments/killington')
            .set('Authorization', `Bearer ${token}`)
            .send({ body });

        expect(response.status).toBe(400);
        expect(ResortComment.create).not.toHaveBeenCalled();
    });

    test('rejects malformed slugs', async () => {
        const response = await request(app).get('/comments/bad_slug!');

        expect(response.status).toBe(400);
        expect(ResortComment.find).not.toHaveBeenCalled();
    });

    test('only deletes the signed-in user’s own comment', async () => {
        ResortComment.findOneAndDelete.mockResolvedValue({ _id: COMMENT_ID });

        const response = await request(app)
            .delete(`/comments/killington/${COMMENT_ID}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(ResortComment.findOneAndDelete).toHaveBeenCalledWith({
            _id: COMMENT_ID,
            resortSlug: 'killington',
            userId: USER_ID
        });
    });

    test('returns 404 when deleting a comment the user does not own', async () => {
        ResortComment.findOneAndDelete.mockResolvedValue(null);

        const response = await request(app)
            .delete(`/comments/killington/${COMMENT_ID}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(404);
    });
});
