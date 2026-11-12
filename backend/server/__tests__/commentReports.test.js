const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../models/resortCommentModel', () => ({
    findOne: jest.fn(),
    findOneAndDelete: jest.fn(),
    findByIdAndDelete: jest.fn(),
    updateOne: jest.fn()
}));
jest.mock('../models/commentReportModel', () => ({
    REPORT_REASONS: ['spam', 'harassment', 'offensive', 'off-topic', 'other'],
    HIDE_THRESHOLD: 5,
    create: jest.fn(),
    countDocuments: jest.fn(),
    deleteMany: jest.fn(),
    aggregate: jest.fn(),
    updateMany: jest.fn()
}));
jest.mock('../models/userModel', () => ({ findById: jest.fn() }));

const ResortComment = require('../models/resortCommentModel');
const CommentReport = require('../models/commentReportModel');
const userModel = require('../models/userModel');

const app = express();
app.use(express.json());
app.use('/comments', require('../routes/resortComments'));
app.use('/admin', require('../routes/adminReports'));

const USER_ID = '64b000000000000000000001';
const AUTHOR_ID = '64b000000000000000000002';
const COMMENT_ID = '64b0000000000000000000aa';

function mockAdmin(isAdmin) {
    userModel.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ isAdmin }) });
}

describe('comment reports', () => {
    const previousSecret = process.env.ACCESS_TOKEN_SECRET;
    let token;

    beforeEach(() => {
        process.env.ACCESS_TOKEN_SECRET = 'test-secret';
        token = jwt.sign({ id: USER_ID, username: 'powderday' }, process.env.ACCESS_TOKEN_SECRET);
        jest.clearAllMocks();
    });

    afterAll(() => {
        if (previousSecret === undefined) {
            delete process.env.ACCESS_TOKEN_SECRET;
        } else {
            process.env.ACCESS_TOKEN_SECRET = previousSecret;
        }
    });

    describe('POST /comments/:slug/:id/report', () => {
        const report = (body) => request(app)
            .post(`/comments/killington/${COMMENT_ID}/report`)
            .set('Authorization', `Bearer ${token}`)
            .send(body);

        test('requires a login', async () => {
            const response = await request(app).post(`/comments/killington/${COMMENT_ID}/report`).send({ reason: 'spam' });

            expect(response.status).toBe(401);
            expect(CommentReport.create).not.toHaveBeenCalled();
        });

        test('records a report against another user’s comment', async () => {
            ResortComment.findOne.mockResolvedValue({ _id: COMMENT_ID, userId: AUTHOR_ID });
            CommentReport.create.mockResolvedValue({});

            const response = await report({ reason: 'spam', details: '  Selling lift tickets  ' });

            expect(response.status).toBe(201);
            expect(ResortComment.findOne).toHaveBeenCalledWith({ _id: COMMENT_ID, resortSlug: 'killington' });
            expect(CommentReport.create).toHaveBeenCalledWith({
                commentId: COMMENT_ID,
                resortSlug: 'killington',
                reporterId: USER_ID,
                reason: 'spam',
                details: 'Selling lift tickets'
            });
        });

        test.each([
            [4, false],
            [5, true]
        ])('with %i open reports, hides the comment: %s', async (openReports, hidden) => {
            ResortComment.findOne.mockResolvedValue({ _id: COMMENT_ID, userId: AUTHOR_ID, hiddenForReview: false });
            CommentReport.create.mockResolvedValue({});
            CommentReport.countDocuments.mockResolvedValue(openReports);

            const response = await report({ reason: 'spam' });

            expect(response.status).toBe(201);
            expect(CommentReport.countDocuments).toHaveBeenCalledWith({ commentId: COMMENT_ID, status: 'open' });
            if (hidden) {
                expect(ResortComment.updateOne).toHaveBeenCalledWith({ _id: COMMENT_ID }, { hiddenForReview: true });
            } else {
                expect(ResortComment.updateOne).not.toHaveBeenCalled();
            }
        });

        test('rejects an unknown reason', async () => {
            const response = await report({ reason: 'boring' });

            expect(response.status).toBe(400);
            expect(ResortComment.findOne).not.toHaveBeenCalled();
        });

        test('does not let users report their own comment', async () => {
            ResortComment.findOne.mockResolvedValue({ _id: COMMENT_ID, userId: USER_ID });

            const response = await report({ reason: 'spam' });

            expect(response.status).toBe(400);
            expect(CommentReport.create).not.toHaveBeenCalled();
        });

        test('returns 409 when the user already reported the comment', async () => {
            ResortComment.findOne.mockResolvedValue({ _id: COMMENT_ID, userId: AUTHOR_ID });
            CommentReport.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));

            const response = await report({ reason: 'offensive' });

            expect(response.status).toBe(409);
        });

        test('returns 404 for a missing comment', async () => {
            ResortComment.findOne.mockResolvedValue(null);

            const response = await report({ reason: 'spam' });

            expect(response.status).toBe(404);
        });
    });

    test('deleting your own comment clears its reports', async () => {
        ResortComment.findOneAndDelete.mockResolvedValue({ _id: COMMENT_ID });

        const response = await request(app)
            .delete(`/comments/killington/${COMMENT_ID}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(CommentReport.deleteMany).toHaveBeenCalledWith({ commentId: COMMENT_ID });
    });

    describe('admin review queue', () => {
        test('rejects signed-in users who are not admins', async () => {
            mockAdmin(false);

            const response = await request(app).get('/admin/reports').set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(CommentReport.aggregate).not.toHaveBeenCalled();
        });

        test('does not trust an isAdmin claim in the token', async () => {
            mockAdmin(false);
            const forged = jwt.sign({ id: USER_ID, isAdmin: true }, process.env.ACCESS_TOKEN_SECRET);

            const response = await request(app).get('/admin/reports').set('Authorization', `Bearer ${forged}`);

            expect(response.status).toBe(403);
        });

        test('lists open reports grouped by comment, most reported first', async () => {
            mockAdmin(true);
            const queue = [{ comment: { body: 'Spam' }, reportCount: 3 }];
            CommentReport.aggregate.mockResolvedValue(queue);

            const response = await request(app).get('/admin/reports').set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual(queue);
            const pipeline = CommentReport.aggregate.mock.calls[0][0];
            expect(pipeline[0]).toEqual({ $match: { status: 'open' } });
            expect(pipeline).toContainEqual({ $sort: { reportCount: -1, lastReportedAt: -1 } });
        });

        test('dismissing keeps the comment and closes its reports', async () => {
            mockAdmin(true);
            CommentReport.updateMany.mockResolvedValue({ modifiedCount: 2 });

            const response = await request(app)
                .post(`/admin/reports/${COMMENT_ID}/dismiss`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(ResortComment.findByIdAndDelete).not.toHaveBeenCalled();
            const [filter, update] = CommentReport.updateMany.mock.calls[0];
            expect(String(filter.commentId)).toBe(COMMENT_ID);
            expect(filter.status).toBe('open');
            expect(update).toMatchObject({ status: 'dismissed', reviewedBy: USER_ID });
            const [unhideFilter, unhide] = ResortComment.updateOne.mock.calls[0];
            expect(String(unhideFilter._id)).toBe(COMMENT_ID);
            expect(unhide).toEqual({ hiddenForReview: false });
        });

        test('removing deletes the comment and closes its reports', async () => {
            mockAdmin(true);
            ResortComment.findByIdAndDelete.mockResolvedValue({ _id: COMMENT_ID });
            CommentReport.updateMany.mockResolvedValue({ modifiedCount: 3 });

            const response = await request(app)
                .delete(`/admin/reports/${COMMENT_ID}`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(String(ResortComment.findByIdAndDelete.mock.calls[0][0])).toBe(COMMENT_ID);
            expect(CommentReport.updateMany.mock.calls[0][1]).toMatchObject({ status: 'removed' });
        });

        test('returns 404 when removing a comment that no longer exists', async () => {
            mockAdmin(true);
            ResortComment.findByIdAndDelete.mockResolvedValue(null);

            const response = await request(app)
                .delete(`/admin/reports/${COMMENT_ID}`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(404);
            expect(CommentReport.updateMany).not.toHaveBeenCalled();
        });
    });
});
