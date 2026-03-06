const state = {
  token: '',
  teacher: null,
  classes: [],
  rows: [],
  imageBase64: '',
  detections: [],
  imageMeta: null,
  manualDetections: []
};

const authCard = document.getElementById('auth-card');
const attendanceCard = document.getElementById('attendance-card');
const tokenInput = document.getElementById('token');
const validateBtn = document.getElementById('validate-btn');
const authStatus = document.getElementById('auth-status');

const teacherName = document.getElementById('teacher-name');
const schoolName = document.getElementById('school-name');
const districtName = document.getElementById('district-name');
const classSelect = document.getElementById('class-select');
const periodSelect = document.getElementById('period');
const dateInput = document.getElementById('date');
const photoInput = document.getElementById('photo-input');
const processBtn = document.getElementById('process-btn');
const processStatus = document.getElementById('process-status');
const manualDetectWrap = document.getElementById('manual-detect-wrap');
const manualImage = document.getElementById('manual-image');
const manualOverlay = document.getElementById('manual-overlay');
const clearFacesBtn = document.getElementById('clear-faces-btn');
const manualCount = document.getElementById('manual-count');
const summaryWrap = document.getElementById('summary');
const tableWrap = document.getElementById('table-wrap');
const attendanceBody = document.getElementById('attendance-body');
const submitBtn = document.getElementById('submit-btn');
const submitStatus = document.getElementById('submit-status');

const urlToken = new URLSearchParams(window.location.search).get('token');
if (urlToken) {
  tokenInput.value = urlToken;
}

dateInput.value = new Date().toISOString().slice(0, 10);

function setStatus(el, text, type = 'info') {
  el.textContent = text;
  if (type === 'error') el.style.color = '#9f1239';
  else if (type === 'success') el.style.color = '#166534';
  else el.style.color = '#1f2937';
}

async function api(path, payload) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

function renderClasses() {
  classSelect.innerHTML = '';
  state.classes.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    classSelect.appendChild(option);
  });
}

function renderSummary(summary) {
  summaryWrap.classList.remove('hidden');
  summaryWrap.innerHTML = `
    <div class="pill total">Total: ${summary.total}</div>
    <div class="pill present">Present: ${summary.present}</div>
    <div class="pill absent">Absent: ${summary.absent}</div>
    <div class="pill review">Review: ${summary.review}</div>
  `;
}

function renderRows(rows) {
  tableWrap.classList.remove('hidden');
  attendanceBody.innerHTML = '';

  rows.forEach((row, idx) => {
    const tr = document.createElement('tr');

    const statusOptions = ['Present', 'Absent', 'Review']
      .map((status) => `<option value="${status}" ${status === row.status ? 'selected' : ''}>${status}</option>`)
      .join('');

    tr.innerHTML = `
      <td>${row.studentId}</td>
      <td>${row.name}</td>
      <td>${Math.round(row.confidence * 100)}%</td>
      <td>
        <select class="status-select" data-row-index="${idx}">
          ${statusOptions}
        </select>
      </td>
    `;

    attendanceBody.appendChild(tr);
  });

  attendanceBody.querySelectorAll('.status-select').forEach((el) => {
    el.addEventListener('change', (event) => {
      const i = Number(event.target.dataset.rowIndex);
      state.rows[i].status = event.target.value;
    });
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function supportsFaceDetector() {
  return 'FaceDetector' in window;
}

function setManualCountText() {
  manualCount.textContent = `Marked faces: ${state.manualDetections.length}`;
}

function renderManualMarks() {
  manualOverlay.innerHTML = '';
  state.manualDetections.forEach((face) => {
    const marker = document.createElement('span');
    marker.className = 'manual-dot';
    marker.style.left = `${Math.round(face.centerX * 100)}%`;
    marker.style.top = `${Math.round(face.centerY * 100)}%`;
    manualOverlay.appendChild(marker);
  });
  setManualCountText();
}

async function detectFaces(imageBase64) {
  if (!supportsFaceDetector()) {
    throw new Error('Automatic detection unavailable. Mark faces manually in the preview.');
  }

  const blob = await fetch(imageBase64).then((res) => res.blob());
  const bitmap = await createImageBitmap(blob);
  const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 100 });
  const faces = await detector.detect(bitmap);

  const detections = faces
    .map((face) => {
      const box = face.boundingBox || {};
      const width = Number(box.width || 0);
      const height = Number(box.height || 0);
      const x = Number(box.x || 0);
      const y = Number(box.y || 0);
      const areaRatio = (width * height) / (bitmap.width * bitmap.height);
      const centerX = (x + width / 2) / bitmap.width;
      const centerY = (y + height / 2) / bitmap.height;

      return {
        xRatio: clamp(x / bitmap.width, 0, 1),
        yRatio: clamp(y / bitmap.height, 0, 1),
        widthRatio: clamp(width / bitmap.width, 0, 1),
        heightRatio: clamp(height / bitmap.height, 0, 1),
        areaRatio: clamp(areaRatio, 0, 1),
        centerX: clamp(centerX, 0, 1),
        centerY: clamp(centerY, 0, 1)
      };
    })
    .filter((face) => face.areaRatio > 0.0015)
    .sort((a, b) => a.centerX - b.centerX);

  return {
    detections,
    imageMeta: {
      width: bitmap.width,
      height: bitmap.height
    }
  };
}

validateBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    setStatus(authStatus, 'Token is required', 'error');
    return;
  }

  setStatus(authStatus, 'Validating token...');

  const result = await api('/api/auth/validate', { token });
  if (!result.ok) {
    setStatus(authStatus, result.message || 'Authentication failed', 'error');
    return;
  }

  state.token = token;
  state.teacher = result.teacher;
  state.classes = result.classes;

  teacherName.textContent = result.teacher.name;
  schoolName.textContent = result.teacher.schoolName;
  districtName.textContent = result.teacher.district;
  renderClasses();

  attendanceCard.classList.remove('hidden');
  setStatus(authStatus, 'Token validated successfully', 'success');
});

photoInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    state.imageBase64 = '';
    state.detections = [];
    state.imageMeta = null;
    state.manualDetections = [];
    manualImage.removeAttribute('src');
    manualDetectWrap.classList.add('hidden');
    renderManualMarks();
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    state.imageBase64 = String(reader.result || '');
    state.detections = [];
    state.imageMeta = null;
    state.manualDetections = [];
    manualImage.src = state.imageBase64;
    if (!supportsFaceDetector()) {
      manualDetectWrap.classList.remove('hidden');
      setStatus(processStatus, 'Auto face detection unavailable. Click each face in image preview, then process.', 'info');
    } else {
      manualDetectWrap.classList.add('hidden');
    }
    renderManualMarks();
  };
  reader.readAsDataURL(file);
});

manualImage.addEventListener('load', () => {
  state.imageMeta = {
    width: manualImage.naturalWidth,
    height: manualImage.naturalHeight
  };
});

manualOverlay.addEventListener('click', (event) => {
  if (!state.imageBase64) {
    return;
  }

  const rect = manualOverlay.getBoundingClientRect();
  const centerX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const centerY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  const widthRatio = 0.1;
  const heightRatio = 0.16;

  state.manualDetections.push({
    xRatio: clamp(centerX - widthRatio / 2, 0, 1),
    yRatio: clamp(centerY - heightRatio / 2, 0, 1),
    widthRatio,
    heightRatio,
    areaRatio: widthRatio * heightRatio,
    centerX,
    centerY
  });

  renderManualMarks();
});

clearFacesBtn.addEventListener('click', () => {
  state.manualDetections = [];
  renderManualMarks();
});

processBtn.addEventListener('click', async () => {
  if (!state.token) {
    setStatus(processStatus, 'Please validate token first', 'error');
    return;
  }
  if (!state.imageBase64) {
    setStatus(processStatus, 'Please select a classroom photo', 'error');
    return;
  }

  let detectionSource = 'auto';
  setStatus(processStatus, 'Preparing face detections...');

  if (supportsFaceDetector()) {
    try {
      const detectionResult = await detectFaces(state.imageBase64);
      state.detections = detectionResult.detections;
      state.imageMeta = detectionResult.imageMeta;
    } catch (error) {
      if (state.manualDetections.length) {
        state.detections = [...state.manualDetections];
        detectionSource = 'manual';
      } else {
        setStatus(processStatus, error.message || 'Face detection failed', 'error');
        return;
      }
    }
  } else {
    if (!state.manualDetections.length) {
      manualDetectWrap.classList.remove('hidden');
      setStatus(processStatus, 'Mark faces manually in the image preview before processing.', 'error');
      return;
    }
    state.detections = [...state.manualDetections];
    detectionSource = 'manual';
  }

  if (!state.detections.length) {
    setStatus(processStatus, 'No faces detected in the photo. Try a clearer image or mark faces manually.', 'error');
    return;
  }

  setStatus(
    processStatus,
    `Using ${detectionSource} detections (${state.detections.length} face(s)). Processing attendance...`
  );

  const result = await api('/api/attendance/process', {
    token: state.token,
    classId: classSelect.value,
    imageBase64: state.imageBase64,
    detections: state.detections,
    imageMeta: state.imageMeta
  });

  if (!result.ok) {
    setStatus(processStatus, result.message || 'Could not process attendance', 'error');
    return;
  }

  state.rows = result.rows;
  renderSummary(result.summary);
  renderRows(result.rows);
  setStatus(processStatus, `Processed ${result.summary.total} students`, 'success');
});

submitBtn.addEventListener('click', async () => {
  if (!state.rows.length) {
    setStatus(submitStatus, 'No attendance rows to submit', 'error');
    return;
  }

  setStatus(submitStatus, 'Submitting final attendance...');

  const result = await api('/api/attendance/submit', {
    token: state.token,
    classId: classSelect.value,
    period: periodSelect.value,
    date: dateInput.value,
    rows: state.rows
  });

  if (!result.ok) {
    setStatus(submitStatus, result.message || 'Submit failed', 'error');
    return;
  }

  setStatus(submitStatus, `Submitted successfully. Snapshot ID: ${result.snapshotId}`, 'success');
});
