const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
    const authorization = req.get('Authorization') || '';
    const token = authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : null;

    if (!token || !process.env.ACCESS_TOKEN_SECRET) {
        return res.status(401).json({ message: 'Authentication required.' });
    }

    try {
        req.user = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        if (!req.user.id) {
            return res.status(401).json({ message: 'Invalid access token.' });
        }
        return next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired access token.' });
    }
}

module.exports = requireAuth;