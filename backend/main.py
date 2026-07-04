import os
import shutil
import uuid
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from database import init_db, get_db_connection
from pdf_generator import generate_transcript_pdf

# Initialize database on startup
init_db()

app = FastAPI(title="Tech-Meet Backend", version="1.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure uploads directory exists
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Mount uploads directory to serve recording files
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# Pydantic models
class AttendancePayload(BaseModel):
    status: str
    duration: int

class MeetingCreatePayload(BaseModel):
    title: str
    position_domain: str
    round_name: str
    scheduled_time: str

class TranscriptLine(BaseModel):
    speaker: str
    text: str
    timestamp: str
    elapsed_seconds: float | None = None
    average_volume: float | None = None
    speech_rate: float | None = None

class EndMeetingPayload(BaseModel):
    attendance_duration: int
    transcript: list[TranscriptLine]


# Connection Manager for WebRTC WebSocket signaling and role based Waiting Room
class ConnectionManager:
    def __init__(self):
        # room_id -> dict of {websocket: client_info_dict}
        self.room_clients = {}

    async def connect(self, websocket: WebSocket, room_id: str, username: str, role: str, status: str):
        await websocket.accept()
        if room_id not in self.room_clients:
            self.room_clients[room_id] = {}
        self.room_clients[room_id][websocket] = {
            "username": username,
            "role": role,
            "status": status
        }

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.room_clients:
            if websocket in self.room_clients[room_id]:
                del self.room_clients[room_id][websocket]
            if not self.room_clients[room_id]:
                del self.room_clients[room_id]

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception:
            pass

    async def broadcast_to_admitted(self, message: dict, room_id: str, sender_ws: WebSocket = None):
        if room_id in self.room_clients:
            for connection, info in self.room_clients[room_id].items():
                if connection != sender_ws and info["status"] == "admitted":
                    try:
                        await connection.send_json(message)
                    except Exception:
                        pass

    async def broadcast_waiting_list(self, room_id: str):
        if room_id not in self.room_clients:
            return
        
        # Get list of all waiting candidates
        waiting_candidates = []
        for info in self.room_clients[room_id].values():
            if info["role"] == "candidate" and info["status"] == "waiting":
                waiting_candidates.append(info["username"])

        # Broadcast list to all admins in the room
        event = {
            "type": "waiting-list",
            "candidates": waiting_candidates
        }
        for ws, info in self.room_clients[room_id].items():
            if info["role"] == "admin":
                try:
                    await ws.send_json(event)
                except Exception:
                    pass


manager = ConnectionManager()


@app.get("/api/meetings")
def get_meetings():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM meetings")
    meetings = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return meetings


@app.get("/api/meetings/{meet_id}")
def get_meeting(meet_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM meetings WHERE id = ?", (meet_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return dict(row)


@app.post("/api/meetings")
def create_meeting(payload: MeetingCreatePayload):
    try:
        meet_id = f"meet-{uuid.uuid4().hex[:8]}"
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO meetings (id, title, position_domain, round_name, status, scheduled_time)
            VALUES (?, ?, ?, ?, 'Scheduled', ?)
        """, (meet_id, payload.title, payload.position_domain, payload.round_name, payload.scheduled_time))
        conn.commit()
        
        cursor.execute("SELECT * FROM meetings WHERE id = ?", (meet_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")


whisper_model_cache = None

def get_whisper_model():
    global whisper_model_cache
    if whisper_model_cache is None:
        from faster_whisper import WhisperModel
        print("Loading Whisper model ('tiny') on CPU...")
        whisper_model_cache = WhisperModel("tiny", device="cpu", compute_type="int8")
    return whisper_model_cache

def transcribe_recording_whisper_task(meet_id: str, file_path: str):
    try:
        print(f"Whisper background transcription started for meeting {meet_id}...")
        
        # 1. Fetch existing meeting info and real-time transcript from DB
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM meetings WHERE id = ?", (meet_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            print(f"Whisper error: Meeting {meet_id} not found in database.")
            return
            
        meet_info = dict(row)
        
        # Parse existing real-time transcript list
        transcript_list = []
        if meet_info.get("transcript_json"):
            try:
                transcript_list = json.loads(meet_info["transcript_json"])
            except Exception as e:
                print("Error parsing transcript_json:", e)
                
        # 2. Run Whisper transcription
        model = get_whisper_model()
        segments, info = model.transcribe(file_path, beam_size=5)
        
        whisper_transcript = []
        for segment in segments:
            start_sec = segment.start
            text = segment.text.strip()
            if not text:
                continue
                
            # Align with real-time speaker chunks using closest timestamp match
            closest_speaker = "Speaker"
            closest_timestamp = ""
            min_diff = 999999.0
            
            for chunk in transcript_list:
                chunk_sec = chunk.get("elapsed_seconds")
                if chunk_sec is not None:
                    diff = abs(chunk_sec - start_sec)
                    if diff < min_diff:
                        min_diff = diff
                        closest_speaker = chunk.get("speaker", "Speaker")
                        closest_timestamp = chunk.get("timestamp", "")
            
            # Formatting timestamp if missing
            if not closest_timestamp:
                minutes = int(start_sec) // 60
                seconds = int(start_sec) % 60
                closest_timestamp = f"{minutes:02d}:{seconds:02d}"
                
            whisper_transcript.append({
                "speaker": closest_speaker,
                "text": text,
                "timestamp": closest_timestamp,
                "elapsed_seconds": start_sec
            })
            
        # If whisper successfully transcribed text, update DB and generate new PDF report
        if whisper_transcript:
            whisper_json_str = json.dumps(whisper_transcript)
            
            # Re-generate PDF using the Whisper refined transcript
            pdf_url = generate_transcript_pdf(
                meet_id=meet_id,
                title=meet_info["title"],
                round_name=meet_info["round_name"],
                position_domain=meet_info["position_domain"],
                scheduled_time=meet_info.get("scheduled_time", ""),
                duration_seconds=meet_info.get("attendance_duration", 0),
                transcript=whisper_transcript
            )
            
            # Update SQLite DB
            cursor.execute("""
                UPDATE meetings 
                SET transcript_json = ?, 
                    transcript_pdf_url = ?
                WHERE id = ?
            """, (whisper_json_str, pdf_url, meet_id))
            conn.commit()
            print(f"Whisper background transcription completed and PDF updated for meeting {meet_id}.")
        else:
            print(f"Whisper returned empty transcript segments for meeting {meet_id}.")
            
        conn.close()
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in Whisper background transcription task: {str(e)}")


@app.post("/api/meetings/{meet_id}/upload-recording")
async def upload_recording(meet_id: str, background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")

    filename = f"recording_{meet_id}.webm"
    dest_path = os.path.join(UPLOAD_DIR, filename)

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    recording_url = f"/uploads/{filename}"
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE meetings 
        SET recording_url = ?, status = 'Completed'
        WHERE id = ?
    """, (recording_url, meet_id))
    conn.commit()
    conn.close()

    # Launch background task to transcribe using Whisper
    background_tasks.add_task(transcribe_recording_whisper_task, meet_id, dest_path)

    return {"message": "Upload successful and Whisper transcription queued", "recording_url": recording_url}


@app.post("/api/meetings/{meet_id}/attendance")
def update_attendance(meet_id: str, payload: AttendancePayload):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE meetings 
        SET attendance_status = ?, attendance_duration = ?
        WHERE id = ?
    """, (payload.status, payload.duration, meet_id))
    conn.commit()
    conn.close()
    return {"message": "Attendance updated successfully"}


@app.post("/api/meetings/{meet_id}/end")
def end_meeting(meet_id: str, payload: EndMeetingPayload):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. Fetch meeting info to populate PDF metadata
        cursor.execute("SELECT * FROM meetings WHERE id = ?", (meet_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Meeting not found")
            
        meet_info = dict(row)
        
        # Convert Pydantic payload models to dicts
        transcript_list = [dict(line) for line in payload.transcript]
        transcript_json_str = json.dumps(transcript_list)
        
        # 2. Generate PDF report
        pdf_url = generate_transcript_pdf(
            meet_id=meet_id,
            title=meet_info["title"],
            round_name=meet_info["round_name"],
            position_domain=meet_info["position_domain"],
            scheduled_time=meet_info.get("scheduled_time", ""),
            duration_seconds=payload.attendance_duration,
            transcript=transcript_list
        )
        
        # 3. Update meeting record in DB
        cursor.execute("""
            UPDATE meetings 
            SET status = 'Completed', 
                attendance_status = 'Attended', 
                attendance_duration = ?, 
                transcript_json = ?, 
                transcript_pdf_url = ?
            WHERE id = ?
        """, (payload.attendance_duration, transcript_json_str, pdf_url, meet_id))
        conn.commit()
        conn.close()
        
        return {
            "message": "Meeting ended and transcript PDF generated successfully",
            "pdf_url": pdf_url
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@app.websocket("/api/ws/meet/{meet_id}")
async def websocket_signaling(
    websocket: WebSocket, 
    meet_id: str, 
    username: str = "Anonymous", 
    role: str = "candidate"
):
    status = "admitted" if role == "admin" else "waiting"
    await manager.connect(websocket, meet_id, username, role, status)

    if status == "waiting":
        # Let candidate know they are waiting in lobby
        await manager.send_personal_message({"type": "waiting-state"}, websocket)
        # Notify admins in the room about the new waiting candidate
        await manager.broadcast_waiting_list(meet_id)
    else:
        # Host connects, broadcast waiting list immediately so they see anyone already waiting
        await manager.broadcast_waiting_list(meet_id)
        # Broadcast host joined to other admitted users
        join_event = {
            "type": "peer-joined",
            "sender": username,
            "message": f"{username} (Host) has joined the room."
        }
        await manager.broadcast_to_admitted(join_event, meet_id, sender_ws=websocket)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if role == "admin" and msg_type == "admit-peer":
                target_username = data.get("target")
                target_ws = None
                
                # Update candidate status
                if meet_id in manager.room_clients:
                    for ws, info in manager.room_clients[meet_id].items():
                        if info["role"] == "candidate" and info["username"] == target_username:
                            info["status"] = "admitted"
                            target_ws = ws
                            break

                if target_ws:
                    # 1. Send admit confirmation to candidate
                    await manager.send_personal_message({"type": "admit-success"}, target_ws)
                    # 2. Update waiting list for admins
                    await manager.broadcast_waiting_list(meet_id)
                    # 3. Broadcast peer joined to all other admitted peers
                    admit_event = {
                        "type": "peer-joined",
                        "sender": target_username,
                        "message": f"{target_username} has been admitted to the room."
                    }
                    await manager.broadcast_to_admitted(admit_event, meet_id)

            elif role == "admin" and msg_type == "remove-peer":
                target_username = data.get("target")
                target_ws = None

                if meet_id in manager.room_clients:
                    for ws, info in manager.room_clients[meet_id].items():
                        if info["username"] == target_username:
                            target_ws = ws
                            break

                if target_ws:
                    # 1. Inform candidate they are removed
                    await manager.send_personal_message({"type": "kick-out"}, target_ws)
                    # 2. Close connection
                    try:
                        await target_ws.close()
                    except Exception:
                        pass
                    manager.disconnect(target_ws, meet_id)
                    # 3. Update waiting list for admins
                    await manager.broadcast_waiting_list(meet_id)
                    # 4. Broadcast peer left
                    leave_event = {
                        "type": "peer-left",
                        "sender": target_username,
                        "message": f"{target_username} has been removed from the meeting."
                    }
                    await manager.broadcast_to_admitted(leave_event, meet_id)

            else:
                # Normal signaling relay (SDP, ICE, chat messages)
                # Only relay to/from admitted clients
                current_info = manager.room_clients.get(meet_id, {}).get(websocket, {})
                if current_info.get("status") == "admitted":
                    target = data.get("target")
                    if target and msg_type in ["offer", "answer", "candidate"]:
                        # Direct routing for WebRTC signaling messages
                        target_ws = None
                        if meet_id in manager.room_clients:
                            for ws, info in manager.room_clients[meet_id].items():
                                if info["username"] == target and info["status"] == "admitted":
                                    target_ws = ws
                                    break
                        if target_ws:
                            await manager.send_personal_message(data, target_ws)
                    else:
                        # Broadcast other messages (chat, transcripts, etc.) to all other admitted clients
                        await manager.broadcast_to_admitted(data, meet_id, sender_ws=websocket)

    except WebSocketDisconnect:
        current_info = manager.room_clients.get(meet_id, {}).get(websocket, {})
        was_admitted = current_info.get("status") == "admitted"
        
        manager.disconnect(websocket, meet_id)
        
        if was_admitted:
            leave_event = {
                "type": "peer-left",
                "sender": username,
                "message": f"{username} has left the room."
            }
            await manager.broadcast_to_admitted(leave_event, meet_id)
        else:
            # Update waiting list since a waiting candidate disconnected
            await manager.broadcast_waiting_list(meet_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
