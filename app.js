// TaskFlow with toasts and drag&drop highlight
const STORAGE = {
  tasks: 'tf_tasks_v1',
  projects: 'tf_projects_v1',
  team: 'tf_team_v1',
  clients: 'tf_clients_v1',
  packages: 'tf_packages_v1',
  theme: 'tf_theme_v1',
};
const PRIORITY = { BLUE: 0, ORANGE: 1, RED: 2 };
const LABEL = { BLUE: 'Azul', ORANGE: 'Laranja', RED: 'Vermelho' };

let tasks = load(STORAGE.tasks, []);
let projects = load(STORAGE.projects, [{ id:'inbox', name:'Entrada', scope:'me' }]);
let team = load(STORAGE.team, []);
let clients = load(STORAGE.clients, []);
let packages = load(STORAGE.packages, []);

let currentView = { type:'today' };
let editingTaskId = null;
let activeClientId = clients[0]?.id || null;

function load(k, def){ try{ const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : def; } catch { return def; } }
function save(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
function todayYMD(){ const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; }
function parseDateOnly(ymd){ const [y,m,d]=(ymd||'').split('-').map(Number); return new Date(y||1970,(m||1)-1,d||1); }
function diffDays(a,b){ return Math.floor((parseDateOnly(b)-parseDateOnly(a))/(24*60*60*1000)); }
function getMonthKey(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }

function recomputePriorities(list){
  const today = todayYMD();
  return list.map(t => {
    let target = t.priority;
    const age = diffDays((t.createdAt||'').slice(0,10), today);
    if (age >= 4) target = 'RED';
    else if (age >= 2) target = (target==='RED')?'RED':'ORANGE';
    if (t.dueDate && diffDays(today, t.dueDate) < 0) target = 'RED';
    return { ...t, priority: target };
  });
}

// Toasts
function showToast(msg, type='success', timeout=5000){
  const stack = document.getElementById('toastStack');
  const t = document.createElement('div');
  t.className = 'toast ' + (type||'');
  t.textContent = msg;
  stack.appendChild(t);
  setTimeout(()=>{
    t.style.pointerEvents='none';
    t.remove();
  }, timeout);
}

// UI refs
const projectList = document.getElementById('projectList');
const teamList = document.getElementById('teamList');
const viewTitle = document.getElementById('viewTitle');
const tasksPanel = document.getElementById('tasksPanel');
const clientsPanel = document.getElementById('clientsPanel');
const reportPanel = document.getElementById('reportPanel');
const search = document.getElementById('search');
const statusFilter = document.getElementById('statusFilter');
const priorityFilter = document.getElementById('priorityFilter');
const themeToggle = document.getElementById('themeToggle');

const themeLabels = { system: 'Sistema', light: 'Claro', dark: 'Escuro' };
function applyTheme(mode){
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  themeToggle.textContent = `Tema: ${themeLabels[mode] || 'Sistema'}`;
  save(STORAGE.theme, mode);
}
const savedTheme = load(STORAGE.theme, 'system');
applyTheme(savedTheme);
themeToggle.addEventListener('click', () => {
  const current = load(STORAGE.theme, 'system');
  const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
  applyTheme(next);
});

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const v = btn.dataset.view;
    if (v==='clients'){ currentView={type:'clients'}; render(); return; }
    if (v==='inbox'){ currentView={type:'inbox'}; }
    if (v==='today'){ currentView={type:'today'}; }
    if (v==='soon'){ currentView={type:'soon'}; }
    if (v==='report'){ currentView={type:'report'}; }
    render();
  });
});
document.getElementById('addProject').addEventListener('click', () => {
  const name = prompt('Nome do projeto (meus projetos):'); if(!name) return;
  projects.push({ id: crypto.randomUUID?.() || String(Math.random()).slice(2), name: name.trim(), scope: 'me' });
  save(STORAGE.projects, projects); renderSidebar(); render();
});
document.getElementById('addTeamProject').addEventListener('click', () => {
  const name = prompt('Nome do projeto (equipe):'); if(!name) return;
  team.push({ id: crypto.randomUUID?.() || String(Math.random()).slice(2), name: name.trim(), scope: 'team' });
  save(STORAGE.team, team); renderSidebar(); render();
});
document.getElementById('quickAdd').addEventListener('click', () => openTaskDialog());
document.getElementById('addInline').addEventListener('click', () => openTaskDialog());
document.getElementById('clearDone').addEventListener('click', () => { tasks = tasks.filter(t => t.status!=='DONE'); save(STORAGE.tasks, tasks); showToast('Concluídas removidas','success'); render(); });
search.addEventListener('input', render);
statusFilter.addEventListener('change', render);
priorityFilter.addEventListener('change', render);

