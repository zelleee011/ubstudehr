const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

let database = { patients: [], appointments: [], labs: [], pharmacy: [] };

app.get('/api/data', (req, res) => { res.json(database); });
app.post('/api/data', (req, res) => { database = req.body; res.json({ success: true }); });

// Listening on Port 80 to match your fly.toml
const PORT = process.env.PORT || 80;
app.listen(PORT, () => { console.log('Live Server running on port ' + PORT); });