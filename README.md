# HyperVoice — Site complet (PWA + Node)
Fonctions :
- **Vidéo → clone** : upload vidéo, extraction audio (ffmpeg-static), création d’un profil voix (consentement requis).
- **Audio → clone** : enregistrement ou import audio → profil.
- **Bibliothèque** : liste, écoute, suppression de voix.
- **TTS démo locale** : via Web Speech (navigateur). Pour un TTS cloné serveur, branche un moteur externe.
- **Conversion (pitch)** : serveur (ffmpeg) pour transposition simple.
- **PWA** : installable, offline UI.

## Démarrage
```bash
npm i
npm run dev
# puis http://localhost:5173
