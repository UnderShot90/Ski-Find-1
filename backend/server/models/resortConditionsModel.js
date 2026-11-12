const mongoose = require('mongoose');

// A resort's current conditions, researched by Claude and reused until they
// are older than CONDITIONS_CACHE_HOURS. `updatedAt` is when they were looked up.
// `found: false` records that nothing current could be found, so the lookup
// is not repeated on every page view.
const resortConditionsSchema = new mongoose.Schema({
    resortSlug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    found: {
        type: Boolean,
        required: true
    },
    operatingStatus: { type: String, enum: ['open', 'closed', 'unknown'], default: 'unknown' },
    reportDate: String,
    // Any of these is null when Claude could not find it.
    tempF: Number,
    weatherSummary: String,
    forecast: String,
    newSnowIn: Number,
    baseDepthIn: Number,
    liftsOpen: Number,
    liftsTotal: Number,
    trailsOpen: Number,
    trailsTotal: Number,
    adultTicketUsd: Number,
    ticketNote: String,
    webcams: [{ _id: false, label: String, url: String }],
    summary: String,
    sources: [String],
    model: String
}, { timestamps: true });

module.exports = mongoose.model('resortConditions', resortConditionsSchema);
