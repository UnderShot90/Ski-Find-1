const express = require('express');
const SavedResort = require('../models/savedResortModel');
const requireAuth = require('../utilities/requireAuth');

const router = express.Router();
const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

router.get('/', requireAuth, async (req, res) => {
    try {
        const resorts = await SavedResort.find({ userId: req.user.id }).sort({ createdAt: -1 });
        return res.json(resorts);
    } catch (error) {
        return res.status(500).json({ message: 'Unable to load saved resorts.' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    const { slug, name, country = '', region = '' } = req.body;
    if (typeof slug !== 'string' || !validSlug.test(slug) || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: 'A valid resort slug and name are required.' });
    }
    if (typeof country !== 'string' || typeof region !== 'string') {
        return res.status(400).json({ message: 'Country and region must be text.' });
    }

    try {
        const resort = await SavedResort.findOneAndUpdate(
            { userId: req.user.id, slug: slug.toLowerCase() },
            { $set: { name: name.trim(), country: country.trim(), region: region.trim() } },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );
        return res.status(201).json(resort);
    } catch (error) {
        return res.status(500).json({ message: 'Unable to save resort.' });
    }
});

router.delete('/:slug', requireAuth, async (req, res) => {
    if (!validSlug.test(req.params.slug)) {
        return res.status(400).json({ message: 'Invalid resort slug.' });
    }

    try {
        const resort = await SavedResort.findOneAndDelete({
            userId: req.user.id,
            slug: req.params.slug.toLowerCase()
        });
        if (!resort) return res.status(404).json({ message: 'Saved resort not found.' });
        return res.json({ message: 'Resort removed from saved resorts.' });
    } catch (error) {
        return res.status(500).json({ message: 'Unable to remove saved resort.' });
    }
});

module.exports = router;