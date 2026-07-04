import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

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
            
    # Build document
    doc.build(story)
    return f"/uploads/{pdf_filename}"
