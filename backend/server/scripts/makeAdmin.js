// Grants (or with --revoke, removes) admin rights for an existing user.
//   node scripts/makeAdmin.js <username>
//   node scripts/makeAdmin.js <username> --revoke
// The user must sign in again for the admin link to appear in the navbar.
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const userModel = require('../models/userModel');
const configureDns = require('../config/dns.config');

async function main() {
    const [username, flag] = process.argv.slice(2);
    if (!username) {
        console.error('Usage: node scripts/makeAdmin.js <username> [--revoke]');
        process.exit(1);
    }
    const isAdmin = flag !== '--revoke';

    configureDns();
    await mongoose.connect(process.env.DB_URL);
    const user = await userModel.findOneAndUpdate({ username }, { isAdmin }, { new: true });
    if (!user) {
        console.error(`No user named "${username}".`);
        process.exitCode = 1;
    } else {
        console.log(`${user.username} is ${isAdmin ? 'now an admin' : 'no longer an admin'}.`);
    }
    await mongoose.disconnect();
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
