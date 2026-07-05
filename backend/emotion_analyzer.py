import os

# Cached pipeline instance
_classifier_pipeline = None

def get_classifier():
    """
    Loads and caches the Hugging Face emotion classifier pipeline.
    """
    global _classifier_pipeline
    if _classifier_pipeline is None:
        from transformers import pipeline
        print("Loading Hugging Face emotion classification model ('j-hartmann/emotion-english-distilroberta-base') on CPU...")
        _classifier_pipeline = pipeline(
            "text-classification",
            model="j-hartmann/emotion-english-distilroberta-base",
            top_k=None,
            device=-1  # Always use CPU to be safe and light on resources
        )
    return _classifier_pipeline

def _analyze_lexicon(transcript: list) -> dict:
    """
    Fallback lexical-based emotion analyzer using pre-defined word lists and audio heuristics.
    """
    print("Running fallback lexical-based emotion analyzer...")
    excited_words = {"amazing", "awesome", "excited", "fantastic", "great", "thrilled", "wonderful", "incredible", "love", "passionate", "absolutely", "perfect", "yes", "wow", "dynamic", "excellent", "superb", "brilliant", "outstanding", "impressive"}
    happy_words = {"happy", "glad", "good", "nice", "enjoy", "pleasure", "thanks", "thank you", "positive", "cooperative", "agree", "support", "help", "hope", "friendly", "satisfied", "fine", "cool", "helpful", "appreciate", "ok", "okay", "correct", "sure"}
    sad_words = {"sad", "disappointed", "regret", "sorry", "unfortunately", "bad", "fail", "missed", "error", "difficult", "hard", "struggle", "poor", "unhappy", "loss", "low", "unable", "cannot", "broke", "wrong"}
    anxious_words = {"nervous", "anxious", "stress", "worried", "fear", "hesitate", "unsure", "maybe", "confused", "stuck", "pressure", "scared", "apologize", "doubt", "uh", "um", "difficult", "challenging", "complex", "trouble"}

    speaker_data = {}
    
    for entry in transcript:
        speaker = entry.get('speaker', 'Unknown')
        text = entry.get('text', '').lower()
        vol = entry.get('average_volume')
        rate = entry.get('speech_rate')
        
        if speaker not in speaker_data:
            speaker_data[speaker] = {
                "happy_score": 0.0,
                "excited_score": 0.0,
                "neutral_score": 0.0,
                "sad_score": 0.0,
                "anxious_score": 0.0,
                "total_lines": 0
            }
            
        data = speaker_data[speaker]
        data["total_lines"] += 1
        
        # Word counts with punctuation stripped
        cleaned_text = "".join(c for c in text if c.isalnum() or c.isspace())
        words = cleaned_text.split()
        happy_count = sum(1 for w in words if w in happy_words)
        excited_count = sum(1 for w in words if w in excited_words)
        sad_count = sum(1 for w in words if w in sad_words)
        anxious_count = sum(1 for w in words if w in anxious_words)
        
        # Base scores
        scores = {
            "happy": float(happy_count),
            "excited": float(excited_count),
            "sad": float(sad_count),
            "anxious": float(anxious_count),
            "neutral": 0.5 # default baseline
        }
        
        # Apply voice audio modifiers
        if rate is not None:
            if rate > 3.8:
                scores["excited"] += 1.5
                scores["anxious"] += 1.0
            elif rate < 1.6:
                scores["sad"] += 1.5
                scores["anxious"] += 1.2
                
        if vol is not None:
            if vol > 28:
                scores["excited"] += 1.2
            elif vol < 16:
                scores["sad"] += 1.0
                scores["anxious"] += 1.0
                
        # Determine highest scoring emotion
        max_emotion = max(scores, key=scores.get)
        if scores[max_emotion] == scores["neutral"]:
            max_emotion = "neutral"
            
        data[f"{max_emotion}_score"] += 1.0

    # Calculate final percentages & interpretations
    results = {}
    for speaker, data in speaker_data.items():
        total = data["total_lines"]
        if total == 0:
            continue
            
        happy_pct = data["happy_score"] / total
        excited_pct = data["excited_score"] / total
        sad_pct = data["sad_score"] / total
        anxious_pct = data["anxious_score"] / total
        neutral_pct = data["neutral_score"] / total
        
        # Normalize to ensure sum is 1.0
        total_pct = happy_pct + excited_pct + sad_pct + anxious_pct + neutral_pct
        if total_pct > 0:
            happy_pct /= total_pct
            excited_pct /= total_pct
            sad_pct /= total_pct
            anxious_pct /= total_pct
            neutral_pct /= total_pct
            
        # Interpretation generation
        interpretation = ""
        dominant = max(
            [("Happy", happy_pct), ("Excited", excited_pct), ("Neutral", neutral_pct), ("Sad", sad_pct), ("Anxious/Stressed", anxious_pct)],
            key=lambda x: x[1]
        )[0]
        
        if dominant == "Neutral":
            interpretation = f"{speaker} maintained a balanced, professional, and objective demeanor throughout the session. Their voice pitch and cadence remained steady."
        elif dominant == "Happy":
            interpretation = f"{speaker} demonstrated a highly positive, polite, and cooperative attitude. They responded warmly to questions and exhibited positive confidence."
        elif dominant == "Excited":
            interpretation = f"{speaker} spoke with high enthusiasm and energy, showcasing a strong passion for the topics being discussed."
        elif dominant == "Sad":
            interpretation = f"{speaker} exhibited lower energy levels or potential disappointment, which could indicate a lack of confidence or regret about some answers."
        elif dominant == "Anxious/Stressed":
            interpretation = f"{speaker} showed signs of nervousness, hesitation, or tension in their voice rate and word patterns, suggesting complex or challenging questions."
            
        results[speaker] = {
            "happy": round(happy_pct * 100, 1),
            "excited": round(excited_pct * 100, 1),
            "neutral": round(neutral_pct * 100, 1),
            "sad": round(sad_pct * 100, 1),
            "anxious": round(anxious_pct * 100, 1),
            "interpretation": interpretation
        }
        
    return results

