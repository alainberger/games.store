// Router
const views = { '#video':'view-video', '#clone':'view-clone', '#tts':'view-tts', '#convert':'view-convert', '#library':'view-library' };
function route(){ const h=location.hash||'#video'; for(const k in views){ document.getElementById(views[k]).style.display = (k===h?'':'none'); document.querySelector(`nav a[href="${k}"]`)?.classList.toggle('active',k===h);} }
addEventListener('hashchange', route); route();

// Helpers
const $ = s=>document.querySelector(s);
async function refreshLibrary(){
  const data = await fetch('/api/voices').then(r=>r.json()).catch(()=>({profiles:[]}));
  const lib = $('#lib'); lib.innerHTML='';
  const sel = $('#voiceSelect'); sel.innerHTML='<option value="">Système (démo)</option>';
  (data.profiles||[]).forEach(p=>{
    const el = document.createElement('div');
    el.className='card';
    el.innerHTML = `<b>${p.name}</b> <span class="small">(${p.id}) — ${p.status||'ready'}</span><br/>
                    <audio controls src="/storage/${p.sample}"></audio><br/>
                    <button data-del="${p.id}">Supprimer</button>`;
    lib.appendChild(el);
    sel.innerHTML += `<option value="${p.id}">${p.name}</option>`;
  });
  lib.querySelectorAll('button[data-del]').forEach(b=>{
    b.onclick = async ()=>{ await fetch('/api/voices/'+b.dataset.del, {method:'DELETE'}); refreshLibrary(); };
  });
}
refreshLibrary();

// -------- Video -> Clone (auto extract) --------
const vidFile = $('#vidFile'), vidDrop=$('#vidDrop'), vidMsg=$('#vidMsg'), vName=$('#vName'), consentV=$('#consentV');
const vidPreview = $('#vidPreview'), audPreview=$('#audPreview');
vidDrop.ondragover = e=>{ e.preventDefault(); vidDrop.style.borderColor='#38e38e'; };
vidDrop.ondragleave = e=>{ vidDrop.style.borderColor='rgba(255,255,255,.25)'; };
vidDrop.ondrop = e=>{ e.preventDefault(); vidDrop.style.borderColor='rgba(255,255,255,.25)'; vidFile.files = e.dataTransfer.files; loadVidPreview(); };
vidFile.onchange = loadVidPreview;
function loadVidPreview(){
  const f = vidFile.files?.[0]; if(!f) return;
  const url = URL.createObjectURL(f);
  vidPreview.src = url;
}
$('#btnVidEnroll').onclick = async ()=>{
  const f = vidFile.files?.[0]; if(!f) return alert('Choisis une vidéo.');
  if(!consentV.checked) return alert('Coche la case de consentement.');
  const fd = new FormData();
  fd.append('media', f);
  fd.append('name', vName.value || 'Ma voix (vidéo)');
  fd.append('consent', 'true');
  vidMsg.textContent = 'Extraction en cours...';
  const r = await fetch('/api/enrollFromMedia', {method:'POST', body: fd}).then(r=>r.json());
  if(r.error){ vidMsg.textContent = 'Erreur: '+r.error; }
  else { vidMsg.textContent='Clone créé: '+r.id; audPreview.src = r.sampleUrl; refreshLibrary(); }
};

// -------- Audio -> Clone --------
const consent = $('#consent');
const btnRec = $('#btnRec'), btnStop=$('#btnStop');
const audFile = $('#audFile'), preview=$('#preview'), enrollMsg=$('#enrollMsg'), voiceName=$('#voiceName');
let media, recorder, chunks=[];
btnRec.onclick = async ()=>{
  if(!consent.checked) return alert('Coche la case de consentement.');
  media = await navigator.mediaDevices.getUserMedia({audio:true});
  recorder = new MediaRecorder(media);
  chunks = [];
  recorder.ondataavailable = e=>chunks.push(e.data);
  recorder.onstop = ()=>{
    const blob = new Blob(chunks, {type:'audio/webm'});
    preview.src = URL.createObjectURL(blob);
    preview.dataset.blobUrl = preview.src;
  };
  recorder.start(); btnRec.disabled = true; btnStop.disabled = false;
};
btnStop.onclick = ()=>{ recorder?.stop(); media?.getTracks().forEach(t=>t.stop()); btnRec.disabled=false; btnStop.disabled=true; };
audFile.onchange = ()=>{ const f=audFile.files?.[0]; if(f){ preview.src = URL.createObjectURL(f); preview.dataset.file = f.name; }};

$('#btnEnroll').onclick = async ()=>{
  if(!consent.checked) return alert('Coche la case de consentement.');
  let blob;
  if(preview.dataset.blobUrl){ blob = await fetch(preview.dataset.blobUrl).then(r=>r.blob()); }
  else if(audFile.files?.[0]){ blob = audFile.files[0]; }
  else return alert('Enregistre ou sélectionne un audio.');
  const fd = new FormData();
  fd.append('name', voiceName.value || 'Ma voix');
  fd.append('consent', 'true');
  fd.append('audio', blob, 'sample.webm');
  const r = await fetch('/api/enroll', {method:'POST', body: fd}).then(r=>r.json());
  if(r.error){ enrollMsg.textContent = 'Erreur : '+r.error; }
  else { enrollMsg.textContent = 'Clone enregistré : '+r.id; refreshLibrary(); }
};

// -------- TTS demo (browser) --------
const ttsAudio = $('#ttsAudio');
$('#btnSpeak').onclick = async ()=>{
  const text = $('#ttsText').value.trim();
  const rate = parseFloat($('#rate').value);
  const pitch = parseFloat($('#pitch').value);
  if(!text) return;
  if(!('speechSynthesis' in window)) return alert('Web Speech non supporté.');
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate; utter.pitch = Math.max(0, 1 + pitch*0.05);
  speechSynthesis.cancel(); speechSynthesis.speak(utter);
  // placeholder silent wav to allow download/share
  const ctx = new (window.AudioContext||window.webkitAudioContext)();
  const dur = Math.min(10, Math.max(2, text.split(/\s+/).length * 0.25));
  const sr=ctx.sampleRate, length=Math.floor(dur*sr);
  const buf=ctx.createBuffer(1,length,sr);
  const wav = bufferToWav(buf);
  ttsAudio.src = URL.createObjectURL(new Blob([wav], {type:'audio/wav'}));
};

// -------- Voice conversion (server pitch) --------
$('#btnConvert').onclick = async ()=>{
  const f = $('#convFile').files?.[0];
  if(!f) return alert('Choisis un fichier audio.');
  const st = parseInt($('#convPitch').value,10);
  const fd = new FormData(); fd.append('audio', f); fd.append('semitones', String(st));
  const res = await fetch('/api/convert', {method:'POST', body: fd});
  if(!res.ok){ return alert('Conversion échouée.'); }
  const blob = await res.blob();
  $('#convOut').src = URL.createObjectURL(blob);
};

// WAV encoder for placeholder
function bufferToWav(buffer){
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const buffer2 = new ArrayBuffer(length);
  const view = new DataView(buffer2);
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + buffer.length * numOfChan * 2, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numOfChan * 2, true);
  view.setUint16(32, numOfChan * 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, buffer.length * numOfChan * 2, true);
  let offset = 44;
  for (let i = 0; i < buffer.length; i++){
    for (let ch = 0; ch < numOfChan; ch++){
      let sample = buffer.getChannelData(ch)[i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  return buffer2;
}
function writeStr(view, offset, str){ for(let i=0;i<str.length;i++) view.setUint8(offset+i, str.charCodeAt(i)); }
