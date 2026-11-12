const userModel = require('../models/userModel');

// Use after requireAuth. Admin rights are read from the database on every
// request rather than trusted from the token, so revoking an admin takes
// effect immediately instead of when their token expires.
async function requireAdmin(req, res, next) {
    try {
        const user = await userModel.findById(req.user.id).select('isAdmin');
        if (!user || !user.isAdmin) {
            return res.status(403).json({ message: 'Admin access required.' });
        }
        return next();
    } catch (error) {
        return res.status(500).json({ message: 'Unable to verify admin access.' });
    }
}

module.exports = requireAdmin;
