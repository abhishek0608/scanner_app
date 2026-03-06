# Rajasthan Attendance Demo

Single-photo facial attendance demo built for showcasing integration with the Rajasthan Government app via URL/WebView.

## Demo capabilities
- Teacher token validation (`/api/auth/validate`)
- Class selection by teacher school mapping
- Single classroom photo upload
- Simulated face-recognition attendance output (`Present`, `Absent`, `Review`)
- Manual correction before submission
- Attendance submission and persistence in local JSON store

## Project structure
- `server.js`: Node HTTP server + API endpoints + static file serving
- `public/`: Frontend UI (`index.html`, `styles.css`, `app.js`)
- `data/demo-data.json`: Seed schools/teachers/classes/students
- `data/attendance.json`: Submitted attendance snapshots

## Run
```bash
npm start
```

Open:
- `http://localhost:3000`
- or simulate host app URL token injection:
  - `http://localhost:3000/?token=demo-token-jpr-1001`

## Demo tokens
- `demo-token-jpr-1001` (Jaipur school)
- `demo-token-uda-2001` (Udaipur school)

## API quick reference
- `GET /api/health`
- `POST /api/auth/validate`
- `POST /api/attendance/process`
- `POST /api/attendance/submit`
- `GET /api/attendance/report?classId=...&date=YYYY-MM-DD`

## Note
Current attendance recognition is deterministic simulation for demo. In pilot/production, replace `buildRecognitionResult` in `server.js` with actual face detection + recognition inference from the Rajasthan Govt server stack.
