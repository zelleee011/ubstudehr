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

// API: Send data to anyone who asks
app.get('/api/data', (req, res) => {
    res.json(database);
});

// API: Smart Merge Engine (Fixes the disappearing bug!)
app.post('/api/data', (req, res) => {
    const incoming = req.body;
    
    // Check every category (patients, appointments, etc.)
    ['patients', 'appointments', 'labs', 'pharmacy'].forEach(key => {
        if (incoming[key] && Array.isArray(incoming[key])) {
            incoming[key].forEach(incomingItem => {
                // Look for the item by ID in the database
                const index = database[key].findIndex(dbItem => dbItem.id === incomingItem.id);
                
                if (index > -1) {
                    // Item exists -> Update/Overwrite it with the latest edits
                    database[key][index] = incomingItem;
                } else {
                    // Item doesn't exist -> Add it cleanly without touching other records
                    database[key].push(incomingItem);
                }
            });
        }
    });

    res.json({ success: true });
});

// API: Dedicated Delete Route (Prevents deleted records from reappearing)
app.post('/api/delete', (req, res) => {
    const { type, id, patientId } = req.body;
    
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

// IMPORTANT: Matches your fly.toml Port 80
const PORT = 80; 
app.listen(PORT, () => {
    console.log(`Server is running on Port ${PORT}`);
});