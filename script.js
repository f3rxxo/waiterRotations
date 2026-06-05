import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, push, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ========== FIREBASE CONFIGURATION ==========
// TODO: Replace with your own Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyBpLXiQn_7XIZbJ38uV_-PwTkIQFSqUraQ",
  authDomain: "juicyo-rotation.firebaseapp.com",
  databaseURL: "https://juicyo-rotation-default-rtdb.firebaseio.com/",
  projectId: "juicyo-rotation",
  storageBucket: "juicyo-rotation.firebasestorage.app",
  messagingSenderId: "1034615515937",
  appId: "1:1034615515937:web:68c1d7c12539ea1b6bac60"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ========== DATA STRUCTURES ==========
// All data is stored under a single root node 'juicyO'
// walkins: list of served tables
// reservations: list of future/present reservations
// rotation: { activeServersSet, waiterRotation, currentRotationIndex, skipTurnCounter }

let currentData = {
  walkins: [],
  reservations: [],
  rotation: {
    activeServersSet: ["Ismael", "Bryan", "Horiandy"],
    waiterRotation: ["Ismael", "Bryan", "Horiandy"],
    currentRotationIndex: 0,
    skipTurnCounter: { Ismael: 0, Bryan: 0, Horiandy: 0 }
  }
};

// Helper functions
function generateId() { return Date.now() + '-' + Math.random().toString(36).substr(2, 8); }
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); }
function showToast(msg, dur = 1800) {
  const toast = document.getElementById("toastMsg");
  if (!toast) return;
  toast.style.opacity = "1";
  toast.innerText = msg;
  setTimeout(() => { toast.style.opacity = "0"; }, dur);
}

// Global references for live updates
let walkins = [];
let reservations = [];
let waiterRotation = [];
let currentRotationIndex = 0;
let activeServersSet = [];
let skipTurnCounter = {};
let selectedWaiter = null;

// ========== SYNC WITH FIREBASE ==========
function syncWalkinsToFirebase() {
  set(ref(db, 'juicyO/walkins'), walkins);
}
function syncReservationsToFirebase() {
  set(ref(db, 'juicyO/reservations'), reservations);
}
function syncRotationToFirebase() {
  set(ref(db, 'juicyO/rotation'), {
    activeServersSet,
    waiterRotation,
    currentRotationIndex,
    skipTurnCounter
  });
}

// Listen for remote changes
function initFirebaseListeners() {
  const walkinsRef = ref(db, 'juicyO/walkins');
  const reservationsRef = ref(db, 'juicyO/reservations');
  const rotationRef = ref(db, 'juicyO/rotation');

  onValue(walkinsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      walkins = data;
      renderWaiterUnifiedTable();
    }
  });

  onValue(reservationsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      reservations = data;
      renderReservationsList();
    }
  });

  onValue(rotationRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      activeServersSet = data.activeServersSet || ["Ismael", "Bryan", "Horiandy"];
      waiterRotation = data.waiterRotation || [...activeServersSet];
      currentRotationIndex = data.currentRotationIndex || 0;
      skipTurnCounter = data.skipTurnCounter || {};
      for (let w of activeServersSet) if (skipTurnCounter[w] === undefined) skipTurnCounter[w] = 0;
      renderRotationQueue();
      renderServerCheckboxes();
    }
  });
}

// ========== ROTATION LOGIC (same as before, but uses global arrays) ==========
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
  syncRotationToFirebase();
}

function advanceTurn() {
  if (!waiterRotation.length) return false;
  currentRotationIndex = (currentRotationIndex + 1) % waiterRotation.length;
  syncRotationToFirebase();
  return true;
}

function addWalkinEntry(people, waiter, note, manualSkip = true) {
  if (people < 1) return false;
  const newWalkin = {
    id: generateId(),
    people,
    waiter,
    note: note.trim() || "mesa",
    timestamp: new Date().toLocaleTimeString()
  };
  walkins.push(newWalkin);
  syncWalkinsToFirebase();
  if (manualSkip) {
    addPendingSkip(waiter);
  }
  showToast(`✅ Mesa para ${people} → ${waiter}`, 1500);
  return true;
}

