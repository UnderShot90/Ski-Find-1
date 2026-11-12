const express = require('express');
const mongoose = require('mongoose');
const ResortComment = require('../models/resortCommentModel');
const CommentReport = require('../models/commentReportModel');
const requireAuth = require('../utilities/requireAuth');
const requireAdmin = require('../utilities/requireAdmin');

// ---------------------------------------------------------------------------
// Comment report review queue, mounted at /admin (admins only)
//   GET    /admin/reports              reported comments, most reports first
//   POST   /admin/reports/:id/dismiss  keep the comment (unhiding it), close its reports
//   DELETE /admin/reports/:id          delete the comment, close its reports
// `:id` is the reported comment's id.
// ---------------------------------------------------------------------------
const router = express.Router();
const QUEUE_SIZE = 50;

router.use(requireAuth, requireAdmin);

router.param('id', (req, res, next, id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid comment id.' });
    }
    req.commentId = new mongoose.Types.ObjectId(id);
    return next();
});

router.get('/reports', async (req, res) => {
    try {
        const queue = await CommentReport.aggregate([
            { $match: { status: 'open' } },
            {
                $group: {
                    _id: '$commentId',
                    reportCount: { $sum: 1 },
                    reasons: { $push: '$reason' },
                    details: { $push: '$details' },
                    lastReportedAt: { $max: '$createdAt' }
                }
            },
            { $sort: { reportCount: -1, lastReportedAt: -1 } },
            { $limit: QUEUE_SIZE },
            { $lookup: { from: 'resortcomments', localField: '_id', foreignField: '_id', as: 'comment' } },
            { $unwind: '$comment' },
            {
                $project: {
                    _id: 0,
                    comment: 1,
                    reportCount: 1,
                    reasons: 1,
                    // Only the notes reporters actually wrote.
                    details: { $filter: { input: '$details', cond: { $ne: ['$$this', ''] } } },
                    lastReportedAt: 1
                }
            }
        ]);
        return res.json(queue);
    } catch (error) {
        return res.status(500).json({ message: 'Unable to load reports.' });
    }
});

// Marks every open report on the comment as reviewed with the given outcome.
function closeReports(req, status) {
    return CommentReport.updateMany(
        { commentId: req.commentId, status: 'open' },
        { status, reviewedBy: req.user.id, reviewedAt: new Date() }
    );
}

router.post('/reports/:id/dismiss', async (req, res) => {
    try {
        const result = await closeReports(req, 'dismissed');
        if (!result.modifiedCount) return res.status(404).json({ message: 'No open reports for this comment.' });
        // A kept comment goes back on the resort page.
        await ResortComment.updateOne({ _id: req.commentId }, { hiddenForReview: false });
        return res.json({ message: 'Reports dismissed.' });
    } catch (error) {
        return res.status(500).json({ message: 'Unable to dismiss reports.' });
    }
});

router.delete('/reports/:id', async (req, res) => {
    try {
        const comment = await ResortComment.findByIdAndDelete(req.commentId);
        if (!comment) return res.status(404).json({ message: 'Comment not found.' });
        await closeReports(req, 'removed');
        return res.json({ message: 'Comment removed.' });
    } catch (error) {
        return res.status(500).json({ message: 'Unable to remove comment.' });
    }
});

module.exports = router;