// Dialog form
const taskDialog = document.getElementById('taskDialog');
const taskForm = document.getElementById('taskForm');
const tTitle = document.getElementById('tTitle');
const tDesc = document.getElementById('tDesc');
const tDue = document.getElementById('tDue');
const tTime = document.getElementById('tTime');
const tPriority = document.getElementById('tPriority');
const tProject = document.getElementById('tProject');
const tTeam = document.getElementById('tTeam');
const tLabels = document.getElementById('tLabels');
document.getElementById('cancelTask').addEventListener('click', () => taskDialog.close());

function openTaskDialog(){
  editingTaskId = null;
  tTitle.value=''; tDesc.value=''; tDue.value=''; tTime.value=''; tPriority.value='BLUE'; tTeam.value='no';
  tProject.innerHTML = [...projects, ...team].map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  if(!projects.find(p=>p.id==='inbox')) projects.unshift({id:'inbox', name:'Entrada', scope:'me'});
  tProject.value = projects[0]?.id || 'inbox';
  tLabels.value='';
  taskDialog.showModal();
}

taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const base = {
    title: tTitle.value.trim(),
    description: tDesc.value.trim(),
    dueDate: tDue.value || null,
    time: tTime.value || null,
    priority: tPriority.value,
    projectId: tProject.value,
    team: tTeam.value === 'yes',
    labels: (tLabels.value||'').split(',').map(s=>s.trim()).filter(Boolean).map(x=>x.startsWith('#')?x:'#'+x),
  };
  if (!base.title) return;
  if (editingTaskId){
    tasks = tasks.map(t => t.id===editingTaskId ? { ...t, ...base } : t);
    showToast('Tarefa atualizada','success');
    editingTaskId = null;
  } else {
    tasks.push({ id: crypto.randomUUID?.() || String(Math.random()).slice(2), status:'PENDING', createdAt:new Date().toISOString(), ...base });
    showToast('Tarefa criada','success');
  }
  tasks = recomputePriorities(tasks);
  save(STORAGE.tasks, tasks);
  taskDialog.close(); render();
});

function renderSidebar(){
  projectList.innerHTML='';
  teamList.innerHTML='';
  const tmpl = document.getElementById('listItemTemplate');
  for(const p of projects){
    const node = tmpl.content.cloneNode(true);
    node.querySelector('.title').textContent = p.name;
    node.querySelector('.select').addEventListener('click', () => { currentView={type:'project', id:p.id}; render(); });
    const delBtn = node.querySelector('.del');
    if (p.id === 'inbox'){
      delBtn.disabled = true; delBtn.classList.add('outline'); delBtn.title = "Projeto 'Entrada' não pode ser excluído";
    } else {
      delBtn.addEventListener('click', () => {
        projects = projects.filter(x => x.id!==p.id);
        tasks = tasks.map(t => t.projectId===p.id ? { ...t, projectId:'inbox' } : t);
        save(STORAGE.projects, projects); save(STORAGE.tasks, tasks); showToast('Projeto excluído','success'); renderSidebar(); render();
      });
    }
    projectList.appendChild(node);
  }
  for(const p of team){
    const node = tmpl.content.cloneNode(true);
    node.querySelector('.title').textContent = p.name;
    node.querySelector('.select').addEventListener('click', () => { currentView={type:'teamProject', id:p.id}; render(); });
    node.querySelector('.del').addEventListener('click', () => {
      team = team.filter(x => x.id!==p.id);
      tasks = tasks.map(t => t.projectId===p.id ? { ...t, projectId:'inbox', team:false } : t);
      save(STORAGE.team, team); save(STORAGE.tasks, tasks); showToast('Projeto da equipe excluído','success'); renderSidebar(); render();
    });
    teamList.appendChild(node);
  }
}

