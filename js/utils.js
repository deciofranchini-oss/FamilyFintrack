function populateSelects(){populateReportFilters();
  const aOpts=state.accounts.map(a=>`<option value="${a.id}">${esc(a.name)} (${a.currency})</option>`).join('');
  ['txAccountId','txTransferTo'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='<option value="">Selecione a conta</option>'+aOpts;});
  const txAF=document.getElementById('txAccount');if(txAF)txAF.innerHTML='<option value="">Todas as contas</option>'+aOpts;
  // payee autocomplete uses state.payees directly - no select to populate
  buildCatPicker(); // hierarchical picker replaces flat select
  const pCat=document.getElementById('payeeCategory');if(pCat)pCat.innerHTML='<option value="">— Nenhuma —</option>'+state.categories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
}

function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.modal-overlay').forEach(el=>{el.addEventListener('click',e=>{if(e.target===el)el.classList.remove('open');});});

function toast(msg,type='info'){
  const icons={success:'✓',error:'✕',info:'i'};
  const el=document.createElement('div');el.className=`toast ${type}`;el.innerHTML=`<span style="font-weight:700">${icons[type]||'i'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(16px)';el.style.transition='.2s';setTimeout(()=>el.remove(),200);},3200);
}

function fmt(v,currency='BRL'){if(state.privacyMode)return'••••••';return new Intl.NumberFormat('pt-BR',{style:'currency',currency:currency||'BRL',minimumFractionDigits:2}).format(v||0);}
// Parse a user-typed amount string: handles both "1.234,56" (BR) and "1,234.56" (EN) and negatives
function parseAmtInput(s) {
  if (!s && s !== 0) return 0;
  const str = String(s).trim();
  if (!str) return 0;
  const neg = str.startsWith('-');
  let clean = str.replace(/^-/, '');
  // Detect BR format: ends with ,XX (comma as decimal separator)
  if (/,\d{1,2}$/.test(clean)) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    // EN format or plain integer: remove commas
    clean = clean.replace(/,/g, '');
  }
  const v = parseFloat(clean);
  if (isNaN(v)) return 0;
  return neg ? -Math.abs(v) : v;
}

// Sign toggle button state: fieldId → true means negative
const _amtSignState = {};

function toggleAmtSign(fieldId) {
  _amtSignState[fieldId] = !_amtSignState[fieldId];
  _updateSignBtn(fieldId);
}

function _updateSignBtn(fieldId) {
  const btn = document.getElementById(fieldId + 'SignBtn');
  if (!btn) return;
  const isNeg = !!_amtSignState[fieldId];
  btn.textContent = isNeg ? '−' : '+';
  btn.classList.toggle('negative', isNeg);
  btn.classList.toggle('positive', !isNeg);
}

// Set amount field value and sign btn state from a numeric value (e.g. when editing)
function setAmtField(fieldId, value) {
  const isNeg = (value < 0);
  _amtSignState[fieldId] = isNeg;
  const el = document.getElementById(fieldId);
  if (el) el.value = value !== 0 ? Math.abs(value).toFixed(2).replace('.', ',') : '';
  _updateSignBtn(fieldId);
}

// Read the signed value from an amount field
function getAmtField(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return 0;
  const raw = el.value.trim();
  if (!raw) return 0;
  // Parse the absolute value
  let clean = raw.replace(/\./g, '').replace(',', '.'); // handle BR format
  if (!/[.,]/.test(raw)) clean = raw; // plain integer
  const abs = Math.abs(parseFloat(clean) || 0);
  return _amtSignState[fieldId] ? -abs : abs;
}
function fmtDate(d){if(!d)return'—';const[y,m,day]=d.split('T')[0].split('-');return`${day}/${m}/${y}`;}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}



/* [REMOVED] PAYEE AUTOCOMPLETE duplicated in payee_autocomplete.js */
/* ═══════════════════════════════════════
   ICON PICKER
═══════════════════════════════════════ */
/* [REMOVED] ICON_META duplicated in ui_helpers.js */

// Render icon from stored key into an element
