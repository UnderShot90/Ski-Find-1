const mongoose = require('mongoose')
const dotenv = require('dotenv')
const configureDns = require('./dns.config')
dotenv.config()

module.exports = () => {
    configureDns()
    return mongoose.connect(process.env.DB_URL)
        .then(() => {
            console.log('The backend has connected to the MongoDB database.');
        })
        .catch((error) => {
            console.error(`MongoDB is unavailable; database-backed routes may fail: ${error.message}`);
        });
}

