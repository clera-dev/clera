import requests
import numpy as np
import sounddevice as sd

input_text = "Hello. My name is Clera! I'm your financial advisor. How can I help you today?"

# API Request
url = "https://api.cartesia.ai/tts/bytes"
payload = {
    "model_id": "sonic-preview",
    "transcript": input_text,  # Add your text here
    "voice": {
        "mode": "id",
        "id": "6f84f4b8-58a2-430c-8c79-688dad597532",
        "__experimental_controls": {
            "speed": -0.2,
            "emotion": [
                "positivity:lowest"
            ]
        }
    },
    "output_format": {
        "container": "raw", # Changed from "raw" to "wav"
        "encoding": "pcm_f32le",
        "sample_rate": 44100
    },
    "language": "en"
}

headers = {
    "Cartesia-Version": "2024-06-10",
    "X-API-Key": "sk_car_DD6rTyVQcWAYPybd2p6H5",
    "Content-Type": "application/json"
}

# Make the request
response = requests.post(url, json=payload, headers=headers)

# Convert response bytes to numpy array of 32-bit float values
audio_data = np.frombuffer(response.content, dtype=np.float32)

# Play the audio
sd.play(audio_data, samplerate=44100)
sd.wait()  # Wait until audio is finished playing


"""
def generate_speech(transcript):
    url = "https://api.cartesia.ai/tts/bytes"
    headers = {
        "Cartesia-Version": "2024-06-10",
        "X-API-Key": "sk_car_DD6rTyVQcWAYPybd2p6H5",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model_id": "sonic-preview",
        "transcript": transcript,
        "voice": {
            "mode": "id",
            "id": "729651dc-c6c3-4ee5-97fa-350da1f88600",
            "__experimental_controls": {
                "speed": 0,
                "emotion": []
            }
        },
        "output_format": {
            "container": "wav",  # Changed from "raw" to "wav"
            "encoding": "pcm_f32le",
            "sample_rate": 44100
        },
        "language": "en"
    }
    
    response = requests.post(url, json=payload, headers=headers)
    return response.content

if __name__ == "__main__":
    transcript = "Hello. My name is Clera! I'm your financial advisor. How can I help you today?"
    speech = generate_speech(transcript)
    with open("speech.wav", "wb") as f:
        f.write(speech)
    print("Speech generated and saved as speech.wav")
"""


'''
how to have frontend interact with this:
from fastapi import FastAPI

app = FastAPI()

@app.post("/api/tts")
async def text_to_speech(text: str):
    audio_bytes = generate_speech(text)
    return Response(content=audio_bytes, media_type="audio/raw")



code from cartesia api docs:

curl -X POST https://api.cartesia.ai/tts/bytes \
-H "Cartesia-Version: 2024-06-10" \
-H "X-API-Key: sk_car_DD6rTyVQcWAYPybd2p6H5" \
-H "Content-Type: application/json" \
-d '{
  "model_id": "sonic-preview",
  "transcript": "",
  "voice": {
    "mode": "id",
    "id": "729651dc-c6c3-4ee5-97fa-350da1f88600",
    "__experimental_controls": {
      "speed": 0,
      "emotion": []
    }
  },
  "output_format": {
    "container": "raw",
    "encoding": "pcm_f32le",
    "sample_rate": 44100
  },
  "language": "en"
}'
  
'''