const fs = require('fs');
const path = require('path');

// The file located inside the Fly.io live server
const dbFile = path.join(__dirname, 'records.json');

// Permanent cloud backup (Invincible against Fly.io server restarts)
const CLOUD_URL = 'https://kvs.zackumar.com/keys/ubstudehr_permanent_records_final';

let memoryData = {
    patients: [],
    appointments: [],
    labs: [],
    pharmacy: []
};

// 1. WAKE UP: Load data from the server's physical file
if (fs.existsSync(dbFile)) {
    try { 
        memoryData = JSON.parse(fs.readFileSync(dbFile, 'utf8')); 
        console.log("Loaded data from local records.json");
    } catch(e){
        console.error("Error reading local file", e);
    }
}

// 2. WAKE UP: Aggressively download from permanent cloud backup
async function restoreFromCloud() {
    try {
        const res = await fetch(CLOUD_URL);
        if(res.ok) {
            const cloud = await res.json();
            if(cloud && cloud.patients) {
                memoryData = cloud;
                // Force write the cloud data into the server's records.json
                fs.writeFileSync(dbFile, JSON.stringify(memoryData, null, 2), 'utf8');
                console.log("Successfully restored data from Cloud Backup!");
            }
        }
    } catch(e) {
        console.error("Cloud restore failed, using local data.");
    }
}
restoreFromCloud();

// 3. SEND DATA
function readData() {
    return memoryData;
}

// 4. SAVE DATA (Writes to server records.json AND Cloud)
function writeData(data) {
    memoryData = data;
    
    // Save to the Fly.io Server's physical hard drive
    try {
        fs.writeFileSync(dbFile, JSON.stringify(memoryData, null, 2), 'utf8');
    } catch (e) {
        console.error("Failed to write to local records.json", e);
    }
    
    // Backup to permanent cloud instantly
    try {
        fetch(CLOUD_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(memoryData)
        }).catch(e => console.error("Cloud backup post failed", e));
    } catch(e) {}
}

module.exports = { readData, writeData };