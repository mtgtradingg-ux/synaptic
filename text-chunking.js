// Puerto literal de supabase/functions/_shared/text-chunking.ts (a su vez
// puerto de lib/core/text_chunking.dart) — TIENE que producir exactamente
// los mismos chunks que esos dos para el mismo texto+totalDays, porque el
// cron (process-generation-queue) re-deriva el chunk del día N a partir de
// subjects.source_text en vez de guardarlo en ninguna tabla. Si este
// algoritmo diverge, un día generado aquí (Fase 1) usaría un trozo de texto
// distinto al que el cron usaría para ese mismo día más adelante.

const K_MAX_CHARS_PER_CHUNK = 16000;
const K_CHUNK_OVERLAP = 150;

function chunkTextForPlan(text, totalDays) {
  if (totalDays <= 0) return [];
  if (text.length <= K_MAX_CHARS_PER_CHUNK) {
    return new Array(totalDays).fill(text);
  }

  const targetChunkSize = Math.ceil(text.length / totalDays);
  const chunks = [];
  let start = 0;
  for (let day = 0; day < totalDays; day++) {
    if (start >= text.length) {
      chunks.push(chunks.length > 0 ? chunks[chunks.length - 1] : '');
      continue;
    }
    const rawEnd = clamp(start + targetChunkSize, 0, text.length);
    const end = day === totalDays - 1
      ? text.length
      : clamp(nearestBreak(text, rawEnd), start + 1, text.length);

    const chunkStart = clamp(start - (day === 0 ? 0 : K_CHUNK_OVERLAP), 0, text.length);
    let chunk = text.slice(chunkStart, end);
    if (chunk.length > K_MAX_CHARS_PER_CHUNK + K_CHUNK_OVERLAP) {
      chunk = chunk.slice(0, K_MAX_CHARS_PER_CHUNK + K_CHUNK_OVERLAP);
    }
    chunks.push(chunk);
    start = end;
  }
  return chunks;
}

function nearestBreak(text, target) {
  const window = 200;
  const from = clamp(target - window, 0, text.length);
  const to = clamp(target + window, 0, text.length);
  const slice = text.slice(from, to);
  const localTarget = clamp(target - from, 0, slice.length);

  const paragraphIdx = slice.indexOf('\n\n', localTarget);
  if (paragraphIdx !== -1) return from + paragraphIdx + 2;

  const rest = slice.slice(localTarget);
  const sentenceMatch = rest.match(/[.!?]\s/);
  if (sentenceMatch && sentenceMatch.index !== undefined) {
    return localTarget + from + sentenceMatch.index + sentenceMatch[0].length;
  }
  return target;
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}
