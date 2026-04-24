// --- Initialize Dynamic Dates on Load ---
document.addEventListener('DOMContentLoaded', () => {
    const dateEl = document.getElementById('current-date-display');
    const bannerDateEl = document.getElementById('banner-date-display');
    
    if(dateEl && bannerDateEl) {
        const fullOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const shortOptions = { month: 'short', day: 'numeric', year: 'numeric' };
        bannerDateEl.innerText = new Date().toLocaleDateString('en-US', fullOptions);
        dateEl.innerText = new Date().toLocaleDateString('en-US', shortOptions);
    }
});

// Helper for precise timestamps
function getExactTimestamp() {
    let d = new Date();
    return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
}

// ==========================================
// --- STRICT MEDICAL LOGIC ENGINE ---
// ==========================================
function getPatientAlerts(v, r) {
    let alerts = [];
    
    // Check Vitals
    if (v) {
        if (v.temp !== '-' && (v.temp < 36.5 || v.temp > 37.5)) alerts.push('Abnormal Temp');
        if (v.hr !== '-' && (v.hr < 60 || v.hr > 100)) alerts.push('Abnormal Heart Rate');
        if (v.resp !== '-' && (v.resp < 12 || v.resp > 20)) alerts.push('Abnormal Resp. Rate');
        if (v.spo2 !== '-' && v.spo2 < 95) alerts.push('Low Oxygen (SpO2)');
        if (v.bmi !== '-' && (v.bmi < 18.5 || v.bmi > 24.9)) alerts.push('Abnormal BMI');
        
        let bpBad = false;
        if (v.bpSys !== '-' && (v.bpSys < 90 || v.bpSys > 120)) bpBad = true;
        if (v.bpDia !== '-' && (v.bpDia < 60 || v.bpDia > 80)) bpBad = true;
        if (bpBad) alerts.push('Abnormal Blood Pressure');
    }
    
    // Check Clinical Assessment (Record)
    if (r) {
        if (r.neuro && r.neuro !== '-' && !['Alert'].includes(r.neuro)) alerts.push('Abnormal Neuro');
        if (r.skin && r.skin !== '-' && !['Normal', 'Pinkish'].includes(r.skin)) alerts.push('Abnormal Skin Color');
        if (r.bowel && r.bowel !== '-' && !['Normal Active'].includes(r.bowel)) alerts.push('Abnormal Bowel Sounds');
        if (r.edema && r.edema !== '-' && !['None (0)'].includes(r.edema)) alerts.push('Edema Present');
    }
    
    return alerts;
}

function isPatientCritical(p) {
    return getPatientAlerts(p.vitals, p.record).length > 0;
}

// --- Navigation Logic & Sync Startup ---
let isCloudInitialized = false; // Safety lock to prevent overwriting cloud with mock data

async function login() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-layout').style.display = 'flex';
    
    updateSyncStatus("Connecting...");
    
    // 1. Download cloud data FIRST before doing anything else
    let success = await downloadFromCloud();
    isCloudInitialized = true; // Unlock uploading
    
    // 2. Now initialize local data (it will use cloud data if it exists)
    initData(); 
    
    if (success) updateSyncStatus("Live 🟢");
}

function updateSyncStatus(text) {
    let statusEl = document.getElementById('live-sync-status');
    if (!statusEl) {
        const sidebar = document.querySelector('.sidebar');
        if(sidebar) {
            sidebar.insertAdjacentHTML('beforeend', `<div id="live-sync-status" style="position: absolute; bottom: 20px; left: 20px; font-size: 13px; color: #fecdd3; font-weight: 600; display: flex; align-items: center; gap: 8px;"><i class="fas fa-satellite-dish"></i> <span>${text}</span></div>`);
        }
    } else {
        statusEl.querySelector('span').innerText = text;
    }
}

function showSection(sectionId, navElement) {
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    if (navElement) {
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        navElement.classList.add('active');
    }
}

// ==========================================
// --- DATA MANAGEMENT & ROBUST SYNC ---
// ==========================================
let patients = [];
let appointments = [];
let labs = [];
let pharmacy = [];
let currentViewedPatientId = null; 

let localDataHash = "";

function generateDataHash(pts, appts, lbs, pharm) {
    return JSON.stringify({ pts, appts, lbs, pharm });
}

function sanitizeData() {
    patients.forEach(p => {
        if (!p.record) p.record = { neuro: '-', skin: '-', bowel: '-', edema: '-', timestamp: '-' };
        if (!p.vitals) p.vitals = { bpSys: '-', bpDia: '-', hr: '-', temp: '-', spo2: '-', resp: '-', bmi: '-' };
        if (!p.vitalsHistory) p.vitalsHistory = [];
    });
}

