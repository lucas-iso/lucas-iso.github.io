/* script.js */
const src=document.getElementById('src');
const dw=document.getElementById('dw');
const modified=document.getElementById('modified');
const copyBtn=document.getElementById('copy');
const copyModBtn=document.getElementById('copyModified');
const live=document.getElementById('live');
const chips=document.getElementById('chips');
const exBtn=document.getElementById('ex');

const SAMPLE=`%dw 2.0\nimport * from dw::dateNormalizer\nvar tz=time_zone.EST\noutput application/json\n---\n{\n  id: payload.order.id,\n  buyer: payload.order.customer.name,\n  trace: attributes.correlationId,\n  retry: vars.carriersResponse[0].id,\n  batch: vars._mule_batch_INTERNAL_record.payload,\n  zone: Mule::p(time_zone.EST)\n}`;

exBtn.addEventListener('click',()=>{src.value=SAMPLE;if(live.checked)generate()});

const RE_BASE=/\b(payload\.|attributes|error|vars)\b((?:\.(?:[A-Za-z_][A-Za-z0-9_]*|\'[^\']*\'|\"[^\"]*\")|\[[^\]]*\])*)/g;
const RE_PCALL=/\b(?:Mule::)?p\(\s*([^\)]+?)\s*\)/g;

function tokenize(str){
  const out={payload:new Set(),attributes:new Set(),error:new Set(),vars:new Set(),p:new Set()};
  let m;
  while((m=RE_BASE.exec(str))){
    const base=m[1];
    const trail=(m[2]||'');
    const clean=trail.replace(/\[[^\]]*\]/g,'');
    const parts=clean.split('.').filter(Boolean).map(k=>k.trim());
    if(parts.length){
      if(base==='vars') out[base].add(parts[0]); // only first level for vars
      else out[base].add(parts.join('.'));
    } else out[base].add('');
  }
  while((m=RE_PCALL.exec(str))){
    const arg=m[1].trim().replace(/\s+/g,' ').replace(/^['"]|['"]$/g,''); // remove surrounding quotes
    if(arg) out.p.add(arg);
  }
  return out;
}

function buildDW(tokens){
  chips.innerHTML='';
  const addChip=label=>{const s=document.createElement('span');s.className='chip';s.textContent=label;chips.appendChild(s);};
  const sections=[];

  // Handle payload/attributes/error
  for(const base of ['payload','attributes','error']){
    const paths=Array.from(tokens[base]);
    if(!paths.length)continue;
    const objs=paths.map(p=>p?`${base}.${p}`:base);
    sections.push(`  ${base}: {\n    ${objs.map((v,i)=>`${i?',\n    ':''}${v.split('.').pop()}: ${v}`).join('')}\n  }`);
    addChip(`${base} · ${paths.length}`);
  }

  // Handle vars with special case for _mule_batch_INTERNAL_record
  if (tokens.vars.size) {
    const vpaths=Array.from(tokens.vars);
    const lines=[];
    vpaths.forEach((v,i)=>{
      if (v==='_mule_batch_INTERNAL_record' || v==="\"_mule_batch_INTERNAL_record\"") {
        const newV=v.replace(/['"]/g, '');
        lines.push(`"${newV}": {\n        payload: vars.${v}.payload\n    }`);
      } else {
        lines.push(`${v}: vars.${v}`);
      }
    });
    sections.push(`  vars: {\n    ${lines.join(',\n    ')}\n  }`);
    addChip(`vars · ${vpaths.length}`);
  }

  // Add p() references again
  if(tokens.p.size){
    const arr=Array.from(tokens.p);
    sections.push(`  p: {\n    ${arr.map((a,i)=>`${i?',\n    ':''}"${a}": p('${a}')`).join('')}\n  }`);
    addChip(`p(·) · ${arr.length}`);
  }

  return `%dw 2.0\noutput application/json\n---\n{\n${sections.join(',\n')}\n}`;
}

function modifyOriginal(srcText){
  let modified=srcText;
  // Replace Mule::p() -> p()
  modified=modified.replace(/Mule::p\(/g,'p(');
  // Adjust dateNormalizer import
  if(/import\s+\*\s+from\s+dw::dateNormalizer/.test(modified)){
    modified=modified.replace(/dw::dateNormalizer/g,'dwl::dateNormalizer');
  }
  // Inject p() helper if used
  if(/\bp\(/.test(modified)){
    modified=modified.replace(/output\s+application\/json/,'output application/json\n\nvar prop = {\n    "timeZone.EST": "America/New_York"\n}\nfun p(v) = prop[v] default v');
  }
  return modified;
}

function generate(){
  const text=src.value||'';
  const tokens=tokenize(text);
  const code=buildDW(tokens);
  dw.textContent=code;
  modified.textContent=modifyOriginal(text);
}

src.addEventListener('input',()=>{if(live.checked)generate()});
document.addEventListener('DOMContentLoaded',()=>{src.value='';generate()});

copyBtn.addEventListener('click',async()=>{const txt=dw.textContent;await navigator.clipboard.writeText(txt);copyBtn.textContent='Copied!';setTimeout(()=>copyBtn.textContent='Copy',1200)});
copyModBtn.addEventListener('click',async()=>{const txt=modified.textContent;await navigator.clipboard.writeText(txt);copyModBtn.textContent='Copied!';setTimeout(()=>copyModBtn.textContent='Copy Modified',1200)});
