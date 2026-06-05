import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, push, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ========== FIREBASE CONFIGURATION (public, safe) ==========
// These values are safe to be public. Security is enforced via Firebase Database Rules.
const firebaseConfig = {
  apiKey: "AIzaSyBpLXiQn_7XIZbJ38uV_-PwTkIQFSqUraQ",
  authDomain: "juicyo-rotation.firebaseapp.com",
  databaseURL: "https://juicyo-rotation-default-rtdb.firebaseio.com",
  projectId: "juicyo-rotation",
  storageBucket: "juicyo-rotation.firebasestorage.app",
  messagingSenderId: "1034615515937",
  appId: "1:1034615515937:web:68c1d7c12539ea1b6bac60"
};

// Fallback to localStorage if Firebase is not configured or fails
let useFirebase = true;
try {
  const app = initializeApp(firebaseConfig);
  var db = getDatabase(app);
} catch (e) {
  console.warn("Firebase init failed, falling back to localStorage", e);
  useFirebase = false;
}

// ========== DATA STORAGE WRAPPER (Firebase + localStorage fallback) ==========
let localStore = {
  walkins: [],
  reservations: [],
  rotation: {
    activeServersSet: ["Ismael", "Bryan", "Horiandy"],
    waiterRotation: ["Ismael", "Bryan", "Horiandy"],
    currentRotationIndex: 0,
    skipTurnCounter: { Ismael: 0, Bryan: 0, Horiandy: 0 }
  }
};

function saveToLocalStorage() {
  localStorage.setItem("juicyO_local", JSON.stringify(localStore));
}

function loadFromLocalStorage() {
  const data = localStorage.getItem("juicyO_local");
  if (data) {
    try {
      localStore = JSON.parse(data);
    } catch(e) {}
  }
}

function syncWalkins() {
  if (useFirebase) set(ref(db, 'juicyO/walkins'), localStore.walkins);
  else saveToLocalStorage();
}
function syncReservations() {
  if (useFirebase) set(ref(db, 'juicyO/reservations'), localStore.reservations);
  else saveToLocalStorage();
}
function syncRotation() {
  if (useFirebase) set(ref(db, 'juicyO/rotation'), localStore.rotation);
  else saveToLocalStorage();
}

// ========== GLOBAL STATE ==========
let walkins = [];
let reservations = [];
let waiterRotation = [];
let currentRotationIndex = 0;
let activeServersSet = [];
let skipTurnCounter = {};
let selectedWaiter = null;

// Helper functions
function generateId() { return Date.now() + '-' + Math.random().toString(36).substr(2, 8); }
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); }
function showToast(msg, dur = 1800) {
  const toast = document.getElementById("toastMsg");
  if (!toast) return;
  toast.style.opacity = "1";
  toast.innerText = msg;
  setTimeout(() => { toast.style.opacity = "0"; }, dur);
  console.log("TOAST:", msg);
}

