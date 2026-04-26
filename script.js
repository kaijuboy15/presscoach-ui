function isOnDashboard() {
    return document.getElementById("lastDate") && document.getElementById("lastScore");
}

function isFirebaseReady() {
    return window.firebase && typeof firebase.auth === "function" && window.db;
}

async function triggerBridge() {
    const email = document.getElementById('userEmail').value;
    const statusDiv = document.getElementById('statusMessage');

    if (!email) {
        alert("Please enter an email first!");
        return;
    }

    statusDiv.innerText = "Sending command to laptop...";

    try {
        const response = await fetch(`${API_URL}/start_workout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });

        const result = await response.json();
        
        if (result.status === "success") {
            statusDiv.style.color = "lime";
            statusDiv.innerText = result.message;
            console.log("Last Session Data:", result.data);
        } else {
            statusDiv.style.color = "red";
            statusDiv.innerText = "Error: " + result.message;
        }
    } catch (err) {
        statusDiv.style.color = "red";
        statusDiv.innerText = "Failed to connect to Python. Is window_response.py running?";
    }
}

async function registerUser() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPass = document.getElementById('confirmPassword').value;
    const statusDiv = document.getElementById('regStatus');

    if (password !== confirmPass) {
        statusDiv.style.color = "#ff4444";
        statusDiv.innerText = "ERROR: Passwords do not match.";
        return; 
    }

    if(!email || !password) { statusDiv.innerText = "ERROR: Missing fields."; return; }

    statusDiv.style.color = "var(--cyber-green)";
    statusDiv.innerText = "INITIALIZING_AUTH_UPLINK...";

    try {
        // 1. Create account in Firebase Auth (Required for Forgot Password to work)
        await firebase.auth().createUserWithEmailAndPassword(email, password);
        
        // 2. Save profile details in Firestore
        const data = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            height: document.getElementById('height').value,
            weight: document.getElementById('weight').value,
            email: email,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection("users").doc(email).set(data); 

        statusDiv.innerText = "SUCCESS: Profile Verified.";
        setTimeout(() => { window.location.href = "index.html"; }, 1500);

    } catch (err) {
        statusDiv.style.color = "#ff4444";
        statusDiv.innerText = "CLOUD_ERROR: " + err.message;
    }
}

async function forgotPassword() {
    const email = prompt("Please enter your registered email:");
    const status = document.getElementById('statusMessage');

    if (!email) return;

    status.style.color = "var(--cyber-green)";
    status.innerText = "SENDING_RESET_LINK...";

    try {
        // This is the built-in Firebase method
        await firebase.auth().sendPasswordResetEmail(email);
        status.innerText = "LINK_SENT: Check your inbox.";
    } catch (error) {
        status.style.color = "#ff4444";
        status.innerText = "ERROR: " + error.message;
        console.error("Reset Error:", error);
    }
}

const LAPTOP_IP = '10.67.22.189'; 
const API_URL = `http://${LAPTOP_IP}:5000`;
//const API_URL = "http://10.92.143.200:5000";
// --- HYBRID LOGIN (No Python Needed) ---
async function loginUser() {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;
    const status = document.getElementById('statusMessage');

    if (!email || !pass) { 
        status.innerText = "ACCESS DENIED: Credentials missing."; 
        return; 
    }

    status.style.color = "var(--cyber-green)";
    status.innerText = "AUTHENTICATING...";

    try {
        // STEP 1: Authenticate with Firebase Auth
        // This is what checks if your email/password is correct.
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, pass);
        const user = userCredential.user;
        
        // Save the email immediately to local storage
        localStorage.setItem('presscoach_user', user.email);

        // STEP 2: Attempt to get the user's name from Firestore
        // We wrap this in its OWN try/catch so if the database times out, 
        // you STILL get logged in.
        try {
            const doc = await db.collection("users").doc(user.email).get();
            if (doc.exists) {
                localStorage.setItem('presscoach_name', doc.data().firstName || "Athlete");
            } else {
                localStorage.setItem('presscoach_name', "Athlete");
            }
        } catch (dbError) {
            console.warn("Database response slow, proceeding with default name.");
            localStorage.setItem('presscoach_name', "Athlete");
        }

        // STEP 3: Redirect to dashboard
        status.innerText = "ACCESS GRANTED. REDIRECTING...";
        window.location.href = "dashboard.html";

    } catch (e) {
        status.style.color = "#ff4444";
        // This will now show you the ACTUAL error code from Firebase
        // (e.g., auth/wrong-password or auth/user-not-found)
        status.innerText = "ERROR: " + e.code;
        console.error("Login Error Details:", e);
    }
}

async function loadLastSession() {
    const user = firebase.auth().currentUser;
    if (!user) return; // not logged in yet
    if (!isOnDashboard()) return;
    if (!isFirebaseReady()) return;
    const email = user.email;
    const dateEl = document.getElementById('lastDate');
    const scoreEl = document.getElementById('lastScore');

    try {
        const snapshot = await db.collection("users")
        .doc(email)
        .collection("sessions")
        .orderBy("created_at", "desc")   // <-- use created_at
        .limit(1)
        .get();

    if (snapshot.empty) {
      scoreEl.innerText = "STATUS: No sessions yet";
      dateEl.innerText = "DATE: --";
      return;
    }

    const data = snapshot.docs[0].data();

    const displayDate =
      data.created_at?.toDate ? data.created_at.toDate().toLocaleString() : "N/A";

    dateEl.innerText = `DATE: ${displayDate}`;

    // Your Python saves `sets` as a list of set summaries, not a number
    const setsCount = Array.isArray(data.sets) ? data.sets.length : (data.sets || 0);

    scoreEl.innerText =
      `STATUS: ${data.passed ? "PASSED ✅" : "FAILED ❌"} | SETS: ${setsCount}`;

  } catch (err) {
    console.error("Firebase Fetch Error:", err);
    scoreEl.innerText = "STATUS: Error loading data";
  }
}

// --- LOCAL BRIDGE (Python Needed for Camera) ---
async function triggerWorkout() {
    const email = localStorage.getItem("presscoach_user");
    const status = document.getElementById("bridgeStatus");
    if (!email) { alert("Please login first!"); return; }

    status.innerText = "Waking up laptop camera...";

    try {
        // Use the API_URL constant instead of 127.0.0.1
        const res = await fetch(`${API_URL}/start_workout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        status.innerText = data.message;
    } catch (e) {
        status.innerText = "Laptop Offline. Is window_response.py running?";
    }
}

async function logout() {
    try {
        // Kill the session on Google's servers [cite: 2026-03-04]
        await firebase.auth().signOut(); 
        // Clear all local data [cite: 2026-03-04]
        localStorage.clear(); 
        console.log("Session killed and memory cleared.");
        window.location.href = "index.html";
    } catch (e) {
        console.error("Logout error:", e);
        localStorage.clear();
        window.location.href = "index.html";
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('Service Worker registered!'))
        .catch(err => console.log('Service Worker failed', err));
  });
}

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.toggle("active");
}

function showUserDetails() {
    alert("Displaying User Profile Data...");
    // Later, we can make this open a modal with your height/weight data
    toggleSidebar(); 
}

function showOverview() {
    alert("PressCoach v1.0: AI-Powered Fitness Analysis System.");
    toggleSidebar();
}

let countdownInterval;

async function sendReset() {
    const email = document.getElementById('resetEmail').value;
    const status = document.getElementById('resetStatus');
    const btn = document.querySelector('.btn'); // Get the button to disable it
    
    if(!email) { 
        status.innerText = "INPUT REQUIRED"; 
        return; 
    }

    const lastSent = localStorage.getItem('last_reset_sent');
    const now = Date.now();
    const cooldownPeriod = 5 * 60 * 1000; // 5 minutes

    if (lastSent && (now - lastSent < cooldownPeriod)) {
        startVisualTimer(cooldownPeriod - (now - lastSent));
        return;
    }

    try {
        await firebase.auth().sendPasswordResetEmail(email);
        localStorage.setItem('last_reset_sent', Date.now());
        
        status.style.color = "var(--cyber-green)";
        status.innerText = "LINK_DISPATCHED: CHECK_INBOX";
        
        // Start the countdown immediately after success
        startVisualTimer(cooldownPeriod);
    } catch (e) {
        status.style.color = "#ff4444";
        status.innerText = "ERROR: " + e.message;
    }
}

function startVisualTimer(duration) {
    const status = document.getElementById('resetStatus');
    const btn = document.querySelector('.btn');
    
    // Clear any existing timer
    clearInterval(countdownInterval);
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";

    countdownInterval = setInterval(() => {
        const now = Date.now();
        const lastSent = localStorage.getItem('last_reset_sent');
        const timeLeft = (parseInt(lastSent) + (5 * 60 * 1000)) - now;

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            status.innerText = "COOLDOWN_EXPIRED: READY_TO_RESEND";
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
        } else {
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            status.style.color = "yellow";
            status.innerText = `COOLDOWN_ACTIVE: ${minutes}m ${seconds}s`;
        }
    }, 1000);
}

// Run check on page load in case they refresh during a cooldown
window.onload = () => {
    const lastSent = localStorage.getItem('last_reset_sent');
    const cooldownPeriod = 5 * 60 * 1000;
    if (lastSent && (Date.now() - lastSent < cooldownPeriod)) {
        startVisualTimer(cooldownPeriod - (Date.now() - lastSent));
    }
};

function togglePass() {
    const passInput = document.getElementById('loginPass');
    const toggle = document.getElementById('showPass');
    
    // Toggle between 'password' and 'text'
    if (toggle.checked) {
        passInput.type = "text";
    } else {
        passInput.type = "password";
    }
}

function toggleRegPass() {
    const p1 = document.getElementById('password');
    const p2 = document.getElementById('confirmPassword');
    const type = document.getElementById('showRegPass').checked ? 'text' : 'password';
    p1.type = type;
    p2.type = type;
}

// This ensures we only fetch data once Firebase confirms we are logged in

if (window.firebase) {
    firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
        if (window.location.pathname.includes("dashboard.html")) {
            window.location.href = "index.html";
        }
        return;
    }

    console.log("Firebase Auth Verified:", user.email);

    // Only run dashboard session loading if the dashboard elements exist
    if (isOnDashboard()) {
        loadLastSession();
    }
  });
}

async function populateUserDetailsModal() {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerText = (val === undefined || val === null || val === "") ? "--" : String(val);
  };

  // Show loading quickly
  setText("udFirst", "LOADING...");
  setText("udLast", "LOADING...");
  setText("udEmail", "LOADING...");
  setText("udHeight", "LOADING...");
  setText("udWeight", "LOADING...");
  setText("udLastDate", "LOADING...");
  setText("udLastStatus", "LOADING...");

  try {
    // Wait for auth to be ready (instead of relying on currentUser immediately)
    const user = await new Promise((resolve) => {
      const unsub = firebase.auth().onAuthStateChanged((u) => {
        unsub();
        resolve(u);
      });
    });

    if (!user) {
      setText("udLastStatus", "Not logged in");
      return;
    }

    const email = user.email;
    setText("udEmail", email);

    // Profile
    const userDoc = await db.collection("users").doc(email).get();
    const profile = userDoc.exists ? userDoc.data() : {};

    setText("udFirst", profile.firstName || profile.first_name);
    setText("udLast", profile.lastName || profile.last_name);
    setText("udHeight", profile.height);
    setText("udWeight", profile.weight);
    // Account creation date
    const created = profile.created_at && profile.created_at.toDate ? profile.created_at.toDate().toLocaleDateString() : "--";

    setText("udCreated", created);

    // Last session: try created_at first, fallback to end_time
    let snap;
    try {
      snap = await db.collection("users").doc(email)
        .collection("sessions")
        .orderBy("created_at", "desc")
        .limit(1)
        .get();
    } catch (e) {
      snap = await db.collection("users").doc(email)
        .collection("sessions")
        .orderBy("end_time", "desc")
        .limit(1)
        .get();
    }

    if (snap.empty) {
      setText("udLastDate", "--");
      setText("udLastStatus", "No sessions yet");
      return;
    }

    const s = snap.docs[0].data();

    const lastDate = s.end_time || "--";

    const status =
      (s.passed === true) ? "PASSED ✅" :
      (s.passed === false) ? "FAILED ❌" :
      "--";

    setText("udLastDate", lastDate);
    setText("udLastStatus", status);

    // --- Variation Progress inside modal ---
    const variationContainer = document.getElementById("udVariationProgress");

    if (session.variations && session.variations.length) {
        // reuse existing renderer but temporarily swap container
        const original = document.getElementById("variationProgress");

        // create temp container trick (clean + simple)
        const temp = document.createElement("div");
        temp.id = "variationProgress";
        document.body.appendChild(temp);

        renderVariationProgress(session);

        variationContainer.innerHTML = temp.innerHTML;

        document.body.removeChild(temp);
        original.id = "variationProgress"; // restore safety
    } else {
        variationContainer.innerHTML = "No variation analytics.";
    }

  } catch (err) {
    console.error("populateUserDetailsModal error:", err);
    setText("udLastStatus", "Error loading data");
  }
}
