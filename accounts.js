async function loadAccounts(){
  const [{data:accs,error}] = await Promise.all([
    famQ(sb.from('accounts').select('*').eq('active',true)).order('name')
  ]);
  if(error){toast(error.message,'error');return;}
  state.accounts=accs||[];
  // Load account_groups gracefully (table may not exist)
  try {
    const {data:grps} = await famQ(sb.from('account_groups').select('*')).order('name');
    state.groups=grps||[];
  } catch(e) {
    state.groups=[];
  }
  // Recalculate balances from initial_balance + all transactions
  await recalcAccountBalances();
}

async function recalcAccountBalances() {
  if (!state.accounts.length) return;
  // Fetch all transaction amounts per account
  const { data: sums } = await famQ(
    sb.from('transactions').select('account_id, amount')
  );

  // Each transfer now has TWO rows: debit (negative) on origin and credit (positive) on destination.
  // Simply sum all amounts per account_id — no manual credit adjustment needed.
  const txMap = {};
  (sums || []).forEach(t => {
    if (t.account_id) {
      txMap[t.account_id] = (txMap[t.account_id] || 0) + (parseFloat(t.amount) || 0);
    }
  });

  // Apply: balance = initial_balance + sum(transactions)
  state.accounts.forEach(a => {
    const initialBal = parseFloat(a.initial_balance) || 0;
    const txSum = txMap[a.id] || 0;
    a.balance = initialBal + txSum;
  });
}
let _accountsViewMode='';
function renderAccounts(ft=''){
  _accountsViewMode=ft;
  const grid=document.getElementById('accountGrid');
  let accs=state.accounts;
  if(ft==='__group__'){
    grid.style.display='block';
    const grouped={};
    accs.forEach(a=>{const gid=a.group_id||'__none__';if(!grouped[gid])grouped[gid]=[];grouped[gid].push(a);});
    const sections=[];
    state.groups.forEach(g=>{if(grouped[g.id])sections.push({g,accs:grouped[g.id]});});
    if(grouped['__none__']?.length)sections.push({g:null,accs:grouped['__none__']});
    if(!sections.length){grid.innerHTML='<div class="empty-state"><div class="es-icon">🗂️</div><p>Nenhum grupo criado ainda.</p></div>';return;}
    grid.innerHTML=sections.map(({g,accs:ga})=>{
      const total=ga.reduce((s,a)=>s+(a.balance||0),0);
      const gName=g?esc(g.name):'Sem grupo';
      const gEmoji=g?(g.emoji||'🗂️'):'📁';
      const gColor=g?(g.color||'var(--accent)'):'var(--muted)';
      const editBtns=g?`<div class="account-group-actions"><button class="btn-icon" onclick="editGroup('${g.id}')">✏️</button><button class="btn-icon" onclick="deleteGroup('${g.id}')">🗑️</button></div>`:'';
      return `<div class="account-group-section">
        <div class="account-group-header">
          <span class="account-group-badge" style="background:${gColor}22">${gEmoji}</span>
          <span class="account-group-title">${gName}</span>
          <span class="account-group-sum ${total<0?'text-red':''}">${fmt(total,'')}</span>
          ${editBtns}
        </div>
        <div class="account-grid">${ga.map(a=>accountCardHTML(a)).join('')}</div>
      </div>`;
    }).join('');
    return;
  }
  grid.style.display='';
  if(ft)accs=accs.filter(a=>a.type===ft);
  if(!accs.length){grid.innerHTML='<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">🏦</div><p>Nenhuma conta encontrada</p></div>';return;}
  grid.innerHTML=accs.map(a=>accountCardHTML(a)).join('');
}
function accountCardHTML(a){
  return `<div class="account-card" onclick="goToAccountTransactions('${a.id}')">
    <div class="account-card-stripe" style="background:${a.color||'var(--accent)'}"></div>
    <div class="account-actions"><button class="btn-icon" onclick="event.stopPropagation();openAccountModal('${a.id}')">✏️</button><button class="btn-icon" onclick="event.stopPropagation();deleteAccount('${a.id}')">🗑️</button></div>
    <div class="account-icon" style="font-size:1.6rem;margin-bottom:8px">${renderIconEl(a.icon,a.color,36)}</div>
    <div class="account-name">${esc(a.name)}</div>
    <div class="account-type">${accountTypeLabel(a.type)}</div>
    <div class="account-balance ${a.balance<0?'text-red':'text-accent'}">${fmt(a.balance,a.currency)}</div>
    <div class="account-currency">${a.currency}</div>
  </div>`;
}
function goToAccountTransactions(accountId){
  state.txFilter.account=accountId;
  state.txFilter.month='';
  state.txPage=0;
  const el=document.getElementById('txAccount');if(el)el.value=accountId;
  const monthEl=document.getElementById('txMonth');if(monthEl)monthEl.value='';
  navigate('transactions');
}
function filterAccounts(type){document.querySelectorAll('#page-accounts .tab').forEach(t=>t.classList.remove('active'));event.target.classList.add('active');renderAccounts(type);}
function accountTypeLabel(t){return{corrente:'Conta Corrente',poupanca:'Poupança',cartao_credito:'Cartão de Crédito',investimento:'Investimentos',dinheiro:'Dinheiro',outros:'Outros'}[t]||t;}
function openAccountModal(id=''){
  const form={id:'',name:'',type:'corrente',currency:'BRL',balance:'',initial_balance:'',icon:'',color:'#2a6049',is_brazilian:false,iof_rate:3.38,group_id:''};
  if(id){
    const a=state.accounts.find(x=>x.id===id);
    if(a){Object.assign(form,a); form.initial_balance = parseFloat(a.initial_balance)||0;}
  }
  document.getElementById('accountId').value=form.id;
  document.getElementById('accountName').value=form.name;
  document.getElementById('accountType').value=form.type;
  document.getElementById('accountCurrency').value=form.currency;
  setAmtField('accountBalance', form.initial_balance||0);
  const balLabel = document.getElementById('accountBalanceLabel');
  if(balLabel) balLabel.textContent = id ? 'Saldo Inicial' : 'Saldo Inicial';
  document.getElementById('accountIcon').value=form.icon||'';
  document.getElementById('accountColor').value=form.color||'#2a6049';
  document.getElementById('accountModalTitle').textContent=id?'Editar Conta':'Nova Conta';
  const gSel=document.getElementById('accountGroupId');
  gSel.innerHTML='<option value="">— Sem grupo —</option>'+state.groups.map(g=>`<option value="${g.id}">${g.emoji||'🗂️'} ${esc(g.name)}</option>`).join('');
  gSel.value=form.group_id||'';
  const isCC=form.type==='cartao_credito';
  document.getElementById('accountIofConfig').style.display=isCC?'':'none';
  document.getElementById('accountIsBrazilian').checked=!!form.is_brazilian;
  document.getElementById('accountIofRate').value=form.iof_rate||3.38;
  document.getElementById('accountIofRateGroup').style.display=form.is_brazilian?'':'none';
  setTimeout(()=>syncIconPickerToValue(form.icon||'',form.color||'#2a6049'),50);
  openModal('accountModal');
}
async function saveAccount(){
  const id=document.getElementById('accountId').value;
  const isCC=document.getElementById('accountType').value==='cartao_credito';
  const isBR=isCC&&document.getElementById('accountIsBrazilian').checked;
  const gid=document.getElementById('accountGroupId').value||null;
  const data={name:document.getElementById('accountName').value.trim(),type:document.getElementById('accountType').value,currency:document.getElementById('accountCurrency').value,initial_balance:getAmtField('accountBalance'),icon:document.getElementById('accountIcon').value||'',color:document.getElementById('accountColor').value,is_brazilian:isBR,iof_rate:isBR?parseFloat(document.getElementById('accountIofRate').value)||3.38:null,group_id:gid,updated_at:new Date().toISOString()};
  if(!data.name){toast('Informe o nome da conta','error');return;}
  if(!id) data.family_id=famId(); let err;if(id){({error:err}=await sb.from('accounts').update(data).eq('id',id));}else{({error:err}=await sb.from('accounts').insert(data));}
  if(err){toast(err.message,'error');return;}
  toast(id?'Conta atualizada!':'Conta criada!','success');closeModal('accountModal');await loadAccounts();populateSelects();if(state.currentPage==='accounts')renderAccounts(_accountsViewMode);if(state.currentPage==='dashboard')loadDashboard();
}
async function deleteAccount(id){if(!confirm('Excluir esta conta?'))return;const{error}=await sb.from('accounts').update({active:false}).eq('id',id);if(error){toast(error.message,'error');return;}toast('Conta removida','success');await loadAccounts();populateSelects();renderAccounts(_accountsViewMode);}

