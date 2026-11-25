// AA Team projects — shared by the Project Details form (/projects) and the
// board (/projects/board). Reads and writes public.projects.
//
// Unlike /tactical these pages need an AA Mastery login: rows name clients,
// law firms and contacts. Row-level security does the real gating (leadership
// sees and edits everything, members file and see their own); PJ.isLeader()
// below only decides what the UI offers.

var PJ_SUPABASE_URL='https://mrxhydaoxlxuampmgaoi.supabase.co';
var PJ_SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yeGh5ZGFveGx4dWFtcG1nYW9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTg2NDgsImV4cCI6MjA4OTMzNDY0OH0.STQzp2Berri61IHeoDFHnDUkg_9eSV-giVCrUhHHk64';

// Kept in step with LEADERSHIP_EMAILS / LEADERSHIP_NAMES in the main app and
// public.is_leadership() in the database.
var PJ_LEADERSHIP_EMAILS=['jeff@ataandeadvisors.com'];
var PJ_LEADERSHIP_NAMES=['jeff','glory','junior','simon','achumboro','aaron'];

var PJ_FORM_PATH='/projects';
var PJ_BOARD_PATH='/projects/board';
var PJ_INCOMING='Incoming responses/In Progress';

// Board groups, top to bottom, as on Monday. Kept in step with the
// board_group check constraint in 20261125_projects.sql.
var PJ_GROUPS=[
  {name:'Incoming responses/In Progress', color:'#f5c542'},
  {name:'Upcoming Projects',              color:'#5b9bf5'},
  {name:'Paused',                         color:'#ff7a85'},
  {name:'Completed Projects',             color:'#4fd1b5', collapsed:true},
  {name:'Irregular (On & Off Projects)',  color:'#b07cf5'},
  {name:'Removed from the Project',       color:'#8aa1bf', collapsed:true},
  {name:'Rejected Projects',              color:'#c0504d', collapsed:true}
];

var PJ_STATUSES=['In Progress','Paused','Completed','Irregular','Removed from the Project'];
var PJ_STATUS_COLOR={'In Progress':'#f5c542','Paused':'#ff7a85','Completed':'#4fd1b5',
  'Irregular':'#b07cf5','Removed from the Project':'#8aa1bf'};

var PJ_YN=['Yes','No'];
var PJ_YNNA=['Yes','No','N/A'];
var PJ_PLATFORMS=['Relativity','DISCO','Reveal','Everlaw','Casepoint','Logikcull','Nuix Discover','Axcelerate','Catalyst'];
var PJ_DESKTOPS=['Citrix','Microsoft Remote Desktop','Azure Remote Desktop','Amazon WorkSpaces','VMware Horizon','Omnissa Horizon','Microsoft 365','N/A'];