function initData() {
    // Only load mock data if the cloud was completely empty
    if (patients.length === 0 && appointments.length === 0) {
        if (localStorage.getItem('ehr_patients_v7')) {
            patients = JSON.parse(localStorage.getItem('ehr_patients_v7'));
        } else {
            patients = [
                { id: 'P001', name: 'Sarah Johnson', age: 34, sex: 'Female', contact: '555-1234', blood: 'O+', date: '4/15/2024', room: 'General Ward - Bed 1', doctor: 'Dr. Maria Santos', diet: 'General Diet', allergies: 'None', complaint: 'Routine Checkup', vitals: { bpSys: 115, bpDia: 75, hr: 78, temp: 37.0, spo2: 98, resp: 16, bmi: 22.5 }, record: { neuro: 'Alert', skin: 'Normal', bowel: 'Normal Active', edema: 'None', timestamp: '4/15/2024 09:30:00' } }, 
                { id: 'P002', name: 'Michael Chen', age: 45, sex: 'Male', contact: '555-5678', blood: 'A+', date: '4/18/2024', room: 'Private Room 102', doctor: 'Dr. Juan Dela Cruz', diet: 'Low Sodium', allergies: 'Penicillin', complaint: 'Chest Pain', vitals: { bpSys: 165, bpDia: 95, hr: 105, temp: 38.2, spo2: 94, resp: 22, bmi: 26.1 }, record: { neuro: 'Lethargic', skin: 'Pale', bowel: 'Hypoactive', edema: '1+ Pitting', timestamp: '4/18/2024 14:20:15' } },
                { id: 'P003', name: 'Emily Rodriguez', age: 28, sex: 'Female', contact: '555-3456', blood: 'B-', date: '4/10/2024', room: 'Outpatient', doctor: 'Dr. Elena Reyes', diet: 'Regular', allergies: 'Peanuts', complaint: 'Fever', vitals: { bpSys: 110, bpDia: 70, hr: 88, temp: 36.8, spo2: 99, resp: 14, bmi: 21.0 }, record: { neuro: 'Alert', skin: 'Normal', bowel: 'Normal Active', edema: 'None', timestamp: '4/10/2024 11:05:40' } }
            ];
        }

        if (localStorage.getItem('ehr_appointments_v7')) { appointments = JSON.parse(localStorage.getItem('ehr_appointments_v7')); }
        if (localStorage.getItem('ehr_labs_v7')) { labs = JSON.parse(localStorage.getItem('ehr_labs_v7')); }
        if (localStorage.getItem('ehr_pharmacy_v7')) { pharmacy = JSON.parse(localStorage.getItem('ehr_pharmacy_v7')); }
    }

    saveData(true); 
}

function refreshUI() {
    sanitizeData();
    try { updateDashboards(); } catch(e){}
    try { populateTable(); } catch(e){}
    try { populateAppointments(); } catch(e){}
    try { populateLabs(); } catch(e){}
    try { populatePharmacy(); } catch(e){}
}

function saveData(skipUpload = false) {
    sanitizeData();
    
    localStorage.setItem('ehr_patients_v7', JSON.stringify(patients));
    localStorage.setItem('ehr_appointments_v7', JSON.stringify(appointments));
    localStorage.setItem('ehr_labs_v7', JSON.stringify(labs));
    localStorage.setItem('ehr_pharmacy_v7', JSON.stringify(pharmacy));
    
    localDataHash = generateDataHash(patients, appointments, labs, pharmacy);
    
    refreshUI();
    
    if(!skipUpload) {
        uploadToCloud();
    }
}

// --- Dashboards & Modals ---
function updateDashboards() {
    document.getElementById('dash-patient-count').innerText = patients.length;
    document.getElementById('dash-appt-count').innerText = appointments.length;
    document.getElementById('dash-lab-count').innerText = labs.length;
    if(document.getElementById('dash-rx-count')) document.getElementById('dash-rx-count').innerText = pharmacy.length;

    let pendingAppts = appointments.filter(a => a.status === 'pending').length;
    let pendingLabs = labs.filter(l => l.status === 'pending').length;
    let criticalPatients = patients.filter(p => isPatientCritical(p)).length;
    
    const badge = document.getElementById('notification-badge');
    if (badge) {
        if (pendingAppts > 0 || pendingLabs > 0 || criticalPatients > 0) badge.style.display = 'block';
        else badge.style.display = 'none';
    }
    populateRecentPatientsWidget();
}

// ==========================================
// --- FACEBOOK STYLE NOTIFICATION ENGINE ---
// ==========================================
function showNotifications() {
    const list = document.getElementById('notification-list');
    list.innerHTML = '';
    let hasNotifs = false;

    patients.forEach(p => {
        let alerts = getPatientAlerts(p.vitals, p.record);
        
        if (alerts.length > 0) {
            hasNotifs = true;
            let alertText = alerts.join(', ');
            let avatarUrl = `https://ui-avatars.com/api/?name=${p.name}&background=831843&color=fff&rounded=true&size=45`;
            
            list.innerHTML += `
                <div class="notif-item clickable" style="align-items: flex-start;" onclick="handleNotificationClick('${p.id}')">
                    <img src="${avatarUrl}" class="notif-icon" style="background: transparent; border-radius: 50%; border: 2px solid #ffe4e6;">
                    <div class="notif-content" style="flex: 1;">
                        <h4 style="margin-bottom: 2px;"><strong>${p.name}</strong> requires attention</h4>
                        <p style="color: #e11d48; font-weight: 600; font-size: 13px; line-height: 1.4;">Flags: ${alertText}</p>
                        <p style="font-size: 11px; margin-top: 6px; color: var(--text-light);"><i class="fas fa-exclamation-circle"></i> Click to view chart</p>
                    </div>
                    <div class="unread-dot"></div>
                </div>
            `;
        }
    });

    let pendingAppts = appointments.filter(a => a.status === 'pending');
    if (pendingAppts.length > 0) {
        hasNotifs = true;
        list.innerHTML += `
            <div class="notif-item clickable" onclick="closeNotificationModal(); showSection('appointments-section', document.querySelectorAll('.nav-links li')[2]);">
                <div class="notif-icon notif-warning"><i class="far fa-calendar-alt"></i></div>
                <div class="notif-content" style="flex: 1;">
                    <h4 style="margin-bottom: 2px;">Pending Appointments</h4>
                    <p style="font-size: 13px;">${pendingAppts.length} Appointment(s) waiting for confirmation.</p>
                </div>
            </div>`;
    }

    let pendingLabs = labs.filter(l => l.status === 'pending');
    if (pendingLabs.length > 0) {
        hasNotifs = true;
        list.innerHTML += `
            <div class="notif-item clickable" onclick="closeNotificationModal(); showSection('labs-section', document.querySelectorAll('.nav-links li')[3]);">
                <div class="notif-icon notif-info"><i class="fas fa-vial"></i></div>
                <div class="notif-content" style="flex: 1;">
                    <h4 style="margin-bottom: 2px;">Pending Lab Results</h4>
                    <p style="font-size: 13px;">${pendingLabs.length} Lab test(s) currently awaiting results.</p>
                </div>
            </div>`;
    }

    if (!hasNotifs) {
        list.innerHTML = `
            <div class="notif-item">
                <div class="notif-icon notif-success"><i class="fas fa-check-circle"></i></div>
                <div class="notif-content"><h4>All caught up!</h4><p>No new notifications at this time.</p></div>
            </div>`;
    }

    document.getElementById('notification-modal').style.display = 'flex';
}

