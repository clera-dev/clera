# api.py

# This is the API for the conversational AI.

# It is used to get the audio files for the pages.

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
import os

app = FastAPI()

# Get absolute path to the project root
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_FILES_DIR = os.path.join(PROJECT_ROOT, 'conversational_ai', 'audio_files')

# Create audio_files directory if it doesn't exist
os.makedirs(AUDIO_FILES_DIR, exist_ok=True)

# Mount the audio files directory
app.mount("/audio", StaticFiles(directory=AUDIO_FILES_DIR), name="audio")

@app.get("/api/audio/{page_id}")
async def get_audio_info(page_id: str):
    # Return audio file information based on page_id
    audio_mapping = {
        "welcome": "welcome_message.wav",
        "about": "about_page_intro.wav",
        # Add more mappings as needed
    }
    
    if page_id not in audio_mapping:
        raise HTTPException(status_code=404, detail="Page ID not found")
        
    audio_file = audio_mapping.get(page_id)
    file_path = os.path.join(AUDIO_FILES_DIR, audio_file)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
        
    return {"audio_file": f"/audio/{audio_file}"}