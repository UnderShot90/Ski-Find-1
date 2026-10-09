const mongoose = require('mongoose');

// A comment a signed-in user left on a resort page.
// `username` is copied from the user's token when the comment is created so
// listing comments never needs a join against the users collection.
const resortCommentSchema = new mongoose.Schema({
    resortSlug: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    username: {
        type: String,
        required: true,
        trim: true
    },
    body: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    }
}, { timestamps: true });

// Comments are always fetched per resort, newest first.
resortCommentSchema.index({ resortSlug: 1, createdAt: -1 });

module.exports = mongoose.model('resortComments', resortCommentSchema);