// Every field on the form, in form order. type: text | long | date | number |
// select (opts) | list (free text with suggestions). req mirrors Monday.
// board:true fields exist only on the board (leadership), not the form.
var PJ_SECTIONS=[
  {title:'Board', board:true, fields:[
    {key:'item_name',     label:'Item', type:'text', req:true, hint:'The name shown on the board, usually the agency.'},
    {key:'board_group',   label:'Group', type:'select', opts:PJ_GROUPS.map(function(g){return g.name;}), req:true},
    {key:'coder_count',   label:'Numbers (coders on the project)', type:'number'},
    {key:'contact_email', label:'Email Address', type:'text'}
  ]},
  {title:'The project', fields:[
    {key:'agency',          label:'Agency', type:'text', req:true},
    {key:'project_name',    label:'Name of the Project', type:'text', req:true},
    {key:'status',          label:'Status', type:'select', opts:PJ_STATUSES, req:true,
     hint:'You’re filling this out after the project starts, so the status should be In Progress.'},
    {key:'litigation_type', label:'Type of Civil Litigation', type:'text', req:true},
    {key:'languages',       label:'Language', type:'text', req:true, hint:'Enter every language for this project, separated by commas.'},
    {key:'about',           label:'What is the project about?', type:'long', req:true, max:2000}
  ]},
  {title:'The parties', fields:[
    {key:'company_represented', label:'Company we represent', type:'text', req:true},
    {key:'firm_represented',    label:'Law firm who we represent', type:'text', req:true},
    {key:'opposing_company',    label:'Company/Agent who we are against', type:'text', req:true},
    {key:'opposing_firm',       label:'Law firm we are against', type:'text', req:true}
  ]},
  {title:'The team', fields:[
    {key:'coders',           label:'Coder/s', type:'text', req:true},
    {key:'supervisor',       label:'Project Supervisor', type:'text', req:true},
    {key:'project_managers', label:'Project Manager/s', type:'text', req:true},
    {key:'team_leads',       label:'Team Lead/s', type:'text', req:true},
    {key:'qcs',              label:'QC/s', type:'text', req:true},
    {key:'other_contacts',   label:'Other team members connected to the agency or the client', type:'long', req:true, max:2000,
     hint:'Only people connected to the agency or law firm. Do not include other document reviewers. Write N/A if there’s no one.'},
    {key:'promoted_qc',      label:'Promoted to QC?', type:'select', opts:PJ_YNNA, req:true, hint:'You may put N/A since the project just started.'},
    {key:'promoted_tl',      label:'Promoted to Team Lead?', type:'select', opts:PJ_YNNA, req:true, hint:'You may put N/A since the project just started.'}
  ]},
  {title:'Setup', fields:[
    {key:'remote_desktop',    label:'Software used for remote desktop', type:'list', opts:PJ_DESKTOPS, req:true},
    {key:'review_platform',   label:'Review Platform', type:'list', opts:PJ_PLATFORMS},
    {key:'skills',            label:'Skills needed for the project', type:'text', req:true, hint:'E.g. privilege, redactions, privilege log.'},
    {key:'it_contact',        label:'IT contact information', type:'text', req:true},
    {key:'protocol_uploaded', label:'Did you upload the project protocol in the ‘protocols-and-issue-logs’ channel?', type:'select', opts:PJ_YN, req:true,
     hint:'This should always be Yes: upload the protocol before filing this form.'}
  ]},
  {title:'Schedule and hours', fields:[
    {key:'start_date',      label:'Start Date', type:'date', req:true},
    {key:'end_date',        label:'End Date', type:'date', hint:'The estimated end date. Skip it if it doesn’t apply.'},
    {key:'case_room_hours', label:'Case Room Hours', type:'text', req:true, hint:'E.g. 8:00 am - 8:00 pm'},
    {key:'weekend_allowed', label:'Allowed to work on the weekend?', type:'select', opts:PJ_YN, req:true},
    {key:'max_hours_day',   label:'Max hours per day allowed', type:'number', req:true, hint:'Numbers only, e.g. 10, 12, 15.'},
    {key:'max_hours_week',  label:'Max hours per week allowed', type:'number', req:true, hint:'Numbers only, e.g. 40, 50, 75.'},
    {key:'proposed_length', label:'Proposed length of the project', type:'text', req:true, hint:'Write N/A if it doesn’t apply.'},
    {key:'pace',            label:'Pace after first week (docs/hr)', type:'text', hint:'You may skip this.'}
  ]},
  {title:'Anything else', fields:[
    {key:'notes', label:'Other notes regarding the project', type:'long', max:2000,
     hint:'Anything significant about this project not covered above.'}
  ]}
];

function el(id){return document.getElementById(id);}

function esc(v){
  return String(v==null?'':v).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function pjPrettyDate(iso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||'')) return '';
  var p=iso.split('-'), d=new Date(+p[0],+p[1]-1,+p[2]);
  var opts={month:'short',day:'numeric'};
  if(d.getFullYear()!==new Date().getFullYear()) opts.year='numeric';
  return d.toLocaleDateString('en-US',opts);
}

function pjToast(msg){
  var t=el('toast'); if(!t) return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(pjToast._t); pjToast._t=setTimeout(function(){t.classList.remove('show');},2200);
}