// ========== FIREBASE / STORAGE LISTENERS ==========
function initDataListeners() {
  if (useFirebase) {
    const walkinsRef = ref(db, 'juicyO/walkins');
    const reservationsRef = ref(db, 'juicyO/reservations');
    const rotationRef = ref(db, 'juicyO/rotation');

    onValue(walkinsRef, (snapshot) => {
      if (snapshot.exists()) walkins = snapshot.val();
      else walkins = [];
      renderWaiterUnifiedTable();
    });
    onValue(reservationsRef, (snapshot) => {
      if (snapshot.exists()) reservations = snapshot.val();
      else reservations = [];
      renderReservationsList();
    });
    onValue(rotationRef, (snapshot) => {
      if (snapshot.exists()) {
        const rot = snapshot.val();
        activeServersSet = rot.activeServersSet || ["Ismael", "Bryan", "Horiandy"];
        waiterRotation = rot.waiterRotation || [...activeServersSet];
        currentRotationIndex = rot.currentRotationIndex || 0;
        skipTurnCounter = rot.skipTurnCounter || {};
        for (let w of activeServersSet) if (skipTurnCounter[w] === undefined) skipTurnCounter[w] = 0;
      } else {
        // Initialize default rotation if none exists in Firebase
        activeServersSet = ["Ismael", "Bryan", "Horiandy"];
        waiterRotation = [...activeServersSet];
        currentRotationIndex = 0;
        skipTurnCounter = { Ismael: 0, Bryan: 0, Horiandy: 0 };
        syncRotation();
      }
      renderRotationQueue();
      renderServerCheckboxes();
    });
  } else {
    // localStorage fallback
    loadFromLocalStorage();
    walkins = localStore.walkins;
    reservations = localStore.reservations;
    activeServersSet = localStore.rotation.activeServersSet;
    waiterRotation = localStore.rotation.waiterRotation;
    currentRotationIndex = localStore.rotation.currentRotationIndex;
    skipTurnCounter = localStore.rotation.skipTurnCounter;
    renderWaiterUnifiedTable();
    renderReservationsList();
    renderRotationQueue();
    renderServerCheckboxes();
  }
}

// ========== ROTATION LOGIC ==========
function getEffectiveNextIndex() {
  if (!waiterRotation.length) return -1;
  let start = currentRotationIndex;
  for (let i = 0; i < waiterRotation.length; i++) {
    let idx = (start + i) % waiterRotation.length;
    if ((skipTurnCounter[waiterRotation[idx]] || 0) === 0) return idx;
  }
  return currentRotationIndex;
}

function getEffectiveNextServer() {
  let idx = getEffectiveNextIndex();
  return idx !== -1 ? waiterRotation[idx] : null;
}

function addPendingSkip(waiter) {
  if (!waiterRotation.includes(waiter)) return;
  skipTurnCounter[waiter] = (skipTurnCounter[waiter] || 0) + 1;
  if (useFirebase) syncRotation();
  else { localStore.rotation = { activeServersSet, waiterRotation, currentRotationIndex, skipTurnCounter }; syncRotation(); }
}

function advanceTurn() {
  if (!waiterRotation.length) return false;
  currentRotationIndex = (currentRotationIndex + 1) % waiterRotation.length;
  if (useFirebase) syncRotation();
  else { localStore.rotation = { activeServersSet, waiterRotation, currentRotationIndex, skipTurnCounter }; syncRotation(); }
  return true;
}

function addWalkinEntry(people, waiter, note, manualSkip = true) {
  if (people < 1) return false;
  const newWalkin = { id: generateId(), people, waiter, note: note.trim() || "mesa", timestamp: new Date().toLocaleTimeString() };
  walkins.push(newWalkin);
  if (useFirebase) syncWalkins();
  else { localStore.walkins = walkins; syncWalkins(); }
  if (manualSkip) addPendingSkip(waiter);
  showToast(`✅ Mesa para ${people} → ${waiter}`, 1500);
  return true;
}

function removeOneTableFromWaiter(waiter) {
  for (let i = walkins.length - 1; i >= 0; i--) {
    if (walkins[i].waiter === waiter) {
      walkins.splice(i, 1);
      if (useFirebase) syncWalkins();
      else { localStore.walkins = walkins; syncWalkins(); }
      showToast(`🗑️ Restada 1 mesa a ${waiter}`, 1800);
      return true;
    }
  }
  showToast(`❌ ${waiter} no tiene mesas`, 1500);
  return false;
}

