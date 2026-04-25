const express = require('express');
const path = require('path');
const app = express();

// Allow reading JSON data
app.use(express.json({ limit: '10mb' }));

// Serve your website files
app.use(express.static(__dirname));

// Private In-Memory Database
let database = {
    patients: [],
    appointments: [],
    labs: [],
    pharmacy: []
};

// ZOMBIE KILLER: Memorizes deleted IDs forever so teammates can't accidentally re-upload them!
const deletedIds = new Set();

// API: Send data to anyone who asks
app.get('/api/data', (req, res) => {
    res.json(database);
});

// API: Safe Deletion Route
app.post('/api/delete', (req, res) => {
    const { type, id, patientId } = req.body;
    
    deletedIds.add(id); // Memorize this ID as permanently dead
    
    if (type === 'patients') database.patients = database.patients.filter(x => x.id !== id);
    else if (type === 'appointments') database.appointments = database.appointments.filter(x => x.id !== id);
    else if (type === 'labs') database.labs = database.labs.filter(x => x.id !== id);
    else if (type === 'pharmacy') database.pharmacy = database.pharmacy.filter(x => x.id !== id);
    else if (type === 'vital') {
        const p = database.patients.find(x => x.id === patientId);
        if (p && p.vitalsHistory) p.vitalsHistory = p.vitalsHistory.filter(x => x.id !== id);
    }
    
    res.json({ success: true });
});

// API: Smart Merge Engine
app.post('/api/data', (req, res) => {
    const incoming = req.body;
    
    ['patients', 'appointments', 'labs', 'pharmacy'].forEach(key => {
        if (incoming[key] && Array.isArray(incoming[key])) {
            incoming[key].forEach(incomingItem => {
                
                // ZOMBIE PROTECTION: If a teammate tries to upload a deleted item, block it!
                if (deletedIds.has(incomingItem.id)) return;
                
                // Protect Patient Vitals from zombies too
                if (key === 'patients' && incomingItem.vitalsHistory) {
                    incomingItem.vitalsHistory = incomingItem.vitalsHistory.filter(v => !deletedIds.has(v.id));
                }

                const index = database[key].findIndex(dbItem => dbItem.id === incomingItem.id);
                
                if (index > -1) {
                    database[key][index] = incomingItem; // Update
                } else {
                    database[key].push(incomingItem); // Add newly created
                }
            });
        }
    });

    // Send back the perfectly merged database to stabilize the browser
    res.json(database);
});

const PORT = 80; 
app.listen(PORT, () => {
    console.log(`Server is running on Port ${PORT}`);
});