def analyze_emotions_hf(transcript: list) -> dict:
    """
    Analyzes meeting transcript emotions using Hugging Face text classification.
    """
    classifier = get_classifier()
    
    # Extract all non-empty texts and keep track of their indices
    texts = []
    indices = []
    
    for i, entry in enumerate(transcript):
        text = entry.get('text', '').strip()
        if text:
            texts.append(text)
            indices.append(i)
            
    if not texts:
        return {}
        
    # Batch prediction to optimize performance
    predictions = classifier(texts)
    
    speaker_data = {}
    
    for i, pred in zip(indices, predictions):
        entry = transcript[i]
        speaker = entry.get('speaker', 'Unknown')
        vol = entry.get('average_volume')
        rate = entry.get('speech_rate')
        
        if speaker not in speaker_data:
            speaker_data[speaker] = {
                "happy_score": 0.0,
                "excited_score": 0.0,
                "neutral_score": 0.0,
                "sad_score": 0.0,
                "anxious_score": 0.0,
                "total_lines": 0
            }
            
        data = speaker_data[speaker]
        data["total_lines"] += 1
        
        # Mapping labels from j-hartmann/emotion-english-distilroberta-base
        # Labels: anger, disgust, fear, joy, neutral, sadness, surprise
        scores = {p['label']: p['score'] for p in pred}
        
        happy = scores.get('joy', 0.0)
        excited = scores.get('surprise', 0.0)
        neutral = scores.get('neutral', 0.0)
        sad = scores.get('sadness', 0.0)
        anxious = scores.get('fear', 0.0) + scores.get('anger', 0.0) + scores.get('disgust', 0.0)
        
        # Mix in speech cues if present
        if rate is not None:
            if rate > 3.8:
                excited += 0.2
                anxious += 0.1
            elif rate < 1.6:
                sad += 0.2
                anxious += 0.15
                
        if vol is not None:
            if vol > 28:
                excited += 0.15
            elif vol < 16:
                sad += 0.15
                anxious += 0.15
                
        data["happy_score"] += happy
        data["excited_score"] += excited
        data["neutral_score"] += neutral
        data["sad_score"] += sad
        data["anxious_score"] += anxious

    results = {}
    for speaker, data in speaker_data.items():
        total = data["total_lines"]
        if total == 0:
            continue
            
        happy_pct = data["happy_score"] / total
        excited_pct = data["excited_score"] / total
        sad_pct = data["sad_score"] / total
        anxious_pct = data["anxious_score"] / total
        neutral_pct = data["neutral_score"] / total
        
        # Normalize to ensure sum is 1.0
        total_pct = happy_pct + excited_pct + sad_pct + anxious_pct + neutral_pct
        if total_pct > 0:
            happy_pct /= total_pct
            excited_pct /= total_pct
            sad_pct /= total_pct
            anxious_pct /= total_pct
            neutral_pct /= total_pct
            
        # Interpretation generation
        dominant = max(
            [("Happy", happy_pct), ("Excited", excited_pct), ("Neutral", neutral_pct), ("Sad", sad_pct), ("Anxious/Stressed", anxious_pct)],
            key=lambda x: x[1]
        )[0]
        
        if dominant == "Neutral":
            interpretation = f"{speaker} maintained a balanced, professional, and objective demeanor throughout the session. Their voice pitch and cadence remained steady."
        elif dominant == "Happy":
            interpretation = f"{speaker} demonstrated a highly positive, polite, and cooperative attitude. They responded warmly to questions and exhibited positive confidence."
        elif dominant == "Excited":
            interpretation = f"{speaker} spoke with high enthusiasm and energy, showcasing a strong passion for the topics being discussed."
        elif dominant == "Sad":
            interpretation = f"{speaker} exhibited lower energy levels or potential disappointment, which could indicate a lack of confidence or regret about some answers."
        elif dominant == "Anxious/Stressed":
            interpretation = f"{speaker} showed signs of nervousness, hesitation, or tension in their voice rate and word patterns, suggesting complex or challenging questions."
            
        results[speaker] = {
            "happy": round(happy_pct * 100, 1),
            "excited": round(excited_pct * 100, 1),
            "neutral": round(neutral_pct * 100, 1),
            "sad": round(sad_pct * 100, 1),
            "anxious": round(anxious_pct * 100, 1),
            "interpretation": interpretation
        }
        
    return results

def analyze_emotions(transcript: list) -> dict:
    """
    Main emotion entry point. Tries to run the Hugging Face model, and falls back to rules
    if anything fails (network error, import error, package not installed, etc.)
    """
    if not transcript:
        return {}
        
    try:
        # Check if we can import transformers & torch
        import transformers
        import torch
        # Run classification
        return analyze_emotions_hf(transcript)
    except Exception as e:
        print(f"Hugging Face Emotion Recognition failed/unavailable ({type(e).__name__}: {e}). Using lexical fallback.")
        return _analyze_lexicon(transcript)