// ── Session ─────────────────────────────────────────────────────────────────
// Kept in sessionStorage: closes with the tab, never shared across devices.
var PJ={
  session:null,

  load(){
    try{ this.session=JSON.parse(sessionStorage.getItem('pj_session')||'null'); }catch(e){ this.session=null; }
    return this.session;
  },
  save(d){
    if(!d||!d.access_token) return false;
    var prev=this.session||{};
    this.session={
      access_token:d.access_token,
      refresh_token:d.refresh_token||prev.refresh_token,
      expires_at:Date.now()+((Number(d.expires_in)||3600)*1000),
      user:d.user||prev.user
    };
    try{ sessionStorage.setItem('pj_session',JSON.stringify(this.session)); }catch(e){}
    return true;
  },
  clear(){
    this.session=null;
    try{ sessionStorage.removeItem('pj_session'); }catch(e){}
  },
  user(){return this.session&&this.session.user;},
  name(){
    var u=this.user()||{};
    return (u.user_metadata&&u.user_metadata.display_name)||(u.email||'').split('@')[0]||'';
  },
  isLeader(){
    var u=this.user(); if(!u) return false;
    var em=(u.email||'').toLowerCase();
    if(PJ_LEADERSHIP_EMAILS.indexOf(em)!==-1) return true;
    var nm=((u.user_metadata&&u.user_metadata.display_name)||'').toLowerCase();
    return PJ_LEADERSHIP_NAMES.indexOf(nm)!==-1;
  },

  async signIn(email,password){
    var res=await fetch(PJ_SUPABASE_URL+'/auth/v1/token?grant_type=password',{
      method:'POST',headers:{'Content-Type':'application/json','apikey':PJ_SUPABASE_ANON_KEY},
      body:JSON.stringify({email:email,password:password})});
    var d=await res.json().catch(function(){return {};});
    if(!res.ok||!d.access_token) throw new Error(d.error_description||d.msg||d.error||'Sign-in failed.');
    this.save(d);
  },

  async signOut(){
    if(this.session){
      fetch(PJ_SUPABASE_URL+'/auth/v1/logout',{method:'POST',headers:{'apikey':PJ_SUPABASE_ANON_KEY,
        'Authorization':'Bearer '+this.session.access_token}}).catch(function(){});
    }
    this.clear();
  },

  // Access tokens last an hour; renew a minute early.
  async fresh(force){
    var s=this.session; if(!s) return false;
    if(!force&&Date.now()<s.expires_at-60000) return true;
    if(!s.refresh_token){ this.clear(); return false; }
    var res=await fetch(PJ_SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',headers:{'Content-Type':'application/json','apikey':PJ_SUPABASE_ANON_KEY},
      body:JSON.stringify({refresh_token:s.refresh_token})}).catch(function(){return null;});
    var d=res&&res.ok?await res.json():null;
    if(!d||!this.save(d)){ this.clear(); return false; }
    return true;
  },

  async api(path,opts){
    opts=opts||{};
    if(!(await this.fresh())) throw new Error('Your session has ended. Sign in again.');
    var send=function(tok){
      var h={'apikey':PJ_SUPABASE_ANON_KEY,'Authorization':'Bearer '+tok,'Content-Type':'application/json'};
      for(var k in (opts.headers||{})) h[k]=opts.headers[k];
      return fetch(PJ_SUPABASE_URL+'/rest/v1/'+path,{method:opts.method||'GET',headers:h,body:opts.body});
    };
    var res=await send(this.session.access_token);
    if(res.status===401&&(await this.fresh(true))) res=await send(this.session.access_token);
    if(res.status===401) throw new Error('Your session has ended. Sign in again.');
    if(!res.ok){
      var d=await res.json().catch(function(){return {};});
      throw new Error(d.message||('Request failed ('+res.status+').'));
    }
    return res.status===204?null:res.json().catch(function(){return null;});
  }
};

// ── Sign-in card ────────────────────────────────────────────────────────────
// Renders into `host` and resolves once signed in. Accounts are the same as
// the main AA Mastery site; password resets happen there.
function pjRequireLogin(host,blurb){
  PJ.load();
  if(PJ.session) return PJ.fresh().then(function(ok){ return ok?true:pjRequireLogin(host,blurb); });
  return new Promise(function(resolve){
    host.innerHTML=
      '<form class="card login" id="pj-login" novalidate>'+
        '<h2>Sign in</h2>'+
        '<p class="login-sub">'+esc(blurb)+' Use your AA Mastery account.</p>'+
        '<label class="fld"><span class="fl">Email</span><input id="pj-email" type="email" autocomplete="username" required></label>'+
        '<label class="fld"><span class="fl">Password</span><input id="pj-pw" type="password" autocomplete="current-password" required></label>'+
        '<div class="note err" id="pj-login-err"></div>'+
        '<button class="btn btn-gold" id="pj-login-btn" type="submit">Sign in</button>'+
        '<p class="login-foot">Forgot your password? Reset it on <a href="/">AA Mastery</a>.</p>'+
      '</form>';
    el('pj-email').focus();
    el('pj-login').addEventListener('submit',async function(ev){
      ev.preventDefault();
      var err=el('pj-login-err'), btn=el('pj-login-btn');
      var email=el('pj-email').value.trim(), pw=el('pj-pw').value;
      if(!email||!pw){ err.textContent='Enter your email and password.'; err.classList.add('show'); return; }
      btn.disabled=true; btn.textContent='Signing in…'; err.classList.remove('show');
      try{ await PJ.signIn(email,pw); host.innerHTML=''; resolve(true); }
      catch(e){ err.textContent=e.message; err.classList.add('show'); btn.disabled=false; btn.textContent='Sign in'; }
    });
  });
}

