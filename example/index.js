
// Example usage:
const dbFilePath = path.resolve(__dirname, 'users.database');
const dbSchema = {
    '12345678910': { xp: 0, coins: 0, loves: [] },
    '9876543210': { xp: 10, coins: 100, loves: ['bird'] }
};
const db = new NitroDB(dbFilePath, dbSchema);

// Set initial user data
db.set('12345678910', { xp: 0, coins: 0, loves: [] });
db.set('9876543210', { xp: 10, coins: 100, loves: ['bird'] });

// Query for users with more than 50 coins
const richUsers = db.query(data => data.coins > 50);
console.log('Rich users:', richUsers);

// Transaction example: Increment XP for all users
db.transaction(() => {
    const users = db.query(() => true);
    users.forEach(user => {
        db.set(user.key + '.xp', user.value.xp + 1);
    });
});

// Backup the database
const backupFilePath = path.resolve(__dirname, 'backup.users.database');
db.backup(backupFilePath);

// Restore the database from backup
const restoredDB = new NitroDB(dbFilePath);
restoredDB.restore(backupFilePath);

console.log('Restored data:', restoredDB);
