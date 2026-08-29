const STORAGE_KEY = "studyQuestData_v1";

const defaultData = {
  examDate: "",
  reward: "",
  tasks: [],
  sessions: [],
  totalXP: 0,
  brainDump: [],
  lastDate: todayKey(),
  celebrationShownFor: ""
};

let data = loadData();
let timerMinutes = 25;
let timerSecondsRemaining = timerMinutes * 60;
let timerInterval = null;
let timerRunning = false;
let selectedTaskId = null;
let microStep = 0;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...defaultData, ...(saved || {}) };
  } catch {
    return { ...defaultData };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function ensureNewDay() {
  const today = todayKey();
  if (data.lastDate !== today) {
    data.tasks = data.tasks.map(task => ({ ...task, completed: false }));
    data.lastDate = today;
    data.celebrationShownFor = "";
    saveData();
  }
}

ensureNewDay();

const $ = id => document.getElementById(id);
const modalBackdrop = $("modalBackdrop");

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2200);
}

function openModal(id) {
  modalBackdrop.classList.remove("hidden");
  document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function closeModals() {
  modalBackdrop.classList.add("hidden");
  document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
}

document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", closeModals));
modalBackdrop.addEventListener("click", e => {
  if (e.target === modalBackdrop) closeModals();
});

function renderGreeting() {
  const hour = new Date().getHours();
  const word = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  $("greeting").textContent = `${word} 👋`;
}

function renderCountdown() {
  $("examDate").value = data.examDate || "";
  if (!data.examDate) {
    $("daysLeft").textContent = "—";
    return;
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exam = new Date(data.examDate + "T00:00:00");
  const diff = Math.ceil((exam - now) / 86400000);
  $("daysLeft").textContent = Math.max(diff, 0);
}

function getTodaySessions() {
  const today = todayKey();
  return data.sessions.filter(s => s.date === today);
}

function getTodayMinutes() {
  return getTodaySessions().reduce((sum, s) => sum + s.minutes, 0);
}

function getTodayXP() {
  return getTodaySessions().reduce((sum, s) => sum + (s.xp || 0), 0) +
    data.tasks.filter(t => t.completed && t.completedDate === todayKey()).length * 10;
}

function getStudyDays() {
  return new Set(data.sessions.map(s => s.date)).size;
}

function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function renderStats() {
  const completed = data.tasks.filter(t => t.completed).length;
  $("studyTimeToday").textContent = formatMinutes(getTodayMinutes());
  $("taskCount").textContent = `${completed} / ${data.tasks.length}`;
  $("studyDays").textContent = `${getStudyDays()} ${getStudyDays() === 1 ? "day" : "days"}`;
  $("xpToday").textContent = `${getTodayXP()} XP`;

  const totalMinutes = data.sessions.reduce((sum, s) => sum + s.minutes, 0);
  const totalCompleted = data.tasks.filter(t => t.completed).length;
  $("totalMinutesStat").textContent = totalMinutes;
  $("totalCompletedStat").textContent = totalCompleted;
  $("totalXPStat").textContent = data.totalXP || 0;
}

function taskHTML(task) {
  return `
    <div class="task-item ${task.completed ? "completed" : ""} ${task.id === selectedTaskId ? "active-task" : ""}" data-id="${task.id}">
      <button class="check-btn" data-action="toggle">${task.completed ? "✓" : ""}</button>
      <div>
        <div class="task-title">${escapeHtml(task.title)}</div>
        <span class="tag">${escapeHtml(task.type)}</span>
      </div>
      <span class="task-time">◷ ${task.minutes} min</span>
      <button class="task-start" data-action="start">${task.completed ? "DONE" : "▷ START"}</button>
      <button class="delete-task" data-action="delete" title="Delete">×</button>
    </div>`;
}

function renderTasks() {
  const html = data.tasks.length
    ? data.tasks.map(taskHTML).join("")
    : `<div style="padding:28px;text-align:center;color:#8a8f9f;border:1px dashed #ddd8eb;border-radius:12px">
        No tasks yet. Add only what you realistically want to study today.
       </div>`;

  $("taskList").innerHTML = html;
  $("planTaskList").innerHTML = html;
  attachTaskEvents($("taskList"));
  attachTaskEvents($("planTaskList"));
  renderProgress();
}

function attachTaskEvents(container) {
  container.querySelectorAll(".task-item").forEach(item => {
    item.addEventListener("click", e => {
      const id = item.dataset.id;
      const action = e.target.dataset.action;

      if (action === "toggle") toggleTask(id);
      if (action === "start") startTask(id);
      if (action === "delete") deleteTask(id);
    });
  });
}

function toggleTask(id) {
  const task = data.tasks.find(t => t.id === id);
  if (!task) return;

  task.completed = !task.completed;
  task.completedDate = task.completed ? todayKey() : "";
  if (task.completed) {
    data.totalXP = (data.totalXP || 0) + 10;
    showToast("✓ Task complete! +10 XP");
  }

  saveData();
  renderAll();
  maybeCelebrate();
}

function deleteTask(id) {
  data.tasks = data.tasks.filter(t => t.id !== id);
  if (selectedTaskId === id) selectedTaskId = null;
  saveData();
  renderAll();
}

function startTask(id) {
  const task = data.tasks.find(t => t.id === id);
  if (!task || task.completed) return;
  selectedTaskId = id;
  setTimer(task.minutes);
  $("timerTaskLabel").textContent = `Current task: ${task.title}`;
  renderTasks();
  window.scrollTo({ top: document.body.scrollHeight * 0.35, behavior: "smooth" });
  showToast(`Ready: ${task.title}`);
}

function renderProgress() {
  const total = data.tasks.length;
  const completed = data.tasks.filter(t => t.completed).length;
  const pct = total ? Math.round(completed / total * 100) : 0;

  $("progressBar").style.width = `${pct}%`;
  $("progressPercent").textContent = `${pct}%`;
  $("progressText").textContent = total ? `${completed} of ${total} tasks complete` : "No tasks yet";

  $("rewardPercent").textContent = `${pct}%`;
  $("rewardCircle").style.background = `conic-gradient(var(--purple) ${pct}%, #eee9fa ${pct}%)`;
  $("rewardStatus").textContent = total ? `${completed} of ${total} tasks completed` : "Add tasks to begin";

  const unlocked = total > 0 && completed === total;
  $("rewardCircle").querySelector("span").textContent = unlocked ? "🎉" : "🎁";
  $("bigRewardIcon").textContent = unlocked ? "🎉" : "🔒";
  $("bigRewardMessage").textContent = unlocked
    ? "You finished everything you committed to today. Enjoy it guilt-free."
    : "Finish today's plan to unlock it.";
}

function maybeCelebrate() {
  const total = data.tasks.length;
  const completed = data.tasks.filter(t => t.completed).length;
  const today = todayKey();

  if (total > 0 && completed === total && data.celebrationShownFor !== today) {
    data.celebrationShownFor = today;
    saveData();
    $("celebrationReward").textContent = data.reward || "Do something you enjoy — guilt-free.";
    openModal("celebrationModal");
  }
}

function renderReward() {
  const text = data.reward || "Set a reward for yourself";
  $("rewardText").textContent = text;
  $("bigRewardText").textContent = text;
  $("rewardInput").value = data.reward || "";
}

function renderSessions() {
  const sessions = [...data.sessions].reverse().slice(0, 20);
  $("sessionHistory").innerHTML = sessions.length
    ? sessions.map(s => `
      <div class="history-item">
        <span>${escapeHtml(s.task || "Focus session")}</span>
        <span>${s.minutes} min · ${s.date}</span>
      </div>`).join("")
    : `<p class="muted">No sessions recorded yet. Your first five minutes can go here.</p>`;
}

function renderDump() {
  $("dumpList").innerHTML = data.brainDump.length
    ? data.brainDump.map((item, i) => `
      <div class="dump-item">
        <span>${escapeHtml(item)}</span>
        <button style="border:0;background:transparent" onclick="removeDump(${i})">×</button>
      </div>`).join("")
    : `<p class="muted">Nothing parked right now.</p>`;
}

window.removeDump = function(index) {
  data.brainDump.splice(index, 1);
  saveData();
  renderDump();
};

function renderAll() {
  renderGreeting();
  renderCountdown();
  renderTasks();
  renderReward();
  renderStats();
  renderSessions();
  renderDump();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

$("examDate").addEventListener("change", e => {
  data.examDate = e.target.value;
  saveData();
  renderCountdown();
});

$("openAddTask").addEventListener("click", () => openModal("taskModal"));
$("openAddTaskPlan").addEventListener("click", () => openModal("taskModal"));

$("saveTaskBtn").addEventListener("click", () => {
  const title = $("taskTitleInput").value.trim();
  if (!title) return showToast("Give the task a name first.");

  data.tasks.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title,
    minutes: Number($("taskMinutesInput").value),
    type: $("taskTypeInput").value,
    completed: false,
    completedDate: ""
  });

  $("taskTitleInput").value = "";
  saveData();
  closeModals();
  renderAll();
  showToast("Task added.");
});

function openReward() {
  $("rewardInput").value = data.reward || "";
  openModal("rewardModal");
}

$("editRewardBtn").addEventListener("click", openReward);
$("editRewardBtn2").addEventListener("click", openReward);

$("saveRewardBtn").addEventListener("click", () => {
  data.reward = $("rewardInput").value.trim();
  saveData();
  closeModals();
  renderReward();
  showToast("Today's reward saved 🎁");
});

function setTimer(minutes) {
  clearInterval(timerInterval);
  timerRunning = false;
  timerMinutes = minutes;
  timerSecondsRemaining = minutes * 60;
  updateTimerDisplays();
  document.querySelectorAll(".time-options button").forEach(btn => {
    btn.classList.toggle("selected", Number(btn.dataset.minutes) === minutes);
  });
  $("startTimer").textContent = "START FOCUS SESSION";
  $("focusStartBtn").textContent = "START";
}

document.querySelectorAll(".time-options button").forEach(btn => {
  btn.addEventListener("click", () => setTimer(Number(btn.dataset.minutes)));
});

function updateTimerDisplays() {
  const m = Math.floor(timerSecondsRemaining / 60).toString().padStart(2, "0");
  const s = (timerSecondsRemaining % 60).toString().padStart(2, "0");
  $("timerDisplay").textContent = `${m}:${s}`;
  $("focusTimerDisplay").textContent = `${m}:${s}`;
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  $("startTimer").textContent = "FOCUSING...";
  $("focusStartBtn").textContent = "FOCUSING...";

  timerInterval = setInterval(() => {
    timerSecondsRemaining--;
    updateTimerDisplays();

    if (timerSecondsRemaining <= 0) {
      completeSession();
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  $("startTimer").textContent = "RESUME";
  $("focusStartBtn").textContent = "RESUME";
}

function resetTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  timerSecondsRemaining = timerMinutes * 60;
  updateTimerDisplays();
  $("startTimer").textContent = "START FOCUS SESSION";
  $("focusStartBtn").textContent = "START";
}

function completeSession() {
  clearInterval(timerInterval);
  timerRunning = false;

  const task = data.tasks.find(t => t.id === selectedTaskId);
  const minutes = timerMinutes;
  const xp = Math.max(5, Math.round(minutes / 5) * 5);

  data.sessions.push({
    date: todayKey(),
    minutes,
    task: task ? task.title : "Focus session",
    xp
  });

  data.totalXP = (data.totalXP || 0) + xp;
  saveData();
  showToast(`Focus session complete! +${xp} XP ⭐`);
  renderAll();

  timerSecondsRemaining = timerMinutes * 60;
  updateTimerDisplays();
  $("startTimer").textContent = "START AGAIN";
  $("focusStartBtn").textContent = "START AGAIN";
}

$("startTimer").addEventListener("click", startTimer);
$("pauseTimer").addEventListener("click", pauseTimer);
$("resetTimer").addEventListener("click", resetTimer);

$("fiveMinuteBtn").addEventListener("click", () => {
  setTimer(5);
  showToast("Only five minutes. You may stop after that.");
  window.scrollTo({ top: document.body.scrollHeight * 0.35, behavior: "smooth" });
});

$("pickForMeBtn").addEventListener("click", () => {
  const unfinished = data.tasks.filter(t => !t.completed);
  if (!unfinished.length) return showToast("No unfinished tasks. You're clear!");
  const task = unfinished[Math.floor(Math.random() * unfinished.length)];
  startTask(task.id);
  showToast(`No deciding. Do this: ${task.title}`);
});

$("brainDumpBtn").addEventListener("click", () => {
  renderDump();
  openModal("dumpModal");
});

$("parkingLotBtn").addEventListener("click", () => {
  renderDump();
  openModal("dumpModal");
});

$("saveDumpBtn").addEventListener("click", () => {
  const thought = $("dumpInput").value.trim();
  if (!thought) return;
  data.brainDump.push(thought);
  $("dumpInput").value = "";
  saveData();
  renderDump();
  showToast("Parked. You don't need to deal with it now.");
});

$("cantStudyBtn").addEventListener("click", () => {
  microStep = 0;
  renderMicroStep();
  openModal("cantStudyModal");
});

function renderMicroStep() {
  const steps = [
    ["Put your phone somewhere you can't reach it.", "DONE — PHONE AWAY"],
    ["Get your book, notes, or study material. Do not study yet.", "GOT IT"],
    ["Open only the topic you are going to study.", "IT'S OPEN"],
    ["Read just ONE paragraph or answer ONE question.", "START 2 MINUTES"]
  ];

  const [text, button] = steps[Math.min(microStep, steps.length - 1)];
  $("cantStudyTitle").textContent = microStep === 0 ? "Okay. No big study session." : `Step ${microStep + 1} of 4`;
  $("cantStudyContent").innerHTML = `
    <p>${text}</p>
    <button id="microStepBtn" class="primary-btn full">${button}</button>`;

  $("microStepBtn").addEventListener("click", () => {
    if (microStep < steps.length - 1) {
      microStep++;
      renderMicroStep();
    } else {
      closeModals();
      setTimer(2);
      startTimer();
      showToast("Two minutes. That's the entire deal.");
    }
  });
}

$("focusModeBtn").addEventListener("click", openFocusMode);
$("closeFocus").addEventListener("click", () => $("focusOverlay").classList.add("hidden"));

function openFocusMode() {
  let task = data.tasks.find(t => t.id === selectedTaskId && !t.completed);
  if (!task) task = data.tasks.find(t => !t.completed);

  if (task) {
    selectedTaskId = task.id;
    $("focusTaskTitle").textContent = task.title;
    if (!timerRunning) setTimer(task.minutes);
    $("timerTaskLabel").textContent = `Current task: ${task.title}`;
  } else {
    $("focusTaskTitle").textContent = "Do one tiny study action";
  }

  $("focusOverlay").classList.remove("hidden");
  renderTasks();
}

$("focusStartBtn").addEventListener("click", startTimer);

$("resetTodayBtn").addEventListener("click", () => {
  if (!data.tasks.length) return;
  const ok = confirm("Reset today's task completion? Your study session history will stay saved.");
  if (!ok) return;

  data.tasks = data.tasks.map(t => ({ ...t, completed: false, completedDate: "" }));
  data.celebrationShownFor = "";
  saveData();
  renderAll();
  showToast("Today's task checkmarks were reset.");
});

document.querySelectorAll(".nav-btn[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn[data-view]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
    $(`${btn.dataset.view}View`).classList.add("active-view");
  });
});

renderAll();
updateTimerDisplays();
