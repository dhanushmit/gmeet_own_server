import os
import shutil
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from database import init_db, get_db_connection

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


# Pydantic models for request bodies
class AttendancePayload(BaseModel):
    status: str
    duration: int


# Connection Manager for WebRTC WebSocket signaling
class ConnectionManager:
    def __init__(self):
        # room_id -> list of web sockets
        self.active_connections = {}
        # websocket -> username
        self.usernames = {}

    async def connect(self, websocket: WebSocket, room_id: str, username: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
        self.usernames[websocket] = username

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
        if websocket in self.usernames:
            del self.usernames[websocket]

    async def broadcast_to_room(self, message: dict, room_id: str, sender_ws: WebSocket = None):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                if connection != sender_ws:
                    try:
                        await connection.send_json(message)
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


@app.post("/api/meetings/{meet_id}/upload-recording")
async def upload_recording(meet_id: str, file: UploadFile = File(...)):
    # Check that file exists
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")

    # Define filename and destination path
    filename = f"recording_{meet_id}.mp4"
    dest_path = os.path.join(UPLOAD_DIR, filename)

    # Save the file
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Update database
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

    return {"message": "Upload successful", "recording_url": recording_url}


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


@app.websocket("/api/ws/meet/{meet_id}")
async def websocket_signaling(websocket: WebSocket, meet_id: str, username: str = "Anonymous"):
    await manager.connect(websocket, meet_id, username)
    
    # Broadcast that peer joined
    join_event = {
        "type": "peer-joined",
        "sender": username,
        "message": f"{username} has joined the room."
    }
    await manager.broadcast_to_room(join_event, meet_id, sender_ws=websocket)

    try:
        while True:
            # Wait for any incoming json data
            data = await websocket.receive_json()
            
            # Types of events handled: 'offer', 'answer', 'candidate', 'chat-message', 'recording-status', etc.
            # We simply route all these message payloads to other users in the same room
            await manager.broadcast_to_room(data, meet_id, sender_ws=websocket)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, meet_id)
        leave_event = {
            "type": "peer-left",
            "sender": username,
            "message": f"{username} has left the room."
        }
        await manager.broadcast_to_room(leave_event, meet_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
