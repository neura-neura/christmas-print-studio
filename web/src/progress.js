export const PROGRESS_KEY='taller-navidad-a1-v1';
const models=['sphere','photo','name'];
export function validDesign(d){return d&&models.includes(d.model)&&typeof d.name==='string'&&d.name.length<=40;}
export function validEntry(e){return e&&typeof e.id==='string'&&validDesign(e.design)&&Number.isInteger(e.quantity)&&e.quantity>0&&e.quantity<=100;}
function read(storage,key){try{return JSON.parse(storage?.getItem(key)||'null');}catch{return null;}}
export function loadProgress(storage,legacySession){
 const saved=read(storage,PROGRESS_KEY);
 const entries=Array.isArray(saved?.entries)?saved.entries.filter(validEntry).slice(0,100):[];
 if(entries.reduce((n,e)=>n+e.quantity,0)>100||new Set(entries.map(e=>e.id)).size!==entries.length)entries.length=0;
 // Preserve work started before drafts moved from sessionStorage to localStorage.
 const candidate=saved?.draft??read(legacySession,PROGRESS_KEY+'-draft');
 const draft=validDesign(candidate?.design)?candidate:null;
 if(draft&&(!validEntry(draft.editingSnapshot)||!entries.some(e=>e.id===draft.editingId)||draft.editingSnapshot.id!==draft.editingId)){
  draft.editingId=null;draft.editingSnapshot=null;
 }
 return {entries,draft};
}
export function saveProgress(storage,entries,draft){
 try{storage.setItem(PROGRESS_KEY,JSON.stringify({version:2,entries,draft}));return true;}catch{return false;}
}