function handleNotificationClick(patientId) {
    closeNotificationModal();
    showSection('patient-records', document.querySelectorAll('.nav-links li')[1]);
    openModal(patientId);
}

function closeNotificationModal() { document.getElementById('notification-modal').style.display = 'none'; }

function generateDailyReport() {
    let today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('report-date').innerText = today;
    
    const list = document.getElementById('report-list');
    list.innerHTML = `
        <div class="notif-item">
            <div class="notif-icon notif-success"><i class="fas fa-users"></i></div>
            <div class="notif-content"><h4>Total Registered Patients</h4><p>${patients.length} active records</p></div>
        </div>
        <div class="notif-item">
            <div class="notif-icon notif-warning"><i class="far fa-calendar-check"></i></div>
            <div class="notif-content"><h4>Appointments Handled</h4><p>${appointments.length} scheduled sessions</p></div>
        </div>
        <div class="notif-item">
            <div class="notif-icon notif-info"><i class="fas fa-microscope"></i></div>
            <div class="notif-content"><h4>Lab Tests Recorded</h4><p>${labs.length} diagnostic tests</p></div>
        </div>
        <div class="notif-item">
            <div class="notif-icon notif-danger" style="background:#fce7f3; color:#831843; border-color:#fbcfe8;"><i class="fas fa-prescription-bottle-alt"></i></div>
            <div class="notif-content"><h4>Prescriptions Issued</h4><p>${pharmacy.length} medication scripts</p></div>
        </div>
    `;
    document.getElementById('report-modal').style.display = 'flex';
}

function closeReportModal() { document.getElementById('report-modal').style.display = 'none'; }

function populateRecentPatientsWidget() {
    const list = document.getElementById('recent-patients-list');
    if(!list) return;
    list.innerHTML = '';
    
    let recent = patients.slice(-4).reverse();
    let mockTimes = ['09:15 AM', '10:00 AM', '10:45 AM', '11:30 AM'];
    
    recent.forEach((p, index) => {
        let status = 'Stable';
        let statusClass = 'status-completed'; 
        
        if(isPatientCritical(p)) { 
            status = 'Critical Alert'; 
            statusClass = 'status-critical'; 
        } else if(p.complaint.toLowerCase().includes('checkup') || p.complaint.toLowerCase().includes('fever')) { 
            status = 'Follow-up'; 
            statusClass = 'status-pending'; 
        }

        let initials = p.name.split(' ').map(n=>n[0]).join('').substring(0,2);
        let displayTime = mockTimes[index] || '12:00 PM';
        
        let r = p.record || {};
        let assessmentTags = '';
        
        const createTag = (label, val, normalValues) => {
            if (val && val !== '-' && !normalValues.includes(val)) {
                return `<span style="font-size: 11px; color: #e11d48; font-weight: 800; background: #ffe4e6; padding: 3px 7px; border-radius: 4px; margin-right: 5px; display: inline-block; margin-top: 5px; border: 1px solid #fda4af; box-shadow: 0 1px 3px rgba(225,29,72,0.1);"><i class="fas fa-bell"></i> ${label}: ${val}</span>`;
            }
            return '';
        };

        assessmentTags += createTag('Neuro', r.neuro, ['Alert']);
        assessmentTags += createTag('Skin', r.skin, ['Normal', 'Pinkish']);
        assessmentTags += createTag('Bowel', r.bowel, ['Normal Active']);
        assessmentTags += createTag('Edema', r.edema, ['None (0)']);

        if (assessmentTags === '') {
            let neuroText = r.neuro && r.neuro !== '-' ? r.neuro : '-';
            assessmentTags = `<span style="font-size: 11px; color: var(--primary); font-weight: 600; background: var(--primary-light); padding: 3px 7px; border-radius: 4px; display: inline-block; margin-top: 5px;">Neuro: ${neuroText}</span>`;
        }

        list.innerHTML += `
            <div class="recent-list-item">
                <div class="r-patient-info">
                    <div class="r-avatar">${initials}</div>
                    <div>
                        <h4>${p.name}</h4>
                        <p style="margin-bottom: 2px;">${p.complaint} • Age ${p.age}</p>
                        ${assessmentTags}
                    </div>
                </div>
                <div class="r-patient-status">
                    <span class="status-badge ${statusClass}">${status}</span>
                    <span class="r-time">${displayTime}</span>
                </div>
            </div>
        `;
    });
}