function seatNextWaiter() {
  if (!waiterRotation.length) { showToast("No hay meseros en rotación", 1500); return; }
  let currentWaiter = waiterRotation[currentRotationIndex];
  let pending = skipTurnCounter[currentWaiter] || 0;
  if (pending > 0) {
    skipTurnCounter[currentWaiter] = pending - 1;
    if (useFirebase) syncRotation();
    else { localStore.rotation = { activeServersSet, waiterRotation, currentRotationIndex, skipTurnCounter }; syncRotation(); }
    showToast(`⚠️ ${currentWaiter} pierde un turno (${skipTurnCounter[currentWaiter]} restantes)`, 2000);
    advanceTurn();
    seatNextWaiter();
    return;
  }
  addWalkinEntry(2, currentWaiter, "rotación automática (2 pers.)", false);
  advanceTurn();
  showToast(`🍽️ Mesa automática a ${currentWaiter}`, 1500);
}

function skipCurrentTurn() {
  if (selectedWaiter && waiterRotation.includes(selectedWaiter)) {
    document.getElementById("skipTargetName").innerText = selectedWaiter;
    document.getElementById("skipOptionsModal").classList.add("active");
  } else {
    if (waiterRotation.length) { advanceTurn(); showToast(`⏭️ Turno saltado`, 1200); }
    else showToast("No hay meseros en rotación", 1000);
  }
}

function skipWithoutTable() {
  if (selectedWaiter) {
    addPendingSkip(selectedWaiter);
    showToast(`⏩ ${selectedWaiter} ha perdido un turno (sin mesa)`, 1500);
    document.getElementById("skipOptionsModal").classList.remove("active");
    clearSelection();
  }
}

function skipWithTable() {
  if (selectedWaiter) {
    addWalkinEntry(2, selectedWaiter, "Mesa asignada en salto", true);
    showToast(`🍽️ Mesa asignada a ${selectedWaiter} y pierde un turno`, 1800);
    document.getElementById("skipOptionsModal").classList.remove("active");
    clearSelection();
  }
}

function moveTurnToSelected() {
  if (!selectedWaiter) { showToast("No hay ningún mesero seleccionado", 1200); return; }
  const idx = waiterRotation.indexOf(selectedWaiter);
  if (idx === -1) { showToast("El mesero ya no está en la rotación", 1200); clearSelection(); return; }
  const removed = removeOneTableFromWaiter(selectedWaiter);
  currentRotationIndex = idx;
  if (useFirebase) syncRotation();
  else { localStore.rotation = { activeServersSet, waiterRotation, currentRotationIndex, skipTurnCounter }; syncRotation(); }
  renderRotationQueue();
  if (removed) showToast(`Turno movido a ${selectedWaiter} y se le ha restado 1 mesa`, 2000);
  else showToast(`Turno movido a ${selectedWaiter} (no tenía mesas para restar)`, 2000);
  clearSelection();
}

function clearSelection() {
  selectedWaiter = null;
  document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('selected'));
}

function selectWaiter(waiterName) {
  if (selectedWaiter === waiterName) clearSelection();
  else {
    clearSelection();
    selectedWaiter = waiterName;
    document.querySelectorAll('.queue-item').forEach(item => {
      if (item.querySelector('.waiter-name-span')?.innerText.includes(waiterName))
        item.classList.add('selected');
    });
  }
}

function renderRotationQueue() {
  const container = document.getElementById("queueContainer");
  if (!container) return;
  if (!waiterRotation.length) { container.innerHTML = "<em>No hay meseros en rotación</em>"; return; }
  const effectiveIdx = getEffectiveNextIndex();
  let html = "";
  waiterRotation.forEach((waiter, idx) => {
    const isEffectiveNext = (idx === effectiveIdx);
    const pending = skipTurnCounter[waiter] || 0;
    let extraClass = isEffectiveNext ? "next" : (pending > 0 ? "skip-turn" : "");
    let badge = "";
    if (pending > 0 && isEffectiveNext) badge = `<span class="skip-badge">Pierde ${pending}</span>`;
    else if (isEffectiveNext) badge = '<span class="next-badge">TURNO</span>';
    else if (pending > 0) badge = `<span class="skip-badge">-${pending}</span>`;
    html += `<div class="queue-item ${extraClass}" data-waiter="${waiter}">
               <span class="waiter-name-span"><i class="fas fa-user-tie"></i> ${waiter}</span>
               ${badge}
             </div>`;
  });
  container.innerHTML = html;
  document.querySelectorAll('.queue-item').forEach(el => {
    el.addEventListener('click', () => {
      const span = el.querySelector('.waiter-name-span');
      if (span) {
        let name = span.innerText.replace(/[🔹]/g, '').trim();
        const matched = waiterRotation.find(w => name.includes(w));
        if (matched) selectWaiter(matched);
      }
    });
  });
  if (selectedWaiter) {
    const selectedEl = Array.from(document.querySelectorAll('.queue-item')).find(el =>
      el.querySelector('.waiter-name-span')?.innerText.includes(selectedWaiter)
    );
    if (selectedEl) selectedEl.classList.add('selected');
    else clearSelection();
  }
}

