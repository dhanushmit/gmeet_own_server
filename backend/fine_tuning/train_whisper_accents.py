# Tech-Meet Whisper Accent & Tech Vocab Fine-Tuning Script
# Designed for Google Colab (with T4 GPU)

# 1. Install required packages (Run this in Colab first)
# !pip install -q transformers datasets evaluate jiwer accelerate peft huggingface_hub librosa soundfile

import os
import torch
import librosa
from datasets import Dataset, Audio
from transformers import WhisperProcessor, WhisperForConditionalGeneration, Seq2SeqTrainingArguments, Seq2SeqTrainer
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from dataclasses import dataclass
from typing import Any, Dict, List, Union
import evaluate

# Setup base model
model_id = "openai/whisper-small"
language = "English"
task = "transcribe"

print("Step 1: Preparing Audio Dataset...")
# To train Whisper, prepare 10-50 short audio recordings (e.g. 5-30s each) 
# containing technical terms or regional accents, and pair them with correct transcripts.
# Place your audio files (.wav or .mp3) in a folder 'audio_files/' in Colab.

# Example Dataset structure:
# Ensure you upload the files listed here, or modify the paths below to match your uploads!
data = {
    "audio": [
        "audio_files/clip1.wav",
        "audio_files/clip2.wav",
        "audio_files/clip3.wav"
    ],
    "sentence": [
        "In this project, we are using React Context along with Zustand for state management.",
        "To optimize the Vite build, we should import lazy loaded React components.",
        "The event loop is a central concept in JavaScript that handles asynchronous callbacks."
    ]
}

# Define datasets
dataset = Dataset.from_dict(data)

# cast audio files to librosa format automatically
dataset = dataset.cast_column("audio", Audio(sampling_rate=16000))

print("Step 2: Loading Whisper Processor...")
processor = WhisperProcessor.from_pretrained(model_id, language=language, task=task)

def prepare_dataset(batch):
    # Load and resample audio data to 16kHz
    audio = batch["audio"]
    # Compute log-Mel input features
    batch["input_features"] = processor.feature_extractor(audio["array"], sampling_rate=audio["sampling_rate"]).input_features[0]
    # Encode target text to token IDs
    batch["labels"] = processor.tokenizer(batch["sentence"]).input_ids
    return batch

# Run pre-processing
dataset = dataset.map(prepare_dataset, remove_columns=dataset.column_names, num_proc=1)

# Split train/eval
dataset_split = dataset.train_test_split(test_size=0.2)

print("Step 3: Loading Whisper Model with LoRA (PEFT)...")
model = WhisperForConditionalGeneration.from_pretrained(model_id, device_map="auto")
model.config.forced_decoder_ids = None
model.config.suppress_tokens = []

# Configure LoRA parameter adapter
peft_config = LoraConfig(
    r=32,
    lora_alpha=64,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none",
    label_modules=["lm_head"]
)
model = get_peft_model(model, peft_config)
model.print_trainable_parameters()

# Data collator to pad audio features and token labels
@dataclass
class DataCollatorSpeechSeq2SeqWithPadding:
    processor: Any

    def __call__(self, features: List[Dict[str, Union[List[int], torch.Tensor]]]) -> Dict[str, torch.Tensor]:
        # Split input features and labels
        input_features = [{"input_features": feature["input_features"]} for feature in features]
        batch = self.processor.feature_extractor.pad(input_features, return_tensors="pt")

        label_features = [{"input_ids": feature["labels"]} for feature in features]
        labels_batch = self.processor.tokenizer.pad(label_features, return_tensors="pt")

        # replace padding token id with -100 to ignore it in loss calculation
        labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)

        # replace start decoder token id if present
        if (labels[:, 0] == self.processor.tokenizer.bos_token_id).all():
            labels = labels[:, 1:]

        batch["labels"] = labels
        return batch

data_collator = DataCollatorSpeechSeq2SeqWithPadding(processor=processor)

# Evaluation Metric setup (Word Error Rate - WER)
metric = evaluate.load("wer")

def compute_metrics(pred):
    pred_ids = pred.predictions
    label_ids = pred.label_ids

    # Replace -100 with pad_token_id
    label_ids[label_ids == -100] = processor.tokenizer.pad_token_id

    # Decode predictions and labels
    pred_str = processor.tokenizer.batch_decode(pred_ids, skip_special_tokens=True)
    label_str = processor.tokenizer.batch_decode(label_ids, skip_special_tokens=True)

    wer = 100 * metric.compute(predictions=pred_str, references=label_str)
    return {"wer": wer}

print("Step 4: Setting Up Trainer...")
training_args = Seq2SeqTrainingArguments(
    output_dir="./whisper-results",
    per_device_train_batch_size=8,
    gradient_accumulation_steps=1,
    learning_rate=1e-3,
    warmup_steps=50,
    max_steps=500,
    evaluation_strategy="steps",
    fp16=True,
    predict_with_generate=True,
    generation_max_length=225,
    save_steps=100,
    eval_steps=100,
    logging_steps=25,
    report_to="none",
    load_best_model_at_end=True,
    metric_for_best_model="wer",
    greater_is_better=False,
    push_to_hub=False
)

trainer = Seq2SeqTrainer(
    args=training_args,
    model=model,
    train_dataset=dataset_split["train"],
    eval_dataset=dataset_split["test"],
    data_collator=data_collator,
    compute_metrics=compute_metrics,
    tokenizer=processor.feature_extractor,
)

print("Step 5: Training Whisper Model...")
trainer.train()

print("Step 6: Pushing Fine-Tuned Whisper Model to Hugging Face...")
# Authenticate in Colab first using notebook_login()
repo_name = "whisper-small-tech-interview"
try:
    trainer.push_to_hub(repo_name)
    print(f"Model pushed successfully! URL: https://huggingface.co/your-username/{repo_name}")
except Exception as e:
    print(f"Failed to push automatically: {e}")
    # Save locally
    model.save_pretrained("./whisper_fine_tuned")
    processor.save_pretrained("./whisper_fine_tuned")
    print("Model saved locally in './whisper_fine_tuned'.")
