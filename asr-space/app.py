"""Quran speech-to-text service for the Ufuq Hifz checker (runs on a free Hugging Face Space, CPU).

POST /transcribe  { "audio": "<base64 16 kHz mono WAV>" }  ->  { "text": "..." }
Header  x-asr-token: <ASR_TOKEN secret>
"""
import base64, hmac, io, os

import numpy as np
import soundfile as sf
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from transformers import pipeline

MODEL_ID = os.getenv("MODEL_ID", "tarteel-ai/whisper-base-ar-quran")  # any Whisper model fine-tuned on Quran recitation
TOKEN = os.getenv("ASR_TOKEN", "")
MAX_AUDIO_B64 = 7_000_000  # ~5 MB of base64 (a 90 s 16 kHz mono WAV is ~4.3 MB) — stops memory-exhaustion uploads
BEAMS = int(os.getenv("NUM_BEAMS", "4"))

asr = pipeline("automatic-speech-recognition", model=MODEL_ID, device=-1, chunk_length_s=30)
app = FastAPI()


class Req(BaseModel):
    audio: str


@app.get("/")
def health():
    return {"ok": True, "model": MODEL_ID}


@app.post("/transcribe")
def transcribe(req: Req, x_asr_token: str = Header(default="")):
    # Fail CLOSED: with no ASR_TOKEN secret configured the endpoint must not be an open, free GPU/CPU for the internet.
    if not TOKEN:
        raise HTTPException(status_code=503, detail="ASR_TOKEN is not configured")
    if not hmac.compare_digest(x_asr_token.encode(), TOKEN.encode()):
        raise HTTPException(status_code=401, detail="bad token")
    if len(req.audio) > MAX_AUDIO_B64:
        raise HTTPException(status_code=413, detail="audio too large")
    try:
        data, sr = sf.read(io.BytesIO(base64.b64decode(req.audio)), dtype="float32")
    except Exception:
        raise HTTPException(status_code=400, detail="bad audio")
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != 16000:  # the site already sends 16 kHz; this is only a safety net
        data = np.interp(np.linspace(0, len(data), int(len(data) * 16000 / sr), endpoint=False), np.arange(len(data)), data).astype("float32")
    if len(data) < 16000 * 0.4:
        return {"text": ""}
    out = asr({"raw": data, "sampling_rate": 16000},
              generate_kwargs={"language": "arabic", "task": "transcribe", "num_beams": BEAMS})
    return {"text": (out.get("text") or "").strip()}