function renderTasks(){
  tasks = recomputePriorities(tasks);
  save(STORAGE.tasks, tasks);

  tasksPanel.classList.remove('hidden');
  clientsPanel.classList.add('hidden');
  reportPanel.classList.add('hidden');

  const myRoot = document.getElementById('myProjectsList');
  const teamRoot = document.getElementById('teamProjectsList');
  myRoot.innerHTML=''; teamRoot.innerHTML='';

  let list = [...tasks];
  const st = statusFilter.value, pf = priorityFilter.value, q = (search.value||'').toLowerCase();
  const today = todayYMD();

  if (currentView.type==='today') list = list.filter(t => t.dueDate === today);
  if (currentView.type==='soon') list = list.filter(t => t.dueDate && diffDays(today, t.dueDate) >= 0 && diffDays(today, t.dueDate) <= 7);
  if (currentView.type==='inbox') list = list.filter(t => t.projectId==='inbox');
  if (currentView.type==='project') list = list.filter(t => t.projectId === currentView.id);
  if (currentView.type==='teamProject') list = list.filter(t => t.projectId === currentView.id && t.team);

  list = list.filter(t => (st==='ALL'||t.status===st) && (pf==='ALL'||t.priority===pf));
  list = list.filter(t => !q || t.title.toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q));

  const byProject = {};
  for(const t of list){
    const p = [...projects, ...team].find(x => x.id===t.projectId) || { name:'Entrada', scope:'me' };
    const key = p.name + '|' + (t.team?'team':'me');
    (byProject[key] = byProject[key] || []).push(t);
  }

  const itemTmpl = document.getElementById('taskItemTemplate');
  const entries = Object.entries(byProject).sort((a,b)=>a[0].localeCompare(b[0]));

  for(const [key, items] of entries){
    const [name, scope] = key.split('|');
    const container = scope==='team' ? teamRoot : myRoot;

    const title = document.createElement('div');
    title.className = 'muted small';
    title.style.margin = '8px 0 4px';
    title.textContent = name;
    container.appendChild(title);

    items.sort((a,b)=>{
      const pr = PRIORITY[b.priority]-PRIORITY[a.priority];
      if (pr) return pr;
      const ad = (a.dueDate||'9999-12-31') + 'T' + (a.time||'23:59');
      const bd = (b.dueDate||'9999-12-31') + 'T' + (b.time||'23:59');
      return ad.localeCompare(bd);
    });

    for(const t of items){
      const node = itemTmpl.content.cloneNode(true);
      node.querySelector('.title').textContent = t.title;
      const circle = node.querySelector('.circle');
      circle.classList.add(t.priority==='RED'?'red':t.priority==='ORANGE'?'orange':'blue');
      const info = node.querySelector('.info');
      const timeStr = t.time ? (' às ' + t.time) : '';
      const dueStr = t.dueDate ? (' · ' + parseDateOnly(t.dueDate).toLocaleDateString()) : '';
      info.textContent = `${LABEL[t.priority]}${dueStr}${timeStr}`;
      node.querySelector('.desc').textContent = t.description || '';

      const toggle = node.querySelector('.toggle');
      toggle.textContent = t.status==='DONE' ? 'Marcar pendente' : 'Concluir';
      toggle.addEventListener('click', () => { t.status = (t.status==='DONE')?'PENDING':'DONE'; save(STORAGE.tasks, tasks); showToast(t.status==='DONE'?'Tarefa concluída':'Tarefa reaberta','success'); render(); });

      node.querySelector('.edit').addEventListener('click', () => {
        editingTaskId = t.id;
        tTitle.value = t.title; tDesc.value = t.description||''; tDue.value = t.dueDate||''; tTime.value = t.time||'';
        tPriority.value = t.priority; tTeam.value = t.team?'yes':'no';
        tProject.innerHTML = [...projects, ...team].map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        tProject.value = t.projectId;
        tLabels.value = (t.labels||[]).join(', ');
        taskDialog.showModal();
      });

      node.querySelector('.del').addEventListener('click', () => {
        tasks = tasks.filter(x => x.id!==t.id);
        save(STORAGE.tasks, tasks); showToast('Tarefa excluída','success'); render();
      });

      container.appendChild(node);
    }
  }

  if (!entries.length){
    const empty = document.createElement('div');
    empty.className='item';
    empty.textContent='Nenhuma tarefa aqui.';
    myRoot.appendChild(empty);
  }
}

