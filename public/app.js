const $ = selector => document.querySelector(selector);
const dialog = $('#dialog');
const state = { users: [], user: null, tasks: [], stats: null, page: 'board', scope: 'all', query: '', priority: 'all', type: 'all', taskId: null, busy: false };
const columns = [
  ['new', 'Новые', 'В ожидании исполнителя'],
  ['work', 'В работе', 'Креативы в производстве'],
  ['review', 'На проверке', 'Ожидают решения байера'],
  ['changes', 'Правки', 'Нужна доработка'],
  ['done', 'Готово', 'Результат принят'],
];
const priorities = { low: 'Низкий', normal: 'Средний', high: 'Высокий' };
const types = ['Статика', 'Видео', 'UGC', 'Анимация', 'Другое'];
const actionNames = { create: 'Создал(а) задачу', claim: 'Взял(а) в работу', submit: 'Сдал(а) на проверку', revise: 'Вернул(а) на правки', approve: 'Принял(а) результат' };
const icons = {
  board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-16v16M5.5 8H7m4 0h2m4 0h1.5"/>',
  chart: '<path d="M4 19h16M7 15v-4m5 4V5m5 10V8"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M7.5 3v4m9-4v4m-13 3h17"/>',
  user: '<circle cx="12" cy="8" r="3"/><path d="M5 20v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  spark: '<path d="M12 2c.8 6.2 3.8 9.2 10 10-6.2.8-9.2 3.8-10 10-.8-6.2-3.8-9.2-10-10 6.2-.8 9.2-3.8 10-10Z"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="M12 8v4m0 4h.01M10.3 4.5 3 18a1.5 1.5 0 0 0 1.3 2h15.4a1.5 1.5 0 0 0 1.3-2L13.7 4.5a2 2 0 0 0-3.4 0Z"/>',
  link: '<path d="M10 14 14 10m-6 6-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m2 6a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-1 1"/>',
  file: '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Zm0 0v7h7"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M16 5a3 3 0 0 1 0 6m6 9v-2a4 4 0 0 0-3-4"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5m-4 0a7 7 0 0 1 12-5l3 5m-16 0 3 5a7 7 0 0 0 12-5"/>',
};

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}
function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const userById = id => state.users.find(user => user.id === id);
const taskById = id => state.tasks.find(task => task.id === id);
const isOverdue = task => task.status !== 'done' && Date.parse(task.brief.due) < Date.now();
const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const dateTime = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const statusLabel = status => columns.find(([id]) => id === status)[1];
const avatar = (user, size = '') => `<span class="avatar ${user?.color ?? 'muted'} ${size}" aria-hidden="true">${user?.initials ?? icon('user', 13)}</span>`;
const statusBadge = status => `<span class="status-pill ${status}"><i></i>${statusLabel(status)}</span>`;
const button = (label, action, { style = 'secondary', glyph, attrs = '' } = {}) =>
  `<button type="button" class="button ${style}" data-action="${action}" ${attrs}>${glyph ? icon(glyph, 17) : ''}${label}</button>`;

function duration(ms) {
  if (ms === null || !Number.isFinite(ms)) return '—';
  const mins = Math.max(0, Math.round(ms / 60000));
  if (!mins) return '< 1 мин';
  if (mins < 60) return `${mins} мин`;
  if (mins < 1440) return `${Math.floor(mins / 60)} ч ${mins % 60} мин`;
  return `${Math.floor(mins / 1440)} д ${Math.floor(mins / 60) % 24} ч`;
}

