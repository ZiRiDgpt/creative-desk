const users = [
  { id: 'buyer', role: 'buyer', name: 'Анна Волкова', initials: 'АВ', label: 'Байер', color: 'violet' },
  { id: 'artist', role: 'artist', name: 'Марк Соколов', initials: 'МС', label: 'Креативщик', color: 'mint' },
  { id: 'artist2', role: 'artist', name: 'Лена Ким', initials: 'ЛК', label: 'Креативщик', color: 'rose' },
  { id: 'lead', role: 'lead', name: 'Денис Орлов', initials: 'ДО', label: 'Руководитель', color: 'amber' },
];

const maxFile = 1024 * 1024;
export const maxRequestSize = 1_200_000;
const day = 86_400_000;
const sessionAge = 7 * 86400;
const sharedWorkspace = 'legacy';
const taskTypes = ['Статика', 'Видео', 'UGC', 'Анимация', 'Другое'];
const priorities = ['low', 'normal', 'high'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function required(value, limit, label, optional = false) {
  if (typeof value !== 'string' || value.trim().length > limit || (!optional && !value.trim())) {
    throw new HttpError(400, `Проверьте поле «${label}» (до ${limit} символов).`);
  }
  return value.trim();
}

function link(value) {
  const url = required(value, 1500, 'Ссылка');
  try {
    if (['http:', 'https:'].includes(new URL(url).protocol)) return url;
  } catch {
    // Return the same validation error for invalid syntax and unsupported schemes.
  }
  throw new HttpError(400, 'Укажите ссылку с http:// или https://.');
}

function readBrief(input) {
  if (!taskTypes.includes(input.type) || !priorities.includes(input.priority)) {
    throw new HttpError(400, 'Выберите тип креатива и приоритет.');
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 999) {
    throw new HttpError(400, 'Укажите количество креативов от 1 до 999.');
  }
  if (typeof input.due !== 'string' || !Number.isFinite(Date.parse(input.due)) ||
      new Date(input.due).toISOString() !== input.due) {
    throw new HttpError(400, 'Укажите дату и время дедлайна.');
  }
  if (!Array.isArray(input.refs) || input.refs.length > 10) {
    throw new HttpError(400, 'Можно указать до 10 ссылок на референсы.');
  }
  return {
    title: required(input.title, 100, 'Название'),
    offer: required(input.offer, 80, 'Оффер'),
    geo: required(input.geo, 30, 'GEO'),
    type: input.type,
    quantity: input.quantity,
    description: required(input.description, 4000, 'Описание'),
    refs: input.refs.map(link),
    priority: input.priority,
    due: input.due,
  };
}

function readCosts(rows) {
  if (!Array.isArray(rows) || rows.length > 10) {
    throw new HttpError(400, 'Можно добавить до 10 AI-сервисов за одну сдачу.');
  }
  return rows.map(row => {
    if (!row || !Number.isFinite(row.credits) || row.credits <= 0 || row.credits > 1_000_000 ||
        Math.abs(row.credits * 100 - Math.round(row.credits * 100)) > 0.000001) {
      throw new HttpError(400, 'Укажите положительное число кредитов с точностью до сотых.');
    }
    return { service: required(row.service, 50, 'AI-сервис'), credits: row.credits };
  });
}

function taskKey(workspace, id) {
  return workspace === sharedWorkspace ? id : `${workspace}:${id}`;
}

function decode({ workspace_id, ...row }) {
  return {
    ...row,
    id: row.id.split(':').at(-1),
    brief: JSON.parse(row.brief),
    history: JSON.parse(row.history),
    submissions: JSON.parse(row.submissions),
  };
}

function event(action, actor, at, status, note = '') {
  return { action, actor, at, status, note };
}

function demoTask(id, title, offer, geo, type, quantity, priority, status, age, dueDays, assignee, costs = []) {
  const now = Date.now();
  const time = offset => new Date(now + offset * day).toISOString();
  const created = time(-age);
  const started = status === 'new' ? null : time(-age + 0.15);
  const submitted = ['review', 'changes', 'done'].includes(status) ? time(-age + 0.75) : null;
  const completed = status === 'done' ? time(-age + 1.15) : null;
  const history = [event('create', 'buyer', created, 'new')];
  const submissions = [];
  if (started) history.push(event('claim', assignee, started, 'work'));
  if (submitted) {
    history.push(event('submit', assignee, submitted, 'review'));
    submissions.push({ at: submitted, actor: assignee, url: '/sample.svg', file: null, note: 'Первый вариант для проверки.', costs });
  }
  if (status === 'changes') history.push(event('revise', 'buyer', time(-age + 1), 'changes', 'Усильте контраст заголовка и попробуйте другой хук.'));
  if (completed) history.push(event('approve', 'buyer', completed, 'done'));
  const brief = {
    title, offer, geo, type, quantity, priority, due: time(dueDays),
    description: `Подготовить ${quantity} креатив(а) для оффера ${offer}. Адаптировать сообщение под ${geo}. В первом варианте сделать акцент на оффере, во втором — на визуальном хуке.`,
    refs: [],
  };
  return [id, status, 'buyer', assignee, created, started, submitted, completed, JSON.stringify(brief), JSON.stringify(history), JSON.stringify(submissions)];
}

async function seed(db, workspace) {
  if (await db.prepare('SELECT id FROM tasks WHERE id = ?').bind(taskKey(workspace, '101')).first()) return;
  const samples = [
    ['101', 'Баннеры для летнего запуска', 'FitLab', 'DE', 'Статика', 4, 'high', 'new', 0.1, 1, null],
    ['102', 'UGC-хуки для TikTok', 'GlowUp', 'US', 'UGC', 3, 'normal', 'new', 0.2, 3, null],
    ['103', 'Адаптация сторис 9:16', 'FinPilot', 'PL', 'Статика', 6, 'low', 'new', 0.35, 4, null],
    ['104', 'Видеокреативы для ретаргета', 'NovaPay', 'GB', 'Видео', 2, 'high', 'work', 2, -0.1, 'artist'],
    ['105', 'Баннеры для Meta Ads', 'FitLab', 'ES', 'Статика', 5, 'normal', 'work', 1.5, 2, 'artist2'],
    ['106', 'Анимация для вертикального плейсмента', 'GlowUp', 'US', 'Анимация', 2, 'normal', 'review', 2.5, 1.5, 'artist', [{ service: 'Runway', credits: 38 }]],
    ['107', 'Три варианта первого кадра', 'NovaPay', 'CA', 'Видео', 3, 'high', 'changes', 3, 0.5, 'artist2', [{ service: 'Midjourney', credits: 14 }]],
    ['108', 'Карусель для промо оффера', 'FinPilot', 'PL', 'Статика', 4, 'normal', 'done', 4, -1, 'artist', [{ service: 'Midjourney', credits: 32 }, { service: 'ChatGPT', credits: 8 }]],
    ['109', 'Видео для теста гипотезы', 'FitLab', 'DE', 'Видео', 2, 'low', 'done', 5, -2, 'artist2', [{ service: 'Runway', credits: 24 }, { service: 'ChatGPT', credits: 8 }]],
  ];
  await db.batch(samples.map(([id, ...fields]) => db.prepare(
    'INSERT OR IGNORE INTO tasks (id,status,buyer,assignee,created_at,started_at,submitted_at,completed_at,brief,history,submissions,workspace_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  ).bind(...demoTask(taskKey(workspace, id), ...fields), workspace)));
}

function taskStats(tasks) {
  const now = new Date().toISOString();
  const completed = tasks.filter(task => task.completed_at);
  const overdue = tasks.filter(task => !task.completed_at && task.brief.due < now);
  const durations = completed.map(task => Date.parse(task.completed_at) - Date.parse(task.started_at));
  const services = new Map();
  const staff = new Map(users.filter(user => user.role === 'artist').map(user => [
    user.id, { id: user.id, active: 0, done: 0, overdue: 0, credits: 0 },
  ]));
  let totalCredits = 0;
  for (const task of tasks) {
    const person = staff.get(task.assignee);
    if (person) {
      if (task.completed_at) person.done++;
      else person.active++;
      if (overdue.includes(task)) person.overdue++;
    }
    for (const submission of task.submissions) {
      for (const cost of submission.costs) {
        const key = cost.service.toLocaleLowerCase('ru');
        const record = services.get(key) ?? { service: cost.service, credits: 0 };
        const units = Math.round(cost.credits * 100);
        record.credits += units;
        totalCredits += units;
        staff.get(submission.actor).credits += units;
        services.set(key, record);
      }
    }
  }
  return {
    total: tasks.length,
    done: completed.length,
    overdue: overdue.length,
    averageMs: durations.length ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length : null,
    credits: totalCredits / 100,
    staff: [...staff.values()].map(person => ({ ...person, credits: person.credits / 100 })),
    services: [...services.values()].sort((a, b) => b.credits - a.credits).map(row => ({ ...row, credits: row.credits / 100 })),
  };
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

async function object(request) {
  let input;
  try { input = await request.json(); } catch {
    throw new HttpError(400, 'Не удалось прочитать данные формы.');
  }
  if (!input || Array.isArray(input) || typeof input !== 'object') {
    throw new HttpError(400, 'Проверьте данные формы.');
  }
  return input;
}

function cookie(request, id, age) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `desk_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`;
}

async function currentSession(request, db) {
  const id = request.headers.get('cookie')?.match(/(?:^|;\s*)desk_session=([a-f0-9-]{36})(?:;|$)/)?.[1];
  if (!id) return null;
  const session = await db.prepare('SELECT user_id, workspace_id FROM sessions WHERE id = ? AND expires_at > ?').bind(id, Date.now()).first();
  const user = users.find(item => item.id === session?.user_id);
  return user ? { id, user, workspace: session.workspace_id } : null;
}

async function signIn(db, request, session, isolated) {
  const { userId } = await object(request);
  const user = users.find(item => item.id === userId);
  if (!user) throw new HttpError(400, 'Выберите тестовый аккаунт.');
  const id = session?.id ?? crypto.randomUUID();
  const workspace = session?.workspace ?? (isolated ? id : sharedWorkspace);
  const now = Date.now();
  const expiry = now + sessionAge * 1000;
  const expiredBoards = 'SELECT workspace_id FROM sessions WHERE expires_at <= ? AND workspace_id != ? AND id != ?';
  await db.batch([
    db.prepare(`DELETE FROM attachments WHERE workspace_id IN (${expiredBoards})`).bind(now, sharedWorkspace, id),
    db.prepare(`DELETE FROM tasks WHERE workspace_id IN (${expiredBoards})`).bind(now, sharedWorkspace, id),
    db.prepare('DELETE FROM sessions WHERE expires_at <= ? AND id != ?').bind(now, id),
    db.prepare(`INSERT INTO sessions (id, user_id, expires_at, workspace_id) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at`).bind(id, user.id, expiry, workspace),
  ]);
  return json({ user }, 200, { 'Set-Cookie': cookie(request, id, sessionAge) });
}

function displayId() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
}

async function saveTask(db, { user, workspace }, request) {
  if (user.role !== 'buyer') throw new HttpError(403, 'Создавать задачи может байер.');
  const brief = readBrief(await object(request));
  const now = new Date().toISOString();
  const id = displayId();
  const history = [event('create', user.id, now, 'new')];
  await db.prepare('INSERT INTO tasks (id,status,buyer,created_at,brief,history,workspace_id) VALUES (?,?,?,?,?,?,?)')
    .bind(taskKey(workspace, id), 'new', user.id, now, JSON.stringify(brief), JSON.stringify(history), workspace).run();
  return json({ id }, 201);
}

const transitions = {
  claim: { from: ['new'], to: 'work', allowed: user => user.role === 'artist' },
  submit: { from: ['work', 'changes'], to: 'review', allowed: (user, task) => user.id === task.assignee },
  revise: { from: ['review'], to: 'changes', allowed: (user, task) => user.id === task.buyer },
  approve: { from: ['review'], to: 'done', allowed: (user, task) => user.id === task.buyer },
};

async function readSubmission(request, user, at) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) {
    throw new HttpError(415, 'Сдайте результат через форму.');
  }
  let form;
  try { form = await request.formData(); } catch {
    throw new HttpError(400, 'Не удалось прочитать форму сдачи.');
  }
  const note = required(form.get('note') ?? '', 2000, 'Комментарий', true);
  const urlInput = required(form.get('url') ?? '', 1500, 'Ссылка', true);
  const url = urlInput ? link(urlInput) : null;
  const file = form.get('file');
  const upload = file instanceof File && file.size ? file : null;
  if (!url && !upload) throw new HttpError(400, 'Приложите файл или добавьте ссылку.');
  if (upload && upload.size > maxFile) throw new HttpError(413, 'Файл больше 1 МБ. Добавьте ссылку на результат.');
  let costs;
  try { costs = JSON.parse(form.get('costs') ?? '[]'); } catch {
    throw new HttpError(400, 'Проверьте расходы AI.');
  }
  const result = { at, actor: user.id, url, note, costs: readCosts(costs), file: null };
  if (upload) {
    result.file = { id: crypto.randomUUID(), name: upload.name.slice(0, 150) || 'result', size: upload.size };
  }
  return { result, upload };
}

async function changeTask(db, { user, workspace }, request, id, action) {
  const key = taskKey(workspace, id);
  const row = await db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').bind(key, workspace).first();
  if (!row) throw new HttpError(404, 'Задача не найдена.');
  const task = decode(row);
  const transition = transitions[action];
  if (!transition.allowed(user, task)) throw new HttpError(403, 'Действие недоступно для этой роли.');
  if (!transition.from.includes(task.status)) throw new HttpError(409, 'Статус задачи изменился. Обновите доску.');
  const now = new Date().toISOString();
  const submittedVersion = Number(request.headers.get('x-task-version'));
  if (!request.headers.has('x-task-version') || submittedVersion !== task.version) {
    throw new HttpError(409, 'Задача изменилась. Обновите доску.');
  }
  let note = '';
  let attachment = null;
  if (action === 'claim') {
    task.assignee = user.id;
    task.started_at = now;
  }
  if (action === 'submit') {
    const { result, upload } = await readSubmission(request, user, now);
    task.submissions.push(result);
    task.submitted_at = now;
    if (upload) attachment = [result.file.id, new Uint8Array(await upload.arrayBuffer())];
  }
  if (action === 'revise') note = required((await object(request)).note, 2000, 'Что исправить');
  if (action === 'approve') task.completed_at = now;
  task.history.push(event(action, user.id, now, transition.to, note));
  const update = db.prepare(`UPDATE tasks SET status = ?, assignee = ?, started_at = ?, submitted_at = ?,
    completed_at = ?, history = ?, submissions = ?, version = version + 1 WHERE id = ? AND version = ?`)
    .bind(transition.to, task.assignee, task.started_at, task.submitted_at, task.completed_at,
      JSON.stringify(task.history), JSON.stringify(task.submissions), key, task.version);
  const statements = [update];
  if (attachment) {
    statements.push(db.prepare(`INSERT INTO attachments (id,content,workspace_id) SELECT ?,?,? WHERE EXISTS (
      SELECT 1 FROM tasks WHERE id = ? AND json_extract(submissions, '$[#-1].file.id') = ?
    )`).bind(...attachment, workspace, key, attachment[0]));
  }
  const [updated] = await db.batch(statements);
  if (updated.meta.changes !== 1) throw new HttpError(409, 'Задача изменилась. Обновите доску.');
  return json({ id });
}

export function createApp(assets, { isolated = false } = {}) {
  return async function handle(request, db) {
    const { pathname, origin } = new URL(request.url);
    try {
      if (request.method === 'GET' && Object.hasOwn(assets, pathname)) {
        const [type, body] = assets[pathname];
        return new Response(body, { headers: {
          'Content-Type': type,
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'",
        } });
      }
      if (!pathname.startsWith('/api/')) throw new HttpError(404, 'Страница не найдена.');
      if (Number(request.headers.get('content-length')) > maxRequestSize) {
        throw new HttpError(413, 'Запрос слишком большой. Файл должен быть не больше 1 МБ.');
      }
      if (request.method === 'POST' && request.headers.get('origin') && request.headers.get('origin') !== origin) {
        throw new HttpError(403, 'Недопустимый источник запроса.');
      }
      const session = await currentSession(request, db);
      if (pathname === '/api/session' && request.method === 'GET') {
        return json({ user: session?.user ?? null, users });
      }
      if (pathname === '/api/session' && request.method === 'POST') {
        return await signIn(db, request, session, isolated);
      }
      if (!session) throw new HttpError(401, 'Выберите тестовый аккаунт.');
      const { user, workspace } = session;
      if (pathname === '/api/tasks' && request.method === 'GET') {
        await seed(db, workspace);
        const { results } = await db.prepare('SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC, id').bind(workspace).all();
        const tasks = results.map(decode);
        return json({ tasks, stats: user.role === 'lead' ? taskStats(tasks) : null });
      }
      if (pathname === '/api/tasks' && request.method === 'POST') return await saveTask(db, session, request);
      const transition = pathname.match(/^\/api\/tasks\/([A-Z0-9]+)\/(claim|submit|revise|approve)$/);
      if (transition && request.method === 'POST') {
        return await changeTask(db, session, request, transition[1], transition[2]);
      }
      const filePath = pathname.match(/^\/api\/tasks\/([A-Z0-9]+)\/files\/([a-f0-9-]{36})$/);
      if (filePath && request.method === 'GET') {
        const row = await db.prepare('SELECT submissions FROM tasks WHERE id = ? AND workspace_id = ?')
          .bind(taskKey(workspace, filePath[1]), workspace).first();
        const file = row && JSON.parse(row.submissions).find(item => item.file?.id === filePath[2])?.file;
        const blob = file && await db.prepare('SELECT content FROM attachments WHERE id = ? AND workspace_id = ?').bind(file.id, workspace).first();
        if (!blob) throw new HttpError(404, 'Файл не найден.');
        return new Response(new Uint8Array(blob.content), { headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(file.name).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16)),
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        } });
      }
      throw new HttpError(404, 'Страница не найдена.');
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: 'Ошибка сервера. Попробуйте ещё раз.' }, 500);
    }
  };
}