// ── Field rendering (form and board drawer) ─────────────────────────────────
function pjInput(f,val,readOnly){
  var id='f-'+f.key, v=val==null?'':String(val);
  var ro=readOnly?' disabled':'';
  var req=f.req&&!readOnly?' required':'';
  if(f.type==='long'){
    return '<textarea id="'+id+'" data-key="'+f.key+'" rows="4"'+(f.max?' maxlength="'+f.max+'"':'')+ro+req+'>'+esc(v)+'</textarea>'+
      (f.max&&!readOnly?'<div class="count"><span data-count="'+f.key+'">'+v.length+'</span>/'+f.max+'</div>':'');
  }
  if(f.type==='select'){
    var opts=f.opts.slice();
    if(v&&opts.indexOf(v)===-1) opts.unshift(v); // keep imported values that are off-list
    return '<select id="'+id+'" data-key="'+f.key+'"'+ro+req+'><option value="">Choose…</option>'+
      opts.map(function(o){return '<option'+(o===v?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select>';
  }
  var type=f.type==='date'?'date':f.type==='number'?'number':'text';
  var extra=f.type==='number'?' inputmode="decimal" step="any" min="0"':'';
  var list=f.type==='list'?' list="dl-'+f.key+'"':'';
  var dl=f.type==='list'&&!readOnly?'<datalist id="dl-'+f.key+'">'+f.opts.map(function(o){return '<option value="'+esc(o)+'">';}).join('')+'</datalist>':'';
  return '<input id="'+id+'" data-key="'+f.key+'" type="'+type+'" value="'+esc(v)+'"'+extra+list+ro+req+' maxlength="1000">'+dl;
}

function pjField(f,val,readOnly){
  return '<label class="fld" for="f-'+f.key+'">'+
    '<span class="fl">'+esc(f.label)+(f.req&&!readOnly?' <b class="req">*</b>':'')+'</span>'+
    (f.hint&&!readOnly?'<span class="fh">'+esc(f.hint)+'</span>':'')+
    pjInput(f,val,readOnly)+'</label>';
}

function pjWireCounts(root){
  root.querySelectorAll('textarea[maxlength]').forEach(function(t){
    t.addEventListener('input',function(){
      var c=root.querySelector('[data-count="'+t.dataset.key+'"]'); if(c) c.textContent=t.value.length;
    });
  });
}

// Read every [data-key] control under root into a row. Blank -> null.
function pjCollect(root){
  var rec={};
  root.querySelectorAll('[data-key]').forEach(function(c){
    var v=c.value.trim();
    rec[c.dataset.key]=v===''?null:(c.type==='number'?Number(v):v);
  });
  return rec;
}

// Names of required fields left blank under root.
function pjMissing(root,sections){
  var miss=[];
  sections.forEach(function(s){ s.fields.forEach(function(f){
    var c=root.querySelector('[data-key="'+f.key+'"]');
    if(f.req&&c&&!c.disabled&&!c.value.trim()) miss.push(f);
  }); });
  return miss;
}

var PJ_LOGO='<svg width="34" height="34" viewBox="0 0 100 100" fill="none" aria-hidden="true"><defs>'+
  '<linearGradient id="pj-tg" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">'+
  '<stop offset="0%" stop-color="#f5d060"/><stop offset="50%" stop-color="#d4a82a"/><stop offset="100%" stop-color="#7eb8f7"/></linearGradient></defs>'+
  '<path d="M50 14 L86 74 L14 74 Z" stroke="url(#pj-tg)" stroke-width="6" fill="none" stroke-linejoin="round"/>'+
  '<path d="M50 30 L72 68 L28 68 Z" fill="url(#pj-tg)" opacity="0.9"/></svg>';
