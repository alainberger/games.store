import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({limit:'25mb'}));
app.use(express.urlencoded({extended:true, limit:'25mb'}));

const __dirname_ = path.resolve();
const PUB = path.join(__dirname_, 'public');
const STORAGE = path.join(__dirname_, 'storage');
const TMP = path.join(STORAGE, 'tmp');
const PROFILES_JSON = path.join(STORAGE, 'profiles.json');
if(!fs.existsSync(PROFILES_JSON)) fs.writeFileSync(PROFILES_JSON, JSON.stringify({profiles:[]},null,2));

const upload = multer({ dest: TMP });

function readProfiles(){ return JSON.parse(fs.readFileSync(PROFILES_JSON,'utf-8')); }
function writeProfiles(d){ fs.writeFileSync(PROFILES_JSON, JSON.stringify(d,null,2)); }
function uid(prefix='id'){ return `${prefix}_` + Math.random().toString(36).slice(2,10); }
function isVideo(name, mime=''){ const ext = path.extname(name||'').toLowerCase(); return mime.startsWith('video/') || ['.mp4','.mov','.mkv','.avi','.webm','.m4v'].includes(ext); }
function isAudio(name, mime=''){ const ext = path.extname(name||'').toLowerCase(); return mime.startsWith('audio/') || ['.wav','.mp3','.m4a','.ogg','.webm','.aac'].includes(ext); }

app.use('/storage', express.static(STORAGE));
app.use(express.static(PUB, { extensions: ['html'] }));

// Health
app.get('/api/health', (_,res)=>{
  res.json({
    ok:true,
    ffmpeg: !!ffmpegPath,
    engine: !!(process.env.REPLICATE_API_TOKEN || process.env.FAL_API_KEY) ? 'configured' : 'not_configured'
  });
});

function extractAudio(inFile, outFile, cb){
  const args = ['-y','-i', inFile, '-vn','-ac','1','-ar','48000','-b:a','192k', outFile];
  const proc = spawn(ffmpegPath, args);
  let err = '';
  proc.stderr.on('data', d=> err += d.toString());
  proc.on('close', code=> cb(code===0 ? null : new Error(err)));
}

// Enroll from media (video or audio): extracts audio if needed, then stores profile
app.post('/api/enrollFromMedia', upload.single('media'), (req,res)=>{
  try{
    const { name='Ma voix', consent } = req.body;
    if(consent!=='true') return res.status(400).json({error:'consent_required'});
    if(!req.file) return res.status(400).json({error:'no_media'});

    const id = uid('v');
    const baseOut = path.join(STORAGE, `${id}.wav`);

    const handleEnroll = (audioPath)=>{
      const data = readProfiles();
      data.profiles.push({ id, name, sample: path.basename(audioPath), createdAt: Date.now(), status: 'ready' });
      writeProfiles(data);
      res.json({ id, name, sampleUrl: `/storage/${path.basename(audioPath)}` });
    };

    if(isVideo(req.file.originalname, req.file.mimetype)){
      extractAudio(req.file.path, baseOut, (err)=>{
        try{ fs.unlinkSync(req.file.path);}catch{}
        if(err){ return res.status(500).json({error:'extract_failed', detail: String(err).slice(0,200)}); }
        handleEnroll(baseOut);
      });
    } else if(isAudio(req.file.originalname, req.file.mimetype)){
      fs.renameSync(req.file.path, baseOut);
      handleEnroll(baseOut);
    } else {
      try{ fs.unlinkSync(req.file.path);}catch{}
      return res.status(400).json({error:'unsupported_file'});
    }
  }catch(e){
    console.error(e); res.status(500).json({error:'server_error'});
  }
});

