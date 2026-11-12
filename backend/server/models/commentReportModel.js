const mongoose = require('mongoose');

const REPORT_REASONS = ['spam', 'harassment', 'offensive', 'off-topic', 'other'];
// Open reports a comment needs before it is hidden pending admin review.
const HIDE_THRESHOLD = 5;

// One user's report against one resort comment.
// Reports stay `open` until an admin reviews the comment, then become
// `dismissed` (comment kept) or `removed` (comment deleted). Reviewed reports
// are kept so the same user cannot report a kept comment again.
const commentReportSchema = new mongoose.Schema({
    commentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'resortComments',
        required: true
    },
    resortSlug: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    reporterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    reason: {
        type: String,
        enum: REPORT_REASONS,
        required: true
    },
    details: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    status: {
        type: String,
        enum: ['open', 'dismissed', 'removed'],
        default: 'open'
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users'
    },
    reviewedAt: Date
}, { timestamps: true });

// A user can report a given comment only once.
commentReportSchema.index({ commentId: 1, reporterId: 1 }, { unique: true });
// The admin queue groups open reports by comment.
commentReportSchema.index({ status: 1, commentId: 1 });

module.exports = mongoose.model('commentReports', commentReportSchema);
module.exports.REPORT_REASONS = REPORT_REASONS;
module.exports.HIDE_THRESHOLD = HIDE_THRESHOLD;
