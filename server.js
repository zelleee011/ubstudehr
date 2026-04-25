const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Allow reading JSON data
app.use(express.json({ limit: '10mb' }));

// Serve your website files
app.use(express.static(__dirname));

// The Permanent Backup Cloud Link
const CLOUD_URL = 'https://kvs.zackumar.com/keys/ubstudehr_permanent_db_final_v1';
const DB_FILE = path.join(__dirname, 'database.json');

// Memory Database
let database = {
    patients: [],
    appointments: [],
    labs: [],
    pharmacy: []
};
const deletedIds = new Set();

// ==========================================
// 1. BOOT SEQUENCE: LOAD SAVED DATA
// ==========================================
async function wakeUpServer() {
    // Check if we have a local file first
    if (fs.existsSync(DB_FILE)) {
        try { database = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } 
        catch (e) {}
    }

    // Always fetch from the permanent cloud just in case the server restarted
    try {
        const res = await fetch(CLOUD_URL);
        if (res.ok) {
            const cloudData = await res.json();
            if (cloudData && cloudData.patients) {
                database = cloudData;
                fs.writeFileSync(DB_FILE, JSON.stringify(database)); // Backup locally
            }
        }
    } catch (e) {
        console.log("Cloud load failed, relying on local memory.");
    }
}
wakeUpServer(); // Run immediately when server wakes up

// ==========================================
// 2. AUTO-SAVE FUNCTION
// ==========================================
async function autoSave() {
    // Save locally
    fs.writeFileSync(DB_FILE, JSON.stringify(database));
    
    // Save to permanent cloud so it survives server restarts!
    try {
        await fetch(CLOUD_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(database)
        });
    } catch (e) {}
}

// ==========================================
// 3. API ROUTES
// ==========================================
app.get('/api/data', (req, res) => {
    res.json(database);
});

// Delete Route
app.post('/api/delete', (req, res) => {
    const { type, id, patientId } = req.body;
    deletedIds.add(id); // Zombie Killer
    
    if (type === 'patients') database.patients = database.patients.filter(x => x.id !== id);
    else if (type === 'appointments') database.appointments = database.appointments.filter(x => x.id !== id);
    else if (type === 'labs') database.labs = database.labs.filter(x => x.id !== id);
    else if (type === 'pharmacy') database.pharmacy = database.pharmacy.filter(x => x.id !== id);
    else if (type === 'vital') {
        const p = database.patients.find(x => x.id === patientId);
        if (p && p.vitalsHistory) p.vitalsHistory = p.vitalsHistory.filter(x => x.id !== id);
    }
    
    autoSave(); // Save changes permanently
    res.json({ success: true });
});

// Smart Merge Add/Edit Route
app.post('/api/data', (req, res) => {
    const incoming = req.body;
    
    ['patients', 'appointments', 'labs', 'pharmacy'].forEach(key => {
        if (incoming[key] && Array.isArray(incoming[key])) {
            incoming[key].forEach(incomingItem => {
                if (deletedIds.has(incomingItem.id)) return; // Zombie Block
                
                if (key === 'patients' && incomingItem.vitalsHistory) {
                    incomingItem.vitalsHistory = incomingItem.vitalsHistory.filter(v => !deletedIds.has(v.id));
                }

                const index = database[key].findIndex(dbItem => dbItem.id === incomingItem.id);
                if (index > -1) {
                    database[key][index] = incomingItem; // Update existing
                } else {
                    database[key].push(incomingItem); // Add new
                }
            });
        }
    });

    autoSave(); // Save changes permanently
    res.json(database);
});

// Start Server on Port 80
const PORT = 80; 
app.listen(PORT, () => {
    console.log(`Server is running on Port ${PORT}`);
});