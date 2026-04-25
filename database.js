const fs = require('fs');
const path = require('path');

// This is the physical file where all data will be saved
const dbFile = path.join(__dirname, 'records.json');

// Permanent cloud backup link (protects data if Fly.io restarts the container)
const CLOUD_URL = 'https://kvs.zackumar.com/keys/ubstudehr_permanent_records_final';

let memoryData = {
    patients: [],
    appointments: [],
    labs: [],
    pharmacy: []
};

// 1. WAKE UP: Load data from physical file
if (fs.existsSync(dbFile)) {
    try { memoryData = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch(e){}
}

// 2. WAKE UP: Download from permanent cloud backup (in case of a Fly.io redeploy)
async function restoreFromCloud() {
    try {
        const res = await fetch(CLOUD_URL);
        if(res.ok) {
            const cloud = await res.json();
            if(cloud && cloud.patients) {
                memoryData = cloud;
                // Create the physical records.json file immediately
                fs.writeFileSync(dbFile, JSON.stringify(memoryData, null, 2));
            }
        }
    } catch(e) {}
}
restoreFromCloud();

// 3. SEND DATA
function readData() {
    return memoryData;
}

// 4. SAVE DATA (Writes to records.json AND Cloud)
function writeData(data) {
    memoryData = data;
    
    // Save locally to a physical JSON file
    fs.writeFileSync(dbFile, JSON.stringify(memoryData, null, 2));
    
    // Backup to permanent cloud
    fetch(CLOUD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memoryData)
    }).catch(e => {});
}

module.exports = { readData, writeData };