function renderServerCheckboxes() {
  const container = document.getElementById("serverCheckboxesContainer");
  if (!container) return;
  const ALL_WAITERS = ["Ismael", "Bryan", "Horiandy", "Nayeli", "Jeel"];
  let html = "";
  for (let waiter of ALL_WAITERS) {
    const checked = activeServersSet.includes(waiter);
    html += `<label class="server-check"><input type="checkbox" class="server-checkbox" value="${waiter}" ${checked ? 'checked' : ''}> ${waiter}</label>`;
  }
  container.innerHTML = html;
}

function applyServerSelection() {
  const checkboxes = document.querySelectorAll('.server-checkbox');
  const newSel = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
  if (newSel.length === 0) { showToast("Selecciona al menos un mesero", 1500); return; }
  console.log("Selected servers:", newSel);
  showOrderModal(newSel);
}

let orderSortable = null;
function showOrderModal(servers) {
  const orderListContainer = document.getElementById("orderListContainer");
  orderListContainer.innerHTML = "";
  servers.forEach(server => {
    const div = document.createElement("div");
    div.className = "order-item";
    div.innerHTML = `<i class="fas fa-grip-vertical"></i><span>${server}</span>`;
    orderListContainer.appendChild(div);
  });
  if (orderSortable) orderSortable.destroy();
  orderSortable = new Sortable(orderListContainer, { animation: 200, handle: '.order-item', ghostClass: 'dragging' });
  document.getElementById("orderModal").classList.add("active");
}

function confirmOrder() {
  const items = Array.from(document.getElementById("orderListContainer").children);
  const orderedServers = items.map(item => item.querySelector('span')?.innerText.trim()).filter(s => s);
  if (orderedServers.length === 0) { showToast("No hay meseros en el orden", 1000); return; }
  console.log("New rotation order:", orderedServers);
  activeServersSet = [...orderedServers];
  waiterRotation = [...orderedServers];
  for (let w of waiterRotation) if (skipTurnCounter[w] === undefined) skipTurnCounter[w] = 0;
  Object.keys(skipTurnCounter).forEach(k => { if (!waiterRotation.includes(k)) delete skipTurnCounter[k]; });
  currentRotationIndex = 0;
  if (useFirebase) syncRotation();
  else { localStore.rotation = { activeServersSet, waiterRotation, currentRotationIndex, skipTurnCounter }; syncRotation(); }
  renderRotationQueue();
  renderServerCheckboxes();
  showToast(`Rotación actualizada con orden personalizado`, 1500);
  document.getElementById("orderModal").classList.remove("active");
  showStartModal();
}

function showStartModal() {
  if (waiterRotation.length === 0) return;
  const select = document.getElementById("startModalSelect");
  select.innerHTML = "";
  waiterRotation.forEach(w => {
    const option = document.createElement("option");
    option.value = w;
    option.textContent = w;
    select.appendChild(option);
  });
  select.value = waiterRotation[0];
  document.getElementById("startModal").classList.add("active");
}

