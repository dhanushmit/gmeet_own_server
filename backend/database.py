import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "meetings.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS meetings (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            position_domain TEXT NOT NULL,
            round_name TEXT NOT NULL,
            recording_url TEXT,
            attendance_status TEXT DEFAULT 'Absent',
            attendance_duration INTEGER DEFAULT 0,
            status TEXT DEFAULT 'Scheduled'
        )
    """)
    conn.commit()

    # Seed some mock data if empty
    cursor.execute("SELECT COUNT(*) FROM meetings")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO meetings (id, title, position_domain, round_name, status)
            VALUES 
            ('react-senior-01', 'Senior React Engineer Interview', 'Frontend Engineering', 'Technical Architecture & Live Coding', 'Scheduled'),
            ('vite-perf-02', 'Vite Core Performance Specialist', 'Build Systems & Tooling', 'System Design & Troubleshooting', 'Scheduled'),
            ('ai-chat-03', 'AI Engineer Mock Interview', 'Artificial Intelligence', 'Coding & ML Fundamentals', 'Scheduled')
        """)
        conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
