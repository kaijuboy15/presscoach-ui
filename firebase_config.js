const firebaseConfig = {
    apiKey: "AIzaSyABbIAYEk8cZQGeU__QDEHNCD1wBFhXy7o",
    authDomain: "presscoach-392f1.firebaseapp.com",
    projectId: "presscoach-392f1",
    storageBucket: "presscoach-392f1.firebasestorage.app",
    messagingSenderId: "265120211081",
    appId: "1:265120211081:web:0b8864713b88511d89e658",
    measurementId: "G-NQ6TX59M4H"
};

// Prevent reinitialization
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();