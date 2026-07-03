import os
import shutil
import uuid
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


# Pydantic models
class AttendancePayload(BaseModel):
    status: str
    duration: int

class MeetingCreatePayload(BaseModel):
    title: str
    position_domain: str
    round_name: str
    scheduled_time: str


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


@app.post("/api/meetings/{meet_id}/upload-recording")
async def upload_recording(meet_id: str, file: UploadFile = File(...)):
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
