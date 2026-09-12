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

// Pestañas "Email y contraseña" / "Tengo un código" — solo cambian qué
// formulario de login se ve, ambos viven en la misma vista.
document.querySelectorAll('[data-login-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-login-tab]').forEach((t) => t.classList.remove('selected'));
    tab.classList.add('selected');
    const mode = tab.dataset.loginTab;
    document.querySelectorAll('.login-mode').forEach((form) => {
      form.hidden = form.dataset.mode !== mode;
    });
  });
});

const CODE_LOGIN_ERRORS = {
  missing_code: 'Escribe un código.',
  invalid_code: 'Código incorrecto.',
  code_expired: 'Este código ha caducado. Genera uno nuevo desde la app.',
  code_already_used: 'Este código ya se usó. Genera uno nuevo desde la app.',
  user_not_found: 'No se encontró la cuenta de ese código.',
  no_email_on_account: 'Tu cuenta no tiene un email asociado; contacta con soporte.',
  exchange_failed: 'No se pudo iniciar sesión con ese código.',
};

document.getElementById('code-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('login-code').value.trim().toUpperCase();
  const errorEl = document.getElementById('code-login-error');
  errorEl.hidden = true;

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/exchange-web-login-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ code }),
    });
    const body = await resp.json();

    if (!resp.ok) {
      errorEl.textContent = CODE_LOGIN_ERRORS[body.error] || 'No se pudo iniciar sesión con ese código.';
      errorEl.hidden = false;
      return;
    }

    const { error } = await sb.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    });
    if (error) {
      errorEl.textContent = 'No se pudo iniciar sesión: ' + error.message;
      errorEl.hidden = false;
      return;
    }
    await refreshSession();
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Error de red al canjear el código.';
    errorEl.hidden = false;
  }
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

  // is_combined = true es el "Camino combinado" (Sesión general, ver
  // supabase_schema_combined_path.sql) — una fila especial en `subjects`
  // que la app usa internamente para mezclar un poco de cada asignatura,
  // no algo que el usuario cree o gestione. La propia app la excluye igual
  // (SubjectProvider.subjects en lib/models/subject.dart:215).
  const { data, error } = await sb
    .from('subjects')
    .select('id, name, color, icon, total_plan_days, language')
    .eq('user_id', user.id)
    .eq('is_combined', false)
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

    // Igual que hace la app justo tras crear una asignatura (Fase 1, ver
    // LessonProvider.generateAndSaveLessons): generar el primer día (o dos)
    // ya mismo, para que al abrir la app no se vea como "vacía, añade
    // documentos" mientras el cron de fondo arranca por su cuenta.
    setStatus('create-status', 'Generando los primeros días…', null);
    try {
      const { generatedDays, quotaExceeded } = await generateInitialDays(
        data.id, text, plan.days,
        (done, total) => setStatus('create-status', `Generando los primeros días… (${done}/${total})`, null),
      );
      if (quotaExceeded) {
        setStatus('create-status', 'Asignatura creada. Se ha alcanzado el límite de generación por ahora; el resto se irá completando más adelante.', 'ok');
      } else if (generatedDays === 0) {
        setStatus('create-status', 'Asignatura creada. Empezará a generarse en unos minutos, igual que en la app.', 'ok');
      } else {
        setStatus('create-status', 'Asignatura creada y lista para abrir en la app.', 'ok');
      }
    } catch (genErr) {
      console.error('Error generando los primeros días:', genErr);
      setStatus('create-status', 'Asignatura creada. Empezará a generarse en unos minutos, igual que en la app.', 'ok');
    }

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
let existingFileNames = [];

async function openAddContent(subject) {
  addContentSubjectId = subject.id;
  document.getElementById('add-content-subject-name').textContent = subject.name;
  document.getElementById('add-content-form').reset();
  setStatus('add-content-status', '', null);
  document.getElementById('add-content-duplicate-warning').hidden = true;
  showView('view-add-content');

  const listEl = document.getElementById('add-content-existing-files');
  listEl.innerHTML = '<li class="file-list-empty">Cargando…</li>';
  const remainingEl = document.getElementById('add-content-remaining-days');
  remainingEl.textContent = 'Calculando días restantes…';

  const [names] = await Promise.all([
    loadExistingFileNames(subject.id),
    renderRemainingDays(subject),
  ]);
  existingFileNames = names;
  renderExistingFiles();
}

