const api=window.cashflowDesktop;
const content=document.querySelector('#content'),status=document.querySelector('#status');
let current={step:'welcome'},busy=false;
const messages={
 INVALID_CONFIGURATION:'Vérifiez l’URL du projet et les clés legacy anon / service_role. Elles doivent appartenir au même projet.',
 SUPABASE_ACCESS_DENIED:'Les accès Supabase ont été refusés. Vérifiez les clés et le jeton personnel.',
 SUPABASE_UNAVAILABLE:'Supabase est indisponible. Vérifiez votre connexion, puis réessayez.',
 INCOMPATIBLE_DATABASE:'Cette base ne correspond pas à cette version de Freelance Cashflow. Aucune migration n’a été appliquée.',
 PROJECT_NOT_EMPTY:'Ce projet contient déjà une installation. Choisissez « Installation existante ».',
 EMPTY_DATABASE:'Ce projet est vide. Choisissez « Nouveau projet dédié ».',
 PORT_IN_USE:'Le port 3000 est déjà utilisé. Fermez l’autre instance ou le programme concerné, puis réessayez.',
 SERVER_TIMEOUT:'Le serveur n’a pas démarré à temps. Réessayez ou réinstallez l’application.',
 SERVER_IDENTITY_MISMATCH:'Le serveur local n’a pas pu être identifié. Fermez l’autre application utilisant le port 3000.',
 CLI_FAILED:'La préparation a échoué. Vérifiez le jeton, le mot de passe et la disponibilité du projet, puis relancez la vérification.',
 CLI_TIMEOUT:'La préparation a dépassé le délai prévu. Relancez la vérification pour connaître l’état de la base.',
 BACKUP_REQUIRED:'Confirmez avoir vérifié une sauvegarde avant de mettre à jour la base.',
 DATABASE_CHANGED:'La base a changé depuis l’aperçu. Relancez la vérification.',
 PREVIEW_REQUIRED:'Un nouvel aperçu est nécessaire. Revenez aux accès pour relancer la vérification.',
 SESSION_EXPIRED:'La session a expiré. Saisissez à nouveau vos accès.',
 CONFIGURATION_UNREADABLE:'Les réglages enregistrés ne sont pas lisibles. Renseignez les accès à votre installation existante.',
 SCHEMA_CHECK_REQUIRED:'Cette version doit vérifier votre base existante avant de démarrer. Vos réglages et vos données sont conservés.',
 AUTH_CONFIGURATION_REQUIRED:'Confirmez les réglages d’authentification avant de démarrer.',
 CONFIGURATION_SAVE_FAILED:'Les réglages n’ont pas pu être enregistrés. Les réglages précédents sont conservés.',
 OPERATION_BUSY:'Une opération est déjà en cours.'
};
function el(tag,text,attrs={}){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;}
function button(text,action,secondary=false){const b=el('button',text,{type:'button',class:secondary?'secondary':''});b.addEventListener('click',action);return b;}
function title(text,description){content.append(el('h1',text,{id:'title'}),el('p',description,{class:'intro'}));}
function field(parent,label,name,type='text'){const wrapper=el('label',label),input=el('input',undefined,{name,type,required:'',autocomplete:'off',spellcheck:'false'});wrapper.append(input);parent.append(wrapper);return input;}
function link(parent,text,name){parent.append(button(text,()=>invoke('openSupabase',name),true));}
function checked(parent,text){const label=el('label',undefined,{class:'check'}),input=el('input',undefined,{type:'checkbox'});label.append(input,document.createTextNode(text));parent.append(label);return input;}
async function invoke(method,payload){
 if(busy)return;
 busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
 status.className='loading';status.textContent=['inspect','apply'].includes(method)?'Vérification en cours… cela peut prendre quelques minutes.':'';
 try{const result=await api[method](payload);if(!result.ok)throw result.error;if(result.value?.step){current=result.value;render();}status.textContent='';}
 catch(error){status.className='';status.textContent=messages[error.code]??'L’opération n’a pas abouti. Réessayez. Code : '+(error.code??'OPERATION_FAILED');}
 finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
function render(){
 content.replaceChildren();
 document.querySelectorAll('#progress li').forEach((n,i)=>n.classList.toggle('active',i===(['welcome','configuration'].includes(current.step)?0:current.step==='preview'?1:2)));
 if(current.notice){content.append(el('p',messages[current.notice]??current.notice,{class:'notice'}));if(['PORT_IN_USE','SERVER_TIMEOUT','SERVER_EXITED','SERVER_IDENTITY_MISMATCH'].includes(current.notice))content.append(button('R\u00e9essayer le d\u00e9marrage',()=>invoke('retryStart')));}
 if(['welcome','configuration'].includes(current.step)){
  title('Installons votre espace de travail.','Quelques réglages, une seule fois. Ensuite, Freelance Cashflow s’ouvrira par double-clic dans votre navigateur.');
  const form=el('form'),panel=el('div',undefined,{class:'panel'}),modeLabel=el('label','Votre situation'),mode=el('select',undefined,{name:'mode'});
  mode.append(el('option','Nouveau projet dédié',{value:'new'}),el('option','Installation existante',{value:'existing'}));modeLabel.append(mode);panel.append(modeLabel);
  panel.append(el('p','Créez un compte Supabase et un projet vide dédié, ou retrouvez votre projet existant. Une connexion Internet est nécessaire.',{class:'hint'}));link(panel,'Ouvrir Supabase','dashboard');
  field(panel,'URL du projet','url','url');
  panel.append(el('p','Supabase : Connect pour l’URL, puis Settings → API Keys → Legacy pour les clés.',{class:'hint'}));
  const grid=el('div',undefined,{class:'grid'});field(grid,'Clé publique anon','anonKey','password');field(grid,'Clé secrète service_role','serviceRoleKey','password');panel.append(grid);
  field(panel,'Jeton personnel Supabase','accessToken','password');panel.append(el('p','Ce jeton sert à vérifier et préparer la base. Il n’est pas enregistré.',{class:'hint'}));link(panel,'Créer ou retrouver mon jeton','tokens');
  field(panel,'Mot de passe de la base','databasePassword','password');panel.append(el('p','Distinct du mot de passe de votre compte Supabase. Il n’est pas enregistré.',{class:'hint'}));
  form.append(panel,el('button','Vérifier mon installation',{type:'submit'}));
  form.addEventListener('submit',e=>{e.preventDefault();void invoke('inspect',Object.fromEntries(new FormData(form)));});content.append(form);
 }else if(current.step==='preview'){
  const inspection=current.inspection;
  title('Vérifiez le projet choisi.','La préparation crée uniquement les éléments nécessaires à Freelance Cashflow.');
  const panel=el('div',undefined,{class:'panel'});panel.append(el('h2','Projet Supabase'),el('code',current.projectRef),el('p',inspection.pending.length?inspection.pending.length+' migrations à appliquer.':'Votre base est déjà à jour.'));
  const list=el('ul',undefined,{class:'migrations'});for(const name of inspection.pending)list.append(el('li',name));panel.append(list);
  let backup;
  if(inspection.kind==='pending'){panel.append(el('p','Avant cette mise à jour, conservez une sauvegarde et vérifiez que vous savez la restaurer.'));link(panel,'Consulter les sauvegardes','backup');backup=checked(panel,'J’ai vérifié une sauvegarde et la procédure de restauration.');}
  content.append(panel);const actions=el('div',undefined,{class:'actions'});
  actions.append(button('Revenir aux accès',()=>{current={step:'configuration'};render();},true),button(inspection.pending.length?'Préparer ma base':'Continuer',()=>invoke('apply',{fingerprint:inspection.fingerprint,backupVerified:backup?.checked===true})));content.append(actions);
 }else if(current.step==='auth'){
  title('Dernier réglage dans Supabase.','Votre base est prête. Vérifiez les réglages qui permettent de créer votre compte et de vous reconnecter.');
  const panel=el('div',undefined,{class:'panel'});panel.append(el('h2','Authentication → URL Configuration'),el('p','Renseignez cette adresse comme Site URL et autorisez les redirections vers cette adresse :'),el('code','http://localhost:3000'),el('p','Dans Authentication → Sign In / Providers, activez l’inscription par e-mail pour votre premier compte. Confirmez ensuite votre adresse si Supabase le demande.'));
  link(panel,'Ouvrir les réglages de mon projet','project');const confirmation=checked(panel,'J’ai vérifié l’URL locale et l’inscription par e-mail.');content.append(panel,button('Ouvrir Freelance Cashflow',()=>invoke('saveAndStart',{authConfirmed:confirmation.checked})),button('Revenir aux acc\u00e8s',()=>{current={step:'configuration'};render();},true));
 }else{
  content.append(el('div','✓',{class:'success','aria-hidden':'true'}));title('Votre espace est prêt.','Freelance Cashflow fonctionne sur votre ordinateur et s’ouvre dans votre navigateur.');
  const panel=el('div',undefined,{class:'panel'});panel.append(el('h2','Pour les prochaines fois'),el('p','Double-cliquez sur Freelance Cashflow. Aucun terminal à ouvrir. Les banques peuvent être connectées plus tard.'),el('p','Fermer l’onglet conserve le serveur actif. Pour l’arrêter, choisissez Quitter dans le menu du lanceur.'));content.append(panel,button('Ouvrir mon espace',()=>invoke('open')));
 }
}
document.querySelector('#quit').addEventListener('click',()=>invoke('quit'));render();void invoke('getState');
