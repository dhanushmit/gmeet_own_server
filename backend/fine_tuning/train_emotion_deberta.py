# Tech-Meet DeBERTa-v3 Emotion Fine-Tuning Script
# Designed for Google Colab (with T4 GPU)

import os
import sys

# 1. Install required packages (Run this in a Colab cell first)
# !pip install -q transformers[torch] datasets accelerate sentencepiece huggingface_hub

from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments
from datasets import Dataset
from huggingface_hub import HfApi, notebook_login

print("Step 1: Preparing Dataset...")

# Label Mapping:
# 0: neutral
# 1: happy
# 2: sad
# 3: excited
# 4: anxious

# Custom Technical Interview Emotion Dataset (Expand this dataset for better accuracy!)
data = {
    "text": [
        # Neutral (standard technical descriptions)
        "React uses a virtual DOM to optimize rendering and patch the real DOM efficiently.",
        "We can manage global state by creating a context provider and consuming it with hooks.",
        "Vite runs on esbuild to bundle modules during development.",
        "An Error Boundary in React is a class component that catches JavaScript errors anywhere in their child component tree.",
        "I have worked with SQL databases like Postgres and MySQL for about three years.",
        
        # Happy / Excited (passion, positivity)
        "I am extremely excited about this opportunity and would love to join your team!",
        "Yes, absolutely! I loved working on optimizing that dashboard, it was a fantastic challenge.",
        "That is awesome! We managed to reduce the bundle size by fifty percent, which was amazing.",
        "I really enjoy solving complex state management problems using Zustand.",
        "It's a great privilege to interview with you today. Thank you for this chance!",
        
        # Sad / Hesitant (loss of energy, disappointment)
        "Oh, unfortunately, we didn't manage to ship that feature on time because of team blockages.",
        "I don't really have much experience with Kubernetes, I only did basic configurations.",
        "We tried to optimize the backend, but it didn't improve the database latency much.",
        "I feel like my previous project was not very successful because of poor planning.",
        "No, I haven't used Docker in my previous role, I mostly deployed directly.",
        
        # Anxious (stress, hesitation, filler words)
        "Uh, actually, I'm not really sure about how the event loop works, let me think...",
        "I think, um, maybe we can use Redux but, uh, it might be too complex for this project...",
        "Sorry, I am a bit nervous. Could you repeat the question about garbage collection?",
        "Oh, wait, let me check my code, I think I made a mistake in the recursive function...",
        "Um, yes, I know what a closure is, but, uh, I can't think of a clean example right now..."
    ],
    "label": [
        0, 0, 0, 0, 0, # Neutral
        1, 1, 1, 1, 1, # Happy / Excited
        2, 2, 2, 2, 2, # Sad / Hesitant
        4, 4, 4, 4, 4  # Anxious
    ]
}

# Add more sample points to your dataset to boost performance!

dataset = Dataset.from_dict(data)

# Split into train/validation
dataset = dataset.train_test_split(test_size=0.2)
train_dataset = dataset["train"]
val_dataset = dataset["test"]

print(f"Dataset Split: {len(train_dataset)} training samples, {len(val_dataset)} validation samples.")

print("Step 2: Loading Tokenizer and Model...")
model_name = "microsoft/deberta-v3-small"
tokenizer = AutoTokenizer.from_pretrained(model_name, use_fast=False)

def preprocess_function(examples):
    return tokenizer(examples["text"], truncation=True, max_length=128)

tokenized_train = train_dataset.map(preprocess_function, batched=True)
tokenized_val = val_dataset.map(preprocess_function, batched=True)

# Load model with 5 output labels
id2label = {0: "neutral", 1: "happy", 2: "sad", 3: "excited", 4: "anxious"}
label2id = {"neutral": 0, "happy": 1, "sad": 2, "excited": 3, "anxious": 4}

model = AutoModelForSequenceClassification.from_pretrained(
    model_name, 
    num_labels=5,
    id2label=id2label,
    label2id=label2id
)

print("Step 3: Setting Up Trainer...")
training_args = TrainingArguments(
    output_dir="./results",
    learning_rate=2e-5,
    per_device_train_batch_size=8,
    per_device_eval_batch_size=8,
    num_train_epochs=5,
    weight_decay=0.01,
    evaluation_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    logging_steps=10,
    report_to="none"
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_train,
    eval_dataset=tokenized_val,
    tokenizer=tokenizer,
)

print("Step 4: Training Model (Fine-Tuning)...")
trainer.train()

print("Step 5: Logging In to Hugging Face...")
# If running in Colab, uncomment notebook_login() to authenticate via UI
# notebook_login()

# Or authenticate programmatically:
# os.environ["HF_TOKEN"] = "your_write_token_here"

print("Step 6: Pushing Model to Hugging Face Hub...")
# Replace with your own model name
repo_name = "interview-emotion-deberta"
try:
    trainer.push_to_hub(repo_name)
    print(f"Model pushed successfully! Accessible at: https://huggingface.co/your-username/{repo_name}")
except Exception as e:
    print(f"Failed to push to hub automatically. Save locally instead: {e}")
    model.save_pretrained("./fine_tuned_deberta")
    tokenizer.save_pretrained("./fine_tuned_deberta")
    print("Model saved locally in './fine_tuned_deberta'.")