// --- PATIENT CRUD OPERATIONS ---
function prepareNewPatient() {
    document.getElementById('patient-form').reset();
    document.getElementById('p-id').value = '';
    
    let d = new Date();
    document.getElementById('p-admission').value = `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
    
    document.getElementById('form-title').innerText = "Register New Patient";
    showSection('new-patient', document.querySelectorAll('.nav-links li')[1]);
}

function savePatient(e) {
    e.preventDefault();
    const idField = document.getElementById('p-id').value;
    
    let initialVitals = { bpSys: '-', bpDia: '-', hr: '-', temp: '-', spo2: '-', resp: '-', bmi: '-' };
    let initialRecord = { neuro: '-', skin: '-', bowel: '-', edema: '-', timestamp: '-' };
    
    const newPatient = {
        id: idField ? idField : 'P00' + (patients.length + 1),
        name: document.getElementById('p-name').value,
        age: document.getElementById('p-age').value,
        sex: document.getElementById('p-sex').value,
        dob: document.getElementById('p-dob').value,
        contact: document.getElementById('p-contact').value,
        address: document.getElementById('p-address').value,
        blood: document.getElementById('p-blood').value,
        room: document.getElementById('p-room').value,
        diet: document.getElementById('p-diet').value || 'Regular',
        allergies: document.getElementById('p-allergies').value || 'None',
        civil: document.getElementById('p-civil').value,
        doctor: document.getElementById('p-doc').value,
        complaint: document.getElementById('p-complaint').value,
        date: document.getElementById('p-admission').value,
        vitals: initialVitals,
        vitalsHistory: [],
        record: initialRecord
    };

    if (idField) {
        const index = patients.findIndex(p => p.id === idField);
        newPatient.vitals = patients[index].vitals || initialVitals; 
        newPatient.vitalsHistory = patients[index].vitalsHistory || []; 
        newPatient.record = patients[index].record || initialRecord;
        patients[index] = newPatient;
        alert('Patient updated successfully!');
    } else {
        patients.push(newPatient);
        alert('Patient saved successfully!');
    }

    saveData();
    showSection('patient-records', document.querySelectorAll('.nav-links li')[1]);
}

function editPatient(id) {
    const p = patients.find(x => x.id === id);
    if (!p) return;

    document.getElementById('p-id').value = p.id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-age').value = p.age;
    document.getElementById('p-sex').value = p.sex;
    document.getElementById('p-contact').value = p.contact;
    document.getElementById('p-admission').value = p.date;
    document.getElementById('p-address').value = p.address || '';
    document.getElementById('p-blood').value = p.blood;
    document.getElementById('p-room').value = p.room;
    document.getElementById('p-diet').value = p.diet;
    document.getElementById('p-allergies').value = p.allergies;
    document.getElementById('p-doc').value = p.doctor;
    document.getElementById('p-complaint').value = p.complaint;

    document.getElementById('form-title').innerText = "Edit Patient Record";
    showSection('new-patient', document.querySelectorAll('.nav-links li')[1]);
}

function deletePatient(id) {
    if (confirm("Are you sure you want to delete this patient? This action cannot be undone.")) {
        patients = patients.filter(p => p.id !== id);
        saveData();
    }
}

function populateTable() {
    const tbody = document.getElementById('patients-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    patients.forEach(patient => {
        let isRowCritical = isPatientCritical(patient);
        let rowClass = isRowCritical ? 'critical-row' : '';
        
        tbody.innerHTML += `
            <tr class="${rowClass}">
                <td>
                    <img src="https://ui-avatars.com/api/?name=${patient.name}&background=831843&color=fff&rounded=true&size=40" style="vertical-align: middle; margin-right: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                    <div style="display: inline-block; vertical-align: middle;">
                        <strong style="color: var(--text-dark); font-size: 15px;">${patient.name}</strong><br>
                        <span style="font-size: 12px; color: var(--text-light); font-weight: 500;">${patient.age} yrs • ${patient.sex}</span>
                    </div>
                </td>
                <td style="font-weight: 700; color: var(--primary);">${patient.id}</td>
                <td><span style="background: var(--primary-light); padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; color: var(--primary);"><i class="fas fa-bed" style="margin-right: 4px;"></i> ${patient.room}</span></td>
                <td><span style="background: #fee2e2; color: #e11d48; padding: 6px 10px; border-radius: 8px; font-weight: 800; font-size: 12px;">${patient.blood}</span></td>
                <td style="font-weight: 500;">${patient.date}</td>
                <td class="action-cell">
                    <span class="view-btn" onclick="openModal('${patient.id}')">View</span>
                    <i class="fas fa-edit edit-icon" onclick="editPatient('${patient.id}')" title="Edit"></i>
                    <i class="fas fa-trash delete-icon" onclick="deletePatient('${patient.id}')" title="Delete"></i>
                </td>
            </tr>
        `;
    });
}

// --- APPOINTMENTS CRUD ---
function openAppointmentModal() {
    document.getElementById('new-appt-name').value = '';
    document.getElementById('new-appt-type').value = 'Checkup';
    document.getElementById('add-appointment-modal').style.display = 'flex';
}
function closeAppointmentModal() { document.getElementById('add-appointment-modal').style.display = 'none'; }
function saveAppointment(e) {
    e.preventDefault();
    let name = document.getElementById('new-appt-name').value;
    let type = document.getElementById('new-appt-type').value;
    appointments.push({ id: Date.now(), name: name, time: 'Pending Schedule', doc: 'Unassigned', type: type, status: 'pending' });
    saveData(); closeAppointmentModal();
    showSection('appointments-section', document.querySelectorAll('.nav-links li')[2]);
}
function cycleApptStatus(id) {
    let appt = appointments.find(a => a.id === id);
    if(appt.status === 'pending') appt.status = 'scheduled';
    else if(appt.status === 'scheduled') appt.status = 'completed';
    else if(appt.status === 'completed') appt.status = 'cancelled';
    else appt.status = 'pending';
    saveData();
}
function deleteAppointment(id) {
    if(confirm("Delete this appointment?")) { appointments = appointments.filter(a => a.id !== id); saveData(); }
}
function populateAppointments() {
    const tbody = document.getElementById('appointments-tbody'); 
    if(!tbody) return;
    tbody.innerHTML = '';
    appointments.forEach(app => {
        tbody.innerHTML += `<tr>
            <td><strong style="color:var(--text-dark);">${app.name}</strong></td><td>${app.time}</td><td>${app.doc}</td><td>${app.type}</td>
            <td><span class="status-badge status-${app.status}">${app.status}</span></td>
            <td class="action-cell"><span class="view-btn" style="background:var(--primary-light); color:var(--primary);" onclick="cycleApptStatus(${app.id})">Update</span> <i class="fas fa-trash delete-icon" onclick="deleteAppointment(${app.id})"></i></td>
        </tr>`;
    });
}

// --- LABS CRUD ---
function openLabModal() {
    document.getElementById('new-lab-name').value = '';
    document.getElementById('new-lab-test').value = '';
    document.getElementById('add-lab-modal').style.display = 'flex';
}
function closeLabModal() { document.getElementById('add-lab-modal').style.display = 'none'; }
function saveLab(e) {
    e.preventDefault();
    let name = document.getElementById('new-lab-name').value;
    let test = document.getElementById('new-lab-test').value;
    labs.push({ id: Date.now(), name: name, test: test, date: new Date().toISOString().split('T')[0], status: 'pending' });
    saveData(); closeLabModal();
    showSection('labs-section', document.querySelectorAll('.nav-links li')[3]);
}
function cycleLabStatus(id) {
    let lab = labs.find(l => l.id === id);
    if(lab.status === 'pending') lab.status = 'completed';
    else if(lab.status === 'completed') lab.status = 'critical';
    else lab.status = 'pending';
    saveData();
}
function deleteLab(id) {
    if(confirm("Delete this lab record?")) { labs = labs.filter(l => l.id !== id); saveData(); }
}
function populateLabs() {
    const tbody = document.getElementById('labs-tbody'); 
    if(!tbody) return;
    tbody.innerHTML = '';
    labs.forEach(lab => {
        tbody.innerHTML += `<tr>
            <td><strong style="color:var(--text-dark);">${lab.name}</strong></td><td>${lab.test}</td><td>${lab.date}</td>
            <td><span class="status-badge status-${lab.status}">${lab.status}</span></td>
            <td class="action-cell"><span class="view-btn" style="background:var(--primary-light); color:var(--primary);" onclick="cycleLabStatus(${lab.id})">Update</span> <i class="fas fa-trash delete-icon" onclick="deleteLab(${lab.id})"></i></td>
        </tr>`;
    });
}

// --- PHARMACY CRUD ---
function openPharmacyModal() {
    document.getElementById('new-pharm-name').value = '';
    document.getElementById('new-pharm-med').value = '';
    document.getElementById('add-pharmacy-modal').style.display = 'flex';
}
function closePharmacyModal() { document.getElementById('add-pharmacy-modal').style.display = 'none'; }
function savePharmacy(e) {
    e.preventDefault();
    let name = document.getElementById('new-pharm-name').value;
    let med = document.getElementById('new-pharm-med').value;
    pharmacy.push({ id: Date.now(), name: name, meds: med, doc: 'Unassigned', status: 'pending' });
    saveData(); closePharmacyModal();
    showSection('pharmacy-section', document.querySelectorAll('.nav-links li')[4]);
}
function cycleMedStatus(id) {
    let med = pharmacy.find(m => m.id === id);
    if(med.status === 'pending') med.status = 'dispensed';
    else med.status = 'pending';
    saveData();
}
function deleteMed(id) {
    if(confirm("Delete this pharmacy order?")) { pharmacy = pharmacy.filter(m => m.id !== id); saveData(); }
}
function populatePharmacy() {
    const tbody = document.getElementById('pharmacy-tbody'); 
    if(!tbody) return;
    tbody.innerHTML = '';
    pharmacy.forEach(rx => {
        tbody.innerHTML += `<tr>
            <td><strong style="color:var(--text-dark);">${rx.name}</strong></td><td><i class="fas fa-pills" style="color: var(--secondary); margin-right:5px;"></i> ${rx.meds}</td><td>${rx.doc}</td>
            <td><span class="status-badge status-${rx.status}">${rx.status}</span></td>
            <td class="action-cell"><span class="view-btn" style="background:var(--primary-light); color:var(--primary);" onclick="cycleMedStatus(${rx.id})">Update</span> <i class="fas fa-trash delete-icon" onclick="deleteMed(${rx.id})"></i></td>
        </tr>`;
    });
}

// --- Patient Modal & Dynamic Vitals Logic ---
let vitalsChartInstance = null;

function openModal(patientId) {
    currentViewedPatientId = patientId; 
    const p = patients.find(x => x.id === patientId);
    if(!p) return;

    if (!p.vitalsHistory) p.vitalsHistory = [];
    if (!p.record) p.record = { neuro: '-', skin: '-', bowel: '-', edema: '-', timestamp: '-' };

    document.getElementById('modal-patient-name').innerText = p.name;
    document.getElementById('modal-patient-info').innerText = `${p.id} • ${p.age} yrs • ${p.sex} • Room: ${p.room}`;
    document.getElementById('modal-doctor').innerText = p.doctor;
    
    let allergyElem = document.getElementById('modal-allergies');
    allergyElem.innerText = p.allergies;
    if(p.allergies !== 'None' && p.allergies !== '') {
        allergyElem.style.color = '#ff0000'; 
        allergyElem.parentElement.style.background = '#ffe4e6';
        allergyElem.parentElement.style.borderColor = '#fda4af';
    } else {
        allergyElem.style.color = 'var(--text-main)';
        allergyElem.parentElement.style.background = '#f8fafc';
        allergyElem.parentElement.style.borderColor = 'var(--border-color)';
    }

    document.getElementById('modal-diet').innerText = p.diet;
    document.getElementById('modal-complaint').innerText = p.complaint;

    // Apply strict normal range checks for the Vitals UI glow
    let v = p.vitals || {};
    
    let bpBad = (v.bpSys !== '-' && (v.bpSys < 90 || v.bpSys > 120)) || (v.bpDia !== '-' && (v.bpDia < 60 || v.bpDia > 80));
    let bpClass = bpBad ? 'red-alert-card' : '';
    
    let hrClass = (v.hr !== '-' && (v.hr < 60 || v.hr > 100)) ? 'red-alert-card' : '';
    let tempClass = (v.temp !== '-' && (v.temp < 36.5 || v.temp > 37.5)) ? 'red-alert-card' : '';
    let spo2Class = (v.spo2 !== '-' && v.spo2 < 95) ? 'red-alert-card' : '';
    let respClass = (v.resp !== '-' && (v.resp < 12 || v.resp > 20)) ? 'red-alert-card' : '';
    let bmiClass = (v.bmi !== '-' && (v.bmi < 18.5 || v.bmi > 24.9)) ? 'red-alert-card' : '';

    let bpDisplay = v.bpSys === '-' ? '- / -' : `${v.bpSys}/${v.bpDia}`;

    document.getElementById('latest-vitals-container').innerHTML = `
        <div class="vital-box ${bpClass}"><h4>Blood Pressure</h4><h2>${bpDisplay} <small>mmHg</small></h2></div>
        <div class="vital-box ${hrClass}"><h4>Heart Rate</h4><h2>${v.hr} <small>bpm</small></h2></div>
        <div class="vital-box ${tempClass}"><h4>Temperature</h4><h2>${v.temp}° <small>C</small></h2></div>
        <div class="vital-box ${spo2Class}"><h4>SpO2</h4><h2>${v.spo2} <small>%</small></h2></div>
        <div class="vital-box ${respClass}"><h4>Resp Rate</h4><h2>${v.resp} <small>br/min</small></h2></div>
        <div class="vital-box ${bmiClass}"><h4>BMI</h4><h2>${v.bmi} <small>Scale</small></h2></div>
    `;

    document.getElementById('rec-admission').innerText = p.date;
    document.getElementById('rec-timestamp').innerText = p.record.timestamp || '-';

    // --- Dynamic Record Highlighting in Modal ---
    const styleAssessmentCard = (elementId, value, normalValues) => {
        const el = document.getElementById(elementId);
        if(!el) return;
        el.innerText = value;
        const card = el.parentElement;
        const label = el.previousElementSibling;
        
        if (value !== '-' && !normalValues.includes(value)) {
            card.classList.add('alert-card');
            el.classList.add('alert-text');
            label.classList.add('alert-text');
        } else {
            card.classList.remove('alert-card');
            el.classList.remove('alert-text');
            label.classList.remove('alert-text');
        }
    };

    styleAssessmentCard('rec-neuro', p.record.neuro, ['Alert']);
    styleAssessmentCard('rec-skin', p.record.skin, ['Normal', 'Pinkish']);
    styleAssessmentCard('rec-bowel', p.record.bowel, ['Normal Active']);
    styleAssessmentCard('rec-edema', p.record.edema, ['None (0)']);

    renderChart(p);
    populateHistoryTable(p);

    document.getElementById('patient-modal').style.display = 'flex';
    switchTab('overview'); 
}

function closeModal() { document.getElementById('patient-modal').style.display = 'none'; }

// --- Patient Record Update Logic ---
function openRecordModal() {
    if(!currentViewedPatientId) return;
    const p = patients.find(x => x.id === currentViewedPatientId);
    if(!p) return;

    let currentTs = (p.record.timestamp && p.record.timestamp !== '-') ? p.record.timestamp : getExactTimestamp();
    
    document.getElementById('ur-admission').value = p.date || '';
    document.getElementById('ur-timestamp').value = currentTs;
    document.getElementById('ur-neuro').value = p.record.neuro;
    document.getElementById('ur-skin').value = p.record.skin;
    document.getElementById('ur-bowel').value = p.record.bowel;
    document.getElementById('ur-edema').value = p.record.edema;

    document.getElementById('update-record-modal').style.display = 'flex';
}

function closeRecordModal() { document.getElementById('update-record-modal').style.display = 'none'; }

function savePatientRecord(e) {
    e.preventDefault();
    if(!currentViewedPatientId) return;
    
    const index = patients.findIndex(p => p.id === currentViewedPatientId);
    if(index === -1) return;

    patients[index].date = document.getElementById('ur-admission').value;

    patients[index].record = {
        neuro: document.getElementById('ur-neuro').value,
        skin: document.getElementById('ur-skin').value,
        bowel: document.getElementById('ur-bowel').value,
        edema: document.getElementById('ur-edema').value,
        timestamp: document.getElementById('ur-timestamp').value 
    };

    saveData();
    closeRecordModal();
    openModal(currentViewedPatientId);
    switchTab('record'); 
}

// --- Vitals History Update Logic ---
function openAddVitalsModal(recordId = null) {
    if(!currentViewedPatientId) return;
    const p = patients.find(x => x.id === currentViewedPatientId);
    if(!p) return;
    
    if (recordId) {
        const r = p.vitalsHistory.find(v => v.id === recordId);
        document.getElementById('vitals-modal-title').innerText = "Edit Vitals Record";
        document.getElementById('v-id').value = r.id;
        document.getElementById('v-date').value = r.date;
        document.getElementById('v-bpsys').value = r.bpSys;
        document.getElementById('v-bpdia').value = r.bpDia;
        document.getElementById('v-hr').value = r.hr;
        document.getElementById('v-temp').value = r.temp;
        document.getElementById('v-spo2').value = r.spo2;
        document.getElementById('v-resp').value = r.resp;
        document.getElementById('v-bmi').value = r.bmi;
    } else {
        document.getElementById('vitals-modal-title').innerText = "Record New Vitals";
        document.getElementById('v-id').value = '';
        document.getElementById('v-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('v-bpsys').value = p.vitals.bpSys === '-' ? '' : p.vitals.bpSys;
        document.getElementById('v-bpdia').value = p.vitals.bpDia === '-' ? '' : p.vitals.bpDia;
        document.getElementById('v-hr').value = p.vitals.hr === '-' ? '' : p.vitals.hr;
        document.getElementById('v-temp').value = p.vitals.temp === '-' ? '' : p.vitals.temp;
        document.getElementById('v-spo2').value = p.vitals.spo2 === '-' ? '' : p.vitals.spo2;
        document.getElementById('v-resp').value = p.vitals.resp === '-' ? '' : p.vitals.resp;
        document.getElementById('v-bmi').value = p.vitals.bmi === '-' ? '' : p.vitals.bmi;
    }

    document.getElementById('add-vitals-modal').style.display = 'flex';
}

function closeAddVitalsModal() { document.getElementById('add-vitals-modal').style.display = 'none'; }

function saveVitals(e) {
    e.preventDefault();
    if(!currentViewedPatientId) return;
    
    const index = patients.findIndex(p => p.id === currentViewedPatientId);
    if(index === -1) return;

    let activeTabId = 'vitals';
    document.querySelectorAll('.tab-content').forEach(tab => {
        if(tab.classList.contains('active')) activeTabId = tab.id.replace('tab-', '');
    });

    let p = patients[index];
    let vId = document.getElementById('v-id').value;

    let newVitalData = {
        date: document.getElementById('v-date').value,
        bpSys: parseInt(document.getElementById('v-bpsys').value),
        bpDia: parseInt(document.getElementById('v-bpdia').value),
        hr: parseInt(document.getElementById('v-hr').value),
        temp: parseFloat(document.getElementById('v-temp').value),
        spo2: parseInt(document.getElementById('v-spo2').value),
        resp: parseInt(document.getElementById('v-resp').value),
        bmi: parseFloat(document.getElementById('v-bmi').value)
    };

    if (vId) {
        let rIndex = p.vitalsHistory.findIndex(r => r.id == vId);
        if(rIndex > -1) p.vitalsHistory[rIndex] = { id: parseInt(vId), ...newVitalData };
    } else {
        p.vitalsHistory.push({ id: Date.now(), ...newVitalData });
    }

    p.vitalsHistory.sort((a,b) => new Date(b.date) - new Date(a.date));
    p.vitals = p.vitalsHistory[0]; 

    saveData();
    closeAddVitalsModal();
    openModal(currentViewedPatientId); 
    switchTab(activeTabId);
}

function deleteVitalRecord(recordId) {
    if(!confirm("Are you sure you want to delete this vital record?")) return;
    
    const p = patients.find(x => x.id === currentViewedPatientId);
    if(!p) return;

    p.vitalsHistory = p.vitalsHistory.filter(v => v.id != recordId);
    
    if (p.vitalsHistory.length > 0) {
        p.vitalsHistory.sort((a,b) => new Date(b.date) - new Date(a.date));
        p.vitals = p.vitalsHistory[0];
    } else {
        p.vitals = { bpSys: '-', bpDia: '-', hr: '-', temp: '-', spo2: '-', resp: '-', bmi: '-' };
    }
    
    saveData();
    openModal(currentViewedPatientId);
    switchTab('vitals');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
}

function renderChart(p) {
    const ctx = document.getElementById('vitalsChart').getContext('2d');
    if(vitalsChartInstance) vitalsChartInstance.destroy();

    if(!p.vitalsHistory || p.vitalsHistory.length === 0) return;

    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#71717a';

    let chartData = [...p.vitalsHistory].sort((a,b) => new Date(a.date) - new Date(b.date));

    vitalsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.map(r => r.date),
            datasets: [
                { label: 'Systolic BP', data: chartData.map(r => r.bpSys), borderColor: '#831843', backgroundColor: '#831843', borderWidth: 3, tension: 0.4, pointRadius: 5, pointHoverRadius: 7 },
                { label: 'Diastolic BP', data: chartData.map(r => r.bpDia), borderColor: '#e11d48', backgroundColor: '#e11d48', borderWidth: 2, borderDash: [5, 5], tension: 0.4, pointRadius: 4 },
                { label: 'Heart Rate', data: chartData.map(r => r.hr), borderColor: '#fb7185', backgroundColor: '#fb7185', borderWidth: 3, tension: 0.4, pointRadius: 5, pointHoverRadius: 7 }
            ]
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 10, font: {weight: 'bold'} } }, tooltip: { backgroundColor: 'rgba(30, 27, 75, 0.9)', titleFont: { size: 14 }, bodyFont: { size: 14 }, padding: 12, cornerRadius: 8 } },
            scales: { y: { grid: { color: '#f1f5f9', drawBorder: false } }, x: { grid: { display: false, drawBorder: false } } }
        }
    });
}

function populateHistoryTable(p) {
    const tbody = document.getElementById('history-tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    if(!p.vitalsHistory || p.vitalsHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-light); font-style: italic;">No vitals recorded yet.</td></tr>`;
        return;
    }

    let sortedHistory = [...p.vitalsHistory].sort((a,b) => new Date(b.date) - new Date(a.date));

    sortedHistory.forEach((r, index) => {
        let rowStyle = index === 0 ? 'background: var(--primary-light); font-weight: 800;' : '';
        tbody.innerHTML += `
            <tr style="${rowStyle}">
                <td>${r.date}</td>
                <td>${r.bpSys} mmHg</td>
                <td>${r.bpDia} mmHg</td>
                <td>${r.hr} bpm</td>
                <td class="action-cell">
                    <i class="fas fa-edit edit-icon" onclick="openAddVitalsModal(${r.id})" title="Edit"></i>
                    <i class="fas fa-trash delete-icon" onclick="deleteVitalRecord(${r.id})" title="Delete"></i>
                </td>
            </tr>
        `;
    });
}

