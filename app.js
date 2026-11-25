import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.2';
const supabase=createClient('https://agninfkeebfpodcawtqu.supabase.co','sb_publishable_oc4DINFH-PtvBVij5Wojtg_Tec06XKf',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let currentUser=null,currentHouseholdId=null,currentHouseholdData=null,billsChannel=null,allBills=[],activeFilter='all',editingBillId=null;
const screens={auth:document.getElementById('authScreen'),household:document.getElementById('householdScreen'),app:document.getElementById('appScreen')};
function showScreen(n){Object.values(screens).forEach(s=>s.classList.add('hidden'));screens[n].classList.remove('hidden')}
function showToast(m,d=3000){const t=document.getElementById('toast');t.textContent=m;t.classList.remove('hidden');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.add('hidden'),d)}
function errText(e){let m=String(e?.message||e||'Something went wrong.');if(/Invalid login credentials/i.test(m))return'Email or password is incorrect.';if(/Email not confirmed/i.test(m))return'Please verify your email using the link we sent you.';if(/User already registered/i.test(m))return'An account with this email already exists. Please log in.';return m}
function setupTabs(c){c.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click',()=>{c.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');c.querySelectorAll('.auth-form').forEach(f=>f.classList.toggle('active',f.id.toLowerCase().includes(b.dataset.tab)))}))}
setupTabs(screens.auth);setupTabs(screens.household);
function showAuthError(m){const e=document.getElementById('authError');e.textContent=m;e.classList.remove('hidden')}
function hideAuthError(){document.getElementById('authError').classList.add('hidden')}
function showHouseholdError(m){const e=document.getElementById('householdError');e.textContent=m;e.classList.remove('hidden')}
function hideHouseholdError(){document.getElementById('householdError').classList.add('hidden')}
document.getElementById('loginForm').addEventListener('submit',async e=>{e.preventDefault();hideAuthError();const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;try{const{error}=await supabase.auth.signInWithPassword({email:document.getElementById('loginEmail').value.trim(),password:document.getElementById('loginPassword').value});if(error)throw error}catch(x){showAuthError(errText(x))}finally{b.disabled=false}});
document.getElementById('signupForm').addEventListener('submit',async e=>{e.preventDefault();hideAuthError();const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;try{const{data,error}=await supabase.auth.signUp({email:document.getElementById('signupEmail').value.trim(),password:document.getElementById('signupPassword').value,options:{data:{full_name:document.getElementById('signupName').value.trim()},emailRedirectTo:'https://aarontanofficial.github.io/BillBuddy/'}});if(error)throw error;if(data.session)showToast('Account created. Welcome to BillBuddy!');else showAuthError('Account created. Please check your email and confirm your address, then log in.')}catch(x){showAuthError(errText(x))}finally{b.disabled=false}});
document.getElementById('googleSignInBtn').addEventListener('click',async()=>{hideAuthError();const b=document.getElementById('googleSignInBtn');b.disabled=true;try{const{error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:'https://aarontanofficial.github.io/BillBuddy/',queryParams:{prompt:'select_account'}}});if(error)throw error}catch(e){showAuthError(errText(e));b.disabled=false}});
const authErrorParams=new URLSearchParams(location.hash.replace(/^#/,' '));const authError=authErrorParams.get('error_description')||authErrorParams.get('error');if(authError){showAuthError(decodeURIComponent(authError.replace(/\+/g,' ')));history.replaceState(null,'',location.pathname+location.search)}
async function signOut(){const{error}=await supabase.auth.signOut();if(error)showToast(errText(error))}
document.getElementById('signOutBtnHousehold').addEventListener('click',signOut);document.getElementById('signOutBtn').addEventListener('click',signOut);
function genCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=new Uint8Array(6);crypto.getRandomValues(bytes);return Array.from(bytes,b=>chars[b%chars.length]).join('')}
document.getElementById('createHouseholdForm').addEventListener('submit',async e=>{e.preventDefault();hideHouseholdError();const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;try{let id=null;for(let i=0;i<4;i++){const{data,error}=await supabase.rpc('create_household',{p_name:document.getElementById('householdName').value.trim(),p_code:genCode()});if(!error){id=data;break}if(!/duplicate key|unique constraint/i.test(error.message)||i===3)throw error}if(!id)throw Error('Could not create household. Please try again.');await loadHousehold(id)}catch(x){showHouseholdError(errText(x))}finally{b.disabled=false}});
document.getElementById('joinHouseholdForm').addEventListener('submit',async e=>{e.preventDefault();hideHouseholdError();const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;try{const{data,error}=await supabase.rpc('join_household',{p_code:document.getElementById('joinCode').value.trim().toUpperCase()});if(error)throw error;await loadHousehold(data)}catch(x){showHouseholdError(errText(x))}finally{b.disabled=false}});
document.getElementById('codeBtn').addEventListener('click',()=>{if(!currentHouseholdData)return;document.getElementById('codeValue').textContent=currentHouseholdData.invite_code;document.getElementById('codeModal').classList.remove('hidden')});
document.getElementById('closeCodeModalBtn').addEventListener('click',()=>document.getElementById('codeModal').classList.add('hidden'));
document.getElementById('copyCodeBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(currentHouseholdData.invite_code);showToast('Code copied to clipboard')}catch{showToast('Could not copy code')}});
async function getMyHousehold(){const{data:m,error}=await supabase.from('household_members').select('household_id').eq('user_id',currentUser.id).maybeSingle();if(error)throw error;if(!m)return null;return fetchHousehold(m.household_id)}
async function fetchHousehold(id){const{data,error}=await supabase.from('households').select('id,name,invite_code,owner_id').eq('id',id).single();if(error)throw error;return data}

async function fetchGmailRequests(){
  const list=document.getElementById('gmailRequestsList');
  const {data,error}=await supabase.from('gmail_connection_requests')
    .select('id,gmail_address,status,created_at,requested_by,reviewed_at')
    .eq('household_id',currentHouseholdId).order('created_at',{ascending:false});
  if(error)throw error;
  renderGmailRequests(data||[]);
}
function renderGmailRequests(rows){
  const list=document.getElementById('gmailRequestsList');
  const active=rows.find(r=>['pending','approved','connected'].includes(r.status));
  const status=document.getElementById('gmailInboxStatus');
  status.textContent=active?.status==='connected'?'Connected':active?.status==='approved'?'Approved · authorization needed':active?.status==='pending'?'Awaiting owner approval':'Not connected';
  const form=document.getElementById('gmailRequestForm');
  const hasActive=!!active;
  form.classList.toggle('hidden',hasActive);
  if(!rows.length){list.innerHTML='<p class="inbox-empty">No Gmail connection requests yet.</p>';return}
  list.innerHTML=rows.map(r=>{
    const owner=currentHouseholdData?.owner_id===currentUser?.id;
    const actions=owner&&r.status==='pending'
      ?'<div class="gmail-request-actions"><button class="bill-btn pay" data-gmail-action="approved" data-id="'+r.id+'">Approve</button><button class="bill-btn edit" data-gmail-action="rejected" data-id="'+r.id+'">Decline</button></div>'
      :'';
    const label=r.status==='pending'?'Waiting for owner':r.status==='approved'?'Approved · Gmail owner authorization required':r.status==='connected'?'Connected':r.status==='rejected'?'Declined':'Cancelled';
    return '<article class="gmail-request-card"><div class="gmail-request-info"><strong>'+escapeHtml(r.gmail_address)+'</strong><span class="gmail-request-state state-'+r.status+'">'+label+'</span></div>'+actions+'</article>';
  }).join('');
  list.querySelectorAll('[data-gmail-action]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try{
      const{error}=await supabase.rpc('review_gmail_connection_request',{p_request_id:button.dataset.id,p_decision:button.dataset.gmailAction});
      if(error)throw error;
      showToast(button.dataset.gmailAction==='approved'?'Request approved. Gmail authorization is the next step.':'Request declined.');
      await fetchGmailRequests();
    }catch(e){showToast(errText(e));button.disabled=false}
  }));
}
document.getElementById('gmailRequestForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const button=document.getElementById('gmailRequestSubmit');
  const address=document.getElementById('gmailRequestAddress').value.trim().toLowerCase();
  button.disabled=true;
  try{
    const{error}=await supabase.from('gmail_connection_requests').insert({
      household_id:currentHouseholdId,requested_by:currentUser.id,gmail_address:address,status:'pending'
    });
    if(error)throw error;
    document.getElementById('gmailRequestAddress').value='';
    showToast('Gmail access request sent to the household owner.');
    await fetchGmailRequests();
  }catch(e){showToast(errText(e))}
  finally{button.disabled=false}
});
document.getElementById('refreshGmailRequests').addEventListener('click',()=>fetchGmailRequests().catch(e=>showToast(errText(e))));

