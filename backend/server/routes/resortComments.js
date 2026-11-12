const express = require('express');
const mongoose = require('mongoose');
const ResortComment = require('../models/resortCommentModel');
const CommentReport = require('../models/commentReportModel');
const { REPORT_REASONS, HIDE_THRESHOLD } = CommentReport;
const requireAuth = require('../utilities/requireAuth');

// ---------------------------------------------------------------------------
// Resort comments, mounted at /comments
//   GET    /comments/:slug       anyone can read a resort's comments (minus hidden ones)
//   POST   /comments/:slug       signed-in users add a comment
//   DELETE /comments/:slug/:id   users can delete only their own comments
//   POST   /comments/:slug/:id/report  signed-in users report someone else's comment
// ---------------------------------------------------------------------------
const router = express.Router();
const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const MAX_COMMENT_LENGTH = 1000;
const MAX_REPORT_DETAILS_LENGTH = 500;
const PAGE_SIZE = 50;

// Rejects malformed slugs before any route touches the database.
router.param('slug', (req, res, next, slug) => {
    if (!validSlug.test(slug)) {
        return res.status(400).json({ message: 'Invalid resort slug.' });
    }
    req.resortSlug = slug.toLowerCase();
    return next();
});

router.get('/:slug', async (req, res) => {
    try {
        const comments = await ResortComment.find({ resortSlug: req.resortSlug, hiddenForReview: { $ne: true } })
            .sort({ createdAt: -1 })
            .limit(PAGE_SIZE);
        return res.json(comments);
    } catch (error) {
        return res.status(500).json({ message: 'Unable to load comments.' });
    }
});

router.post('/:slug', requireAuth, async (req, res) => {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body) {
        return res.status(400).json({ message: 'Write something before posting.' });
    }
    if (body.length > MAX_COMMENT_LENGTH) {
        return res.status(400).json({ message: `Comments can be at most ${MAX_COMMENT_LENGTH} characters.` });
    }

    try {
        const comment = await ResortComment.create({
            resortSlug: req.resortSlug,
            userId: req.user.id,
            // Older tokens may lack a username; fall back to the email's name part.
            username: req.user.username || String(req.user.email || 'Skier').split('@')[0],
            body
        });
        return res.status(201).json(comment);
    } catch (error) {
        return res.status(500).json({ message: 'Unable to post comment.' });
    }
});

router.delete('/:slug/:id', requireAuth, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Invalid comment id.' });
    }

    try {
        // Matching on userId means a user can never delete someone else's comment.
        const comment = await ResortComment.findOneAndDelete({
            _id: req.params.id,
            resortSlug: req.resortSlug,
            userId: req.user.id
        });
        if (!comment) return res.status(404).json({ message: 'Comment not found.' });
        // A deleted comment no longer needs review.
        await CommentReport.deleteMany({ commentId: comment._id });
        return res.json({ message: 'Comment deleted.' });
    } catch (error) {
        return res.status(500).json({ message: 'Unable to delete comment.' });
    }
});

router.post('/:slug/:id/report', requireAuth, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Invalid comment id.' });
    }
    const reason = req.body?.reason;
    if (!REPORT_REASONS.includes(reason)) {
        return res.status(400).json({ message: 'Choose a reason for the report.' });
    }
    const details = typeof req.body?.details === 'string' ? req.body.details.trim() : '';
    if (details.length > MAX_REPORT_DETAILS_LENGTH) {
        return res.status(400).json({ message: `Report details can be at most ${MAX_REPORT_DETAILS_LENGTH} characters.` });
    }

    try {
        const comment = await ResortComment.findOne({ _id: req.params.id, resortSlug: req.resortSlug });
        if (!comment) return res.status(404).json({ message: 'Comment not found.' });
        if (String(comment.userId) === String(req.user.id)) {
            return res.status(400).json({ message: 'You cannot report your own comment.' });
        }

        await CommentReport.create({
            commentId: comment._id,
            resortSlug: req.resortSlug,
            reporterId: req.user.id,
            reason,
            details
        });

        const openReports = await CommentReport.countDocuments({ commentId: comment._id, status: 'open' });
        if (openReports >= HIDE_THRESHOLD && !comment.hiddenForReview) {
            await ResortComment.updateOne({ _id: comment._id }, { hiddenForReview: true });
        }
        return res.status(201).json({ message: 'Thanks. An admin will review this comment.' });
    } catch (error) {
        // The unique index on (commentId, reporterId) rejects repeat reports.
        if (error.code === 11000) {
            return res.status(409).json({ message: 'You have already reported this comment.' });
        }
        return res.status(500).json({ message: 'Unable to report comment.' });
    }
});

module.exports = router;
