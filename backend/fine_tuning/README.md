# Fine-Tuning Guide: Speech Emotion Recognition & Whisper STT

This directory contains Python scripts designed to help you fine-tune custom models for **Tech-Meet** on Google Colab (using a free GPU) and deploy them to your Hugging Face account.

---

## Getting Started

1. **Create a Hugging Face Account**: If you don't have one, sign up at [huggingface.co](https://huggingface.co/).
2. **Generate a User Access Token**: Go to **Settings > Access Tokens** in Hugging Face and create a token with `Write` permissions. You will use this token to push your fine-tuned models to the cloud.
3. **Open Google Colab**: Go to [colab.research.google.com](https://colab.research.google.com/) and upload the python scripts in this directory. Set the runtime type to **T4 GPU** (under *Runtime > Change runtime type*).

---

## 1. Emotion Recognition Fine-Tuning (`train_emotion_deberta.py`)

This script fine-tunes Microsoft's advanced **DeBERTa-v3-small** model on interview-specific dialogue. It learns to recognize professional indicators:
- **Confident / Excited**: Passionate explanations, smooth delivery.
- **Anxious**: Hesitations, fillers, vocabulary signifying stress.
- **Sad / Hesitant**: Lower energy speech.
- **Neutral**: Standard explanations.

### How to use:
1. Open the script in Google Colab.
2. Edit the training dataset inside the script to match your desired interview lines and emotion tags.
3. Run the script. It will train the model and upload it to `huggingface.co/your-username/interview-emotion-deberta`.
4. In your backend [emotion_analyzer.py](file:///d:/gmeet_web/backend/emotion_analyzer.py), update the model ID:
   ```python
   classifier = pipeline("text-classification", model="your-username/interview-emotion-deberta")
   ```

---

## 2. Whisper Speech-to-Text Fine-Tuning (`train_whisper_accents.py`)

This script fine-tunes **OpenAI's Whisper-Small** model to specialize in Indian accents and technical/coding keywords (like *React, Zustand, Vite, useEffect*).
- It uses **LoRA (Low-Rank Adaptation)** via Hugging Face's PEFT library, which lets you train a model on a free GPU with very little memory.

### How to use:
1. Open the script in Google Colab.
2. Upload short audio clips (`.wav` or `.mp3` format) of speakers talking about programming, along with their matching text transcripts.
3. Run the training cell.
4. The script will save your model and upload it to `huggingface.co/your-username/whisper-small-tech-interview`.
5. Convert this model to **CTranslate2 (CT2)** format (required by `faster-whisper` for fast CPU inference) and point to it in [main.py](file:///d:/gmeet_web/backend/main.py):
   ```python
   whisper_model_cache = WhisperModel("your-username/whisper-small-tech-interview-ct2", device="cpu")
   ```