async function loadHousehold(id=null){if(billsChannel){await supabase.removeChannel(billsChannel);billsChannel=null}currentHouseholdData=id?await fetchHousehold(id):await getMyHousehold();if(!currentHouseholdData){currentHouseholdId=null;showScreen('household');return}currentHouseholdId=currentHouseholdData.id;document.getElementById('householdNameDisplay').textContent=currentHouseholdData.name;showScreen('app');await fetchBills();subscribeBills();await fetchGmailRequests();requestNotificationPermission()}
function fromDb(r){return{id:r.id,name:r.name,amount:Number(r.amount),dueDate:r.due_date,category:r.category,recurring:r.recurring,recurringDay:r.recurring_day,notes:r.notes,status:r.status,paidAt:r.paid_at,createdBy:r.created_by}}
async function fetchBills(){const{data,error}=await supabase.from('bills').select('*').eq('household_id',currentHouseholdId).order('due_date');if(error)throw error;allBills=(data||[]).map(fromDb);updateBillStatuses();renderBills();renderDashboard();checkReminders()}
function subscribeBills(){if(billsChannel)supabase.removeChannel(billsChannel);billsChannel=supabase.channel('billbuddy-bills-'+currentHouseholdId).on('postgres_changes',{event:'*',schema:'public',table:'bills',filter:'household_id=eq.'+currentHouseholdId},()=>fetchBills().catch(e=>showToast(errText(e)))).subscribe()}
function todayISO(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function parseLocalDate(s){const[y,m,d]=String(s||'').split('-').map(Number);return y&&m&&d?new Date(y,m-1,d,12):null}
function daysBetween(s){const a=parseLocalDate(todayISO()),b=parseLocalDate(s);return a&&b?Math.round((b-a)/86400000):0}
function addMonthsClamped(s,n=1,p=null){const a=parseLocalDate(s)||parseLocalDate(todayISO()),day=Number(p)||a.getDate(),t=new Date(a.getFullYear(),a.getMonth()+n,1,12);t.setDate(Math.min(day,new Date(t.getFullYear(),t.getMonth()+1,0).getDate()));return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0')}
const money=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:2});
function formatMoney(v){return money.format(Number(v||0))}
function updateBillStatuses(){allBills.forEach(b=>{if(b.status!=='paid')b.status=daysBetween(b.dueDate)<0?'overdue':'pending'})}
function renderDashboard(){const n=allBills.length,month=todayISO().slice(0,7),expense=allBills.filter(b=>String(b.dueDate).slice(0,7)===month).reduce((s,b)=>s+Number(b.amount||0),0);document.getElementById('statTotal').textContent=n;document.getElementById('statUpcoming').textContent=allBills.filter(b=>b.status==='pending').length;document.getElementById('statOverdue').textContent=allBills.filter(b=>b.status==='overdue').length;document.getElementById('statPaid').textContent=allBills.filter(b=>b.status==='paid').length;document.getElementById('statExpense').textContent=formatMoney(expense)}
function formatDate(s){const d=parseLocalDate(s);return d?d.toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}):s}
function dueLabel(b){if(b.status==='paid')return'Paid';const n=daysBetween(b.dueDate);return n===0?'Due today':n<0?Math.abs(n)+'d overdue':'Due in '+n+'d'}
function escapeHtml(s){const d=document.createElement('div');d.textContent=s||'';return d.innerHTML}
function renderBills(){const list=document.getElementById('billsList'),empty=document.getElementById('emptyState'),rows=activeFilter==='all'?allBills:allBills.filter(b=>b.status===activeFilter);list.querySelectorAll('.bill-card').forEach(e=>e.remove());if(!rows.length){empty.classList.remove('hidden');empty.textContent=activeFilter==='all'?'No bills yet. Tap + to add your first bill.':'No '+activeFilter+' bills.';return}empty.classList.add('hidden');rows.forEach((b,i)=>{const card=document.createElement('div');card.className='bill-card status-'+b.status;card.style.setProperty('--stagger-index',Math.min(i,8));card.innerHTML='<div class="bill-card-top"><div><div class="bill-name">'+escapeHtml(b.name)+'</div><div class="bill-category">'+escapeHtml(b.category)+'</div></div><div class="bill-amount">'+formatMoney(b.amount)+'</div></div><div class="bill-card-mid"><span>'+formatDate(b.dueDate)+' · '+dueLabel(b)+'</span><span class="badge '+b.status+'">'+b.status+'</span></div>'+(b.recurring?'<div class="recurring-tag">🔁 Monthly Recurring</div>':'')+(b.notes?'<div class="bill-notes">'+escapeHtml(b.notes)+'</div>':'')+'<div class="bill-card-actions">'+(b.status!=='paid'?'<button class="bill-btn pay" data-id="'+b.id+'">Mark Paid</button>':'')+'<button class="bill-btn edit" data-id="'+b.id+'">Edit</button></div>';list.appendChild(card)});list.querySelectorAll('.bill-btn.pay').forEach(b=>b.addEventListener('click',()=>markPaid(b.dataset.id)));list.querySelectorAll('.bill-btn.edit').forEach(b=>b.addEventListener('click',()=>openEditModal(b.dataset.id)))}
document.querySelectorAll('.filter-btn').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.filter-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeFilter=b.dataset.filter;renderBills()}));
async function markPaid(id){const bill=allBills.find(b=>b.id===id);if(!bill)return;try{const{error}=await supabase.from('bills').update({status:'paid',paid_at:new Date().toISOString()}).eq('id',id).eq('household_id',currentHouseholdId);if(error)throw error;if(bill.recurring){const day=Number(bill.recurringDay)||(parseLocalDate(bill.dueDate)||new Date()).getDate(),next=addMonthsClamped(bill.dueDate,1,day);const{error:e}=await supabase.from('bills').insert({household_id:currentHouseholdId,name:bill.name,amount:bill.amount,due_date:next,category:bill.category,recurring:true,recurring_day:day,notes:bill.notes||'',status:'pending',created_by:currentUser.id});if(e)throw e;showToast(bill.name+' paid. Next bill created for '+formatDate(next)+'.')}else showToast(bill.name+' marked as paid.');await fetchBills()}catch(e){showToast(errText(e))}}
const billModal=document.getElementById('billModal'),billForm=document.getElementById('billForm');
document.getElementById('addBillFab').addEventListener('click',openAddModal);document.getElementById('closeModalBtn').addEventListener('click',closeModal);
function openAddModal(){editingBillId=null;billForm.reset();document.getElementById('modalTitle').textContent='Add Bill';document.getElementById('deleteBillBtn').classList.add('hidden');document.getElementById('billDueDate').value=todayISO();billModal.classList.remove('hidden')}
function openEditModal(id){const b=allBills.find(x=>x.id===id);if(!b)return;editingBillId=id;document.getElementById('modalTitle').textContent='Edit Bill';document.getElementById('billName').value=b.name;document.getElementById('billAmount').value=b.amount;document.getElementById('billDueDate').value=b.dueDate;document.getElementById('billCategory').value=b.category;document.getElementById('billRecurring').checked=!!b.recurring;document.getElementById('billNotes').value=b.notes||'';document.getElementById('deleteBillBtn').classList.remove('hidden');billModal.classList.remove('hidden')}
function closeModal(){billModal.classList.add('hidden');editingBillId=null}
billModal.addEventListener('click',e=>{if(e.target===billModal)closeModal()});
billForm.addEventListener('submit',async e=>{e.preventDefault();const due=document.getElementById('billDueDate').value,rec=document.getElementById('billRecurring').checked,prev=editingBillId?allBills.find(b=>b.id===editingBillId):null,p={name:document.getElementById('billName').value.trim(),amount:Number.parseFloat(document.getElementById('billAmount').value),due_date:due,category:document.getElementById('billCategory').value,recurring:rec,recurring_day:rec?(Number(prev?.recurringDay)||(parseLocalDate(due)||new Date()).getDate()):null,notes:document.getElementById('billNotes').value.trim()},button=billForm.querySelector('[type=submit]');button.disabled=true;try{let q;if(editingBillId)q=await supabase.from('bills').update(p).eq('id',editingBillId).eq('household_id',currentHouseholdId);else q=await supabase.from('bills').insert({...p,household_id:currentHouseholdId,status:daysBetween(due)<0?'overdue':'pending',created_by:currentUser.id});if(q.error)throw q.error;showToast(editingBillId?'Bill updated.':'Bill added.');closeModal();await fetchBills()}catch(x){showToast(errText(x))}finally{button.disabled=false}});
document.getElementById('deleteBillBtn').addEventListener('click',async()=>{if(!editingBillId||!confirm('Delete this bill?'))return;try{const{error}=await supabase.from('bills').delete().eq('id',editingBillId).eq('household_id',currentHouseholdId);if(error)throw error;showToast('Bill deleted.');closeModal();await fetchBills()}catch(e){showToast(errText(e))}});
async function requestNotificationPermission(){if('Notification'in window&&Notification.permission==='default'){try{await Notification.requestPermission()}catch{}}}
let lastReminderCheckDate=null;
function checkReminders(){const today=todayISO();if(lastReminderCheckDate===today)return;lastReminderCheckDate=today;const soon=[],late=[];allBills.forEach(b=>{if(b.status==='paid')return;const d=daysBetween(b.dueDate);if([7,3,1,0].includes(d))soon.push({b,d});if(d<0)late.push(b)});if(!soon.length&&!late.length)return;const notify='Notification'in window&&Notification.permission==='granted';soon.forEach(({b,d})=>{const body=d===0?b.name+' is due today ('+formatMoney(b.amount)+')':b.name+' is due in '+d+' day(s) ('+formatMoney(b.amount)+')';if(notify)new Notification('BillBuddy Reminder',{body})});late.forEach(b=>{if(notify)new Notification('BillBuddy Overdue',{body:b.name+' is overdue ('+formatMoney(b.amount)+')'})});if(!notify)showToast('📌 '+(soon.length+late.length)+' bill(s) need attention',5000)}
function updateOfflineBadge(){const b=document.getElementById('offlineBadge');b.textContent=navigator.onLine?'':'Offline — cached viewing only. Changes need an internet connection.';b.classList.toggle('hidden',navigator.onLine)}
window.addEventListener('online',updateOfflineBadge);window.addEventListener('offline',updateOfflineBadge);updateOfflineBadge();
async function handleSession(session){currentUser=session?.user||null;if(!currentUser){currentHouseholdId=null;currentHouseholdData=null;allBills=[];if(billsChannel){await supabase.removeChannel(billsChannel);billsChannel=null}showScreen('auth');return}try{const{error}=await supabase.from('profiles').upsert({id:currentUser.id,full_name:currentUser.user_metadata?.full_name||'',email:currentUser.email||''},{onConflict:'id',ignoreDuplicates:true});if(error)throw error;await loadHousehold()}catch(e){showScreen('auth');showAuthError('Could not load your BillBuddy account: '+errText(e));console.error(e)}}
supabase.auth.getSession().then(({data,error})=>{if(error)showAuthError(errText(error));return handleSession(data?.session||null)}).catch(e=>{showScreen('auth');showAuthError('Could not connect to BillBuddy. Check your internet connection and refresh.');console.error(e)});
supabase.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>handleSession(session),0)});
setInterval(()=>{if(allBills.length){updateBillStatuses();renderBills();renderDashboard();checkReminders()}},60*60*1000);
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(e=>console.error('Service worker registration failed',e)));
