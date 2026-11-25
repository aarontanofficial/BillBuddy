let currentUser = null;
let currentHouseholdId = null;
let currentHouseholdData = null;
let billsUnsubscribe = null;
let allBills = [];
let activeFilter = 'all';
let editingBillId = null;

const screens = {
  auth: document.getElementById('authScreen'),
  household: document.getElementById('householdScreen'),
  app: document.getElementById('appScreen')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), duration);
}

function setupTabs(container) {
  const tabBtns = container.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      container.querySelectorAll('.auth-form').forEach(form => {
        form.classList.toggle('active', form.id.toLowerCase().includes(target));
      });
    });
  });
}

setupTabs(document.getElementById('authScreen'));
setupTabs(document.getElementById('householdScreen'));

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  hideAuthError();
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    showAuthError(err.message);
  }
});

document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  hideAuthError();
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection('users').doc(cred.user.uid).set({
      name,
      email,
      householdId: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    showAuthError(err.message);
  }
});

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideAuthError() {
  document.getElementById('authError').classList.add('hidden');
}

function showHouseholdError(msg) {
  const el = document.getElementById('householdError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideHouseholdError() {
  document.getElementById('householdError').classList.add('hidden');
}

document.getElementById('signOutBtnHousehold').addEventListener('click', () => auth.signOut());
document.getElementById('signOutBtn').addEventListener('click', () => auth.signOut());

function generateHouseholdCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

document.getElementById('createHouseholdForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideHouseholdError();
  const name = document.getElementById('householdName').value.trim();
  const code = generateHouseholdCode();
  try {
    const householdRef = await db.collection('households').add({
      name,
      code,
      ownerId: currentUser.uid,
      memberIds: [currentUser.uid],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('users').doc(currentUser.uid).update({ householdId: householdRef.id });
    currentHouseholdId = householdRef.id;
    await loadHousehold();
  } catch (err) {
    showHouseholdError(err.message);
  }
});

document.getElementById('joinHouseholdForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideHouseholdError();
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  try {
    const snap = await db.collection('households').where('code', '==', code).limit(1).get();
    if (snap.empty) {
      showHouseholdError('No household found with that code.');
      return;
    }
    const doc = snap.docs[0];
    await doc.ref.update({
      memberIds: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
    await db.collection('users').doc(currentUser.uid).update({ householdId: doc.id });
    currentHouseholdId = doc.id;
    await loadHousehold();
  } catch (err) {
    showHouseholdError(err.message);
  }
});

document.getElementById('codeBtn').addEventListener('click', () => {
  document.getElementById('codeValue').textContent = currentHouseholdData.code;
  document.getElementById('codeModal').classList.remove('hidden');
});

document.getElementById('closeCodeModalBtn').addEventListener('click', () => {
  document.getElementById('codeModal').classList.add('hidden');
});

document.getElementById('copyCodeBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(currentHouseholdData.code);
    showToast('Code copied to clipboard');
  } catch (e) {
    showToast('Could not copy code');
  }
});

async function loadHousehold() {
  const doc = await db.collection('households').doc(currentHouseholdId).get();
  currentHouseholdData = doc.data();
  document.getElementById('householdNameDisplay').textContent = currentHouseholdData.name;
  showScreen('app');
  listenToBills();
  requestNotificationPermission();
}

function listenToBills() {
  if (billsUnsubscribe) billsUnsubscribe();
  billsUnsubscribe = db.collection('households').doc(currentHouseholdId)
    .collection('bills')
    .orderBy('dueDate')
    .onSnapshot((snapshot) => {
      allBills = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      updateBillStatuses();
      renderBills();
      renderDashboard();
      checkReminders();
    }, (err) => {
      console.error('Bills listener error', err);
    });
}

// Work with calendar dates in the device's local timezone. Avoid UTC ISO
// conversion, which can shift Philippine dates to the previous day.
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDate(dateStr) {
  const [year, month, day] = String(dateStr || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function daysBetween(dateStr) {
  const today = parseLocalDate(todayISO());
  const due = parseLocalDate(dateStr);
  if (!today || !due) return 0;
  return Math.round((due - today) / 86400000);
}

function addMonthsClamped(dateStr, months = 1) {
  const source = parseLocalDate(dateStr) || parseLocalDate(todayISO());
  const targetMonth = source.getMonth() + months;
  const target = new Date(source.getFullYear(), targetMonth, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(source.getDate(), lastDay));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
}

const moneyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', minimumFractionDigits: 2
});
function formatMoney(value) {
  return moneyFormatter.format(Number(value || 0));
}

function updateBillStatuses() {
  allBills.forEach(bill => {
    if (bill.status !== 'paid') {
      const diff = daysBetween(bill.dueDate);
      bill.status = diff < 0 ? 'overdue' : 'pending';
    }
  });
}

function renderDashboard() {
  const total = allBills.length;
  const upcoming = allBills.filter(b => b.status === 'pending').length;
  const overdue = allBills.filter(b => b.status === 'overdue').length;
  const paid = allBills.filter(b => b.status === 'paid').length;
  const monthKey = todayISO().slice(0, 7);
  const expense = allBills
    .filter(b => String(b.dueDate || '').slice(0, 7) === monthKey)
    .reduce((sum, b) => sum + Number(b.amount || 0), 0);

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statUpcoming').textContent = upcoming;
  document.getElementById('statOverdue').textContent = overdue;
  document.getElementById('statPaid').textContent = paid;
  document.getElementById('statExpense').textContent = formatMoney(expense);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dueLabel(bill) {
  if (bill.status === 'paid') return `Paid`;
  const diff = daysBetween(bill.dueDate);
  if (diff === 0) return 'Due today';
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return `Due in ${diff}d`;
}

function renderBills() {
  const list = document.getElementById('billsList');
  const emptyState = document.getElementById('emptyState');
  let filtered = allBills;
  if (activeFilter !== 'all') {
    filtered = allBills.filter(b => b.status === activeFilter);
  }

  list.querySelectorAll('.bill-card').forEach(el => el.remove());

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    emptyState.textContent = activeFilter === 'all'
      ? 'No bills yet. Tap + to add your first bill.'
      : `No ${activeFilter} bills.`;
    return;
  }
  emptyState.classList.add('hidden');

  filtered.forEach(bill => {
    const card = document.createElement('div');
    card.className = `bill-card status-${bill.status}`;
    card.innerHTML = `
      <div class="bill-card-top">
        <div>
          <div class="bill-name">${escapeHtml(bill.name)}</div>
          <div class="bill-category">${escapeHtml(bill.category)}</div>
        </div>
        <div class="bill-amount">${formatMoney(bill.amount)}</div>
      </div>
      <div class="bill-card-mid">
        <span>${formatDate(bill.dueDate)} · ${dueLabel(bill)}</span>
        <span class="badge ${bill.status}">${bill.status}</span>
      </div>
      ${bill.recurring ? '<div class="recurring-tag">🔁 Monthly Recurring</div>' : ''}
      ${bill.notes ? `<div class="bill-notes">${escapeHtml(bill.notes)}</div>` : ''}
      <div class="bill-card-actions">
        ${bill.status !== 'paid' ? `<button class="bill-btn pay" data-id="${bill.id}">Mark Paid</button>` : ''}
        <button class="bill-btn edit" data-id="${bill.id}">Edit</button>
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('.bill-btn.pay').forEach(btn => {
    btn.addEventListener('click', () => markPaid(btn.dataset.id));
  });
  list.querySelectorAll('.bill-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderBills();
  });
});

async function markPaid(billId) {
  const bill = allBills.find(b => b.id === billId);
  if (!bill) return;
  const billRef = db.collection('households').doc(currentHouseholdId).collection('bills').doc(billId);
  await billRef.update({
    status: 'paid',
    paidAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  if (bill.recurring) {
    const nextDate = addMonthsClamped(bill.dueDate, 1);
    await db.collection('households').doc(currentHouseholdId).collection('bills').add({
      name: bill.name,
      amount: bill.amount,
      dueDate: nextDate,
      category: bill.category,
      recurring: true,
      notes: bill.notes || '',
      status: 'pending',
      createdBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast(`${bill.name} paid. Next bill created for ${formatDate(nextDate)}.`);
  } else {
    showToast(`${bill.name} marked as paid.`);
  }
}

const billModal = document.getElementById('billModal');
const billForm = document.getElementById('billForm');

document.getElementById('addBillFab').addEventListener('click', () => openAddModal());
document.getElementById('closeModalBtn').addEventListener('click', closeModal);

function openAddModal() {
  editingBillId = null;
  billForm.reset();
  document.getElementById('modalTitle').textContent = 'Add Bill';
  document.getElementById('deleteBillBtn').classList.add('hidden');
  document.getElementById('billDueDate').value = todayISO();
  billModal.classList.remove('hidden');
}

function openEditModal(billId) {
  const bill = allBills.find(b => b.id === billId);
  if (!bill) return;
  editingBillId = billId;
  document.getElementById('modalTitle').textContent = 'Edit Bill';
  document.getElementById('billName').value = bill.name;
  document.getElementById('billAmount').value = bill.amount;
  document.getElementById('billDueDate').value = bill.dueDate;
  document.getElementById('billCategory').value = bill.category;
  document.getElementById('billRecurring').checked = !!bill.recurring;
  document.getElementById('billNotes').value = bill.notes || '';
  document.getElementById('deleteBillBtn').classList.remove('hidden');
  billModal.classList.remove('hidden');
}

function closeModal() {
  billModal.classList.add('hidden');
  editingBillId = null;
}

billModal.addEventListener('click', (e) => {
  if (e.target === billModal) closeModal();
});

billForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    name: document.getElementById('billName').value.trim(),
    amount: parseFloat(document.getElementById('billAmount').value),
    dueDate: document.getElementById('billDueDate').value,
    category: document.getElementById('billCategory').value,
    recurring: document.getElementById('billRecurring').checked,
    notes: document.getElementById('billNotes').value.trim()
  };

  const billsRef = db.collection('households').doc(currentHouseholdId).collection('bills');

  if (editingBillId) {
    await billsRef.doc(editingBillId).update(data);
    showToast('Bill updated.');
  } else {
    data.status = daysBetween(data.dueDate) < 0 ? 'overdue' : 'pending';
    data.createdBy = currentUser.uid;
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    await billsRef.add(data);
    showToast('Bill added.');
  }
  closeModal();
});

document.getElementById('deleteBillBtn').addEventListener('click', async () => {
  if (!editingBillId) return;
  if (!confirm('Delete this bill?')) return;
  await db.collection('households').doc(currentHouseholdId).collection('bills').doc(editingBillId).delete();
  showToast('Bill deleted.');
  closeModal();
});

async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

let lastReminderCheckDate = null;

function checkReminders() {
  const today = todayISO();
  if (lastReminderCheckDate === today) return;
  lastReminderCheckDate = today;

  const dueSoon = [];
  const overdue = [];

  allBills.forEach(bill => {
    if (bill.status === 'paid') return;
    const diff = daysBetween(bill.dueDate);
    if ([7, 3, 1, 0].includes(diff)) dueSoon.push({ bill, diff });
    if (diff < 0) overdue.push(bill);
  });

  if (dueSoon.length === 0 && overdue.length === 0) return;

  const canNotify = 'Notification' in window && Notification.permission === 'granted';

  dueSoon.forEach(({ bill, diff }) => {
    const text = diff === 0
      ? `${bill.name} is due today (${formatMoney(bill.amount)})`
      : `${bill.name} is due in ${diff} day${diff > 1 ? 's' : ''} (${formatMoney(bill.amount)})`;
    if (canNotify) {
      new Notification('BillBuddy Reminder', { body: text, icon: 'icons/icon-192.png' });
    }
  });

  overdue.forEach(bill => {
    const text = `${bill.name} is overdue (${formatMoney(bill.amount)})`;
    if (canNotify) {
      new Notification('BillBuddy Overdue', { body: text, icon: 'icons/icon-192.png' });
    }
  });

  if (!canNotify) {
    const count = dueSoon.length + overdue.length;
    showToast(`📌 ${count} bill${count > 1 ? 's' : ''} need attention`, 5000);
  }
}

function updateOfflineBadge() {
  const badge = document.getElementById('offlineBadge');
  badge.textContent = navigator.onLine ? '' : 'Offline — cached viewing only. Changes need an internet connection.';
  badge.classList.toggle('hidden', navigator.onLine);
}

window.addEventListener('online', updateOfflineBadge);
window.addEventListener('offline', updateOfflineBadge);
updateOfflineBadge();

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data();
    if (userData && userData.householdId) {
      currentHouseholdId = userData.householdId;
      await loadHousehold();
    } else {
      showScreen('household');
    }
  } else {
    currentUser = null;
    currentHouseholdId = null;
    currentHouseholdData = null;
    if (billsUnsubscribe) {
      billsUnsubscribe();
      billsUnsubscribe = null;
    }
    showScreen('auth');
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.error('Service worker registration failed', err);
    });
  });
}

setInterval(() => {
  if (allBills.length) {
    updateBillStatuses();
    renderBills();
    renderDashboard();
    checkReminders();
  }
}, 60 * 60 * 1000);
