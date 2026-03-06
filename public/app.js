const state = {
  token: '',
  teacher: null,
  classes: [],
  rows: [],
  imageBase64: ''
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
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    state.imageBase64 = String(reader.result || '');
  };
  reader.readAsDataURL(file);
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

  setStatus(processStatus, 'Processing attendance...');

  const result = await api('/api/attendance/process', {
    token: state.token,
    classId: classSelect.value,
    imageBase64: state.imageBase64
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
