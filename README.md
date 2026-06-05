# Juicy-O – Restaurant Rotation & Reservation System

A real‑time web app for managing waiter rotation and customer reservations, built with **HTML/CSS/JS** and **Firebase Realtime Database**. All connected devices stay instantly synchronised.

## Features

- **Waiter Rotation** – define which waiters are active, reorder them, and enforce a fair turn system.
- **Live Leaderboard** – see how many tables each waiter has served.
- **Reservations** – add future or immediate reservations with date/time picker.
- **SMS Notification** – sends a pre‑filled SMS to the customer when their table is ready (opens native messaging app).
- **Table Assignment** – assign a reservation to the next waiter in rotation (penalty system) or manually.
- **Cross‑device Sync** – any change made on one device appears instantly on all others.

## Setup Instructions

### 1. Create a Firebase Project

- Go to [Firebase Console](https://console.firebase.google.com/)
- Create a new project (e.g., "juicy-o-rotation").
- In the project overview, click **Add app** > **Web** and register your app.
- Copy the Firebase configuration object (apiKey, authDomain, databaseURL, etc.).

### 2. Enable Realtime Database

- In the Firebase console, go to **Build** > **Realtime Database**.
- Click **Create Database**, start in **test mode** (for development – later you can add security rules).
- Note your database URL (e.g., `https://your-project.firebaseio.com`).

### 3. Update the Firebase Configuration

Open `script.js` and replace the placeholder `firebaseConfig` object with your own:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};