// Report
function computeStats(){ const total=tasks.length, done=tasks.filter(t=>t.status==='DONE').length; return { total, done, pending: total-done, red: tasks.filter(t=>t.priority==='RED').length, orange: tasks.filter(t=>t.priority==='ORANGE').length, blue: tasks.filter(t=>t.priority==='BLUE').length }; }
function drawChart(canvas, done, pending){
  const ctx = canvas.getContext('2d'); const W=canvas.width,H=canvas.height; ctx.clearRect(0,0,W,H);
  const data=[done,pending], labels=['Concluídas','Pendentes'], max=Math.max(1,...data), barW=120,gap=80,startX=(W-(barW*data.length+gap*(data.length-1)))/2;
  data.forEach((v,i)=>{ const h=(v/max)*(H-60), x=startX+i*(barW+gap), y=H-30-h; const g=ctx.createLinearGradient(x,y,x,y+h); g.addColorStop(0,'#9b59b6'); g.addColorStop(1,'#5b2c6f'); ctx.fillStyle=g; ctx.fillRect(x,y,barW,h); ctx.fillStyle='#e9e7ff'; ctx.textAlign='center'; ctx.font='bold 16px system-ui,sans-serif'; ctx.fillText(String(v), x+barW/2, y-8); ctx.font='12px system-ui,sans-serif'; ctx.fillText(labels[i], x+barW/2, H-10); }); ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.beginPath(); ctx.moveTo(20,H-30); ctx.lineTo(W-20,H-30); ctx.stroke();
}
function renderReport(){
  tasks = recomputePriorities(tasks); save(STORAGE.tasks, tasks);
  tasksPanel.classList.add('hidden'); clientsPanel.classList.add('hidden'); reportPanel.classList.remove('hidden');
  const s=computeStats(); document.getElementById('kpiTotal').textContent=s.total; document.getElementById('kpiDone').textContent=s.done; document.getElementById('kpiPending').textContent=s.pending;
  drawChart(document.getElementById('prodChart'), s.done, s.pending);
  function setBar(id,val,total){ const pct= total? Math.round((val/total)*100):0; const el=document.getElementById(id); el.style.width=pct+'%'; document.getElementById(id+'Val').textContent=val; }
  setBar('barRed', s.red, s.total); setBar('barOrange', s.orange, s.total); setBar('barBlue', s.blue, s.total);
}

function render(){
  const clientsView = currentView.type==='clients'; const reportView = currentView.type==='report';
  viewTitle.textContent = currentView.type==='today' ? 'Hoje' : currentView.type==='soon' ? 'Em breve' : currentView.type==='inbox' ? 'Entrada' : currentView.type==='project' ? 'Projeto' : currentView.type==='teamProject' ? 'Equipe' : currentView.type==='report' ? 'Produtividade' : 'Clientes';
  if (clientsView) { renderClients(); renderDrive(); return; }
  if (reportView) { renderReport(); return; }
  renderTasks();
}

function renderClients(){
  tasksPanel.classList.add('hidden'); reportPanel.classList.add('hidden'); clientsPanel.classList.remove('hidden');
  const list = document.getElementById('clientList'); list.innerHTML=''; const tmpl = document.getElementById('listItemTemplate');
  for(const c of clients){
    const n = tmpl.content.cloneNode(true);
    const packageName = packages.find(p => p.id === c.packageId)?.name;
    n.querySelector('.title').textContent = packageName ? `${c.name} · ${packageName}` : c.name;
    n.querySelector('.select').addEventListener('click', () => { activeClientId=c.id; renderDrive(); showToast('Cliente selecionado: '+c.name,'success',2500); });
    n.querySelector('.del').addEventListener('click', () => { clients=clients.filter(x=>x.id!==c.id); save(STORAGE.clients, clients); if(activeClientId===c.id) activeClientId=clients[0]?.id||null; renderClients(); renderDrive(); showToast('Cliente excluído','success'); });
    list.appendChild(n);
  }
  if (!clients.length){ const e=document.createElement('div'); e.className='item'; e.textContent='Sem clientes.'; list.appendChild(e); }
  document.getElementById('addClient').onclick = () => {
    const name = document.getElementById('clientName').value.trim();
    if(!name){ showToast('Digite um nome para o cliente','error'); return; }
    const selectedPackage = document.getElementById('clientPackage').value || null;
    const c = { id: crypto.randomUUID?.() || String(Math.random()).slice(2), name, packageId: selectedPackage, contact: document.getElementById('clientContact').value.trim(), notes: document.getElementById('clientNotes').value.trim(), files: [], tasks: [], createdAt: new Date().toISOString() };
    clients.push(c);
    save(STORAGE.clients, clients);
    document.getElementById('clientName').value='';
    document.getElementById('clientContact').value='';
    document.getElementById('clientNotes').value='';
    document.getElementById('clientPackage').value = packages[0]?.id || '';
    renderClients();
    renderDrive();
    showToast('Cliente adicionado','success');
  };
  renderPackages();
  populatePackageSelect();
}

