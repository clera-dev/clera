#save_gen_audio.py

import os
import sounddevice as sd
import numpy as np
import requests

def save_tts_response(text, filename):
    url = "https://api.cartesia.ai/tts/bytes"
    payload = {
        "model_id": "sonic-preview",
        "transcript": text,
        "voice": {
            "mode": "id",
            "id": "6f84f4b8-58a2-430c-8c79-688dad597532",
            "__experimental_controls": {
                "speed": -0.2,
                "emotion": ["positivity:lowest"]
            }
        },
        "output_format": {
            "container": "wav",  # Changed to WAV for easier file handling
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
    
    response = requests.post(url, json=payload, headers=headers)
    
    # Save the WAV file
    with open(f"audio_files/{filename}.wav", "wb") as f:
        f.write(response.content)
    
    return f"audio_files/{filename}.wav"

if __name__ == "__main__":
    #text = "Hello. My name is Clera! I'm your financial advisor. How can I help you today?"
    test = """
    Hi.
    
    I’m Clera, your personal AI powered financial advisor.

    I’m here to help you crush your investment goals.
    With me, you’ll never have to worry about no conflicts of interest,
    crazy expensive advisor fees, biased information, or any other drawbacks of
    your traditional suit and tie advisor.

    I’m here to leverage my deep knowledge of investing to help you make and keep as 
    much money as your willing to invest. 
    
    Let’s get started. why dont’ you tell me a few things about yourself...
    """
    filename = "test_welcome_audio"
    save_tts_response(test, filename)
