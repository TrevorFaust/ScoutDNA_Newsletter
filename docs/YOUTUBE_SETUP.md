# YouTube → transcript → newsletter pipeline

## What you described (correct)

1. **yt-dlp** — download audio (or pull captions without full Whisper).
2. **Whisper** — transcribe when captions are missing or bad.
3. **Existing compose** — Claude reads `newsletter_raw_items.body` like Reddit/RSS text (no separate “report” step unless you want one).

You do **not** need a second LLM pass for every video; store the transcript in `raw_items` and let `run_compose` cluster + write sections.

## Prerequisites (Windows)

| Requirement | Why |
|-------------|-----|
| **ffmpeg** on `PATH` | Required by yt-dlp and Whisper. Install: `winget install Gyan.FFmpeg` then reopen PowerShell. |
| **Python venv** in `pipeline/` | Same as Reddit collect. |
| **Optional: NVIDIA GPU** | Whisper `medium` is slow on CPU; use `base` or `small` on laptop, or `medium` with CUDA. |

## Install (optional extras — keeps main venv lighter)

```powershell
cd "C:\Users\trevo\Desktop\Personal Projects\Coding\Fantasy Data\nfl_newsletter\pipeline"
.\.venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-youtube.txt
```

`requirements-youtube.txt` installs `openai-whisper` (pulls PyTorch — several GB) and `yt-dlp`.

Verify:

```powershell
ffmpeg -version
python -m yt_dlp --version
python -c "import whisper; print('whisper ok')"
```

## Manual one-off test (your flow)

```powershell
cd "C:\Users\trevo\Desktop\Personal Projects\Coding\Fantasy Data\nfl_newsletter\pipeline"
.\.venv\Scripts\activate
mkdir tmp\yt-test -Force
cd tmp\yt-test

python -m yt_dlp -x --audio-format mp3 -o "audio.%(ext)s" "https://www.youtube.com/watch?v=VIDEO_ID"
python -m whisper audio.mp3 --model base --output_format txt
type audio.txt
```

Prefer **`base`** on CPU for tests; **`medium`** is better quality but much slower without a GPU.

## Pipeline integration (recommended)

1. Edit `data/youtube_sources.csv` — channel URLs + team slugs.
2. Run collect for an issue date (Reddit/RSS), then YouTube:

```powershell
cd "C:\Users\trevo\Desktop\Personal Projects\Coding\Fantasy Data\nfl_newsletter\pipeline"
.\.venv\Scripts\activate
.\youtube.ps1 -Date 2026-05-21 -MaxVideos 3
.\compose.ps1 -Date 2026-05-21 -Team pittsburgh-steelers
```

The YouTube collector:

- Lists recent uploads per channel (yt-dlp).
- Tries **English captions** first (official or auto — no Whisper).
- Falls back to **audio + Whisper** when needed.
- Upserts rows into `newsletter_raw_items` (`source_type: youtube`).

## Env (optional)

```env
WHISPER_MODEL=base
YOUTUBE_MAX_VIDEOS_PER_CHANNEL=5
```

## Cost / time tips

- Cap videos per channel per day (`-MaxVideos`).
- Captions-first avoids Whisper for most press conferences.
- Long podcasts: skip or whitelist; a 2h show can take 30+ minutes on CPU.
- Disk: audio temp files live under `pipeline/tmp/youtube/` and are deleted after transcribe.

## Legal / ToS

Use for your own newsletter research; respect YouTube ToS and channel rights. Prefer official team/NFL channels and shows you have rights to summarize.