document.getElementById('addPackage').addEventListener('click', () => {
  const name = document.getElementById('packageName').value.trim();
  if (!name){ showToast('Digite um nome para o pacote','error'); return; }
  const arts = Number(document.getElementById('packageArts').value || 0);
  const stories = Number(document.getElementById('packageStories').value || 0);
  const flyers = Number(document.getElementById('packageFlyers').value || 0);
  const pkg = { id: crypto.randomUUID?.() || String(Math.random()).slice(2), name, arts, stories, flyers, createdAt: new Date().toISOString() };
  packages.push(pkg);
  save(STORAGE.packages, packages);
  document.getElementById('packageName').value='';
  document.getElementById('packageArts').value='';
  document.getElementById('packageStories').value='';
  document.getElementById('packageFlyers').value='';
  renderPackages();
  populatePackageSelect();
  showToast('Pacote adicionado','success');
});

// Drive upload
const uploadBtn = document.getElementById('uploadBtn'); const removeClientBtn = document.getElementById('removeClient'); const filePicker = document.getElementById('filePicker'); const dropZone = document.getElementById('dropZone'); const fileGrid = document.getElementById('fileGrid'); const activeClientName = document.getElementById('activeClientName'); const activeClientContact = document.getElementById('activeClientContact');
uploadBtn.addEventListener('click', ()=> filePicker.click());
filePicker.addEventListener('change', async (e) => {
  if(!activeClientId){ showToast('Selecione um cliente primeiro','error'); return; }
  if(e.target.files && e.target.files.length){ await addFiles(activeClientId, e.target.files); e.target.value=''; renderDrive(); showToast('Arquivo(s) enviados','success'); }
});
['dragenter','dragover','dragleave','drop'].forEach(evt => dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }));
dropZone.addEventListener('dragenter',()=> dropZone.classList.add('drag-over'));
dropZone.addEventListener('dragleave',()=> dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', async (e) => {
  dropZone.classList.remove('drag-over');
  if(!activeClientId){ showToast('Selecione um cliente antes de soltar os arquivos','error'); return; }
  const fl = e.dataTransfer?.files; if(fl && fl.length){ await addFiles(activeClientId, fl); renderDrive(); showToast('Arquivo(s) enviados','success'); }
});
async function addFiles(id, fileList){ const c = clients.find(x => x.id===id); if(!c) return; const arr = []; for(const f of Array.from(fileList)){ const dataUrl = await readAsDataURL(f); arr.push({ id: crypto.randomUUID?.() || String(Math.random()).slice(2), name:f.name, type:f.type, size:f.size, dataUrl, uploadedAt:new Date().toISOString() }); } c.files = [...arr, ...c.files]; save(STORAGE.clients, clients); }
function readAsDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }
function renderDrive(){
  const c = clients.find(x => x.id===activeClientId) || null;
  const pkg = packages.find(p => p.id === c?.packageId);
  if (c && !Array.isArray(c.tasks)) c.tasks = [];
  activeClientName.textContent = c ? c.name : 'Selecione um cliente';
  activeClientContact.textContent = c ? `${c.contact || ''}${pkg ? ' · ' + pkg.name : ''}` : '';
  uploadBtn.disabled = !c;
  removeClientBtn.disabled = !c;
  dropZone.classList.toggle('disabled', !c);
  fileGrid.innerHTML='';
  if(!c) return;

  removeClientBtn.onclick = () => {
    clients = clients.filter(x => x.id!==c.id);
    save(STORAGE.clients, clients);
    activeClientId = clients[0]?.id || null;
    renderClients();
    renderDrive();
    showToast('Cliente excluído','success');
  };

  const monthKey = getMonthKey(new Date());
  const doneMonth = c.tasks.filter(t => t.status==='DONE' && t.monthKey===monthKey).length;
  const pendingMonth = c.tasks.filter(t => t.status==='PENDING' && t.monthKey===monthKey).length;
  document.getElementById('clientDoneMonth').textContent = doneMonth;
  document.getElementById('clientPendingMonth').textContent = pendingMonth;

  document.getElementById('addClientTask').onclick = () => {
    const copy = document.getElementById('clientTaskCopy').value.trim();
    if(!copy){ showToast('Digite a copy da arte','error'); return; }
    const date = document.getElementById('clientTaskDate').value || todayYMD();
    const priority = document.getElementById('clientTaskPriority').value;
    const task = { id: crypto.randomUUID?.() || String(Math.random()).slice(2), copy, date, priority, status:'PENDING', monthKey: getMonthKey(parseDateOnly(date)) };
    c.tasks.unshift(task);
    save(STORAGE.clients, clients);
    document.getElementById('clientTaskCopy').value='';
    document.getElementById('clientTaskDate').value='';
    document.getElementById('clientTaskPriority').value='BLUE';
    renderDrive();
    showToast('Tarefa adicionada','success');
  };

  renderClientTasks(c);

  const tmpl = document.getElementById('fileCardTemplate');
  for(const f of c.files){
    const node = tmpl.content.cloneNode(true);
    const th = node.querySelector('.thumb');
    if (f.type && f.type.startsWith('image/')){
      const img = document.createElement('img');
      img.src = f.dataUrl;
      th.appendChild(img);
    } else {
      th.innerHTML = '<div class="muted small">Arquivo<br>'+(f.type||'')+'</div>';
    }
    node.querySelector('.file-name').textContent = f.name;
    const sizeKB = f.size/1024;
    node.querySelector('.file-size').textContent = sizeKB >= 1024 ? (sizeKB/1024).toFixed(2)+' MB' : sizeKB.toFixed(0)+' KB';
    const [aOpen, aDown] = node.querySelectorAll('a');
    aOpen.href = f.dataUrl;
    aDown.href = f.dataUrl;
    aDown.download = f.name;
    node.querySelector('.remove').addEventListener('click', () => {
      c.files = c.files.filter(x => x.id!==f.id);
      save(STORAGE.clients, clients);
      renderDrive();
      showToast('Arquivo removido','success');
    });
    fileGrid.appendChild(node);
  }
  if (c.files.length===0){
    const e=document.createElement('div');
    e.className='item';
    e.textContent='Nenhum arquivo enviado.';
    fileGrid.appendChild(e);
  }
}

