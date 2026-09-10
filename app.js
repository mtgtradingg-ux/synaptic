const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ---------- Navegación entre vistas ----------

function showView(id) {
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === id));
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.back));
});

function renderIcons() {
  if (window.lucide) lucide.createIcons();
}

// ---------- Sesión ----------

async function refreshSession() {
  const { data } = await sb.auth.getSession();
  const loggedIn = !!data.session;
  document.getElementById('logout-btn').hidden = !loggedIn;
  if (loggedIn) {
    showView('view-dashboard');
    loadSubjects();
  } else {
    showView('view-login');
  }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.hidden = true;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = 'No se pudo iniciar sesión: ' + error.message;
    errorEl.hidden = false;
    return;
  }
  await refreshSession();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  await refreshSession();
});

// ---------- Dashboard ----------

async function loadSubjects() {
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) return;

  const { data, error } = await sb
    .from('subjects')
    .select('id, name, color, icon, total_plan_days, language')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  const list = document.getElementById('subject-list');
  const empty = document.getElementById('dashboard-empty');
  list.innerHTML = '';

  if (error) {
    console.error('Error cargando asignaturas:', error);
    return;
  }

  empty.hidden = data.length > 0;

  for (const subject of data) {
    const li = document.createElement('li');
    li.className = 'subject-row';
    li.innerHTML = `
      <div class="subject-icon" style="background:${subject.color || '#2E8B57'}">
        <span data-lucide="${subject.icon || 'book-open'}"></span>
      </div>
      <div class="subject-info">
        <div class="subject-name">${escapeHtml(subject.name)}</div>
        <div class="subject-meta">${subject.total_plan_days ?? '?'} días · ${subject.language || 'es'}</div>
      </div>
      <button class="btn btn-ghost add-content-btn">Añadir contenido</button>
    `;
    li.querySelector('.add-content-btn').addEventListener('click', () => openAddContent(subject));
    list.appendChild(li);
  }

  renderIcons();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Crear asignatura ----------

let selectedColor = SUBJECT_COLORS[0];
let selectedIcon = DEFAULT_SUBJECT_ICON;
let selectedPlanIndex = 0;

function buildColorPicker() {
  const el = document.getElementById('color-picker');
  el.innerHTML = '';
  SUBJECT_COLORS.forEach((color, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch' + (i === 0 ? ' selected' : '');
    btn.style.background = color;
    btn.addEventListener('click', () => {
      selectedColor = color;
      el.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
      btn.classList.add('selected');
    });
    el.appendChild(btn);
  });
}

function buildIconPicker() {
  const el = document.getElementById('icon-picker');
  el.innerHTML = '';
  SUBJECT_ICONS.forEach((icon) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-option' + (icon === DEFAULT_SUBJECT_ICON ? ' selected' : '');
    btn.innerHTML = `<span data-lucide="${icon}"></span>`;
    btn.addEventListener('click', () => {
      selectedIcon = icon;
      el.querySelectorAll('.icon-option').forEach((s) => s.classList.remove('selected'));
      btn.classList.add('selected');
    });
    el.appendChild(btn);
  });
  renderIcons();
}

function buildPlanPicker() {
  const el = document.getElementById('plan-picker');
  el.innerHTML = '';
  PLAN_OPTIONS.forEach((option, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (i === 0 ? ' selected' : '');
    btn.textContent = option.label;
    btn.addEventListener('click', () => {
      selectedPlanIndex = i;
      el.querySelectorAll('.chip').forEach((s) => s.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('plan-extended-note').hidden = !option.extended;
    });
    el.appendChild(btn);
  });
}

function buildLanguagePicker() {
  const select = document.getElementById('create-language');
  LANGUAGE_CODES.forEach((code, i) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = LANGUAGE_LABELS[i];
    select.appendChild(opt);
  });
}

document.getElementById('new-subject-btn').addEventListener('click', () => {
  document.getElementById('create-form').reset();
  selectedColor = SUBJECT_COLORS[0];
  selectedIcon = DEFAULT_SUBJECT_ICON;
  selectedPlanIndex = 0;
  buildColorPicker();
  buildIconPicker();
  buildPlanPicker();
  document.getElementById('plan-extended-note').hidden = true;
  setStatus('create-status', '', null);
  showView('view-create');
});

function setStatus(elId, message, kind) {
  const el = document.getElementById(elId);
  el.textContent = message;
  el.hidden = !message;
  el.className = 'status' + (kind ? ' ' + kind : '');
}