// ==========================================
// --- FLAWLESS REAL-TIME CLOUD SYNC ---
// ==========================================

// Changed Database Key to ensure a completely fresh start for everyone
const CLOUD_DB_KEY = "ubstudehr_db_production_sync_v7"; 
const CLOUD_API_URL = `https://kvs.zackumar.com/keys/${CLOUD_DB_KEY}`;

async function uploadToCloud() {
    if (!isCloudInitialized) return; // SAFEGUARD: Never upload until we've confirmed the live data first

    const payload = { patients, appointments, labs, pharmacy };
    try {
        updateSyncStatus("Syncing...");
        await fetch(CLOUD_API_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json' 
            },
            body: JSON.stringify(payload)
        });
        updateSyncStatus("Live 🟢");
    } catch (e) {
        console.error("Sync Upload Failed", e);
        updateSyncStatus("Offline 🔴");
    }
}

async function downloadFromCloud() {
    try {
        const response = await fetch(CLOUD_API_URL + "?_t=" + new Date().getTime(), {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            cache: 'no-store'
        });
        
        if (!response.ok) return false;
        
        const cloudData = await response.json();
        
        if (!cloudData || typeof cloudData !== 'object') return false;
        if (!cloudData.patients && !cloudData.appointments && !cloudData.labs && !cloudData.pharmacy) return true;

        let cloudHash = generateDataHash(cloudData.patients || [], cloudData.appointments || [], cloudData.labs || [], cloudData.pharmacy || []);

        if (cloudHash !== localDataHash && cloudHash !== generateDataHash([],[],[],[])) {
            patients = cloudData.patients || [];
            appointments = cloudData.appointments || [];
            labs = cloudData.labs || [];
            pharmacy = cloudData.pharmacy || [];
            
            saveData(true); 
            
            if (currentViewedPatientId && document.getElementById('patient-modal').style.display === 'flex') {
                openModal(currentViewedPatientId);
            }
        }
        updateSyncStatus("Live 🟢");
        return true;
    } catch(e) {
        console.error("Sync Download Failed", e);
        updateSyncStatus("Offline 🔴");
        return false;
    }
}

function forceCloudSync() {
    uploadToCloud();
}

// Background sync runs every 2.5 seconds
setInterval(async () => {
    if(isCloudInitialized) {
        await downloadFromCloud();
    }
}, 2500);