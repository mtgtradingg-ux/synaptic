// Extrae y concatena el texto de varios archivos (PDF/TXT) igual que
// upload_screen.dart:590-613 (_extractAllText): un encabezado
// "===== nombre =====" por archivo, separados por línea en blanco, para que
// un chunk que abarque dos archivos siga leyéndose como un cambio de tema
// claro.

async function extractPdfPageText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => item.str).join(' '));
  }
  return { text: pageTexts.join('\n\n'), pageCount: pdf.numPages };
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Devuelve { text, failed } — failed son los nombres de archivo que no se
// pudieron leer, igual que la lista `failed` de _extractAllText.
async function extractAllText(files) {
  let buffer = '';
  const failed = [];
  for (const file of files) {
    try {
      let text;
      const isPdf = file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await extractPdfPageText(arrayBuffer);
        text = result.text;
      } else {
        text = await readTextFile(file);
      }
      if (buffer.length > 0) buffer += '\n\n';
      buffer += `===== ${file.name} =====\n${text}`;
    } catch (e) {
      console.error(`Error extrayendo texto de ${file.name}:`, e);
      failed.push(file.name);
    }
  }
  return { text: buffer, failed };
}

// Recupera la lista de nombres de archivo ya metidos en un source_text
// (el de subjects o el de cualquier subject_content_batches), leyendo los
// encabezados "===== nombre =====" que escribe extractAllText — así la
// web puede mostrar qué archivos ya tiene una asignatura sin necesitar
// guardarlos aparte en ningún sitio.
function extractFileNamesFromText(text) {
  if (!text) return [];
  const names = [];
  const re = /^===== (.+) =====$/gm;
  let match;
  while ((match = re.exec(text)) !== null) {
    names.push(match[1]);
  }
  return names;
}
