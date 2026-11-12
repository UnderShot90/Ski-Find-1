const mongoose = require('mongoose');

// A resort's trail difficulty breakdown, researched once by Claude and then
// served from here so each resort costs at most one API call.
// `found: false` records that no published breakdown could be found, so the
// lookup is not repeated on every page view.
const resortTerrainSchema = new mongoose.Schema({
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
    // Percent of trails by rating; they add up to 100 when found.
    beginnerPct: Number,
    intermediatePct: Number,
    advancedPct: Number,
    summary: String,
    sources: [String],
    model: String
}, { timestamps: true });

module.exports = mongoose.model('resortTerrain', resortTerrainSchema);