// El contenido nuevo ya no amplía el plan — se reparte entre los días que
// todavía no tienen lección generada (mismo criterio que el edge function:
// count(lessons), no is_locked). Se muestra solo a título informativo; el
// propio edge function es quien decide de verdad si cabe o no.
async function renderRemainingDays(subject) {
  const remainingEl = document.getElementById('add-content-remaining-days');
  const { count } = await sb
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('subject_id', subject.id);
  const total = subject.total_plan_days ?? 0;
  const remaining = Math.max(total - (count ?? 0), 0);
  remainingEl.textContent = remaining > 0
    ? `Quedan ${remaining} de ${total} días sin generar — el contenido nuevo se repartirá entre ellos, sin alargar el plan.`
    : `Ya se generaron los ${total} días de este plan; no se puede añadir más contenido sin estudiar primero para liberar días.`;
}

// Reconstruye qué archivos tiene ya una asignatura leyendo los encabezados
// "===== nombre =====" del source_text original y de cada lote añadido
// después (subject_content_batches) — no hay ninguna tabla que guarde los
// nombres por separado, así que se extraen del propio texto guardado.
async function loadExistingFileNames(subjectId) {
  const [{ data: subjectRow }, { data: batchRows }] = await Promise.all([
    sb.from('subjects').select('source_text').eq('id', subjectId).maybeSingle(),
    sb.from('subject_content_batches').select('source_text').eq('subject_id', subjectId),
  ]);

  const names = extractFileNamesFromText(subjectRow?.source_text);
  for (const batch of batchRows || []) {
    names.push(...extractFileNamesFromText(batch.source_text));
  }
  return names;
}

function renderExistingFiles() {
  const listEl = document.getElementById('add-content-existing-files');
  listEl.innerHTML = '';
  if (existingFileNames.length === 0) {
    listEl.innerHTML = '<li class="file-list-empty">Todavía no hay archivos.</li>';
    return;
  }
  for (const name of existingFileNames) {
    const li = document.createElement('li');
    li.innerHTML = `<span data-lucide="file-check"></span> ${escapeHtml(name)}`;
    listEl.appendChild(li);
  }
  renderIcons();
}

// Avisa si alguno de los archivos que se acaban de elegir para subir
// coincide (por nombre) con uno que la asignatura ya tiene, para no
// duplicar apuntes sin darse cuenta.
document.getElementById('add-content-files').addEventListener('change', (e) => {
  const warningEl = document.getElementById('add-content-duplicate-warning');
  const selected = Array.from(e.target.files).map((f) => f.name);
  const duplicates = selected.filter((name) => existingFileNames.includes(name));
  if (duplicates.length > 0) {
    warningEl.textContent = `Ya subiste antes: ${duplicates.join(', ')}. Si continúas, ese contenido se duplicará.`;
    warningEl.hidden = false;
  } else {
    warningEl.hidden = true;
  }
});

const ADD_CONTENT_ERRORS = {
  missing_source_text: 'No se pudo extraer texto de los archivos.',
  unauthorized: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  premium_required: 'Esta función requiere Premium, igual que en la app.',
  subject_not_found: 'No se encontró la asignatura.',
  plan_fully_generated: 'Ya se generaron todos los días de este plan; no se puede añadir más contenido sin estudiar primero para liberar días.',
  content_too_large_for_remaining_days: 'Hay demasiado contenido para los días que quedan sin generar. Prueba con menos archivos, o espera a tener más días libres.',
  plan_changed_retry: 'La asignatura cambió mientras se procesaba. Vuelve a intentarlo.',
  add_content_failed: 'No se pudo añadir el contenido.',
};

document.getElementById('add-content-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('add-content-submit');
  const files = Array.from(document.getElementById('add-content-files').files);

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
      body: { subjectId: addContentSubjectId, sourceText: text },
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