function renderClientTasks(client){
  const list = document.getElementById('clientTaskList');
  list.innerHTML='';
  const tasksByDate = [...client.tasks].sort((a,b) => (a.date||'').localeCompare(b.date||''));
  if (!tasksByDate.length){
    const e = document.createElement('div');
    e.className='item';
    e.textContent='Nenhuma tarefa futura ainda.';
    list.appendChild(e);
    return;
  }
  for(const t of tasksByDate){
    const row = document.createElement('div');
    row.className='item compact';
    const info = document.createElement('div');
    const dateLabel = t.date ? parseDateOnly(t.date).toLocaleDateString() : 'Sem data';
    info.innerHTML = `<div class="title">${t.copy}</div><div class="muted small">${dateLabel} · ${LABEL[t.priority]}</div>`;
    const actions = document.createElement('div');
    actions.className='row gap';
    const toggle = document.createElement('button');
    toggle.className='btn tiny toggle';
    toggle.textContent = t.status==='DONE' ? 'Reabrir' : 'Concluir';
    toggle.addEventListener('click', () => {
      t.status = t.status==='DONE' ? 'PENDING' : 'DONE';
      save(STORAGE.clients, clients);
      renderDrive();
      showToast(t.status==='DONE' ? 'Tarefa concluída' : 'Tarefa reaberta','success');
    });
    const del = document.createElement('button');
    del.className='btn tiny danger';
    del.textContent='Excluir';
    del.addEventListener('click', () => {
      client.tasks = client.tasks.filter(x => x.id !== t.id);
      save(STORAGE.clients, clients);
      renderDrive();
      showToast('Tarefa removida','success');
    });
    actions.appendChild(toggle);
    actions.appendChild(del);
    row.appendChild(info);
    row.appendChild(actions);
    list.appendChild(row);
  }
}

