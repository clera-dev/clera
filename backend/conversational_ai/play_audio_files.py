#play_audio_files.py

# This is meant to play the audio files in the audio_files folder
# to make sure they work properly.

# Run in terminal:python3 play_audio_files.py

import os
import sounddevice as sd
import soundfile as sf  # You'll need to pip install soundfile

def play_audio_file(filename):
    """
    Play a WAV file from the audio_files directory
    
    Args:
        filename (str): Name of the file (with or without .wav extension)
    """
    # Ensure the filename has .wav extension
    if not filename.endswith('.wav'):
        filename += '.wav'
    
    # Construct full path
    file_path = os.path.join('audio_files', filename)
    
    # Load the audio file
    data, samplerate = sf.read(file_path)
    
    # Play the audio
    sd.play(data, samplerate)
    sd.wait()  # Wait until the audio is finished playing

if __name__ == "__main__":
    # Example usage
    try:
        # Play the welcome message we created earlier
        play_audio_file("test_welcome_audio.wav")
        
        # You can test other files too:
        # play_audio_file("another_file.wav")
        
    except FileNotFoundError:
        print("Audio file not found! Make sure it exists in the audio_files directory.")
    except Exception as e:
        print(f"Error playing audio: {str(e)}")


"""
How to get the audio files to play in the frontend:

############ Frontend setup: #############
// When page loads
async function loadPageAudio(pageId) {
    const response = await fetch(`/api/audio/${pageId}`);
    const data = await response.json();
    
    const audio = document.getElementById('background-audio');
    audio.src = data.audio_file;
    audio.play();
}

############ Backend setup: #############
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Mount the audio files directory
app.mount("/audio", StaticFiles(directory="audio_files"), name="audio")

@app.get("/api/audio/{page_id}")
async def get_audio_info(page_id: str):
    # Return audio file information based on page_id
    audio_mapping = {
        "welcome": "welcome_message.wav",
        "about": "about_page_intro.wav",
        # Add more mappings as needed
    }
    return {"audio_file": f"/audio/{audio_mapping.get(page_id)}"}
"""