document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('create-submit');
  const name = document.getElementById('create-name').value.trim();
  const files = Array.from(document.getElementById('create-files').files);
  const language = document.getElementById('create-language').value || null;

  if (!name || files.length === 0) return;

  submitBtn.disabled = true;
  setStatus('create-status', 'Extrayendo texto de los archivos…', null);

  try {
    const { text, failed } = await extractAllText(files);
    if (!text.trim()) {
      setStatus('create-status', 'No se pudo leer ningún archivo.', 'error');
      return;
    }
    if (failed.length > 0) {
      setStatus('create-status', `Aviso: no se pudieron leer: ${failed.join(', ')}. Continuando con el resto…`, null);
    }

    const { data: userData } = await sb.auth.getUser();
    const user = userData.user;
    const plan = PLAN_OPTIONS[selectedPlanIndex];
    const fileNames = files.map((f) => f.name).join(', ');

    const resolvedLanguage = language ?? detectLanguageFallback();

    const { data, error } = await sb
      .from('subjects')
      .insert({
        user_id: user.id,
        name,
        file_name: fileNames,
        color: selectedColor,
        icon: selectedIcon,
        total_plan_days: plan.days,
        source_text: text,
        language: resolvedLanguage,
      })
      .select('id')
      .single();

    if (error) {
      if (error.message.includes('device_already_used')) {
        setStatus('create-status', 'Esta cuenta no puede crear más asignaturas gratis desde este dispositivo. Hazte Premium o apela desde la app.', 'error');
      } else if (error.message.includes('free_subject_limit_reached')) {
        setStatus('create-status', 'Has alcanzado el límite de asignaturas gratuitas. Hazte Premium para crear más.', 'error');
      } else if (error.message.includes('premium_subject_limit_reached')) {
        setStatus('create-status', 'Has alcanzado el límite de asignaturas de tu cuenta Premium.', 'error');
      } else {
        setStatus('create-status', 'Error creando la asignatura: ' + error.message, 'error');
      }
      return;
    }

    setStatus('create-status', 'Asignatura creada. Las lecciones se generarán en unos minutos, igual que en la app.', 'ok');
    await loadSubjects();
    setTimeout(() => showView('view-dashboard'), 1200);
  } catch (err) {
    console.error(err);
    setStatus('create-status', 'Error inesperado: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

// upload_screen.dart usa el idioma de la interfaz como último recurso si no
// se detecta ninguno; aquí no hay selector de interfaz, así que caemos
// directamente a español.
function detectLanguageFallback() {
  return 'es';
}

// ---------- Añadir contenido ----------

let addContentSubjectId = null;

function openAddContent(subject) {
  addContentSubjectId = subject.id;
  document.getElementById('add-content-subject-name').textContent = subject.name;
  document.getElementById('add-content-form').reset();
  document.getElementById('add-content-days').value = 30;
  setStatus('add-content-status', '', null);
  showView('view-add-content');
}

const ADD_CONTENT_ERRORS = {
  missing_source_text: 'No se pudo extraer texto de los archivos.',
  invalid_day_count: 'El número de días debe estar entre 1 y 90.',
  unauthorized: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  premium_required: 'Esta función requiere Premium, igual que en la app.',
  subject_not_found: 'No se encontró la asignatura.',
  generation_in_progress: 'La asignatura todavía está generando lecciones. Espera un poco y vuelve a intentarlo.',
  plan_length_limit_reached: 'Esta asignatura ya alcanzó el máximo de días de plan.',
  add_content_failed: 'No se pudo añadir el contenido.',
};

document.getElementById('add-content-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('add-content-submit');
  const files = Array.from(document.getElementById('add-content-files').files);
  const dayCount = parseInt(document.getElementById('add-content-days').value, 10);

  if (!addContentSubjectId || files.length === 0) return;

  submitBtn.disabled = true;
  setStatus('add-content-status', 'Extrayendo texto de los archivos…', null);

  try {
    const { text, failed } = await extractAllText(files);
    if (!text.trim()) {
      setStatus('add-content-status', 'No se pudo leer ningún archivo.', 'error');
      return;
    }
    if (failed.length > 0) {
      setStatus('add-content-status', `Aviso: no se pudieron leer: ${failed.join(', ')}. Continuando con el resto…`, null);
    }

    const { data, error } = await sb.functions.invoke('add-subject-content', {
      body: { subjectId: addContentSubjectId, sourceText: text, dayCount },
    });

    if (error) {
      const code = await tryReadErrorCode(error);
      const message = ADD_CONTENT_ERRORS[code] || 'No se pudo añadir el contenido: ' + error.message;
      setStatus('add-content-status', message, 'error');
      return;
    }

    setStatus('add-content-status', 'Contenido añadido. Se generará en unos minutos, igual que en la app.', 'ok');
    await loadSubjects();
    setTimeout(() => showView('view-dashboard'), 1200);
  } catch (err) {
    console.error(err);
    setStatus('add-content-status', 'Error inesperado: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

async function tryReadErrorCode(error) {
  try {
    const body = await error.context.json();
    return body?.error ?? null;
  } catch {
    return null;
  }
}

// ---------- Arranque ----------

buildLanguagePicker();
refreshSession();
