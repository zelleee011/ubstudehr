const express = require('express');
const path = require('path');
const db = require('./database'); // Connects to your new database.js!

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const deletedIds = new Set();

app.get('/api/data', (req, res) => {
    res.json(db.readData());
});

app.post('/api/delete', (req, res) => {
    const { type, id, patientId } = req.body;
    deletedIds.add(id);

    let currentData = db.readData();

    if (type === 'patients') currentData.patients = currentData.patients.filter(x => x.id !== id);
    else if (type === 'appointments') currentData.appointments = currentData.appointments.filter(x => x.id !== id);
    else if (type === 'labs') currentData.labs = currentData.labs.filter(x => x.id !== id);
    else if (type === 'pharmacy') currentData.pharmacy = currentData.pharmacy.filter(x => x.id !== id);
    else if (type === 'vital') {
        const p = currentData.patients.find(x => x.id === patientId);
        if (p && p.vitalsHistory) p.vitalsHistory = p.vitalsHistory.filter(x => x.id !== id);
    }

    db.writeData(currentData); // Save deletion to records.json
    res.json({ success: true });
});

app.post('/api/data', (req, res) => {
    const incoming = req.body;
    let currentData = db.readData();

    ['patients', 'appointments', 'labs', 'pharmacy'].forEach(key => {
        if (incoming[key] && Array.isArray(incoming[key])) {
            incoming[key].forEach(incomingItem => {
                if (deletedIds.has(incomingItem.id)) return;

                if (key === 'patients' && incomingItem.vitalsHistory) {
                    incomingItem.vitalsHistory = incomingItem.vitalsHistory.filter(v => !deletedIds.has(v.id));
                }

                const index = currentData[key].findIndex(dbItem => dbItem.id === incomingItem.id);
                if (index > -1) {
                    currentData[key][index] = incomingItem; // Update
                } else {
                    currentData[key].push(incomingItem); // Add
                }
            });
        }
    });

    db.writeData(currentData); // Save additions/edits to records.json
    res.json(currentData);
});

const PORT = 80;
app.listen(PORT, () => {
    console.log(`Server running on Port ${PORT} with database.js active!`);
});