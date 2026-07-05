const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store meeting sessions
// roomId -> { startTime, participants: Set, transcript: [] }
const meetings = new Map();

// Helper to get formatted timestamp
const getTimestamp = () => {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-room', ({ roomId, participantName }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.participantName = participantName;

    if (!meetings.has(roomId)) {
      meetings.set(roomId, {
        startTime: Date.now(),
        participants: new Set(),
        transcript: []
      });
    }

    const meeting = meetings.get(roomId);
    meeting.participants.add(participantName);

    console.log(`${participantName} joined room ${roomId}`);
    
    // Broadcast who joined
    io.to(roomId).emit('peer-joined', { sender: participantName, timestamp: getTimestamp() });
  });

  socket.on('caption', ({ text, isFinal }) => {
    const { roomId, participantName } = socket;
    if (!roomId || !participantName) return;

    // Broadcast live caption (interim or final) to all members of the room
    io.to(roomId).emit('caption', {
      sender: participantName,
      text: text,
      isFinal: isFinal,
      timestamp: getTimestamp()
    });

    // If final, log it into the transcript
    if (isFinal) {
      const meeting = meetings.get(roomId);
      if (meeting) {
        meeting.transcript.push({
          speaker: participantName,
          text: text,
          timestamp: getTimestamp()
        });
      }
    }
  });

  socket.on('mic-state', ({ isMuted }) => {
    const { roomId, participantName } = socket;
    if (!roomId || !participantName) return;
    io.to(roomId).emit('mic-state-updated', { sender: participantName, isMuted });
  });

  socket.on('disconnect', () => {
    const { roomId, participantName } = socket;
    if (roomId && participantName) {
      console.log(`${participantName} disconnected from room ${roomId}`);
      io.to(roomId).emit('peer-left', { sender: participantName, timestamp: getTimestamp() });
    }
  });
});

// Endpoint to end the meeting and generate PDF report
app.post('/api/meetings/:roomId/end', (req, res) => {
  const { roomId } = req.params;
  const meeting = meetings.get(roomId);

  if (!meeting) {
    return res.status(404).json({ error: 'Meeting session not found' });
  }

  const durationSec = Math.floor((Date.now() - meeting.startTime) / 1000);
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  const durationStr = `${minutes}m ${seconds}s`;

  try {
    const doc = new PDFDocument({ margin: 50 });
    const pdfFilename = `meeting_report_${roomId}_${Date.now()}.pdf`;
    
    // Ensure reports folder exists
    const reportsDir = path.join(__dirname, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir);
    }
    
    const pdfPath = path.join(reportsDir, pdfFilename);
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // PDF Title
    doc.fontSize(22).fillColor('#1e3a8a').text('Tech-Meet Session Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#6b7280').text('Official Attendance Logs & Speech Transcript', { align: 'center' });
    doc.moveDown(1.5);

    // Horizontal Divider
    doc.strokeColor('#1e3a8a').lineWidth(1.5).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(1);

    // Meeting Details Panel
    doc.fontSize(12).fillColor('#1e3a8a').text('Session Metadata');
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#1f2937');
    doc.text(`Meeting Room ID: ${roomId}`);
    doc.text(`Duration: ${durationStr}`);
    doc.text(`Total Participants: ${meeting.participants.size}`);
    doc.text(`Attendees: ${Array.from(meeting.participants).join(', ')}`);
    doc.moveDown(1.5);

    // Horizontal Divider
    doc.strokeColor('#d1d5db').lineWidth(0.5).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(1);

    // Transcription Log
    doc.fontSize(12).fillColor('#1e3a8a').text('Conversation Transcript Log');
    doc.moveDown(0.5);

    if (meeting.transcript.length === 0) {
      doc.fontSize(10).fillColor('#9ca3af').text('No speech transcripts were logged during this call.');
    } else {
      meeting.transcript.forEach((line) => {
        doc.fontSize(9.5).fillColor('#374151').text(`[${line.timestamp}] `, { continued: true })
           .fillColor('#0f766e').text(`${line.speaker}: `, { continued: true })
           .fillColor('#1f2937').text(line.text);
        doc.moveDown(0.4);
      });
    }

    doc.end();

    writeStream.on('finish', () => {
      // Clean up session
      meetings.delete(roomId);
      res.json({
        message: 'Meeting ended successfully',
        pdfUrl: `/reports/${pdfFilename}`,
        participants: Array.from(meeting.participants),
        duration_seconds: durationSec
      });
    });

  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ error: 'Failed to generate meeting report PDF' });
  }
});

// Serve PDF files
app.use('/reports', express.static(path.join(__dirname, 'reports')));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Caption & Attendance server listening on port ${PORT}`);
});
