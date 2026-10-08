const mongoose = require('mongoose');

const savedResortSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    slug: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    country: {
        type: String,
        default: ''
    },
    region: {
        type: String,
        default: ''
    }
}, { timestamps: true });

savedResortSchema.index({ userId: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('savedResorts', savedResortSchema);