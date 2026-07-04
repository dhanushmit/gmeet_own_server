import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def analyze_emotions(transcript: list) -> dict:
    """
    Analyzes the mood/emotion for each speaker in the transcript.
    Returns a dict structure:
    {
        "SpeakerName": {
            "happy": 0.25,
            "excited": 0.15,
            "neutral": 0.50,
            "sad": 0.05,
            "anxious": 0.05,
            "interpretation": "..."
        }
    }
    """
    # Lexicon definition
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

def generate_transcript_pdf(
    meet_id: str, 
    title: str, 
    round_name: str, 
    position_domain: str, 
    scheduled_time: str, 
    duration_seconds: int, 
    transcript: list
) -> str:
    # 1. Ensure uploads directory exists
    current_dir = os.path.dirname(__file__)
    uploads_dir = os.path.join(current_dir, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    
    pdf_filename = f"transcript_{meet_id}.pdf"
    pdf_path = os.path.join(uploads_dir, pdf_filename)
    
    # 2. Setup document
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    # 3. Setup styles
    styles = getSampleStyleSheet()
    
    # Custom colors
    primary_color = colors.HexColor("#1e3a8a")   # Deep Blue
    secondary_color = colors.HexColor("#0f766e") # Dark Teal
    text_dark = colors.HexColor("#1f2937")       # Charcoal
    bg_light = colors.HexColor("#f3f4f6")        # Light Gray
    border_color = colors.HexColor("#d1d5db")    # Medium Gray
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=primary_color,
        spaceAfter=4
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#4b5563"),
        spaceAfter=15
    )
    
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=primary_color,
        spaceBefore=12,
        spaceAfter=8
    )
    
    meta_label_style = ParagraphStyle(
        'MetaLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=primary_color
    )
    
    meta_value_style = ParagraphStyle(
        'MetaValue',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=text_dark
    )
    
    dialogue_style = ParagraphStyle(
        'Dialogue',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=14,
        textColor=text_dark,
        spaceAfter=6
    )

    story = []
    
    # -- Header Section --
    story.append(Paragraph("Tech-Meet Interview Report", title_style))
    story.append(Paragraph("Official Candidate Session Logs & Speech Transcription Log", subtitle_style))
    
    # Divider line using a table with thin border
    line_table = Table([[""]], colWidths=[504])
    line_table.setStyle(TableStyle([
        ('LINEBELOW', (0,0), (-1,-1), 1.5, primary_color),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0)
    ]))
    story.append(line_table)
    story.append(Spacer(1, 10))
    
    # -- Session Information Table --
    minutes = duration_seconds // 60
    seconds = duration_seconds % 60
    duration_str = f"{minutes}m {seconds}s ({duration_seconds} seconds)"
    
    formatted_date = scheduled_time
    if scheduled_time:
        try:
            formatted_date = scheduled_time.replace("T", " ")
        except Exception:
            pass
            
    meta_data = [
        [
            Paragraph("Meeting ID:", meta_label_style),
            Paragraph(meet_id, meta_value_style),
            Paragraph("Domain / Role:", meta_label_style),
            Paragraph(position_domain, meta_value_style)
        ],
        [
            Paragraph("Interview Title:", meta_label_style),
            Paragraph(title, meta_value_style),
            Paragraph("Round Name:", meta_label_style),
            Paragraph(round_name, meta_value_style)
        ],
        [
            Paragraph("Scheduled Date:", meta_label_style),
            Paragraph(formatted_date or "N/A", meta_value_style),
            Paragraph("Actual Duration:", meta_label_style),
            Paragraph(duration_str, meta_value_style)
        ]
    ]
    
    meta_table = Table(meta_data, colWidths=[90, 162, 90, 162])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), bg_light),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
    ]))
    
    story.append(Paragraph("Session Metadata", section_heading))
    story.append(meta_table)
    story.append(Spacer(1, 15))
    
    # -- Transcription Log Section --
    story.append(Paragraph("Conversation Log", section_heading))
    
    log_divider = Table([[""]], colWidths=[504])
    log_divider.setStyle(TableStyle([
        ('LINEBELOW', (0,0), (-1,-1), 0.5, border_color),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0)
    ]))
    story.append(log_divider)
    story.append(Spacer(1, 8))
    
    if not transcript:
        story.append(Paragraph("<i>No speech transcription was captured during this session.</i>", dialogue_style))
    else:
        for entry in transcript:
            speaker = entry.get('speaker', 'Unknown')
            text = entry.get('text', '')
            timestamp = entry.get('timestamp', '')
            
            # Format color for speakers
            color_hex = "#1e3a8a" # default dark blue
            if "ai" in speaker.lower():
                color_hex = "#6b21a8" # purple for AI
            elif speaker.lower() not in ["admin", "host", "interviewer"]:
                color_hex = "#0f766e" # teal for candidate
                
            formatted_text = f'<font color="{color_hex}"><b>[{timestamp}] {speaker}:</b></font> {text}'
            story.append(Paragraph(formatted_text, dialogue_style))
            
    # -- Mood and Emotion Analysis Section --
    mood_analysis = analyze_emotions(transcript)
    if mood_analysis:
        story.append(Spacer(1, 15))
        story.append(Paragraph("AI Voice Mood & Emotion Analysis", section_heading))
        
        log_divider2 = Table([[""]], colWidths=[504])
        log_divider2.setStyle(TableStyle([
            ('LINEBELOW', (0,0), (-1,-1), 0.5, border_color),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0)
        ]))
        story.append(log_divider2)
        story.append(Spacer(1, 8))
        
        for speaker, data in mood_analysis.items():
            speaker_style = ParagraphStyle(
                'SpeakerMoodTitle',
                parent=styles['Normal'],
                fontName='Helvetica-Bold',
                fontSize=10,
                leading=14,
                textColor=primary_color,
                spaceBefore=6,
                spaceAfter=4
            )
            story.append(Paragraph(f"Speaker: {speaker}", speaker_style))
            
            # Mood Table data
            mood_table_data = [
                [
                    Paragraph("<b>Happy</b>", meta_label_style),
                    Paragraph("<b>Excited</b>", meta_label_style),
                    Paragraph("<b>Neutral</b>", meta_label_style),
                    Paragraph("<b>Sad</b>", meta_label_style),
                    Paragraph("<b>Anxious/Stressed</b>", meta_label_style)
                ],
                [
                    Paragraph(f"{data['happy']}%", meta_value_style),
                    Paragraph(f"{data['excited']}%", meta_value_style),
                    Paragraph(f"{data['neutral']}%", meta_value_style),
                    Paragraph(f"{data['sad']}%", meta_value_style),
                    Paragraph(f"{data['anxious']}%", meta_value_style)
                ]
            ]
            
            mood_table = Table(mood_table_data, colWidths=[100, 100, 100, 100, 104])
            mood_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), bg_light),
                ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('GRID', (0,0), (-1,-1), 0.5, border_color),
                ('TOPPADDING', (0,0), (-1,-1), 4),
                ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ]))
            
            story.append(mood_table)
            story.append(Spacer(1, 4))
            
            interpretation_style = ParagraphStyle(
                'MoodInterpretation',
                parent=styles['Normal'],
                fontName='Helvetica-Oblique',
                fontSize=8.5,
                leading=12,
                textColor=colors.HexColor("#4b5563"),
                spaceAfter=10
            )
            story.append(Paragraph(f"<b>Overall Tone Analysis:</b> {data['interpretation']}", interpretation_style))
            story.append(Spacer(1, 6))

    # Build document
    doc.build(story)
    return f"/uploads/{pdf_filename}"
