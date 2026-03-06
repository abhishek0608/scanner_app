const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data', 'demo-data.json');
const ATTENDANCE_FILE = path.join(ROOT, 'data', 'attendance.json');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

let cachedDemoData = null;

async function loadDemoData() {
  if (cachedDemoData) {
    return cachedDemoData;
  }

  const raw = await fs.readFile(DATA_FILE, 'utf8');
  cachedDemoData = JSON.parse(raw);
  return cachedDemoData;
}

async function loadAttendance() {
  const raw = await fs.readFile(ATTENDANCE_FILE, 'utf8');
  return JSON.parse(raw);
}

async function saveAttendance(payload) {
  await fs.writeFile(ATTENDANCE_FILE, JSON.stringify(payload, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function safePathname(inputPath) {
  const parsed = new URL(inputPath, 'http://localhost');
  const pathname = decodeURIComponent(parsed.pathname);
  const resolved = path.join(PUBLIC_DIR, pathname === '/' ? '/index.html' : pathname);

  if (!resolved.startsWith(PUBLIC_DIR)) {
    return null;
  }

  return resolved;
}

function createDeterministicFloat(seed) {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const int = parseInt(hash.slice(0, 8), 16);
  return int / 0xffffffff;
}

function getTeacherByToken(demoData, token) {
  return demoData.teachers.find((teacher) => teacher.token === token) || null;
}

async function parseBody(req) {
  let body = '';

  for await (const chunk of req) {
    body += chunk;

    if (body.length > 10 * 1024 * 1024) {
      throw new Error('Payload too large');
    }
  }

  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new Error('Invalid JSON payload');
  }
}

function buildRecognitionResult(students, imageFingerprint) {
  return students.map((student) => {
    const base = createDeterministicFloat(`${student.id}:${imageFingerprint}`);
    const confidence = Number((0.45 + base * 0.53).toFixed(2));

    let status = 'Absent';
    if (confidence >= 0.82) {
      status = 'Present';
    } else if (confidence >= 0.68) {
      status = 'Review';
    }

    return {
      studentId: student.id,
      name: student.name,
      status,
      confidence,
      method: status === 'Present' ? 'FaceMatch' : status === 'Review' ? 'ManualNeeded' : 'NoMatch'
    };
  });
}

async function handleApi(req, res, urlObj) {
  const demoData = await loadDemoData();

  if (req.method === 'GET' && urlObj.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, service: 'rajasthan-attendance-demo', timestamp: new Date().toISOString() });
  }

  if (req.method === 'POST' && urlObj.pathname === '/api/auth/validate') {
    const body = await parseBody(req);
    const token = body.token || '';
    const teacher = getTeacherByToken(demoData, token);

    if (!teacher) {
      return sendJson(res, 401, { ok: false, message: 'Invalid token' });
    }

    const school = demoData.schools.find((item) => item.id === teacher.schoolId);
    const classes = demoData.classes
      .filter((item) => item.schoolId === teacher.schoolId)
      .map((item) => ({ id: item.id, name: item.name }));

    return sendJson(res, 200, {
      ok: true,
      teacher: {
        id: teacher.id,
        name: teacher.name,
        schoolId: teacher.schoolId,
        schoolName: school ? school.name : null,
        district: school ? school.district : null
      },
      classes
    });
  }

  if (req.method === 'POST' && urlObj.pathname === '/api/attendance/process') {
    const body = await parseBody(req);
    const token = body.token || '';
    const classId = body.classId || '';
    const imageBase64 = body.imageBase64 || '';

    const teacher = getTeacherByToken(demoData, token);
    if (!teacher) {
      return sendJson(res, 401, { ok: false, message: 'Invalid token' });
    }

    const classroom = demoData.classes.find((item) => item.id === classId && item.schoolId === teacher.schoolId);
    if (!classroom) {
      return sendJson(res, 404, { ok: false, message: 'Class not found for this teacher' });
    }

    if (!imageBase64 || imageBase64.length < 40) {
      return sendJson(res, 400, { ok: false, message: 'Image is required' });
    }

    const fingerprint = crypto
      .createHash('md5')
      .update(`${imageBase64.length}:${imageBase64.slice(0, 80)}:${imageBase64.slice(-80)}`)
      .digest('hex');

    const attendanceRows = buildRecognitionResult(classroom.students, fingerprint);
    const summary = attendanceRows.reduce(
      (acc, row) => {
        if (row.status === 'Present') acc.present += 1;
        if (row.status === 'Absent') acc.absent += 1;
        if (row.status === 'Review') acc.review += 1;
        return acc;
      },
      { total: classroom.students.length, present: 0, absent: 0, review: 0 }
    );

    return sendJson(res, 200, {
      ok: true,
      classId,
      className: classroom.name,
      generatedAt: new Date().toISOString(),
      summary,
      rows: attendanceRows
    });
  }

  if (req.method === 'POST' && urlObj.pathname === '/api/attendance/submit') {
    const body = await parseBody(req);
    const token = body.token || '';
    const classId = body.classId || '';
    const period = body.period || 'P1';
    const date = body.date || new Date().toISOString().slice(0, 10);
    const rows = Array.isArray(body.rows) ? body.rows : [];

    const teacher = getTeacherByToken(demoData, token);
    if (!teacher) {
      return sendJson(res, 401, { ok: false, message: 'Invalid token' });
    }

    const classroom = demoData.classes.find((item) => item.id === classId && item.schoolId === teacher.schoolId);
    if (!classroom) {
      return sendJson(res, 404, { ok: false, message: 'Class not found for this teacher' });
    }

    const snapshotId = `ATT-${Date.now()}`;
    const attendance = await loadAttendance();
    attendance.records.push({
      snapshotId,
      classId,
      className: classroom.name,
      schoolId: teacher.schoolId,
      teacherId: teacher.id,
      teacherName: teacher.name,
      date,
      period,
      submittedAt: new Date().toISOString(),
      rows
    });

    await saveAttendance(attendance);

    return sendJson(res, 200, {
      ok: true,
      snapshotId,
      message: 'Attendance submitted successfully'
    });
  }

  if (req.method === 'GET' && urlObj.pathname === '/api/attendance/report') {
    const classId = urlObj.searchParams.get('classId');
    const date = urlObj.searchParams.get('date');

    if (!classId || !date) {
      return sendJson(res, 400, { ok: false, message: 'classId and date are required' });
    }

    const attendance = await loadAttendance();
    const result = attendance.records.filter((record) => record.classId === classId && record.date === date);

    return sendJson(res, 200, { ok: true, records: result });
  }

  return sendJson(res, 404, { ok: false, message: 'API route not found' });
}

async function serveStatic(req, res) {
  const filePath = safePathname(req.url);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
    const ext = path.extname(filePath);
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream'
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  try {
    if (urlObj.pathname.startsWith('/api/')) {
      await handleApi(req, res, urlObj);
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message || 'Internal server error' });
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Attendance demo running at http://${HOST}:${PORT}`);
});