async function api(path, { body, method = 'GET', version } = {}) {
  const headers = {};
  if (version !== undefined) headers['X-Task-Version'] = String(version);
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch('/api' + path, { method, headers, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error ?? 'Не удалось связаться с сервером.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadTasks() {
  const { tasks, stats } = await api('/tasks');
  state.tasks = tasks;
  state.stats = stats;
}

function renderShell() {
  const user = state.user;
  $('#sidebar').innerHTML = `
    <div class="brand"><img src="/mark.svg" width="42" height="42" alt=""><div><strong>Creative Desk</strong><small>РАБОЧЕЕ ПРОСТРАНСТВО</small></div></div>
    <div class="side-content">
      <p class="side-label">ПРОСТРАНСТВО</p>
      <nav class="side-nav">
        <button class="nav-item ${state.page === 'board' ? 'active' : ''}" data-action="board" aria-label="Доска задач" title="Доска задач" ${state.page === 'board' ? 'aria-current="page"' : ''}>${icon('board')}<span>Доска задач</span></button>
        ${user.role === 'lead' ? `<button class="nav-item ${state.page === 'analytics' ? 'active' : ''}" data-action="analytics" aria-label="Аналитика" title="Аналитика" ${state.page === 'analytics' ? 'aria-current="page"' : ''}>${icon('chart')}<span>Аналитика</span></button>` : ''}
      </nav>
    </div>
    <div class="side-bottom">
      <div class="demo-panel"><span class="demo-icon">${icon('spark', 17)}</span><div><strong>Демо-режим</strong><p>Смените аккаунт, чтобы проверить сценарий другой роли.</p></div></div>
      <button class="profile" data-action="accounts" aria-label="Сменить тестовый аккаунт">
        ${avatar(user)}<span class="profile-text"><strong>${user.name}</strong><small>${user.label}</small></span>${icon('chevron', 15)}
      </button>
    </div>`;
  $('#topbar').innerHTML = `
    <div class="breadcrumb"><span class="workspace-icon">${icon('spark', 16)}</span><span>Креативный отдел</span>${icon('right', 14)}<strong>${state.page === 'board' ? 'Доска задач' : 'Аналитика'}</strong></div>
    <div class="top-actions"><span class="demo-badge"><i></i> Демо</span><button class="top-account" data-action="accounts" aria-label="Сменить тестовый аккаунт">${avatar(user, 'small')}<span>${user.label}</span>${icon('chevron', 14)}</button></div>`;
}

function filteredTasks() {
  const needle = state.query.trim().toLocaleLowerCase('ru');
  return state.tasks.filter(task => {
    if (state.scope === 'mine' && ![task.assignee, task.buyer].includes(state.user.id)) return false;
    if (state.scope === 'overdue' && !isOverdue(task)) return false;
    if (state.priority !== 'all' && task.brief.priority !== state.priority) return false;
    if (state.type !== 'all' && task.brief.type !== state.type) return false;
    return [task.id, task.brief.title, task.brief.offer, task.brief.geo].some(value => value.toLocaleLowerCase('ru').includes(needle));
  });
}

function card(task) {
  const { brief } = task;
  const assignee = userById(task.assignee);
  return `<button class="card" data-action="task" data-id="${task.id}">
    <div class="card-top"><span class="task-ref">#${task.id}</span><span class="priority ${brief.priority}"><i></i>${priorities[brief.priority]}</span></div>
    <strong class="card-title">${esc(brief.title)}</strong>
    <div class="card-meta"><span>${esc(brief.offer)}</span><i></i><span>${esc(brief.geo)}</span></div>
    <div class="card-tags"><span>${esc(brief.type)}</span><span>${brief.quantity} шт.</span></div>
    <div class="card-footer"><span class="due ${isOverdue(task) ? 'late' : ''}" title="${isOverdue(task) ? 'Дедлайн прошёл' : 'Дедлайн'}">${icon('calendar', 14)}${date.format(new Date(brief.due))}</span><span class="assignee" title="${assignee?.name ?? 'Без исполнителя'}">${avatar(assignee, 'small')}</span></div>
  </button>`;
}

function renderColumns() {
  const tasks = filteredTasks();
  $('#columns').innerHTML = columns.map(([status, name, description]) => {
    const items = tasks.filter(task => task.status === status);
    return `<section class="column ${status}" aria-label="${name}">
      <header class="column-head"><div><i class="status-dot"></i><h2>${name}</h2><span class="count">${items.length}</span></div><p>${description}</p></header>
      <div class="column-cards">${items.length ? items.map(card).join('') : '<p class="empty-column">Нет задач</p>'}</div>
    </section>`;
  }).join('');
  $('#results').textContent = `Задач на доске · ${tasks.length} из ${state.tasks.length}`;
}

function selectOptions(items, selected) {
  return items.map(([value, label]) => `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

function renderBoard() {
  const overdue = state.tasks.filter(isOverdue).length;
  const active = state.tasks.filter(task => ['work', 'review', 'changes'].includes(task.status)).length;
  const scopes = [['all', 'Все задачи'], ...(state.user.role === 'lead' ? [] : [['mine', 'Мои задачи']]), ['overdue', 'Просроченные']];
  $('#main').innerHTML = `
    <section class="page-heading">
      <div><p class="eyebrow"><i></i> УПРАВЛЕНИЕ КРЕАТИВАМИ</p><h1>Доска задач</h1><p>От первого брифа до принятого креатива.</p></div>
      <div class="heading-actions">${button('Обновить', 'refresh', { glyph: 'refresh', style: 'secondary refresh' })}${state.user.role === 'buyer' ? button('Новая задача', 'new', { style: 'primary', glyph: 'plus' }) : ''}</div>
    </section>
    <div class="overview">
      <div class="overview-copy"><span class="overview-icon">${icon('spark', 22)}</span><div><strong>Креативный отдел</strong><p>Общая доска команды</p></div></div>
      <div class="overview-metrics"><div><strong>${state.tasks.length}</strong><span>Всего задач</span></div><div><strong>${active}</strong><span>Активные</span></div><div><strong class="${overdue ? 'red' : ''}">${overdue}</strong><span>Просрочены</span></div></div>
    </div>
    <div class="toolbar">
      <div class="tabs" aria-label="Группа задач">${scopes.map(([id, label]) => `<button type="button" class="${state.scope === id ? 'selected' : ''}" data-action="scope" data-id="${id}" aria-pressed="${state.scope === id}">${label}</button>`).join('')}</div>
      <div class="filters">
        <label class="search">${icon('search', 17)}<input id="query" aria-label="Поиск по задачам" placeholder="Поиск задач…" value="${esc(state.query)}"></label>
        <select id="priority" aria-label="Приоритет">${selectOptions([['all', 'Приоритет'], ...Object.entries(priorities)], state.priority)}</select>
        <select id="type" aria-label="Тип креатива">${selectOptions([['all', 'Тип'], ...types.map(value => [value, value])], state.type)}</select>
      </div>
    </div>
    <div id="columns" class="board" tabindex="0" aria-label="Канбан-доска"></div>
    <p id="results" class="results" aria-live="polite"></p>`;
  renderColumns();
}

function metric(label, value, caption, glyph, tone) {
  return `<article class="metric"><span class="metric-icon ${tone}">${icon(glyph, 20)}</span><p>${label}</p><strong>${value}</strong><small>${caption}</small></article>`;
}

function renderAnalytics() {
  const stats = state.stats;
  const max = Math.max(1, ...stats.services.map(item => item.credits));
  $('#main').innerHTML = `
    <section class="page-heading">
      <div><p class="eyebrow"><i></i> СВОДКА ПО ОТДЕЛУ</p><h1>Аналитика</h1><p>Загрузка команды, сроки выполнения и расходы на AI.</p></div>
      <div class="heading-actions">${button('Обновить', 'refresh', { glyph: 'refresh' })}</div>
    </section>
    <div class="metrics">
      ${metric('Всего задач', number.format(stats.total), `Принято · ${stats.done}`, 'board', 'violet')}
      ${metric('Среднее время', esc(duration(stats.averageMs)), 'От взятия до приёмки', 'clock', 'blue')}
      ${metric('Просрочено', number.format(stats.overdue), 'Активные задачи за дедлайном', 'alert', 'rose')}
      ${metric('AI-кредиты', number.format(stats.credits), 'Все сдачи, включая правки', 'spark', 'mint')}
    </div>
    <div class="analytics-grid">
      <section class="panel"><div class="panel-head"><span class="metric-icon violet">${icon('people', 19)}</span><div><h2>Загрузка команды</h2><p>Задачи и кредиты по исполнителям</p></div></div>
        <div class="table-scroll"><table><thead><tr><th>Исполнитель</th><th>Активные</th><th>Готово</th><th>Просрочки</th><th>Кредиты</th></tr></thead><tbody>
        ${stats.staff.map(person => {
          const user = userById(person.id);
          return `<tr><th>${avatar(user, 'small')}${user.name}</th><td>${person.active}</td><td>${person.done}</td><td class="${person.overdue ? 'red' : ''}">${person.overdue}</td><td>${number.format(person.credits)}</td></tr>`;
        }).join('')}</tbody></table></div>
      </section>
      <section class="panel"><div class="panel-head"><span class="metric-icon mint">${icon('spark', 19)}</span><div><h2>Кредиты по сервисам</h2><p>Суммарные расходы по всем сдачам</p></div></div>
        <div class="bars">${stats.services.length ? stats.services.map(item => `<div class="bar-row"><div><span>${esc(item.service)}</span><strong>${number.format(item.credits)}</strong></div><div class="bar"><i style="width:${item.credits / max * 100}%"></i></div></div>`).join('') : '<p class="muted-text">Пока нет расходов.</p>'}</div>
      </section>
    </div>`;
}

function render() {
  renderShell();
  if (state.page === 'analytics') renderAnalytics();
  else renderBoard();
}

function showDialog(title, description, content, { drawer = false } = {}) {
  dialog.className = drawer ? 'drawer' : '';
  dialog.innerHTML = `<div class="dialog-head"><div><h2 id="dialog-title">${title}</h2><p>${description}</p></div><button type="button" class="icon-button" data-action="close" aria-label="Закрыть">${icon('close', 22)}</button></div><div class="dialog-content">${content}</div>`;
  if (!dialog.open) dialog.showModal();
}

function openAccounts() {
  showDialog('Тестовые аккаунты', 'Аккаунты работают с общей доской. Вход в демо без пароля.', `
    <div class="account-list">${state.users.map(user => `<button class="account-row" data-action="login" data-id="${user.id}">
      ${avatar(user)}<span><strong>${user.name}</strong><small>${user.label}</small></span>
      ${state.user.id === user.id ? `<span class="account-current">${icon('check', 16)} Текущий</span>` : icon('right', 17)}
    </button>`).join('')}</div><p class="form-error" role="alert" hidden></p>`);
}

function formFooter(label) {
  return `<p class="form-error" role="alert" hidden></p><div class="dialog-actions">${button('Отмена', 'close')}<button class="button primary" type="submit">${label}</button></div>`;
}

function openNewTask() {
  showDialog('Новая задача', 'Заполните ТЗ. Креативщик увидит задачу в колонке «Новые».', `
    <form id="create-form" class="form">
      <label>Название <input name="title" required maxlength="100" placeholder="Например, баннеры для запуска"></label>
      <div class="form-row"><label>Оффер <input name="offer" required maxlength="80" placeholder="FitLab"></label><label>GEO <input name="geo" required maxlength="30" placeholder="DE, PL"></label></div>
      <div class="form-row"><label>Тип креатива <select name="type">${selectOptions(types.map(value => [value, value]), 'Статика')}</select></label><label>Количество <input name="quantity" type="number" min="1" max="999" value="1" required></label></div>
      <div class="form-row"><label>Приоритет <select name="priority">${selectOptions(Object.entries(priorities), 'normal')}</select></label><label>Дедлайн <input type="datetime-local" name="due" required></label></div>
      <label>Описание <textarea name="description" rows="4" maxlength="4000" required placeholder="Что подготовить и на что обратить внимание"></textarea></label>
      <label>Референсы <span class="hint">необязательно, по одной ссылке на строку</span><textarea name="refs" rows="2" placeholder="https://…"></textarea></label>
      ${formFooter('Создать задачу')}
    </form>`);
}

function openTask(id) {
  const task = taskById(id);
  if (!task) return;
  state.taskId = id;
  const { brief } = task;
  const creator = userById(task.buyer);
  const assignee = userById(task.assignee);
  const user = state.user;
  const mayClaim = task.status === 'new' && user.role === 'artist';
  const maySubmit = ['work', 'changes'].includes(task.status) && task.assignee === user.id;
  const mayReview = task.status === 'review' && task.buyer === user.id;
  const latest = task.history.at(-1);
  const costs = task.submissions.reduce((sum, item) => sum + item.costs.reduce((units, row) => units + Math.round(row.credits * 100), 0), 0) / 100;
  showDialog(esc(brief.title), `Задача #${task.id} · ${esc(brief.offer)} · ${esc(brief.geo)}`, `
    <div class="task-summary">${statusBadge(task.status)}<span class="priority ${brief.priority}"><i></i>${priorities[brief.priority]} приоритет</span></div>
    ${task.status === 'changes' ? `<div class="feedback"><strong>Комментарий к правкам</strong><p>${esc(latest.note)}</p></div>` : ''}
    <dl class="detail-grid">
      <div><dt>Байер</dt><dd>${avatar(creator, 'small')}${creator.name}</dd></div>
      <div><dt>Исполнитель</dt><dd>${avatar(assignee, 'small')}${assignee?.name ?? 'Не назначен'}</dd></div>
      <div><dt>Тип и количество</dt><dd>${esc(brief.type)} · ${brief.quantity} шт.</dd></div>
      <div><dt>Дедлайн</dt><dd class="${isOverdue(task) ? 'red' : ''}">${dateTime.format(new Date(brief.due))}</dd></div>
      <div><dt>Создана</dt><dd>${dateTime.format(new Date(task.created_at))}</dd></div>
      <div><dt>Взята в работу</dt><dd>${task.started_at ? dateTime.format(new Date(task.started_at)) : '—'}</dd></div>
      <div><dt>Последняя сдача</dt><dd>${task.submitted_at ? dateTime.format(new Date(task.submitted_at)) : '—'}</dd></div>
      <div><dt>Принята</dt><dd>${task.completed_at ? dateTime.format(new Date(task.completed_at)) : '—'}</dd></div>
      <div><dt>Время до приёмки</dt><dd>${task.completed_at ? esc(duration(Date.parse(task.completed_at) - Date.parse(task.started_at))) : '—'}</dd></div>
      <div><dt>AI-кредиты</dt><dd>${number.format(costs)}</dd></div>
    </dl>
    <section class="detail-section"><h3>Техническое задание</h3><p class="preserve-lines">${esc(brief.description)}</p>
      ${brief.refs.length ? `<div class="links">${brief.refs.map((url, index) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon('link', 16)} Референс ${index + 1}</a>`).join('')}</div>` : ''}
    </section>
    <section class="detail-section"><h3>Результаты</h3>
      ${task.submissions.length ? task.submissions.map((item, index) => `
        <article class="submission"><div class="submission-head"><strong>Версия ${index + 1}</strong><small>${dateTime.format(new Date(item.at))}</small></div>
        ${item.note ? `<p class="preserve-lines">${esc(item.note)}</p>` : ''}
        <div class="links">${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${icon('link', 16)} Открыть результат</a>` : ''}
        ${item.file ? `<a href="/api/tasks/${id}/files/${item.file.id}" download>${icon('file', 16)} ${esc(item.file.name)}</a>` : ''}</div>
        ${item.costs.length ? `<div class="cost-tags">${item.costs.map(cost => `<span>${icon('spark', 13)}${esc(cost.service)} · ${number.format(cost.credits)}</span>`).join('')}</div>` : ''}
        </article>`).reverse().join('') : '<p class="muted-text">Результаты появятся после первой сдачи.</p>'}
    </section>
    <section class="detail-section"><h3>История действий</h3><ol class="timeline">
      ${[...task.history].reverse().map(item => `<li><span class="timeline-dot"></span><div><strong>${actionNames[item.action]}</strong><p>${userById(item.actor).name} · ${statusLabel(item.status)}</p>${item.note ? `<p class="preserve-lines">${esc(item.note)}</p>` : ''}</div><time datetime="${item.at}">${dateTime.format(new Date(item.at))}</time></li>`).join('')}
    </ol></section>
    <p class="form-error" role="alert" hidden></p>
    ${mayClaim || maySubmit || mayReview ? `<div class="dialog-actions sticky">
      ${mayClaim ? button('Взять в работу', 'claim', { style: 'primary', glyph: 'check' }) : ''}
      ${maySubmit ? button('Сдать на проверку', 'open-submit', { style: 'primary', glyph: 'check' }) : ''}
      ${mayReview ? button('Отправить на правки', 'open-revise') + button('Принять результат', 'approve', { style: 'primary', glyph: 'check' }) : ''}
    </div>` : ''}`, { drawer: true });
}

function costRow() {
  return `<div class="cost-row"><input name="service" aria-label="Название AI-сервиса" placeholder="Например, Runway" maxlength="50"><input name="credits" aria-label="Кредиты" placeholder="Кредиты" type="number" min="0.01" step="0.01" max="1000000"><button type="button" class="icon-button" data-action="remove-cost" aria-label="Удалить строку">${icon('close', 16)}</button></div>`;
}

function openSubmission() {
  showDialog('Сдать на проверку', 'Добавьте результат и кредиты, потраченные именно на эту версию.', `
    <form id="submit-form" class="form">
      <label>Ссылка на результат <input type="url" name="url" maxlength="1500" placeholder="https://…"></label>
      <label>Файл <span class="hint">до 1 МБ, можно приложить вместо ссылки</span><input type="file" name="file"></label>
      <label>Комментарий <span class="hint">необязательно</span><textarea name="note" rows="3" maxlength="2000"></textarea></label>
      <div class="cost-editor"><strong>Расходы AI</strong><div id="cost-rows">${costRow()}</div>${button('Добавить сервис', 'add-cost', { glyph: 'plus', style: 'ghost' })}</div>
      ${formFooter('Сдать на проверку')}
    </form>`);
}

function openRevision() {
  showDialog('Отправить на правки', 'Креативщик увидит комментарий в карточке задачи.', `
    <form id="revise-form" class="form"><label>Что исправить <textarea name="note" rows="5" maxlength="2000" required></textarea></label>
    ${formFooter('Отправить на правки')}</form>`);
}

let noticeTimer;
function notify(message, error = false) {
  const notice = $('#notice');
  notice.textContent = message;
  notice.classList.toggle('error', error);
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 4200);
}

async function perform(work, control) {
  if (state.busy) return;
  state.busy = true;
  if (control) control.disabled = true;
  const errorBox = dialog.open ? dialog.querySelector('.form-error') : null;
  if (errorBox) errorBox.hidden = true;
  try {
    await work();
  } catch (error) {
    if (error.status === 409) {
      try {
        await loadTasks();
        render();
        if (dialog.open && state.taskId) openTask(state.taskId);
      } catch {
        // Keep the last rendered snapshot if refresh fails.
      }
      notify(error.message, true);
    } else if (errorBox) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } else {
      notify(error.message, true);
    }
  } finally {
    if (control) control.disabled = false;
    state.busy = false;
  }
}

async function changeTask(action, body, message) {
  const task = taskById(state.taskId);
  await api(`/tasks/${task.id}/${action}`, { method: 'POST', body, version: task.version });
  await loadTasks();
  render();
  openTask(task.id);
  notify(message);
}

document.addEventListener('click', event => {
  const control = event.target.closest('button[data-action]');
  if (!control || state.busy) return;
  const { action, id } = control.dataset;
  switch (action) {
    case 'board':
    case 'analytics':
      state.page = action;
      render();
      break;
    case 'scope':
      state.scope = id;
      $('#main').querySelectorAll('.tabs button').forEach(tab => {
        const active = tab.dataset.id === id;
        tab.classList.toggle('selected', active);
        tab.setAttribute('aria-pressed', String(active));
      });
      renderColumns();
      break;
    case 'refresh':
      perform(async () => { await loadTasks(); render(); notify('Данные обновлены'); }, control);
      break;
    case 'accounts': openAccounts(); break;
    case 'login':
      perform(async () => {
        const { user } = await api('/session', { method: 'POST', body: { userId: id } });
        state.user = user;
        state.page = user.role === 'lead' ? 'analytics' : 'board';
        Object.assign(state, { scope: 'all', query: '', priority: 'all', type: 'all' });
        await loadTasks();
        dialog.close();
        render();
        notify(`Роль · ${user.label}`);
      }, control);
      break;
    case 'new': openNewTask(); break;
    case 'task': openTask(id); break;
    case 'close':
      if (dialog.querySelector('#submit-form, #revise-form')) openTask(state.taskId);
      else dialog.close();
      break;
    case 'open-submit': openSubmission(); break;
    case 'open-revise': openRevision(); break;
    case 'claim': perform(() => changeTask('claim', undefined, 'Задача взята в работу'), control); break;
    case 'approve': perform(() => changeTask('approve', undefined, 'Результат принят'), control); break;
    case 'add-cost':
      if ($('#cost-rows').children.length < 10) {
        $('#cost-rows').insertAdjacentHTML('beforeend', costRow());
        $('#cost-rows').lastElementChild.querySelector('input').focus();
      }
      break;
    case 'remove-cost': control.closest('.cost-row').remove(); break;
  }
});

dialog.addEventListener('cancel', event => {
  if (state.busy || dialog.querySelector('#submit-form, #revise-form')) {
    event.preventDefault();
    if (!state.busy) openTask(state.taskId);
  }
});
dialog.addEventListener('close', () => { state.taskId = null; });
$('#main').addEventListener('input', event => {
  if (['query', 'priority', 'type'].includes(event.target.id)) {
    state[event.target.id] = event.target.value;
    renderColumns();
  }
});

dialog.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  perform(async () => {
    if (form.id === 'create-form') {
      const values = Object.fromEntries(data);
      const { id } = await api('/tasks', { method: 'POST', body: {
        ...values, quantity: Number(values.quantity), due: new Date(values.due).toISOString(),
        refs: values.refs.split(/\r?\n/).map(url => url.trim()).filter(Boolean),
      } });
      Object.assign(state, { scope: 'all', query: '', priority: 'all', type: 'all' });
      await loadTasks();
      render();
      openTask(id);
      notify('Задача создана');
    } else if (form.id === 'submit-form') {
      const costs = [...form.querySelectorAll('.cost-row')].map(row => ({
        service: row.querySelector('[name=service]').value.trim(),
        credits: row.querySelector('[name=credits]').value,
      })).filter(row => row.service || row.credits).map(row => ({ ...row, credits: Number(row.credits) }));
      if (data.get('file').size > 1024 * 1024) throw new Error('Файл больше 1 МБ. Добавьте ссылку на результат.');
      data.delete('service');
      data.delete('credits');
      data.set('costs', JSON.stringify(costs));
      await changeTask('submit', data, 'Результат отправлен на проверку');
    } else if (form.id === 'revise-form') {
      await changeTask('revise', Object.fromEntries(data), 'Задача отправлена на правки');
    }
  }, event.submitter);
});

async function init() {
  try {
    const { user, users } = await api('/session');
    state.users = users;
    state.user = user ?? (await api('/session', { method: 'POST', body: { userId: 'buyer' } })).user;
    await loadTasks();
    render();
  } catch (error) {
    $('#main').innerHTML = `<div class="load-error"><h1>Доска недоступна</h1><p>${esc(error.message)}</p><p>Обновите страницу, чтобы попробовать ещё раз.</p></div>`;
  }
}

init();