// Classic enroll (audio only)
app.post('/api/enroll', upload.single('audio'), (req,res)=>{
  try{
    const { name='Ma voix', consent } = req.body;
    if(consent!=='true') return res.status(400).json({error:'consent_required'});
    if(!req.file) return res.status(400).json({error:'no_audio'});
    const id = uid('v');
    const out = path.join(STORAGE, `${id}.wav`);
    if(isAudio(req.file.originalname, req.file.mimetype)){
      // normalize to wav
      extractAudio(req.file.path, out, (err)=>{
        try{ fs.unlinkSync(req.file.path);}catch{}
        if(err) return res.status(500).json({error:'normalize_failed'});
        const data = readProfiles();
        data.profiles.push({ id, name, sample: path.basename(out), createdAt: Date.now(), status:'ready' });
        writeProfiles(data);
        res.json({ id, name, sampleUrl:`/storage/${path.basename(out)}` });
      });
    } else {
      try{ fs.unlinkSync(req.file.path);}catch{}
      return res.status(400).json({error:'unsupported_file'});
    }
  }catch(e){
    console.error(e); res.status(500).json({error:'server_error'});
  }
});

// List / delete voices
app.get('/api/voices', (req,res)=> res.json(readProfiles()));
app.delete('/api/voices/:id', (req,res)=>{
  const data = readProfiles();
  const i = data.profiles.findIndex(p=>p.id===req.params.id);
  if(i<0) return res.status(404).json({error:'not_found'});
  const p = data.profiles[i];
  try{ fs.unlinkSync(path.join(STORAGE, p.sample)); }catch{}
  data.profiles.splice(i,1); writeProfiles(data);
  res.json({ok:true});
});

// Simulated "training" (optional)
app.post('/api/clone/train', (req,res)=>{
  const { voiceId } = req.body || {};
  const data = readProfiles();
  const p = data.profiles.find(x=>x.id===voiceId);
  if(!p) return res.status(404).json({error:'voice_not_found'});
  p.status='trained'; writeProfiles(data);
  res.json({ok:true, status:p.status});
});
app.get('/api/clone/status', (req,res)=>{
  const { id } = req.query;
  const data = readProfiles();
  const p = data.profiles.find(x=>x.id===id);
  if(!p) return res.status(404).json({error:'voice_not_found'});
  res.json({status:p.status||'ready'});
});

// TTS server stub (configure a real engine if desired)
app.post('/api/tts', async (req,res)=>{
  const { text, voiceId } = req.body || {};
  const hasEngine = !!(process.env.REPLICATE_API_TOKEN || process.env.FAL_API_KEY);
  if(!hasEngine) return res.status(501).json({error:'engine_not_configured'});
  // TODO: forward to your preferred provider here.
  return res.status(501).json({error:'adapter_missing'});
});

// Voice conversion using ffmpeg pitch/time approximation
app.post('/api/convert', upload.single('audio'), (req,res)=>{
  try{
    const { semitones="0" } = req.body || {};
    if(!req.file) return res.status(400).json({error:'no_audio'});
    const ratio = Math.pow(2, parseFloat(semitones)/12);
    const out = path.join(TMP, uid('conv')+'.wav');
    // pitch shift via asetrate+atempo (approx formant)
    const args = ['-y','-i', req.file.path,
      '-af', `asetrate=48000*${ratio},aresample=48000,atempo=${(1/ratio).toFixed(4)}`,
      '-ac','1','-ar','48000', out];
    const proc = spawn(ffmpegPath, args);
    let err='';
    proc.stderr.on('data', d=> err+=d.toString());
    proc.on('close', code=>{
      try{ fs.unlinkSync(req.file.path);}catch{}
      if(code!==0) return res.status(500).json({error:'convert_failed', detail:err.slice(0,200)});
      const buf = fs.readFileSync(out);
      try{ fs.unlinkSync(out);}catch{}
      res.setHeader('Content-Type','audio/wav');
      res.send(buf);
    });
  }catch(e){
    console.error(e); res.status(500).json({error:'server_error'});
  }
});

const PORT = process.env.PORT || 5173;
app.listen(PORT, ()=>{
  console.log('HyperVoice running at http://localhost:'+PORT);
});