function confirmStartSelection() {
  const selected = document.getElementById("startModalSelect").value;
  if (!selected || !waiterRotation.includes(selected)) return;
  currentRotationIndex = waiterRotation.indexOf(selected);
  if (useFirebase) syncRotation();
  else { localStore.rotation = { activeServersSet, waiterRotation, currentRotationIndex, skipTurnCounter }; syncRotation(); }
  renderRotationQueue();
  showToast(`Turno iniciado con ${selected}`, 1500);
  document.getElementById("startModal").classList.remove("active");
}

// ========== LEADERBOARD ==========
function computeWaiterStats() {
  const stats = {};
  const ALL_WAITERS = ["Ismael", "Bryan", "Horiandy", "Nayeli", "Jeel"];
  for (let w of ALL_WAITERS) stats[w] = { totalTables: 0 };
  for (let w of walkins) if (w.waiter && stats[w.waiter]) stats[w.waiter].totalTables++;
  return stats;
}

function renderWaiterUnifiedTable() {
  const tbody = document.getElementById("waiterTableBody");
  if (!tbody) return;
  const stats = computeWaiterStats();
  const ALL_WAITERS = ["Ismael", "Bryan", "Horiandy", "Nayeli", "Jeel"];
  const waiterArray = ALL_WAITERS.map(name => ({ name, ...stats[name] })).sort((a,b) => b.totalTables - a.totalTables);
  let html = "";
  waiterArray.forEach((w, idx) => {
    const rankIcon = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx+1}`;
    html += `<tr><td style="font-weight:bold;">${rankIcon}</td><td><strong>${w.name}</strong></td><td class="guest-count-large">${w.totalTables}</td></tr>`;
  });
  tbody.innerHTML = html;
}

function resetAllCounters() {
  if (confirm("⚠️ ¿Estás seguro de que deseas resetear TODAS las mesas a 0?")) {
    walkins = [];
    if (useFirebase) syncWalkins();
    else { localStore.walkins = walkins; syncWalkins(); }
    showToast("Todas las mesas han sido reseteadas a 0", 1600);
  }
}

// ========== RESERVATIONS (abbreviated for brevity) ==========
function isToday(dateStr) {
  const today = new Date().toISOString().slice(0,10);
  return dateStr === today;
}
function formatElapsed(ms) {
  if (ms < 0) return "0s";
  let mins = Math.floor(ms / 60000);
  let secs = Math.floor((ms % 60000) / 1000);
  return `${mins}min ${secs}s`;
}
function renderReservationsList() { /* same as before – keep existing working code */ }
function addReservation(name, partySize, phone, estimateMinutes, scheduledDate, scheduledTime, notes) { /* same */ }
// ... (keep all reservation functions as they were, they are not the cause of the rotation issue)

// ========== INITIALIZATION ==========
function init() {
  initDataListeners();
  // Attach event listeners
  document.getElementById("seatNextBtn")?.addEventListener("click", seatNextWaiter);
  document.getElementById("skipNextBtn")?.addEventListener("click", skipCurrentTurn);
  document.getElementById("moveToSelectedBtn")?.addEventListener("click", moveTurnToSelected);
  document.getElementById("applyServerSelectionBtn")?.addEventListener("click", applyServerSelection);
  document.getElementById("confirmOrderBtn")?.addEventListener("click", confirmOrder);
  document.getElementById("cancelOrderBtn")?.addEventListener("click", () => document.getElementById("orderModal").classList.remove("active"));
  document.getElementById("confirmStartBtn")?.addEventListener("click", confirmStartSelection);
  document.getElementById("cancelStartBtn")?.addEventListener("click", () => document.getElementById("startModal").classList.remove("active"));
  document.getElementById("resetAllTablesBtn")?.addEventListener("click", resetAllCounters);
  // ... attach all other buttons (skip modal, request modal, etc.) as before
}

document.addEventListener("DOMContentLoaded", init);