const express = require('express');
const mongoose = require('mongoose');
const ResortComment = require('../models/resortCommentModel');
const requireAuth = require('../utilities/requireAuth');

// ---------------------------------------------------------------------------
// Resort comments, mounted at /comments
//   GET    /comments/:slug       anyone can read a resort's comments
//   POST   /comments/:slug       signed-in users add a comment
//   DELETE /comments/:slug/:id   users can delete only their own comments
// ---------------------------------------------------------------------------
const router = express.Router();
const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const MAX_COMMENT_LENGTH = 1000;
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
        const comments = await ResortComment.find({ resortSlug: req.resortSlug })
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
        return res.json({ message: 'Comment deleted.' });
    } catch (error) {
        return res.status(500).json({ message: 'Unable to delete comment.' });
    }
});

module.exports = router;
