const express = require('express');
const path = require('path');
const app = express();

// Allow the server to read JSON data
app.use(express.json({ limit: '10mb' }));

// Serve your HTML, CSS, and JS files to the internet
app.use(express.static(__dirname));

// This is your new Private In-Memory Database!
let database = {
    patients: [],
    appointments: [],
    labs: [],
    pharmacy: []
};

// API: Send data to anyone who asks (the 2.5-second sync)
app.get('/api/data', (req, res) => {
    res.json(database);
});

// API: Receive new data when someone adds a patient
app.post('/api/data', (req, res) => {
    database = req.body;
    res.json({ success: true });
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Live Server running on port ${PORT}`);
});