/* ── Account Groups CRUD ── */
function openGroupModal(){
  renderGroupList();
  cancelGroupEdit();
  openModal('groupModal');
}
function renderGroupList(){
  const el=document.getElementById('groupList');
  if(!el)return;
  if(!state.groups.length){el.innerHTML='<div style="font-size:.85rem;color:var(--muted);text-align:center;padding:16px">Nenhum grupo criado ainda.</div>';return;}
  el.innerHTML=state.groups.map(g=>{
    const count=state.accounts.filter(a=>a.group_id===g.id).length;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm)">
      <span style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:${g.color||'var(--accent)'}22;border-radius:50%;font-size:1.1rem">${g.emoji||'🗂️'}</span>
      <span style="flex:1;font-weight:500;font-size:.9rem">${esc(g.name)}</span>
      <span style="font-size:.75rem;color:var(--muted)">${count} conta${count!==1?'s':''}</span>
      <button class="btn-icon" onclick="editGroup('${g.id}')">✏️</button>
      <button class="btn-icon" onclick="deleteGroup('${g.id}')">🗑️</button>
    </div>`;
  }).join('');
}
function editGroup(id){
  const g=state.groups.find(x=>x.id===id);if(!g)return;
  document.getElementById('groupEditId').value=g.id;
  document.getElementById('groupName').value=g.name;
  document.getElementById('groupEmoji').value=g.emoji||'';
  document.getElementById('groupColor').value=g.color||'#2a6049';
  document.getElementById('groupName').focus();
}
function cancelGroupEdit(){
  document.getElementById('groupEditId').value='';
  document.getElementById('groupName').value='';
  document.getElementById('groupEmoji').value='';
  document.getElementById('groupColor').value='#2a6049';
}
async function saveGroup(){
  const id=document.getElementById('groupEditId').value;
  const name=document.getElementById('groupName').value.trim();
  const emoji=document.getElementById('groupEmoji').value.trim();
  const color=document.getElementById('groupColor').value;
  if(!name){toast('Informe o nome do grupo','error');return;}
  const data={name,emoji:emoji||'🗂️',color};
  if(!id) data.family_id=famId(); let err;
  if(id){({error:err}=await sb.from('account_groups').update(data).eq('id',id));}
  else{({error:err}=await sb.from('account_groups').insert(data));}
  if(err){toast(err.message,'error');return;}
  toast(id?'Grupo atualizado!':'Grupo criado!','success');
  await loadAccounts();
  cancelGroupEdit();
  renderGroupList();
  if(state.currentPage==='accounts')renderAccounts(_accountsViewMode);
}
async function deleteGroup(id){
  if(!confirm('Excluir este grupo? As contas serão mantidas sem grupo.'))return;
  try { await sb.from('accounts').update({group_id:null}).eq('group_id',id); } catch(e) {}
  const{error}=await sb.from('account_groups').delete().eq('id',id);
  if(error){toast(error.message,'error');return;}
  toast('Grupo removido','success');
  await loadAccounts();
  renderGroupList();
  if(state.currentPage==='accounts')renderAccounts(_accountsViewMode);
}
