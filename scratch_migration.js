const sql = require('mssql');
const fs = require('fs');

const config = {
    user: 'sa',
    password: 'YourStrong!Pass123',
    server: 'localhost',
    database: 'csdl',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(config);
        const migration = fs.readFileSync('database/migrations/004_add_validation_constraints.sql', 'utf8');
        const batches = migration.split('GO');
        for (const batch of batches) {
            if (batch.trim()) {
                console.log('Running batch...');
                await sql.query(batch);
            }
        }
        console.log('Migration applied successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
