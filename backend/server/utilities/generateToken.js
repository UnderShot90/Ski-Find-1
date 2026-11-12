const jwt = require('jsonwebtoken')
const dotenv = require('dotenv');
dotenv.config();

const generateAccessToken = (userId, email, username, isAdmin = false) => {
    // isAdmin only drives what the UI shows; admin routes re-check the database.
    return jwt.sign({ id: userId, email, username, isAdmin }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
    })
}

module.exports.generateAccessToken = generateAccessToken
