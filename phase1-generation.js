// Replica LessonProvider.generateAndSaveLessons (lib/models/lesson.dart:575-663)
// — justo después de crear una asignatura, la app genera de forma síncrona
// los primeros días (mientras muestra su pantalla de "generando") para que
// al entrar ya haya contenido; el resto del plan lo rellena solo el cron en
// segundo plano (process-generation-queue). Sin este paso, una asignatura
// creada aquí se veía como "vacía, añade documentos" en la app hasta que el
// cron arrancaba por su cuenta.

const K_INITIAL_BLOCKING_DAYS = 2;
const REQUEST_GAP_MS = 5000; // mismo ritmo que _requestGap en lesson.dart

// onProgress(day, totalDays) se llama tras guardar cada día, para que la UI
// pueda mostrar progreso igual que AILoadingScreen en la app.
async function generateInitialDays(subjectId, sourceText, totalPlanDays, onProgress) {
  const totalDays = totalPlanDays;
  const chunks = chunkTextForPlan(sourceText, totalDays);
  const initialBatchDays = Math.min(totalDays, K_INITIAL_BLOCKING_DAYS);

  const { data: userData } = await sb.auth.getUser();
  const userId = userData.user.id;

  const claimed = await claimSubjectWithRetry(subjectId);
  if (!claimed) {
    // No es fatal — el cron en background recogerá la asignatura por su
    // cuenta en cuanto le toque (claim_next_subject_for_generation).
    return { generatedDays: 0, quotaExceeded: false };
  }

  let generatedDays = 0;
  let quotaExceeded = false;

  for (let day = 0; day < initialBatchDays; day++) {
    if (day > 0) await claimSubjectWithRetry(subjectId);

    let batch;
    try {
      batch = await generateBatch(chunks[day], day + 1, subjectId);
    } catch (e) {
      if (e.quotaExceeded) {
        quotaExceeded = true;
        break;
      }
      console.error(`Error generando día ${day + 1}:`, e);
      break;
    }
    if (!batch || batch.length === 0) break;

    try {
      await saveDays(batch, { userId, subjectId, globalStartIndex: day });
    } catch (e) {
      console.error(`Error guardando lecciones iniciales (día ${day + 1}):`, e);
      break;
    }
    generatedDays = day + 1;
    if (onProgress) onProgress(generatedDays, initialBatchDays);

    if (day !== initialBatchDays - 1) {
      await sleep(REQUEST_GAP_MS);
    }
  }

  return { generatedDays, quotaExceeded };
}

async function claimSubjectWithRetry(subjectId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data: claimed } = await sb.rpc('claim_subject_for_generation', {
        p_subject_id: subjectId,
        p_lock_seconds: 30,
      });
      if (claimed === true) return true;
    } catch (e) {
      console.error(`Error reservando asignatura ${subjectId} para generación:`, e);
    }
    if (attempt < 2) await sleep(1000);
  }
  return false;
}

async function generateBatch(contextText, startDay, subjectId) {
  const { data, error } = await sb.functions.invoke('generate-lessons', {
    body: { contextText, startDay, batchDays: 1, subjectId },
  });
  if (error) {
    const code = await tryReadErrorCode(error);
    if (code === 'quota_exceeded') {
      const err = new Error('quota_exceeded');
      err.quotaExceeded = true;
      throw err;
    }
    throw error;
  }
  if (data && Array.isArray(data.lessons)) return data.lessons;
  return null;
}

async function saveDays(dayList, { userId, subjectId, globalStartIndex }) {
  for (let i = 0; i < dayList.length; i++) {
    const dayObj = dayList[i];
    const sortOrder = globalStartIndex + i;
    const title = `Sesión ${sortOrder + 1}`;
    const description = String(dayObj.description ?? '');
    const shouldLock = await shouldLockNewLesson(subjectId, sortOrder);

    const { data: lessonRow, error } = await sb
      .from('lessons')
      .insert({
        user_id: userId,
        title,
        description,
        is_completed: false,
        is_locked: shouldLock,
        subject_id: subjectId,
        sort_order: sortOrder,
      })
      .select('id')
      .single();
    if (error) throw error;

    await saveActivities(dayObj, lessonRow.id);
  }
}

async function shouldLockNewLesson(subjectId, sortOrder) {
  if (sortOrder <= 0) return sortOrder > 0;
  try {
    const { data: prev } = await sb
      .from('lessons')
      .select('is_completed')
      .eq('subject_id', subjectId)
      .eq('sort_order', sortOrder - 1)
      .maybeSingle();
    if (!prev || prev.is_completed === true) return false;
    return true;
  } catch (e) {
    console.error('Error comprobando lección previa:', e);
    return true;
  }
}

async function saveActivities(dayObj, lessonId) {
  const rawActivities = Array.isArray(dayObj.activities) ? dayObj.activities : null;
  const activities = rawActivities && rawActivities.length > 0 ? rawActivities : [dayObj];
  for (let i = 0; i < activities.length; i++) {
    await insertActivity(activities[i], lessonId, i);
  }
}

async function insertActivity(act, lessonId, orderIndex) {
  const options = Array.isArray(act.options) && act.options.length > 0
    ? act.options.map((o) => String(o))
    : null;
  const explanation = String(act.explanation ?? '');
  const extraData = act.extra_data && typeof act.extra_data === 'object' ? act.extra_data : {};
  const topic = typeof act.topic === 'string' && act.topic.trim().length > 0 ? act.topic.trim() : null;

  const { error } = await sb.from('activities').insert({
    lesson_id: lessonId,
    activity_type: String(act.type ?? 'quiz'),
    question: String(act.question ?? ''),
    options,
    correct_answer: String(act.correct_answer ?? ''),
    explanation: explanation.length > 0 ? explanation : null,
    data: Object.keys(extraData).length > 0 ? extraData : null,
    is_practice: act.practice === true,
    topic,
    order_index: orderIndex,
  });
  if (error) throw error;
}

async function tryReadErrorCode(error) {
  try {
    const body = await error.context.json();
    return body?.error ?? null;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
