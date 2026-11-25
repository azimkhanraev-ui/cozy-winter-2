// Строки интерфейса RU/EN. Чистый модуль.
export type Lang = 'ru' | 'en';

const S = {
  hand: ['Рука', 'Hand'],
  shovel: ['Лопата', 'Shovel'],
  eraser: ['Ластик', 'Eraser'],
  blower: ['Снегодув', 'Snow blower'],
  heat: ['Тепло (фен)', 'Heat (hair dryer)'],
  add: ['Насыпать', 'Add snow'],
  ball: ['Шар', 'Snowball'],
  ballS: ['Шар S', 'Ball S'],
  ballM: ['Шар M', 'Ball M'],
  ballL: ['Шар L', 'Ball L'],
  ballXL: ['Шар XL', 'Ball XL'],
  roll: ['Катать ком', 'Roll a ball'],
  steps: ['Шаги', 'Footsteps'],
  angel: ['Снежный ангел', 'Snow angel'],
  tree: ['Ёлка', 'Fir tree'],
  throw: ['Снежок (бой)', 'Throw snowball'],
  drive: ['Рулить снегоуборщиком', 'Drive the plow'],
  undo: ['Отменить (Ctrl+Z)', 'Undo (Ctrl+Z)'],
  redo: ['Повторить (Ctrl+Y)', 'Redo (Ctrl+Y)'],
  clear: ['Очистить снег', 'Clear snow'],
  dust: ['Присыпать всё', 'Cover with snow'],
  pause: ['Пауза', 'Pause'],
  resume: ['Продолжить', 'Resume'],
  settings: ['Настройки', 'Settings'],
  camera: ['Снимок в «Изображения»', 'Screenshot to Pictures'],
  shake: ['Встряхнуть (снежный шар)', 'Shake (snow globe)'],
  winterMinute: ['Зима за минуту', 'Winter in a minute'],
  close: ['Закрыть инструменты (Esc)', 'Close tools (Esc)'],
  size: ['Размер', 'Size'],
  hintOrder: ['Большой шар должен быть снизу', 'The biggest ball goes at the bottom'],
  hintCrooked: ['Поставьте шары ровнее', 'Stack the balls straighter'],
  shotSaved: ['Снимок сохранён', 'Screenshot saved'],
  limitSnowmen: ['Достигнут лимит снеговиков', 'Snowman limit reached'],
  tour1: ['Снег копится на панели задач и сам ложится сугробами. Клики проходят сквозь него.', 'Snow piles up on the taskbar by itself. Clicks pass through it.'],
  tour2: ['Нажмите снежинку внизу или Ctrl+Alt+S — появятся инструменты: лопата, шары, снегодув…', 'Click the snowflake below or press Ctrl+Alt+S to open the tools: shovel, snowballs, blower…'],
  tour3: ['Скатайте три шара (большой внизу) и поставьте друг на друга — получится снеговик!', 'Roll three balls (biggest at the bottom) and stack them — you get a snowman!'],
  next: ['Далее', 'Next'],
  gotIt: ['Понятно', 'Got it'],
  customize: ['Снеговик', 'Snowman'],
  name: ['Имя', 'Name'],
  hat: ['Шапка', 'Hat'],
  scarf: ['Шарф', 'Scarf'],
  nose: ['Нос', 'Nose'],
  broom: ['Метла', 'Broom'],
  hatBucket: ['Ведро', 'Bucket'],
  hatTop: ['Цилиндр', 'Top hat'],
  hatKnit: ['Вязаная шапка', 'Knit hat'],
  hatNone: ['Без шапки', 'No hat'],
  noseCarrot: ['Морковка', 'Carrot'],
  noseLong: ['Длинная морковка', 'Long carrot'],
  noseButton: ['Пуговка', 'Button'],
  done: ['Готово', 'Done'],
  melt: ['Растопить', 'Melt'],
  winterOn: ['Зима за минуту: ускорение ×25', 'Winter in a minute: ×25'],
} as const;

export type Key = keyof typeof S;

export function t(lang: Lang, key: Key): string {
  const e = S[key];
  return lang === 'en' ? e[1] : e[0];
}

export const PHRASES: Record<Lang, string[]> = {
  ru: [
    'Какой чудесный снег!',
    'Мне совсем не холодно.',
    'Кто-нибудь видел мою морковку?',
    'Ух, ветрено сегодня!',
    'Люблю зиму!',
    'Только не включай фен…',
    'Слепи мне друга!',
    'Работаешь? Я посторожу рабочий стол.',
    'Снежинки щекотно!',
    'Скоро Новый год!',
    'Сделай перерыв, выпей чаю.',
    'Я самый красивый снеговик на этом мониторе.',
  ],
  en: [
    'What wonderful snow!',
    "I'm not cold at all.",
    'Has anyone seen my carrot?',
    "Whoa, it's windy today!",
    'I love winter!',
    "Please don't use the hair dryer…",
    'Build me a friend!',
    "Working? I'll guard the desktop.",
    'Snowflakes tickle!',
    'New Year is coming!',
    'Take a break, have some tea.',
    "I'm the handsomest snowman on this monitor.",
  ],
};

export const NAMES: Record<Lang, string[]> = {
  ru: ['Снежок', 'Морозик', 'Пушок', 'Валенок', 'Сугробыч', 'Льдинка', 'Метелька', 'Буран', 'Кругляш', 'Хрустик', 'Ёжик', 'Сосулька'],
  en: ['Frosty', 'Flurry', 'Chilly', 'Snowball', 'Puffy', 'Crispin', 'Blizzard', 'Sleet', 'Button', 'Twig', 'Icicle', 'Nippy'],
};
