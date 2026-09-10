// Estas constantes replican exactamente lib/models/subject.dart y
// lib/screens/upload/upload_screen.dart de la app Flutter, para que una
// asignatura creada desde aquí se vea y se comporte igual que una creada
// desde el móvil. Si esos archivos cambian en la app, actualiza esto a mano.

// lib/models/subject.dart:7-28
const SUBJECT_COLORS = [
  '#2E8B57', // Sea Green
  '#4682B4', // Steel Blue
  '#CD853F', // Earth Brown
  '#9370DB', // Purple
  '#FF7043', // Coral Orange
  '#00838F', // Teal
  '#558B2F', // Olive Green
  '#AD1457', // Dark Pink
  '#E53935', // Red
  '#FDD835', // Yellow
  '#3F51B5', // Indigo
  '#00ACC1', // Cyan
  '#EC407A', // Pink
  '#8D6E63', // Taupe
  '#7CB342', // Lime Green
  '#FFA000', // Amber
  '#5C6BC0', // Blue Violet
  '#26A69A', // Teal Green
  '#D81B60', // Magenta
  '#607D8B', // Blue Grey
];

const DEFAULT_SUBJECT_ICON = 'book-open';

// lib/models/subject.dart:35-63 — la clave es lo que se guarda en
// subjects.icon; también es el nombre del icono de Lucide que usamos aquí.
const SUBJECT_ICONS = [
  'book-open', 'graduation-cap', 'calculator', 'flask-conical', 'atom',
  'microscope', 'leaf', 'telescope', 'globe', 'landmark', 'scale',
  'briefcase', 'chart-bar', 'brain', 'languages', 'palette', 'music',
  'dumbbell', 'heart-pulse', 'code', 'cpu', 'database', 'compass',
  'pencil-ruler', 'building', 'users', 'notebook',
];

// upload_screen.dart:500-501
const LANGUAGE_CODES = ['es', 'en', 'fr', 'de', 'pt'];
const LANGUAGE_LABELS = ['Español', 'English', 'Français', 'Deutsch', 'Português'];

// upload_screen.dart:485-491 — meses -> días (30 días/mes); la última
// opción reutiliza el mismo cupo de 3 meses pero se amplía sola más
// adelante (nota "extendida" en la propia app).
const PLAN_OPTIONS = [
  { label: '1 mes', days: 30 },
  { label: '2 meses', days: 60 },
  { label: '3 meses', days: 90 },
  { label: 'Más de 3 meses', days: 90, extended: true },
];