function renderPackages(){
  const list = document.getElementById('packageList');
  list.innerHTML='';
  const tmpl = document.getElementById('listItemTemplate');
  for(const p of packages){
    const n = tmpl.content.cloneNode(true);
    n.querySelector('.title').textContent = `${p.name} · ${p.arts} artes · ${p.stories} stories · ${p.flyers} panfletos`;
    n.querySelector('.select').textContent = 'Selecionar';
    n.querySelector('.select').addEventListener('click', () => {
      document.getElementById('clientPackage').value = p.id;
      showToast('Pacote selecionado','success',2000);
    });
    n.querySelector('.del').addEventListener('click', () => {
      packages = packages.filter(x => x.id!==p.id);
      clients = clients.map(c => c.packageId===p.id ? { ...c, packageId: null } : c);
      save(STORAGE.packages, packages);
      save(STORAGE.clients, clients);
      renderPackages();
      populatePackageSelect();
      renderClients();
      renderDrive();
      showToast('Pacote excluído','success');
    });
    list.appendChild(n);
  }
  if (!packages.length){
    const e=document.createElement('div');
    e.className='item';
    e.textContent='Sem pacotes.';
    list.appendChild(e);
  }
}

function populatePackageSelect(){
  const select = document.getElementById('clientPackage');
  select.innerHTML = '';
  for(const p of packages){
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  }
  if (!packages.length){
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nenhum pacote cadastrado';
    select.appendChild(opt);
  }
}

// Report
function computeStats(){ const total=tasks.length, done=tasks.filter(t=>t.status==='DONE').length; return { total, done, pending: total-done, red: tasks.filter(t=>t.priority==='RED').length, orange: tasks.filter(t=>t.priority==='ORANGE').length, blue: tasks.filter(t=>t.priority==='BLUE').length }; }
function drawChart(canvas, done, pending){ const ctx=canvas.getContext('2d'); const W=canvas.width,H=canvas.height; ctx.clearRect(0,0,W,H); const data=[done,pending], labels=['Concluídas','Pendentes'], max=Math.max(1,...data), barW=120,gap=80,startX=(W-(barW*data.length+gap*(data.length-1)))/2; data.forEach((v,i)=>{ const h=(v/max)*(H-60), x=startX+i*(barW+gap), y=H-30-h; const g=ctx.createLinearGradient(x,y,x,y+h); g.addColorStop(0,'#9b59b6'); g.addColorStop(1,'#5b2c6f'); ctx.fillStyle=g; ctx.fillRect(x,y,barW,h); ctx.fillStyle='#e9e7ff'; ctx.textAlign='center'; ctx.font='bold 16px system-ui,sans-serif'; ctx.fillText(String(v), x+barW/2, y-8); ctx.font='12px system-ui,sans-serif'; ctx.fillText(labels[i], x+barW/2, H-10); }); ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.beginPath(); ctx.moveTo(20,H-30); ctx.lineTo(W-20,H-30); ctx.stroke(); }
function renderReport(){ tasks = recomputePriorities(tasks); save(STORAGE.tasks, tasks); tasksPanel.classList.add('hidden'); clientsPanel.classList.add('hidden'); reportPanel.classList.remove('hidden'); const s=computeStats(); document.getElementById('kpiTotal').textContent = s.total; document.getElementById('kpiDone').textContent=s.done; document.getElementById('kpiPending').textContent=s.pending; drawChart(document.getElementById('prodChart'), s.done, s.pending); function setBar(id,val,total){ const pct= total? Math.round((val/total)*100) : 0; const el=document.getElementById(id); el.style.width=pct+'%'; document.getElementById(id+'Val').textContent=val; } setBar('barRed', s.red, s.total); setBar('barOrange', s.orange, s.total); setBar('barBlue', s.blue, s.total); }

function render(){ const clientsView = currentView.type==='clients', reportView = currentView.type==='report'; viewTitle.textContent = currentView.type==='today' ? 'Hoje' : currentView.type==='soon' ? 'Em breve' : currentView.type==='inbox' ? 'Entrada' : currentView.type==='project' ? 'Projeto' : currentView.type==='teamProject' ? 'Equipe' : currentView.type==='report' ? 'Produtividade' : 'Clientes'; if (clientsView) { renderClients(); renderDrive(); return; } if (reportView) { renderReport(); return; } renderTasks(); }

// Init
tasks = recomputePriorities(tasks); save(STORAGE.tasks, tasks); renderSidebar(); render();
if ('serviceWorker' in navigator){ window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{})); }