function removeOneTableFromWaiter(waiter) {
  for (let i = walkins.length - 1; i >= 0; i--) {
    if (walkins[i].waiter === waiter) {
      walkins.splice(i, 1);
      syncWalkinsToFirebase();
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
    syncRotationToFirebase();
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
  syncRotationToFirebase();
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
  // attach click events
  document.querySelectorAll('.queue-item').forEach(el => {
    el.removeEventListener('click', () => {});
    el.addEventListener('click', (e) => {
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
  // Show order modal
  showOrderModal(newSel);
}

// Order modal with SortableJS
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
  if (orderedServers.length === 0) return;
  activeServersSet = [...orderedServers];
  waiterRotation = [...orderedServers];
  for (let w of waiterRotation) if (skipTurnCounter[w] === undefined) skipTurnCounter[w] = 0;
  Object.keys(skipTurnCounter).forEach(k => { if (!waiterRotation.includes(k)) delete skipTurnCounter[k]; });
  currentRotationIndex = 0;
  syncRotationToFirebase();
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
  syncRotationToFirebase();
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
    syncWalkinsToFirebase();
    showToast("Todas las mesas han sido reseteadas a 0", 1600);
  }
}

// ========== RESERVATIONS ==========
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

function renderReservationsList() {
  const currentTbody = document.getElementById("currentReservationsTbody");
  const futureTbody = document.getElementById("futureReservationsTbody");
  if (!currentTbody || !futureTbody) return;
  const now = new Date();
  const currentTime = now.getTime();
  const currentRes = reservations.filter(r => isToday(r.scheduledDate));
  const futureRes = reservations.filter(r => !isToday(r.scheduledDate));
  currentRes.sort((a,b) => (a.scheduledTime || "00:00").localeCompare(b.scheduledTime || "00:00"));
  futureRes.sort((a,b) => (a.scheduledDate + a.scheduledTime).localeCompare(b.scheduledDate + b.scheduledTime));

  let currentHtml = '';
  currentRes.forEach(res => {
    const scheduledDateTime = new Date(`${res.scheduledDate}T${res.scheduledTime || "00:00"}`);
    const elapsedMs = currentTime - (res.createdAt || scheduledDateTime.getTime());
    const elapsedStr = formatElapsed(elapsedMs);
    const isOverdue = (elapsedMs / 60000) > res.estimateMinutes;
    const timerColorClass = isOverdue ? "text-red" : "";
    currentHtml += `
      <tr>
        <td><strong>${escapeHtml(res.name)}</strong></td>
        <td style="text-align: center;">${res.partySize}</td>
        <td>${escapeHtml(res.phone)}</td>
        <td style="font-size:0.8rem;">${res.scheduledTime || "—"}</td>
        <td style="text-align: center;"><span class="timer-cell ${timerColorClass}"><i class="fas fa-hourglass-start"></i> ${elapsedStr}</span></td>
        <td style="text-align: center;">${res.estimateMinutes} min</td>
        <td style="text-align: left; max-width: 180px; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(res.notes || '')}">${escapeHtml(res.notes || '—')}</td>
        <td style="text-align: center;">
          <div class="action-cell">
            <button class="sms-btn-large notify-res-btn" data-id="${res.id}" data-name="${escapeHtml(res.name)}" data-phone="${escapeHtml(res.phone)}" data-party="${res.partySize}"><i class="fas fa-envelope"></i> Enviar SMS</button>
            <div class="dual-buttons">
              <button class="assign-res-btn" data-id="${res.id}" data-name="${escapeHtml(res.name)}" data-phone="${escapeHtml(res.phone)}" data-party="${res.partySize}"><i class="fas fa-chair"></i> Asignar</button>
              <button class="delete-res-btn" data-id="${res.id}"><i class="fas fa-trash-can"></i> Eliminar</button>
            </div>
          </div>
        </td>
      </tr>
    `;
  });
  if (currentRes.length === 0) currentHtml = '<tr><td colspan="8" style="text-align:center;">No hay reservaciones para hoy</td></tr>';
  currentTbody.innerHTML = currentHtml;

  let futureHtml = '';
  futureRes.forEach(res => {
    futureHtml += `
      <tr>
        <td><strong>${escapeHtml(res.name)}</strong></td>
        <td style="text-align: center;">${res.partySize}</td>
        <td>${escapeHtml(res.phone)}</td>
        <td>${escapeHtml(res.scheduledDate)} ${escapeHtml(res.scheduledTime || "—")}</td>
        <td style="text-align: left; max-width: 180px;" title="${escapeHtml(res.notes || '')}">${escapeHtml(res.notes || '—')}</td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 4px;">
            <button class="sms-btn-large notify-res-btn" data-id="${res.id}" data-name="${escapeHtml(res.name)}" data-phone="${escapeHtml(res.phone)}" data-party="${res.partySize}" style="padding: 0.3rem 0.5rem; font-size:0.7rem;"><i class="fas fa-envelope"></i> SMS</button>
            <button class="assign-res-btn" data-id="${res.id}" data-name="${escapeHtml(res.name)}" data-phone="${escapeHtml(res.phone)}" data-party="${res.partySize}" style="padding: 0.3rem 0.5rem; font-size:0.7rem;"><i class="fas fa-chair"></i> Asignar</button>
            <button class="delete-res-btn" data-id="${res.id}" style="padding: 0.3rem 0.5rem; font-size:0.7rem;"><i class="fas fa-trash-can"></i> Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  });
  if (futureRes.length === 0) futureHtml = '<tr><td colspan="6" style="text-align:center;">No hay reservaciones futuras</td></tr>';
  futureTbody.innerHTML = futureHtml;

  // attach events
  document.querySelectorAll(".notify-res-btn").forEach(btn => {
    btn.removeEventListener("click", notifyHandler);
    btn.addEventListener("click", notifyHandler);
  });
  document.querySelectorAll(".assign-res-btn").forEach(btn => {
    btn.removeEventListener("click", assignHandler);
    btn.addEventListener("click", assignHandler);
  });
  document.querySelectorAll(".delete-res-btn").forEach(btn => {
    btn.removeEventListener("click", deleteHandler);
    btn.addEventListener("click", deleteHandler);
  });
}

function notifyHandler(e) {
  const btn = e.currentTarget;
  const name = btn.getAttribute("data-name");
  const phone = btn.getAttribute("data-phone");
  const party = btn.getAttribute("data-party");
  const smsMsg = encodeURIComponent(`Hello ${name}, your table for ${party} people is ready at Juicy-O. We look forward to serving you!`);
  window.location.href = `sms:${phone}?body=${smsMsg}`;
  showToast(`📱 SMS abierto para ${name}`, 1500);
}

function assignHandler(e) {
  const btn = e.currentTarget;
  const id = btn.getAttribute("data-id");
  const name = btn.getAttribute("data-name");
  const phone = btn.getAttribute("data-phone");
  const party = parseInt(btn.getAttribute("data-party"));
  const reservation = reservations.find(r => r.id === id);
  if (reservation) openAssignModal(reservation, party, name, phone);
}

function deleteHandler(e) {
  const id = e.currentTarget.getAttribute("data-id");
  if (confirm("¿Eliminar esta reservación permanentemente?")) {
    reservations = reservations.filter(r => r.id !== id);
    syncReservationsToFirebase();
    showToast("Reservación eliminada", 1200);
  }
}

let pendingAssign = null;
function openAssignModal(reservation, partySize, customerName, phone) {
  if (!waiterRotation.length) {
    showToast("No hay meseros activos. Configúralos en la pestaña Rotación.", 2000);
    return;
  }
  pendingAssign = { reservation, partySize, customerName, phone };
  const select = document.getElementById("assignReservationSelect");
  select.innerHTML = "";
  const ordered = [];
  let idx = currentRotationIndex;
  for (let i = 0; i < waiterRotation.length; i++) {
    ordered.push(waiterRotation[(idx + i) % waiterRotation.length]);
  }
  ordered.forEach(w => {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = w;
    select.appendChild(opt);
  });
  const effective = getEffectiveNextServer();
  if (effective) select.value = effective;
  document.getElementById("assignReservationInfo").innerHTML = `<i class="fas fa-user"></i> ${escapeHtml(customerName)} (${partySize} pers.)<br><i class="fas fa-phone"></i> ${escapeHtml(phone)}`;
  document.getElementById("assignReservationModal").classList.add("active");
}

function confirmAssignAndRemove() {
  if (!pendingAssign) return;
  const selected = document.getElementById("assignReservationSelect").value;
  if (!selected) { showToast("Selecciona un mesero", 1000); return; }
  const { reservation, partySize, customerName } = pendingAssign;
  addWalkinEntry(partySize, selected, `Reserva: ${customerName}`, true);
  reservations = reservations.filter(r => r.id !== reservation.id);
  syncReservationsToFirebase();
  document.getElementById("assignReservationModal").classList.remove("active");
  pendingAssign = null;
  showToast(`✅ Mesa de ${customerName} asignada a ${selected}. Reserva eliminada.`, 2500);
}

function addReservation(name, partySize, phone, estimateMinutes, scheduledDate, scheduledTime, notes) {
  if (!name.trim()) { showToast("Nombre requerido", 1000); return false; }
  if (partySize < 1) { showToast("Número de personas mínimo 1", 1000); return false; }
  if (!phone.trim()) { showToast("Teléfono requerido", 1000); return false; }
  const est = parseInt(estimateMinutes);
  if (isNaN(est) || est < 0) { showToast("Tiempo estimado válido", 1000); return false; }
  let finalDate = scheduledDate, finalTime = scheduledTime;
  if (!finalDate || !finalTime) {
    const now = new Date();
    finalDate = now.toISOString().slice(0,10);
    finalTime = now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
  }
  const newRes = {
    id: generateId(),
    name: name.trim(),
    partySize: parseInt(partySize),
    phone: phone.trim(),
    scheduledDate: finalDate,
    scheduledTime: finalTime,
    estimateMinutes: est,
    notes: notes ? notes.trim() : "",
    createdAt: Date.now()
  };
  reservations.unshift(newRes);
  syncReservationsToFirebase();
  showToast(`Reserva para ${name.trim()} agregada (${finalDate} ${finalTime})`, 1800);
  return true;
}

// ========== INITIALIZATION ==========
function init() {
  initFirebaseListeners();
  // wait for initial data before enabling UI interactions
  // Buttons are wired after DOM ready
  document.getElementById("seatNextBtn")?.addEventListener("click", seatNextWaiter);
  document.getElementById("skipNextBtn")?.addEventListener("click", skipCurrentTurn);
  document.getElementById("moveToSelectedBtn")?.addEventListener("click", moveTurnToSelected);
  document.getElementById("assignRequestBtn")?.addEventListener("click", () => {
    if (waiterRotation.length) document.getElementById("requestModal").classList.add("active");
    else showToast("No hay meseros activos", 1500);
  });
  document.getElementById("confirmRequestBtn")?.addEventListener("click", () => {
    const selected = document.getElementById("requestModalSelect").value;
    if (selected && waiterRotation.includes(selected)) {
      addWalkinEntry(2, selected, "Solicitud especial", true);
      document.getElementById("requestModal").classList.remove("active");
    } else showToast("Selecciona un mesero", 1000);
  });
  document.getElementById("cancelRequestBtn")?.addEventListener("click", () => document.getElementById("requestModal").classList.remove("active"));
  document.getElementById("skipWithoutTableBtn")?.addEventListener("click", skipWithoutTable);
  document.getElementById("skipWithTableBtn")?.addEventListener("click", skipWithTable);
  document.getElementById("cancelSkipBtn")?.addEventListener("click", () => document.getElementById("skipOptionsModal").classList.remove("active"));
  document.getElementById("applyServerSelectionBtn")?.addEventListener("click", applyServerSelection);
  document.getElementById("confirmOrderBtn")?.addEventListener("click", confirmOrder);
  document.getElementById("cancelOrderBtn")?.addEventListener("click", () => document.getElementById("orderModal").classList.remove("active"));
  document.getElementById("confirmStartBtn")?.addEventListener("click", confirmStartSelection);
  document.getElementById("cancelStartBtn")?.addEventListener("click", () => document.getElementById("startModal").classList.remove("active"));
  document.getElementById("resetAllTablesBtn")?.addEventListener("click", resetAllCounters);
  document.getElementById("confirmAssignReservationBtn")?.addEventListener("click", confirmAssignAndRemove);
  document.getElementById("cancelAssignReservationBtn")?.addEventListener("click", () => document.getElementById("assignReservationModal").classList.remove("active"));
  document.getElementById("nowButton")?.addEventListener("click", () => {
    const now = new Date();
    document.getElementById("resDate").value = now.toISOString().slice(0,10);
    document.getElementById("resTime").value = now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
    showToast("Fecha y hora actuales seleccionadas", 1000);
  });
  document.getElementById("reservationForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("resName").value;
    const party = document.getElementById("resParty").value;
    const phone = document.getElementById("resPhone").value;
    const estimate = document.getElementById("resEstimate").value;
    const date = document.getElementById("resDate").value;
    const time = document.getElementById("resTime").value;
    const notes = document.getElementById("resNotes").value;
    addReservation(name, parseInt(party), phone, parseInt(estimate), date, time, notes);
    e.target.reset();
    document.getElementById("resEstimate").value = "25";
  });
  document.getElementById("clearAllReservationsBtn")?.addEventListener("click", () => {
    if (confirm("¿Eliminar TODAS las reservaciones?")) {
      reservations = [];
      syncReservationsToFirebase();
      showToast("Todas las reservas eliminadas", 1500);
    }
  });

  // fill request modal select
  function fillRequestSelect() {
    const sel = document.getElementById("requestModalSelect");
    if (sel) {
      sel.innerHTML = "";
      waiterRotation.forEach(w => {
        const opt = document.createElement("option");
        opt.value = w;
        opt.textContent = w;
        sel.appendChild(opt);
      });
    }
  }
  fillRequestSelect();
  setInterval(() => {
    if (document.getElementById("reservationsTab")?.classList.contains("active-pane"))
      renderReservationsList();
  }, 1000);

  // Tab switching
  const tabs = document.querySelectorAll(".tab-btn");
  const panes = {
    rotation: document.getElementById("rotationTab"),
    leaderboard: document.getElementById("leaderboardTab"),
    reservations: document.getElementById("reservationsTab")
  };
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      Object.values(panes).forEach(p => p.classList.remove("active-pane"));
      if (panes[tabId]) panes[tabId].classList.add("active-pane");
      tabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (tabId === "leaderboard") renderWaiterUnifiedTable();
      if (tabId === "rotation") { renderRotationQueue(); renderServerCheckboxes(); }
      if (tabId === "reservations") renderReservationsList();
    });
  });
}

// Wait for DOM content loaded
document.addEventListener("DOMContentLoaded", init);