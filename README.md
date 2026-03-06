# Rajasthan Attendance Demo

Single-photo facial attendance demo built for showcasing integration with the Rajasthan Government app via URL/WebView.

## Demo capabilities
- Teacher token validation (`/api/auth/validate`)
- Class selection by teacher school mapping
- Single classroom photo upload
- Browser face detection from uploaded image (image-driven attendance output)
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

Browser requirement for processing:
- Use latest Chrome/Edge (requires Web Face Detection API support)
- If unsupported browser/webview, use manual face-mark mode by clicking faces on uploaded image

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
The app now detects faces from the uploaded image in-browser, then maps detections to attendance rows for review/submit flow. For production identity matching, integrate student enrollment photos + model-based face recognition in backend inference.
