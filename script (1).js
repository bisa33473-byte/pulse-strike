// ==================== Firebase 配置与初始化 ====================
const firebaseConfig = {
  apiKey: "AIzaSyDLfCkdeTp3VW5ar_L6BbxdeNX1MbGTrSk",
  authDomain: "pulsestrikeonline.firebaseapp.com",
  databaseURL: "https://pulsestrikeonline-default-rtdb.firebaseio.com/",
  projectId: "pulsestrikeonline",
  appId: "1:911188853233:web:6fd2c1b6ae4348d3634450"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let myRole = null, roomRef = null, currentRoomId = "", isPvE = false;
let gameState = null, gameVersion = 'stable', isProcessing = false; 

// ==================== 用户认证与缓存 ====================
let currentUser = { uid: "", username: "", title: "初阶特工", stats: { total: 0, wins: 0 }, friends: {} };

window.onload = function() {
  const cachedUid = localStorage.getItem('pulse_uid');
  if (cachedUid) {
    db.ref('users/' + cachedUid).once('value', function(snap) {
      if (snap.val()) {
        currentUser = snap.val();
        if (!currentUser.stats) currentUser.stats = { total: 0, wins: 0 };
        if (!currentUser.friends) currentUser.friends = {};
        if (!currentUser.title) currentUser.title = "初阶特工";
        setupPresence(); showHub();
      } else { localStorage.removeItem('pulse_uid'); }
    });
  }
};

function setupPresence() {
  const connectedRef = db.ref(".info/connected");
  connectedRef.on("value", function(snap) {
    if (snap.val() === true && currentUser.uid) {
      const userOnlineRef = db.ref('users/' + currentUser.uid + '/online');
      userOnlineRef.set(true); userOnlineRef.onDisconnect().set(false);
    }
  });
  listenToInvites();
}

function handleRegister() {
  const user = document.getElementById('auth-username').value.trim();
  const pass = document.getElementById('auth-password').value.trim();
  const msg = document.getElementById('auth-msg');
  if (user.length < 2 || pass.length < 3) { msg.innerText = "账号至少2位，密码至少3位。"; return; }

  db.ref('users').orderByChild('username').equalTo(user).once('value', function(snap) {
    if (snap.exists()) { msg.innerText = "该代号已被注册！"; } 
    else {
      const newUid = Math.floor(100000 + Math.random() * 900000).toString();
      const newUserObj = { uid: newUid, username: user, password: pass, title: "初阶特工", stats: { total: 0, wins: 0 }, online: true };
      db.ref('users/' + newUid).set(newUserObj).then(function() {
        currentUser = newUserObj; currentUser.friends = {}; localStorage.setItem('pulse_uid', newUid);
        setupPresence(); showHub();
      });
    }
  });
}

function handleLogin() {
  const user = document.getElementById('auth-username').value.trim();
  const pass = document.getElementById('auth-password').value.trim();
  const msg = document.getElementById('auth-msg');
  if (!user || !pass) { msg.innerText = "请完整输入。"; return; }

  db.ref('users').orderByChild('username').equalTo(user).once('value', function(snap) {
    if (!snap.exists()) { msg.innerText = "查无此人。"; return; }
    let found = false;
    snap.forEach(function(childSnap) {
      const data = childSnap.val();
      if (data.password === pass) {
        currentUser = data;
        if (!currentUser.stats) currentUser.stats = { total: 0, wins: 0 };
        if (!currentUser.friends) currentUser.friends = {};
        if (!currentUser.title) currentUser.title = "初阶特工";
        localStorage.setItem('pulse_uid', currentUser.uid); found = true;
      }
    });
    if (found) { setupPresence(); showHub(); } else { msg.innerText = "密码错误！"; }
  });
}

function handleLogout() {
  if (currentUser.uid) db.ref('users/' + currentUser.uid + '/online').set(false);
  localStorage.removeItem('pulse_uid'); location.reload();
}

// ==================== 主城 (Hub) 控制 ====================
function showHub() {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('mode-overlay').style.display = 'none';
  document.getElementById('hub-overlay').style.display = 'flex';
  document.getElementById('hub-title').innerText = `[${currentUser.title}]`;
  document.getElementById('hub-username').innerText = currentUser.username;
  document.getElementById('hub-uid').innerText = currentUser.uid;
  listenToFriendRequests();
}

function updateCustomTitle() {
  const newTitle = document.getElementById('new-title-input').value.trim();
  if (!newTitle) return alert("称号不能为空！");
  db.ref('users/' + currentUser.uid + '/title').set(newTitle).then(function() {
    currentUser.title = newTitle; document.getElementById('hub-title').innerText = `[${newTitle}]`;
    document.getElementById('new-title-input').value = ""; alert("称号更新成功！");
  });
}

function openGameSelect() { document.getElementById('hub-overlay').style.display = 'none'; document.getElementById('mode-overlay').style.display = 'flex'; }
function goBackToHub() { document.getElementById('mode-overlay').style.display = 'none'; document.getElementById('hub-overlay').style.display = 'flex'; }

// ==================== 社交与通讯 ====================
function openFriendsModal() { document.getElementById('friends-modal').style.display = 'flex'; renderFriendsList(); }

function sendFriendRequest() {
  const targetUid = document.getElementById('add-friend-uid').value.trim();
  if (targetUid === currentUser.uid) return alert("不能添加自己！");
  if (targetUid.length !== 6) return alert("UID 是6位数字！");
  db.ref('users/' + targetUid).once('value', function(snap) {
    if (!snap.exists()) alert("找不到该特工。");
    else {
      db.ref('friend_requests/' + targetUid + '/' + currentUser.uid).set(currentUser.username).then(function() {
        alert("申请已发送！"); document.getElementById('add-friend-uid').value = "";
      });
    }
  });
}

function listenToFriendRequests() {
  db.ref('friend_requests/' + currentUser.uid).on('value', function(snap) {
    const data = snap.val(); const area = document.getElementById('friend-requests-area'); const list = document.getElementById('friend-requests-list');
    list.innerHTML = "";
    if (!data) { area.style.display = 'none'; return; }
    area.style.display = 'block'; const requestKeys = Object.keys(data);
    for (let i = 0; i < requestKeys.length; i++) {
      let rUid = requestKeys[i]; let rName = data[rUid];
      const item = document.createElement('div');
      item.style.cssText = "display:flex; justify-content:space-between; background:#21262d; padding:8px; margin-bottom:5px; border-radius:6px; align-items:center;";
      item.innerHTML = `<span style="font-size:0.9em; color:#fff;">[${rUid}] <b>${rName}</b></span><button class="setup-btn host-btn" style="padding:5px 10px; font-size:0.8em;" onclick="acceptFriend('${rUid}', '${rName}')">同意</button>`;
      list.appendChild(item);
    }
  });
}

function acceptFriend(rUid, rName) {
  let updates = {};
  updates['users/' + currentUser.uid + '/friends/' + rUid] = rName;
  updates['users/' + rUid + '/friends/' + currentUser.uid] = currentUser.username;
  db.ref().update(updates).then(function() {
    db.ref('friend_requests/' + currentUser.uid + '/' + rUid).remove();
    if (!currentUser.friends) currentUser.friends = {};
    currentUser.friends[rUid] = rName; renderFriendsList();
  });
}

function renderFriendsList() {
  const fList = document.getElementById('friends-list');
  fList.innerHTML = "<div style='color:#8b949e; text-align:center; font-size:0.85em;'>正在连接全网...</div>";
  if (!currentUser.friends || Object.keys(currentUser.friends).length === 0) {
    fList.innerHTML = "<p style='color:#8b949e; text-align:center; font-size:0.85em;'>暂无好友。</p>"; return;
  }
  db.ref('users').once('value', function(snap) {
    const allUsers = snap.val() || {}; fList.innerHTML = "";
    const fKeys = Object.keys(currentUser.friends);
    for (let i = 0; i < fKeys.length; i++) {
      let fUid = fKeys[i]; let fName = currentUser.friends[fUid];
      let isOnline = allUsers[fUid] && allUsers[fUid].online === true;
      let statusDot = isOnline ? "<span style='color:var(--green);'>🟢 在线</span>" : "<span style='color:#8b949e;'>⚪ 离线</span>";
      let inviteBtn = "";
      if (isOnline && gameState && gameState.status === 'waiting' && myRole !== 'spectator' && currentRoomId !== "") {
         inviteBtn = `<button class="setup-btn host-btn" style="padding:4px 8px; font-size:0.7em; margin-left:10px;" onclick="sendRoomInvite('${fUid}')">邀请</button>`;
      }
      const item = document.createElement('div');
      item.style.cssText = "background:#21262d; padding:10px; margin-bottom:8px; border-radius:6px; font-size:0.9em; display:flex; justify-content:space-between; align-items:center;";
      item.innerHTML = `<div><span style="display:inline-block; min-width:60px;">${statusDot}</span><b style="color:var(--blue); margin-left:5px;">${fName}</b></div><div style="display:flex; align-items:center;"><span style="color:#8b949e; font-family:monospace;">UID:${fUid}</span>${inviteBtn}</div>`;
      fList.appendChild(item);
    }
  });
}

// 核心修复1：给邀请绑定当前的游戏版本号
function sendRoomInvite(friendUid) {
  if (!currentRoomId) return;
  db.ref('invites/' + friendUid).set({ 
    roomId: currentRoomId, 
    hostName: currentUser.username, 
    version: gameVersion, // 把房主的版本号发送过去
    timestamp: Date.now() 
  }).then(function() { alert("邀请已发送！"); });
}

// 核心修复2：受邀者接收邀请时，把版本号藏进数据集里
function listenToInvites() {
  db.ref('invites/' + currentUser.uid).on('value', function(snap) {
    const data = snap.val(); if (!data) return;
    if (Date.now() - data.timestamp > 60000) { db.ref('invites/' + currentUser.uid).remove(); return; }

    document.getElementById('invite-alert-text').innerHTML = `⚠️ <b>${data.hostName}</b> 邀请加入 <span style="color:var(--gold); font-family:monospace; font-size:1.2em;">${data.roomId}</span>`;

    const alertBox = document.getElementById('global-invite-alert');
    alertBox.style.display = 'flex'; 
    alertBox.dataset.targetRoom = data.roomId;
    alertBox.dataset.targetVersion = data.version || 'stable'; // 提取版本号
  });
}

// 核心修复3：受邀者接受邀请时，强行同步版本，并直接调用安全入房逻辑
function acceptInvite() {
  const alertBox = document.getElementById('global-invite-alert');
  const roomId = alertBox.dataset.targetRoom;
  const targetVer = alertBox.dataset.targetVersion || 'stable';

  alertBox.style.display = 'none'; 
  db.ref('invites/' + currentUser.uid).remove();

  if (roomRef) roomRef.off(); 

  // 强制同步房主的版本！！！
  gameVersion = targetVer;

  document.getElementById('roomInput').value = roomId;
  document.getElementById('hub-overlay').style.display = 'none'; 
  document.getElementById('friends-modal').style.display = 'none'; 
  document.getElementById('mode-overlay').style.display = 'block';
  selectMode('pvp'); 

  // 直接无异步调用直连函数，避免等待 UI 导致的 DOM 未加载问题
  joinRoomWithId(roomId);
}

function declineInvite() { document.getElementById('global-invite-alert').style.display = 'none'; db.ref('invites/' + currentUser.uid).remove(); }

// ==================== 排行榜 ====================
function openLeaderboardModal() {
  document.getElementById('leaderboard-modal').style.display = 'flex';
  const list = document.getElementById('leaderboard-list'); list.innerHTML = "<div style='text-align: center; color: #8b949e;'>正在拉取数据...</div>";
  db.ref('users').once('value', function(snap) {
    const data = snap.val(); if (!data) return;
    let players = []; const uKeys = Object.keys(data);
    for (let i = 0; i < uKeys.length; i++) {
      let uData = data[uKeys[i]];
      if (uData.stats && uData.stats.total > 0) {
        let rate = (uData.stats.wins / uData.stats.total) * 100;
        players.push({ name: uData.username, title: uData.title || "特工", total: uData.stats.total, wins: uData.stats.wins, rate: rate });
      }
    }
    players.sort(function(a, b) { if (b.rate !== a.rate) return b.rate - a.rate; return b.total - a.total; });
    list.innerHTML = "";
    if (players.length === 0) { list.innerHTML = "<div style='text-align: center; color: #8b949e;'>暂无数据</div>"; return; }
    for (let i = 0; i < players.length; i++) {
      let p = players[i]; let rankColor = "#c9d1d9"; if (i === 0) rankColor = "#d29922"; if (i === 1) rankColor = "#c0c0c0"; if (i === 2) rankColor = "#cd7f32";
      const item = document.createElement('div');
      item.style.cssText = `background:rgba(0,0,0,0.5); padding:12px; margin-bottom:8px; border-radius:8px; border-left:4px solid ${rankColor}; display:flex; justify-content:space-between; align-items:center;`;
      item.innerHTML = `<div style="flex:1;"><span style="font-weight:bold; font-size:1.1em; color:${rankColor}; margin-right:10px;">#${i+1}</span><span style="font-size:0.75em; color:var(--gold);">[${p.title}]</span><span style="font-weight:bold; margin-left:5px; color:#fff;">${p.name}</span></div><div style="text-align:right;"><div style="color:var(--green); font-weight:bold; font-size:1.1em;">${p.rate.toFixed(1)}%</div><div style="color:#8b949e; font-size:0.7em;">${p.wins}胜 / ${p.total}局</div></div>`;
      list.appendChild(item);
    }
  });
}

// ==================== 数据生成器 ====================
function getInitialState(capacity) {
  let hp = 5; let maxAmmo = 4; let maxShield = 4;
  if (capacity === 4) { hp = 9; maxAmmo = 6; maxShield = 6; } else if (capacity === 3) { hp = 7; maxAmmo = 5; maxShield = 5; }
  let state = { config: { capacity: capacity, maxAmmo: maxAmmo, maxShield: maxShield, baseHp: hp }, log: "准备就绪，请出招！", round: 1, status: 'waiting', playAgain: { p1: false, p2: false, p3: false, p4: false } };
  state.p1 = createBasePlayer(capacity >= 1 ? hp : 0, hp, maxAmmo, maxShield);
  state.p2 = createBasePlayer(capacity >= 2 ? hp : 0, hp, maxAmmo, maxShield);
  state.p3 = createBasePlayer(capacity >= 3 ? hp : 0, hp, maxAmmo, maxShield);
  state.p4 = createBasePlayer(capacity >= 4 ? hp : 0, hp, maxAmmo, maxShield);
  return state;
}
function createBasePlayer(currentHp, maxHp, maxAmmo, maxShield) {
  return { uid: "", username: "", title: "", hp: currentHp, maxHp: maxHp, ammo: 0, maxAmmo: maxAmmo, shield: 1, maxShield: maxShield, move: "", val: 0, target: "", talent: null, joined: false, ready: false, healCd: 0, talentCd: 0, holyCd: 0, fatalCd: 0, dualCd: 0, rerolled: false };
}

const TALENT_POOL = {
  numerical: [
    { id: 'n_a1', type: 'angel', category: '数值', name: '战术储备', desc: '护盾 +2，弹药 -1' },
    { id: 'n_a2', type: 'angel', category: '数值', name: '轻装上阵', desc: '初始弹药 +1，护盾 +1，血量与上限 -1' },
    { id: 'n_d1', type: 'demon', category: '数值', name: '军火狂人', desc: '弹药 +4，血量与上限 -3\n代价：第一回合绝对禁止射击。' },
    { id: 'n_d2', type: 'demon', category: '数值', name: '叹息之墙', desc: '护盾 +3，血量与上限 -3\n代价：容错极低的防御型，考验身法。' }
  ],
  mechanism: [
    { id: 'm_a1', type: 'angel', category: '机制', name: '圣盾坚壁', desc: '使用防御时获得 2 层护盾。\n代价：单次射击最高被限制为 2 发。' },
    { id: 'm_a2', type: 'angel', category: '机制', name: '圣戒', desc: '专属动作【圣光】(每5回合可用)：无视防御，强行抽取目标1血量反哺自身。\n代价：本局游戏彻底丧失【包扎】能力。' },
    { id: 'm_a3', type: 'angel', category: '机制', name: '神圣复苏', desc: '回合末，若本回合未受伤害且未射击，恢复 1 点血。\n(触发后进入 2 回合冷却)' },
    { id: 'm_a4', type: 'angel', category: '机制', name: '双向渡灵', desc: '专属动作【渡灵】(每4回合可用)：无消耗。50%概率恢复自身1血，50%概率随机给一名存活敌人恢复1血。' },
    { id: 'm_d1', type: 'demon', category: '机制', name: '深渊魔弹', desc: '你的射击必定穿甲（无视护盾直接扣血）。\n代价：你永久无法使用防御动作。' },
    { id: 'm_d2', type: 'demon', category: '机制', name: '嗜血狂热', desc: '装弹时流失 1 血量，但获得 3 发子弹。\n(触发后 2 回合内只能普通装弹；1血时触发濒死保护停止扣血)' },
    { id: 'm_d3', type: 'demon', category: '机制', name: '贪婪吞噬', desc: '射击若对目标造成掉血，吸取 1 点生命。\n(触发后进入 2 回合冷却) 代价：血量上限 -2，护盾上限固定为 2。' },
    { id: 'm_d4', type: 'demon', category: '机制', name: '蚀命狂击', desc: '专属动作【狂击】(每3回合可用)：60%概率伤害翻倍；20%射击失效且自身受一半伤害反噬(不耗弹)；20%哑火空枪(耗弹)。' }
  ]
};

// ==================== 建立与加入 ====================
function selectVersion(v) { gameVersion = v; document.getElementById('step-version').style.display = 'none'; document.getElementById('step-mode').style.display = 'block'; }
function goBackToVersion() { document.getElementById('step-version').style.display = 'block'; document.getElementById('step-mode').style.display = 'none'; }
function toggleRules(show) { document.getElementById('rules-modal').style.display = show ? 'flex' : 'none'; }
function showTalentCodex() {
  const container = document.getElementById('codex-list-container'); container.innerHTML = "";
  let htmlStr = `<h3 style="color: var(--green); border-bottom: 1px solid #30363d; padding-bottom: 5px;">👼 天使机缘</h3>`;
  for (let i = 0; i < TALENT_POOL.numerical.length; i++) { if (TALENT_POOL.numerical[i].type === 'angel') htmlStr += `<div style="margin-bottom: 12px;"><strong style="color:#fff;">${TALENT_POOL.numerical[i].name}</strong> <span style="font-size:0.8em; color:#8b949e;">(数值)</span><br><span style="font-size:0.9em; color:#c9d1d9;">${TALENT_POOL.numerical[i].desc}</span></div>`; }
  for (let i = 0; i < TALENT_POOL.mechanism.length; i++) { if (TALENT_POOL.mechanism[i].type === 'angel') htmlStr += `<div style="margin-bottom: 12px;"><strong style="color:#fff;">${TALENT_POOL.mechanism[i].name}</strong> <span style="font-size:0.8em; color:#8b949e;">(机制)</span><br><span style="font-size:0.9em; color:#c9d1d9;">${TALENT_POOL.mechanism[i].desc}</span></div>`; }
  htmlStr += `<h3 style="color: var(--purple); border-bottom: 1px solid #30363d; padding-bottom: 5px; margin-top: 25px;">😈 恶魔机缘</h3>`;
  for (let i = 0; i < TALENT_POOL.numerical.length; i++) { if (TALENT_POOL.numerical[i].type === 'demon') htmlStr += `<div style="margin-bottom: 12px;"><strong style="color:#fff;">${TALENT_POOL.numerical[i].name}</strong> <span style="font-size:0.8em; color:#8b949e;">(数值)</span><br><span style="font-size:0.9em; color:#c9d1d9;">${TALENT_POOL.numerical[i].desc.replace(/\n/g, '<br>')}</span></div>`; }
  for (let i = 0; i < TALENT_POOL.mechanism.length; i++) { if (TALENT_POOL.mechanism[i].type === 'demon') htmlStr += `<div style="margin-bottom: 12px;"><strong style="color:#fff;">${TALENT_POOL.mechanism[i].name}</strong> <span style="font-size:0.8em; color:#8b949e;">(机制)</span><br><span style="font-size:0.9em; color:#c9d1d9;">${TALENT_POOL.mechanism[i].desc.replace(/\n/g, '<br>')}</span></div>`; }
  container.innerHTML = htmlStr; document.getElementById('codex-modal').style.display = 'flex';
}
function exitGame() { 
  if (roomRef && myRole) {
    let msg = myRole === 'p1' ? "你是房主，离开将解散房间。" : (myRole === 'spectator' ? "确定退出观战？" : "确定退出房间？");
    if (confirm(msg)) {
      if (myRole === 'p1') roomRef.remove().then(function(){location.reload();}); 
      else if (myRole === 'spectator') location.reload();
      else roomRef.child(myRole).update({ joined: false, ready: false }).then(function(){location.reload();}); 
    }
  } else location.reload(); 
}

function selectMode(mode) {
  isPvE = (mode === 'pve');
  document.getElementById('mode-overlay').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';
  if (isPvE) {
    document.getElementById('room-setup').style.display = 'none'; myRole = 'p1';
    gameState = getInitialState(2);
    gameState.p1.uid = currentUser.uid; gameState.p1.username = currentUser.username; gameState.p1.title = currentUser.title;
    gameState.p2.uid = "000000"; gameState.p2.username = "COMPUTER (AI)"; gameState.p2.title = "机械领主";
    gameState.status = 'playing'; gameState.p1.joined = true; gameState.p1.ready = true; gameState.p2.joined = true; gameState.p2.ready = true;
    if (gameVersion === 'beta') showTalentSelection(false); else render(gameState);
  } else { document.getElementById('room-setup').style.display = 'flex'; }
}

function createRoom(capacity) {
  const rid = Math.random().toString(36).substring(2, 7).toUpperCase();
  myRole = 'p1'; currentRoomId = rid; document.getElementById('room-setup').style.display = 'none';
  const dbPath = gameVersion === 'beta' ? "rooms_beta/" : "rooms_v2/";
  roomRef = db.ref(dbPath + rid);
  let newRoom = getInitialState(capacity);
  newRoom.p1.joined = true; newRoom.p1.uid = currentUser.uid; newRoom.p1.username = currentUser.username; newRoom.p1.title = currentUser.title;
  roomRef.set(newRoom); roomRef.onDisconnect().remove(); setupRoomListener(rid);
}

// 核心修复4：重构加入逻辑，支持直接传参强制跳转
function joinRoomWithId(explicitId) {
  const rid = explicitId.toUpperCase().trim();
  const dbPath = gameVersion === 'beta' ? "rooms_beta/" : "rooms_v2/";
  const tempRef = db.ref(dbPath + rid);

  tempRef.once('value', function(snap) {
    let data = snap.val(); 
    if (!data) return alert("❌ 房间不存在！(检查游戏版本或房间码)");

    const cap = data.config.capacity; let isAssigned = false;
    if (data.status === 'playing' || data.status === 'finished') {
      if (cap >= 2 && !data.p2.joined && data.p2.hp > 0) { myRole = 'p2'; isAssigned = true; }
      else if (cap >= 3 && !data.p3.joined && data.p3.hp > 0) { myRole = 'p3'; isAssigned = true; }
      else if (cap === 4 && !data.p4.joined && data.p4.hp > 0) { myRole = 'p4'; isAssigned = true; }
    } else {
      if (cap >= 2 && !data.p2.joined) { myRole = 'p2'; isAssigned = true; }
      else if (cap >= 3 && !data.p3.joined) { myRole = 'p3'; isAssigned = true; }
      else if (cap === 4 && !data.p4.joined) { myRole = 'p4'; isAssigned = true; }
    }

    if (!isAssigned) { myRole = 'spectator'; alert("房间满，进入观战！"); }
    currentRoomId = rid; roomRef = tempRef; document.getElementById('room-setup').style.display = 'none';
    if (myRole !== 'spectator') {
      roomRef.child(myRole).update({ joined: true, ready: false, uid: currentUser.uid, username: currentUser.username, title: currentUser.title });
      roomRef.child(myRole).onDisconnect().update({ joined: false, ready: false });
    }
    setupRoomListener(rid);
  });
}

function joinRoom() {
  const ridInput = document.getElementById('roomInput').value;
  if (!ridInput) return alert("请输入房间码！");
  joinRoomWithId(ridInput);
}

function setupRoomListener(rid) {
  roomRef.on('value', function(snap) {
    let data = snap.val(); if (!data) { alert("房间解散。"); location.reload(); return; }
    gameState = data;
    if (gameState.status === 'waiting') renderLobby(rid);
    else { document.getElementById('waiting-room').style.display = 'none'; document.getElementById('game-container').style.display = 'block'; render(gameState); checkRoundStart(); }
  });
}

function renderLobby(rid) {
  document.getElementById('game-container').style.display = 'none'; document.getElementById('waiting-room').style.display = 'block'; document.getElementById('lobby-rid').innerText = rid;
  document.getElementById('spectator-banner-lobby').style.display = myRole === 'spectator' ? 'block' : 'none';
  const cap = gameState.config.capacity;
  updateLobbyPlayer('p1', gameState.p1, 1 <= cap); updateLobbyPlayer('p2', gameState.p2, 2 <= cap); updateLobbyPlayer('p3', gameState.p3, 3 <= cap); updateLobbyPlayer('p4', gameState.p4, 4 <= cap);
  const actionBtn = document.getElementById('lobby-action-btn');
  if (myRole === 'spectator') actionBtn.style.display = 'none';
  else {
    actionBtn.style.display = 'inline-block'; const myData = gameState[myRole];
    if (myData && myData.ready) { actionBtn.innerText = "等待玩家..."; actionBtn.style.opacity = 0.5; actionBtn.onclick = null; } 
    else {
      actionBtn.style.opacity = 1;
      if (gameVersion === 'beta') { actionBtn.innerText = "抽取机缘"; actionBtn.onclick = function() { showTalentSelection(false); }; } 
      else { actionBtn.innerText = "准备就绪"; actionBtn.onclick = function() { if (roomRef) roomRef.child(myRole).update({ ready: true }); }; }
    }
  }
  if (myRole === 'p1') {
    let allReady = true;
    if (cap >= 1 && (!gameState.p1.joined || !gameState.p1.ready)) allReady = false;
    if (cap >= 2 && (!gameState.p2.joined || !gameState.p2.ready)) allReady = false;
    if (cap >= 3 && (!gameState.p3.joined || !gameState.p3.ready)) allReady = false;
    if (cap >= 4 && (!gameState.p4.joined || !gameState.p4.ready)) allReady = false;
    if (allReady) roomRef.update({ status: 'playing', playAgain: { p1: false, p2: false, p3: false, p4: false } });
  }
}
function updateLobbyPlayer(playerId, pData, isActive) {
  const cardEl = document.getElementById(`lobby-${playerId}-card`); const statusEl = document.getElementById(`lobby-${playerId}-status`);
  if (!isActive) { if (cardEl) cardEl.style.display = 'none'; return; } else { if (cardEl) cardEl.style.display = 'block'; }
  const roleBadge = cardEl.querySelector('.role-badge');
  if (pData && pData.joined && pData.username) {
    let titleStr = pData.title ? `[${pData.title}] ` : ""; roleBadge.innerText = `${titleStr}${pData.username}`; roleBadge.style.color = "#fff";
  } else {
    if (playerId === 'p1') roleBadge.innerText = "PLAYER A (房主)"; else if (playerId === 'p2') roleBadge.innerText = "PLAYER B"; else if (playerId === 'p3') roleBadge.innerText = "PLAYER C"; else if (playerId === 'p4') roleBadge.innerText = "PLAYER D";
    roleBadge.style.color = "var(--blue)";
  }
  if (!pData || !pData.joined) { statusEl.innerText = "等待加入..."; statusEl.style.color = "#8b949e"; if(cardEl) cardEl.style.borderColor = "#30363d"; } 
  else if (!pData.ready) { statusEl.innerText = gameVersion === 'beta' ? "挑选机缘中..." : "未准备"; statusEl.style.color = "#d29922"; if(cardEl) cardEl.style.borderColor = "#d29922"; } 
  else { statusEl.innerText = "已准备就绪！"; statusEl.style.color = "#3fb950"; if(cardEl) cardEl.style.borderColor = "#3fb950"; }
}

// ==================== 天赋分配与安全撤销 ====================
function showTalentSelection(isReroll) {
  const overlay = document.getElementById('talent-overlay'); const list = document.getElementById('talent-list');
  const title = document.getElementById('talent-title-text'); const subtitle = document.getElementById('talent-subtitle-text');
  if (isReroll) { title.innerText = "✨ 机缘重铸 (第80回合) ✨"; subtitle.innerText = "命运之轮再次转动，请重新抉择。"; } 
  else { title.innerText = "✨ 获取机缘 ✨"; subtitle.innerText = "请选择一项作为本局核心"; }
  overlay.style.display = 'flex'; list.innerHTML = '';
  let options = [];
  options.push(TALENT_POOL.numerical[Math.floor(Math.random() * TALENT_POOL.numerical.length)]);
  options.push(TALENT_POOL.mechanism[Math.floor(Math.random() * TALENT_POOL.mechanism.length)]);
  const combinedPool = [];
  for (let i=0; i<TALENT_POOL.numerical.length; i++) combinedPool.push(TALENT_POOL.numerical[i]);
  for (let i=0; i<TALENT_POOL.mechanism.length; i++) combinedPool.push(TALENT_POOL.mechanism[i]);
  while (options.length < 4) {
    const pick = combinedPool[Math.floor(Math.random() * combinedPool.length)];
    let exists = false; for (let i = 0; i < options.length; i++) { if (options[i].id === pick.id) { exists = true; break; } }
    if (!exists) options.push(pick);
  }
  for (let i = 0; i < options.length; i++) {
    let t = options[i]; const card = document.createElement('div'); card.className = `talent-card ${t.type}`;
    card.innerHTML = `<h4>${t.name}</h4><small>${t.category}类</small><p>${t.desc}</p>`; card.onclick = function() { applyTalent(t, isReroll); }; list.appendChild(card);
  }
  if (isReroll) {
    const keepCard = document.createElement('div'); keepCard.className = `talent-card`; keepCard.style.borderBottom = "4px solid #8b949e"; keepCard.style.gridColumn = "1 / -1";
    keepCard.innerHTML = `<h4 style="color:#8b949e;">保留原机缘</h4><p>放弃重铸，维持当前天赋不变。</p>`; keepCard.onclick = function() { applyTalent('keep', isReroll); }; list.appendChild(keepCard);
  }
}
function removeTalentMods(playerData, t, config) {
  if (!t) return;
  if (t.id === 'n_a1') { playerData.shield -= 2; playerData.ammo += 1; } 
  else if (t.id === 'n_a2') { playerData.ammo -= 1; playerData.shield -= 1; playerData.maxHp += 1; playerData.hp += 1; } 
  else if (t.id === 'n_d1') { playerData.ammo -= 4; playerData.maxHp += 3; playerData.hp += 3; } 
  else if (t.id === 'n_d2') { playerData.shield += 3; playerData.maxHp += 3; playerData.hp += 3; } 
  else if (t.id === 'm_d3') {
    playerData.maxHp += 2; playerData.hp += 2; playerData.maxShield = config.maxShield;
    if (gameState && gameState.round >= 120) {
      playerData.maxShield -= 2; if (playerData.maxShield < 0) playerData.maxShield = 0;
      playerData.maxHp -= 2; if (playerData.maxHp < 1) playerData.maxHp = 1;
    }
  }
  if (playerData.hp > playerData.maxHp) playerData.hp = playerData.maxHp;
  if (playerData.ammo > playerData.maxAmmo) playerData.ammo = playerData.maxAmmo;
  if (playerData.shield > playerData.maxShield) playerData.shield = playerData.maxShield;
}
function applyTalentMods(playerData, t) {
  if (!t) return;
  if (t.id === 'n_a1') { playerData.shield += 2; playerData.ammo -= 1; } 
  else if (t.id === 'n_a2') { playerData.ammo += 1; playerData.shield += 1; playerData.maxHp -= 1; playerData.hp -= 1; } 
  else if (t.id === 'n_d1') { playerData.ammo += 4; playerData.maxHp -= 3; playerData.hp -= 3; } 
  else if (t.id === 'n_d2') { playerData.shield += 3; playerData.maxHp -= 3; playerData.hp -= 3; } 
  else if (t.id === 'm_d3') { playerData.maxHp -= 2; playerData.hp -= 2; playerData.maxShield = 2; if (playerData.shield > 2) playerData.shield = 2; }
}
function applyTalent(t, isReroll) {
  document.getElementById('talent-overlay').style.display = 'none';
  if (isPvE) {
    if (isReroll) {
      if (t !== 'keep') { removeTalentMods(gameState.p1, gameState.p1.talent, gameState.config); gameState.p1.talent = t; applyTalentMods(gameState.p1, t); }
      gameState.p1.rerolled = true;
      if (gameState.p2.hp > 0) {
        if (Math.random() > 0.2) {
          removeTalentMods(gameState.p2, gameState.p2.talent, gameState.config);
          const combinedPool = [];
          for (let i=0; i<TALENT_POOL.numerical.length; i++) combinedPool.push(TALENT_POOL.numerical[i]);
          for (let i=0; i<TALENT_POOL.mechanism.length; i++) combinedPool.push(TALENT_POOL.mechanism[i]);
          const aiT = combinedPool[Math.floor(Math.random() * combinedPool.length)];
          gameState.p2.talent = aiT; applyTalentMods(gameState.p2, aiT);
        }
        gameState.p2.rerolled = true;
      }
      render(gameState); checkRoundStart(); 
    } else {
      gameState.p1.talent = t; applyTalentMods(gameState.p1, t);
      const combinedPool = [];
      for (let i=0; i<TALENT_POOL.numerical.length; i++) combinedPool.push(TALENT_POOL.numerical[i]);
      for (let i=0; i<TALENT_POOL.mechanism.length; i++) combinedPool.push(TALENT_POOL.mechanism[i]);
      const aiT = combinedPool[Math.floor(Math.random() * combinedPool.length)];
      gameState.p2.talent = aiT; applyTalentMods(gameState.p2, aiT);
      render(gameState); 
    }
  } else {
    let pData = gameState[myRole];
    if (isReroll) {
      if (t !== 'keep') { removeTalentMods(pData, pData.talent, gameState.config); pData.talent = t; applyTalentMods(pData, t); }
      pData.rerolled = true;
    } else { pData.talent = t; pData.ready = true; applyTalentMods(pData, t); }
    if (roomRef) roomRef.child(myRole).set(pData);
  }
}
function showTalentDetail(t) {
  if (!t) return;
  document.getElementById('td-name').innerText = t.name;
  const typeBadge = document.getElementById('td-type');
  if (t.type === 'angel') { typeBadge.innerText = '👼 天使 | ' + t.category + '类'; typeBadge.style.background = '#3fb950'; } 
  else { typeBadge.innerText = '😈 恶魔 | ' + t.category + '类'; typeBadge.style.background = '#a371f7'; }
  document.getElementById('td-desc').innerText = t.desc; document.getElementById('talent-detail-modal').style.display = 'flex';
}

// ==================== 安全校验与动作处理 ====================
function checkRoundStart() {
  if (isPvE) return; 
  if (!gameState || gameState.status !== 'playing') return;
  const cap = gameState.config.capacity;
  const aliveKeys = [];
  if (cap >= 1 && gameState.p1 && gameState.p1.hp > 0) aliveKeys.push('p1');
  if (cap >= 2 && gameState.p2 && gameState.p2.hp > 0) aliveKeys.push('p2');
  if (cap >= 3 && gameState.p3 && gameState.p3.hp > 0) aliveKeys.push('p3');
  if (cap >= 4 && gameState.p4 && gameState.p4.hp > 0) aliveKeys.push('p4');

  if (gameState.round === 80) {
    let allRerolled = true;
    for (let i = 0; i < aliveKeys.length; i++) { if (!gameState[aliveKeys[i]].rerolled) { allRerolled = false; break; } }
    if (!allRerolled) return; 
  }
  let allMoved = true;
  for (let i = 0; i < aliveKeys.length; i++) { if (gameState[aliveKeys[i]].move === "") { allMoved = false; break; } }

  if (allMoved && aliveKeys.length > 0 && myRole === aliveKeys[0]) {
    if (isProcessing) return; isProcessing = true;
    setTimeout(function() {
      roomRef.once('value', function(snap) {
        const currentData = snap.val();
        if (currentData) {
          let stillAllMoved = true;
          for (let i = 0; i < aliveKeys.length; i++) { if (currentData[aliveKeys[i]].move === "") { stillAllMoved = false; break; } }
          if (stillAllMoved) { gameState = currentData; processRound(); }
        }
        isProcessing = false; 
      });
    }, 500); 
  }
}

function handleInput(move, val = 0) {
  if (!gameState || !myRole || myRole === 'spectator' || !gameState[myRole]) return;
  const myData = gameState[myRole];
  if (myData.move !== "" || myData.hp <= 0) return;
  if (gameState.round === 80 && !myData.rerolled) return;

  const t = myData.talent;
  if (t) {
    if (t.id === 'm_a1' && move === 'shoot' && val > 2) return alert("【圣盾坚壁】单次射击最高 2 发");
    if (t.id === 'm_d1' && move === 'shield') return alert("【深渊魔弹】无法使用防御");
    if (t.id === 'n_d1' && (move === 'shoot' || move === 'fatal_shoot') && gameState.round === 1) return alert("【军火狂人】第一回合禁止开火");
    if (t.id === 'm_a2' && move === 'heal') return alert("【圣戒】丧失包扎能力");
  }

  if ((move === 'shoot' || move === 'fatal_shoot') && myData.ammo < val) return alert("弹药不足！");
  if (move === 'heal') {
    if (gameState.round >= 100) return alert("【生体衰竭】100回合后包扎永久禁用！");
    if (myData.healCd > 0) return alert("【包扎】冷却中，还需 " + myData.healCd + " 回合！");
    if (myData.shield < 2) return alert("【包扎】需要消耗 2 护盾！");
    if (myData.hp >= myData.maxHp) return alert("生命值已满。");
  }
  if (move === 'holy_light') {
    if (!t || t.id !== 'm_a2') return alert("非法操作！");
    if (myData.holyCd > 0) return alert("【圣光】冷却中，还需 " + myData.holyCd + " 回合！");
  }
  if (move === 'dual_heal') {
    if (!t || t.id !== 'm_a4') return alert("非法操作！");
    if (myData.dualCd > 0) return alert("【渡灵】冷却中，还需 " + myData.dualCd + " 回合！");
  }
  if (move === 'fatal_shoot') {
    if (!t || t.id !== 'm_d4') return alert("非法操作！");
    if (myData.fatalCd > 0) return alert("【狂击】冷却中，还需 " + myData.fatalCd + " 回合！");
  }

  let target = "";
  if (move === 'shoot' || move === 'ground_spike' || move === 'holy_light' || move === 'fatal_shoot') {
    if (gameState.config.capacity === 2) { target = myRole === 'p1' ? 'p2' : 'p1'; } 
    else {
      const tRadio = document.querySelector('input[name="atk-target"]:checked');
      if (!tRadio) return alert("请先锁定目标🎯！");
      target = tRadio.value;
      if (gameState[target] && gameState[target].hp <= 0) return alert("目标已阵亡！");
    }
  }

  if (isPvE) {
    gameState.p1.move = move; gameState.p1.val = val; gameState.p1.target = target;
    const aiDecision = getSmartAiMove('p2', 'p1');
    gameState.p2.move = aiDecision.move; gameState.p2.val = aiDecision.val; gameState.p2.target = 'p1';
    processRound();
  } else {
    if (roomRef) roomRef.child(myRole).update({ move: move, val: val, target: target });
  }
}

function getSmartAiMove(aiKey, oppKey) {
  const ai = gameState[aiKey]; const human = gameState[oppKey]; let allowedMoves = [];
  let baseMoves = ['reload', 'shield', 'duck', 'ground_spike', 'rock'];
  for (let i = 0; i < baseMoves.length; i++) {
    let m = baseMoves[i]; let pushIt = true;
    if (m === 'shield' && ai.talent && ai.talent.id === 'm_d1') pushIt = false;
    if (pushIt) allowedMoves.push(m);
  }
  if (ai.talent && ai.talent.id === 'm_a2' && ai.holyCd === 0) allowedMoves.push('holy_light', 'holy_light');
  if (ai.talent && ai.talent.id === 'm_a4' && ai.dualCd === 0 && ai.hp < ai.maxHp) {
    if (ai.hp <= 3 && Math.random() < 0.7) return { move: 'dual_heal', val: 0 };
    allowedMoves.push('dual_heal');
  }
  if ((!ai.talent || ai.talent.id !== 'm_a2') && gameState.round < 100) {
    if (ai.shield >= 2 && ai.hp < ai.maxHp && ai.healCd === 0) {
      if (ai.hp <= 2 && Math.random() < 0.8) return { move: 'heal', val: 0 };
      allowedMoves.push('heal'); 
    }
  }
  let canShoot = true; if (ai.ammo <= 0) canShoot = false;
  if (ai.talent && ai.talent.id === 'n_d1' && gameState.round === 1) canShoot = false;

  if (human.ammo >= 3 && ai.shield === 0 && Math.random() < 0.7) {
    let defMoves = [];
    if (!ai.talent || ai.talent.id !== 'm_d1') defMoves.push('shield');
    defMoves.push('duck');
    if (defMoves.length > 0) return { move: defMoves[Math.floor(Math.random() * defMoves.length)], val: 0 };
  }

  let isPiercing = (ai.talent && ai.talent.id === 'm_d1'); let effectiveShield = isPiercing ? 0 : human.shield;
  if (canShoot) {
    let maxVal = ai.ammo; if (maxVal > ai.maxAmmo) maxVal = ai.maxAmmo;
    if (ai.talent && ai.talent.id === 'm_a1' && maxVal > 2) maxVal = 2;
    let canFatal = (ai.talent && ai.talent.id === 'm_d4' && ai.fatalCd === 0);
    if (maxVal > effectiveShield && (maxVal - effectiveShield) >= human.hp) return { move: 'shoot', val: maxVal };
    if (canFatal) {
      if ((maxVal * 2) > effectiveShield && (maxVal * 2 - effectiveShield) >= human.hp && Math.random() < 0.7) return { move: 'fatal_shoot', val: maxVal };
      if (Math.random() < 0.4) return { move: 'fatal_shoot', val: maxVal };
    }
    allowedMoves.push('shoot', 'shoot');
  } else {
    if (Math.random() < 0.7) return { move: 'reload', val: 0 };
  }

  let chosenMove = allowedMoves[Math.floor(Math.random() * allowedMoves.length)]; let shootVal = 0;
  if (chosenMove === 'shoot' || chosenMove === 'fatal_shoot') {
    let maxVal = ai.ammo; if (maxVal > ai.maxAmmo) maxVal = ai.maxAmmo;
    if (ai.talent && ai.talent.id === 'm_a1' && maxVal > 2) maxVal = 2;
    shootVal = Math.floor(Math.random() * maxVal) + 1;
  }
  return { move: chosenMove, val: shootVal };
}

// ==================== 极限防弹核算矩阵 ====================
function processRound() {
  let data = gameState; let logs = [];
  const moveMap = { reload:'装弹', shield:'防御', duck:'趴下', ground_spike:'地刺', rock:'石头', shoot:'射击', heal:'包扎', holy_light:'圣光', dual_heal:'渡灵', fatal_shoot:'狂击' };
  const cap = data.config.capacity; const allKeys = ['p1', 'p2', 'p3', 'p4'];

  let alive = [];
  for (let i = 0; i < allKeys.length; i++) {
    const k = allKeys[i]; if (i < cap && data[k] && data[k].hp > 0) alive.push(k);
  }
  for (let i = 0; i < alive.length; i++) { data[alive[i]].tookDamage = false; }

  let actionStrs = [];
  for (let i = 0; i < alive.length; i++) {
    const p = alive[i]; let m = data[p].move; if (m === "") continue; 
    let mStr = (m === 'shoot' || m === 'fatal_shoot') ? `${data[p].val}发${moveMap[m]}` : moveMap[m];
    if (data[p].target && cap > 2 && (m === 'shoot' || m === 'fatal_shoot' || m === 'ground_spike' || m === 'holy_light')) mStr += `(➡${data[p].target.replace('p', '').toUpperCase()})`;
    actionStrs.push(`${p.replace('p', '').toUpperCase()}:${mStr}`);
  }
  const actionHeader = `【${actionStrs.join(' | ')}】`;

  for (let i = 0; i < alive.length; i++) {
    const p = alive[i]; let player = data[p]; if (player.move === "") continue;
    if (player.move === 'reload') {
      let gain = 1;
      if (player.talent && player.talent.id === 'm_d2') {
        if (player.talentCd === 0) {
          if (player.hp > 1) { gain = 3; player.hp -= 1; player.talentCd = 3; logs.push(`${p.toUpperCase()} 触发嗜血，流失 1 血换取 3 弹药`); } 
          else logs.push(`<span style="color:#d29922;">${p.toUpperCase()} 触发濒死保护，转为安全装弹</span>`);
        } else logs.push(`<span style="color:#8b949e;">${p.toUpperCase()} 嗜血冷却中，普通装弹</span>`);
      }
      player.ammo = Math.min(player.ammo + gain, player.maxAmmo);
    }
    if (player.move === 'shield') {
      let gain = (player.talent && player.talent.id === 'm_a1') ? 2 : 1;
      player.shield = Math.min(player.shield + gain, player.maxShield);
    }
    if (player.move === 'heal') {
      player.shield -= 2; player.hp = Math.min(player.hp + 1, player.maxHp);
      let baseWait = (data.round >= 80) ? 4 : 2; player.healCd = baseWait + 1; 
      logs.push(`<span class="log-safe">${p.toUpperCase()} 包扎完成，生命恢复！</span>`);
    }
    if (player.move === 'dual_heal') {
      player.dualCd = 5; 
      if (Math.random() < 0.5) {
        player.hp = Math.min(player.hp + 1, player.maxHp); logs.push(`<span class="log-safe">✨ ${p.toUpperCase()} 渡灵法阵眷顾，恢复自身 1 点生命！</span>`);
      } else {
        let enemies = []; for (let k = 0; k < alive.length; k++) { if (alive[k] !== p) enemies.push(alive[k]); }
        if (enemies.length > 0) {
          let randEnemyKey = enemies[Math.floor(Math.random() * enemies.length)];
          data[randEnemyKey].hp = Math.min(data[randEnemyKey].hp + 1, data[randEnemyKey].maxHp);
          logs.push(`<span class="log-dmg">💀 ${p.toUpperCase()} 渡灵反转！为敌人 ${randEnemyKey.replace('p','').toUpperCase()} 恢复了 1 点生命！</span>`);
        } else logs.push(`<span style="color:#8b949e;">✨ ${p.toUpperCase()} 渡灵落空...</span>`);
      }
    }
    if (player.move !== 'shoot' && player.move !== 'fatal_shoot' && player.ammo > player.maxAmmo) player.ammo = player.maxAmmo;
  }

  for (let i = 0; i < alive.length; i++) {
    const attKey = alive[i]; let att = data[attKey];
    if (!att || (att.move !== 'shoot' && att.move !== 'ground_spike' && att.move !== 'holy_light' && att.move !== 'fatal_shoot')) continue;
    let defKey = att.target; let def = data[defKey];
    let attN = attKey.replace('p', '').toUpperCase(); let defN = defKey ? defKey.replace('p', '').toUpperCase() : '空气';
    let actualDmg = 0;

    if (!def || def.hp <= 0) { 
      if (cap > 2) logs.push(`<span style="color:#8b949e">${attN} 的攻击落空。</span>`); 
      if (att.move === 'shoot') att.ammo -= att.val;
      if (att.move === 'fatal_shoot') { att.ammo -= att.val; att.fatalCd = 4; }
      if (att.move === 'holy_light') att.holyCd = 6;
      continue; 
    }

    if (att.move === 'holy_light') {
      att.holyCd = 6; def.hp -= 1; def.tookDamage = true; att.hp = Math.min(att.hp + 1, att.maxHp);
      logs.push(`<span class="log-safe">✨ ${attN} 圣光降临，抽取 ${defN} 1点生命！</span>`);
    }

    if (att.move === 'shoot' || att.move === 'fatal_shoot') {
      const isPiercing = (att.talent && att.talent.id === 'm_d1'); 
      let isFatal = (att.move === 'fatal_shoot'); let dmgToApply = att.val; let shouldProceedShoot = true;

      if (isFatal) {
        att.fatalCd = 4; let roll = Math.random();
        if (roll < 0.60) {
          att.ammo -= att.val; dmgToApply = att.val * 2; logs.push(`<span class="log-dmg">🩸 ${attN} 狂击暴走！双倍伤害！</span>`);
        } else if (roll < 0.80) {
          shouldProceedShoot = false; let selfDmg = Math.floor(att.val / 2);
          if (selfDmg > 0) { att.hp -= selfDmg; att.tookDamage = true; logs.push(`<span class="log-dmg">💀 ${attN} 狂击反噬！承受 ${selfDmg} 伤害！</span>`); } 
          else logs.push(`<span style="color:#d29922;">💀 ${attN} 狂击反噬，威力过小幸免于难。</span>`);
        } else {
          shouldProceedShoot = false; att.ammo -= att.val; logs.push(`<span style="color:#8b949e;">💨 ${attN} 狂击哑火...</span>`);
        }
      } else { att.ammo -= att.val; }

      if (shouldProceedShoot) {
        if (def.move === 'duck' || def.move === 'ground_spike') logs.push(`<span class="log-safe">${defN} 避开了 ${attN} 的射击</span>`);
        else if (def.move === 'shield' && !isPiercing) {
          if (dmgToApply > def.shield) {
            let dmg = dmgToApply - def.shield; def.hp -= dmg; def.shield = 0; def.tookDamage = true; actualDmg = dmg;
            logs.push(`<span class="log-dmg">${attN} 击穿 ${defN} 护盾造成 ${dmg} 伤</span>`);
          } else { def.shield -= dmgToApply; logs.push(`<span class="log-safe">${defN} 的护盾吸收了 ${attN} 的伤害</span>`); }
        } else {
          def.hp -= dmgToApply; def.tookDamage = true; actualDmg = dmgToApply;
          let hitType = isPiercing ? '无视护盾' : '直接'; logs.push(`<span class="log-dmg">${attN} ${hitType}对 ${defN} 造成 ${dmgToApply} 伤</span>`);
        }
      }
    }

    if (att.move === 'ground_spike') {
      if (def.move === 'rock') { att.hp -= 1; att.tookDamage = true; logs.push(`<span class="log-dmg">${defN} 反弹地刺，${attN} 受到 1 伤</span>`); } 
      else if (def.move === 'duck') { def.hp -= 2; def.tookDamage = true; logs.push(`<span class="log-dmg">${attN} 的地刺贯穿了 ${defN}，造成 2 伤</span>`); }
    }

    if (actualDmg > 0 && (att.move === 'shoot' || att.move === 'fatal_shoot') && att.talent && att.talent.id === 'm_d3') {
      if (att.talentCd === 0) {
        if (att.hp < att.maxHp) { att.hp = Math.min(att.hp + 1, att.maxHp); att.talentCd = 3; logs.push(`<span class="log-dmg">😈 ${attN} 吞噬生效，吸取 1 点鲜血！</span>`); }
      }
    }
  }

  for (let i = 0; i < alive.length; i++) {
    const p = alive[i]; let player = data[p];
    if (player.talent && player.talent.id === 'm_a3' && player.talentCd === 0) {
      if (!player.tookDamage && player.move !== 'shoot' && player.move !== 'fatal_shoot' && player.hp < player.maxHp) {
        player.hp = Math.min(player.hp + 1, player.maxHp); player.talentCd = 3; logs.push(`<span class="log-safe">👼 ${p.toUpperCase()} 缓慢恢复了 1 点血量</span>`);
      }
    }
    delete player.tookDamage; 
  }

  let battleResult = logs.length > 0 ? logs.join('<br>') : '<span style="color:#8b949e">双方试探，未爆发冲突</span>';
  data.log = `<div class="action-header">${actionHeader}</div><div class="result-body" style="margin-top:10px;">${battleResult}</div>`;

  for (let i = 0; i < allKeys.length; i++) {
    const p = allKeys[i];
    if (data[p]) { 
      data[p].move = ""; data[p].target = ""; 
      if (data[p].healCd > 0) data[p].healCd -= 1;
      if (data[p].talentCd > 0) data[p].talentCd -= 1;
      if (data[p].holyCd > 0) data[p].holyCd -= 1;
      if (data[p].dualCd > 0) data[p].dualCd -= 1;
      if (data[p].fatalCd > 0) data[p].fatalCd -= 1;
    } 
  }
  data.round += 1;

  if (data.round === 80) {
    data.log += `<div style="color:var(--gold); font-weight:bold; margin-top:10px; background:rgba(210,153,34,0.1); padding:10px; border-radius:8px;">✨ 异象突生：第80回合，全员强制【机缘重铸】！</div>`;
    for (let i = 0; i < allKeys.length; i++) { if (data[allKeys[i]]) data[allKeys[i]].rerolled = false; }
  }
  if (data.round === 100) {
    data.log += `<div style="color:var(--red); font-weight:bold; margin-top:10px; background:rgba(248,81,73,0.1); padding:10px; border-radius:8px;">⚠️ 警告：第100回合【生体衰竭】，包扎永久禁用！</div>`;
  }
  if (data.round === 120) {
    data.log += `<div style="color:var(--red); font-weight:bold; margin-top:10px; background:rgba(248,81,73,0.1); padding:10px; border-radius:8px;">💀 警告：第120回合【绝对枯竭】，全员血盾上限 -2！</div>`;
    for (let i = 0; i < allKeys.length; i++) {
      const p = allKeys[i];
      if (data[p] && data[p].hp > 0) {
        data[p].maxShield -= 2; if (data[p].maxShield < 0) data[p].maxShield = 0;
        if (data[p].shield > data[p].maxShield) data[p].shield = data[p].maxShield;
        data[p].maxHp -= 2; if (data[p].maxHp < 1) data[p].maxHp = 1;
        if (data[p].hp > data[p].maxHp) data[p].hp = data[p].maxHp;
      }
    }
  }

  let stillAliveCount = 0; let winner = "";
  for (let i = 0; i < allKeys.length; i++) { if (data[allKeys[i]] && data[allKeys[i]].hp > 0) { stillAliveCount++; winner = allKeys[i]; } }

  if (stillAliveCount <= 1) {
    let winStr = (stillAliveCount === 0) ? "惨烈战况，全军覆没！" : `🎉 玩家 [${data[winner].username || winner.toUpperCase()}] 取得胜利！`;
    data.log += `<div class="win-msg" style="margin-top:20px;">${winStr}</div>`;
    data.status = 'finished'; data.playAgain = { p1: false, p2: false, p3: false, p4: false };

    if (myRole === 'p1' && !isPvE) {
      for (let i = 0; i < allKeys.length; i++) {
        const pk = allKeys[i];
        if (data[pk] && data[pk].joined && data[pk].uid) {
          let userUid = data[pk].uid; let isWinner = (data[pk].hp > 0 && stillAliveCount === 1);
          db.ref('users/' + userUid + '/stats').once('value', function(snap) {
            let s = snap.val() || { total: 0, wins: 0 };
            s.total += 1; if (isWinner) s.wins += 1; db.ref('users/' + userUid + '/stats').set(s);
          });
        }
      }
    }
  }
  if (!isPvE && roomRef) roomRef.set(data); else render(data); 
}

function handleRematchAction() {
  if (isPvE) { selectMode('pve'); return; }
  if (roomRef && myRole && myRole !== 'spectator') roomRef.child('playAgain').child(myRole).set(true);
}
function resetRoomForRematch(oldData) {
  let cap = oldData.config.capacity; let newData = getInitialState(cap);
  const pKeys = ['p1', 'p2', 'p3', 'p4'];
  for (let i = 0; i < pKeys.length; i++) {
    const p = pKeys[i];
    if (oldData[p] && oldData[p].joined) {
      newData[p].joined = true; newData[p].ready = false; 
      newData[p].uid = oldData[p].uid; newData[p].username = oldData[p].username; newData[p].title = oldData[p].title;
    }
  }
  if (roomRef) roomRef.set(newData);
}

// ==================== 渲染引擎 (DOM 接驳) ====================
function render(data) {
  if (!data) return;

  if (data.status === 'playing' && data.round === 80) {
    if (myRole && myRole !== 'spectator' && data[myRole] && data[myRole].hp > 0 && !data[myRole].rerolled) {
      const overlay = document.getElementById('talent-overlay');
      if (overlay && overlay.style.display !== 'flex') showTalentSelection(true);
    }
  }

  const cap = data.config.capacity;
  updatePlayerCardDOM('p1', data.p1, 1 <= cap && !(isPvE && data.p1 && data.p1.hp <= 0 && 'p1' === 'p3'), data);
  updatePlayerCardDOM('p2', data.p2, 2 <= cap && !(isPvE && data.p2 && data.p2.hp <= 0 && 'p2' === 'p3'), data);
  updatePlayerCardDOM('p3', data.p3, 3 <= cap && !(isPvE && data.p3 && data.p3.hp <= 0 && 'p3' === 'p3'), data);
  updatePlayerCardDOM('p4', data.p4, 4 <= cap && !(isPvE && data.p4 && data.p4.hp <= 0 && 'p4' === 'p3'), data);

  const logInner = document.getElementById('battle-log-inner'); if (logInner) logInner.innerHTML = data.log;
  const roundEl = document.getElementById('current-round'); if (roundEl) roundEl.innerText = data.round;

  const specBanner = document.getElementById('spectator-banner-game');
  if (specBanner) specBanner.style.display = (myRole === 'spectator') ? 'block' : 'none';

  updateActionPanel(data); updateRematchPanel(data);
}

function updateRematchPanel(data) {
  const panel = document.getElementById('rematch-panel');
  const statusText = document.getElementById('rematch-status');
  const actionBtn = document.getElementById('btn-rematch-action');

  if (data.status !== 'finished') { if (panel) panel.style.display = 'none'; return; }
  if (panel) panel.style.display = 'block';

  if (isPvE) {
    statusText.innerText = "单机模式结束"; actionBtn.innerText = "再来一局"; actionBtn.onclick = handleRematchAction; return;
  }
  if (myRole === 'spectator') {
    statusText.innerText = "等待房主选择是否再来一局..."; actionBtn.style.display = 'none'; return;
  }

  actionBtn.style.display = 'inline-block'; if (!data.playAgain) data.playAgain = {};
  if (myRole === 'p1') {
    if (!data.playAgain.p1) {
      statusText.innerText = "房主权限：保留原班人马再来一局？"; actionBtn.innerText = "发起再来一局"; actionBtn.onclick = handleRematchAction;
    } else {
      let waitCount = 0; const cap = data.config.capacity;
      if (cap >= 2 && data.p2 && data.p2.joined && !data.playAgain.p2) waitCount++;
      if (cap >= 3 && data.p3 && data.p3.joined && !data.playAgain.p3) waitCount++;
      if (cap >= 4 && data.p4 && data.p4.joined && !data.playAgain.p4) waitCount++;

      if (waitCount > 0) { statusText.innerText = `已发起！等待 ${waitCount} 名玩家同意...`; actionBtn.style.display = 'none'; } 
      else {
        statusText.innerText = "全体同意！重置中..."; actionBtn.style.display = 'none';
        if (!isProcessing) { isProcessing = true; setTimeout(function() { resetRoomForRematch(data); isProcessing = false; }, 800); }
      }
    }
  } else {
    if (!data.playAgain.p1) { statusText.innerText = "等待房主发起..."; actionBtn.style.display = 'none'; } 
    else {
      if (!data.playAgain[myRole]) { statusText.innerText = "房主已发起，同意重归战场？"; actionBtn.innerText = "同意开启新局"; actionBtn.onclick = handleRematchAction; } 
      else { statusText.innerText = "已同意，等待其他玩家..."; actionBtn.style.display = 'none'; }
    }
  }
}

function updatePlayerCardDOM(pKey, pData, isVisible, fullData) {
  const cardEl = document.getElementById(`${pKey}-card`); const tsRadio = document.getElementById(`ts-${pKey}`);
  if (!isVisible || !pData) { if (cardEl) cardEl.style.display = 'none'; if (tsRadio) tsRadio.style.display = 'none'; return; } 
  else { if (cardEl) cardEl.style.display = 'block'; }

  const hpEl = document.getElementById(`${pKey}-hp`); const ammoEl = document.getElementById(`${pKey}-ammo`);
  const shieldEl = document.getElementById(`${pKey}-shield`); const talentEl = document.getElementById(`${pKey}-talent-name`);
  const connEl = document.getElementById(`${pKey}-conn`); const turnStatusEl = document.getElementById(`${pKey}-turn-status`);
  const playerLabelEl = document.getElementById(`${pKey}-label`);

  if (playerLabelEl && pData.username) {
    let tStr = pData.title ? `[${pData.title}] ` : ""; let baseName = `${tStr}${pData.username}`;
    let existingNameSpan = document.getElementById(`${pKey}-name-display`);
    if (existingNameSpan) existingNameSpan.innerText = baseName;
    else playerLabelEl.innerHTML = `<span id="${pKey}-name-display">${baseName}</span> <span id="${pKey}-turn-status" class="turn-status"></span> <span id="${pKey}-conn" class="conn-status">(离线)</span>`;
  }
  const newConnEl = document.getElementById(`${pKey}-conn`); const newTurnStatusEl = document.getElementById(`${pKey}-turn-status`);

  if (newConnEl) newConnEl.style.display = (!isPvE && pData.hp > 0 && !pData.joined) ? 'inline' : 'none';
  if (newTurnStatusEl) {
    if (pData.hp > 0 && fullData.status === 'playing') newTurnStatusEl.innerHTML = (pData.move !== "") ? `<span style="color: #3fb950;">(✅ 已出招)</span>` : `<span style="color: #d29922;">(🤔 思考中...)</span>`;
    else newTurnStatusEl.innerHTML = ''; 
  }
  if (talentEl) {
    if (pData.talent) {
      let cdText = "";
      if (pData.talent.id === 'm_a2' && pData.holyCd > 0) cdText = ` <span style="color:#f85149; font-size:0.85em;">(CD:${pData.holyCd})</span>`;
      else if (pData.talent.id === 'm_a4' && pData.dualCd > 0) cdText = ` <span style="color:#f85149; font-size:0.85em;">(CD:${pData.dualCd})</span>`;
      else if (pData.talent.id === 'm_d4' && pData.fatalCd > 0) cdText = ` <span style="color:#f85149; font-size:0.85em;">(CD:${pData.fatalCd})</span>`;
      else if (pData.talentCd > 0) cdText = ` <span style="color:#f85149; font-size:0.85em;">(CD:${pData.talentCd})</span>`;
      talentEl.innerHTML = `◈ ${pData.talent.name}${cdText} <span style="opacity:0.8; font-size:1.1em; cursor:pointer;">ℹ️</span>`;
      talentEl.style.display = 'inline-block'; talentEl.onclick = function() { showTalentDetail(pData.talent); };
    } else { talentEl.innerText = "无天赋"; talentEl.style.display = 'none'; talentEl.onclick = null; }
  }

  if (pData.hp <= 0) {
    if (cardEl) { cardEl.style.opacity = '0.3'; cardEl.style.filter = 'grayscale(1)'; }
    if (tsRadio) tsRadio.style.display = 'none';
  } else {
    if (cardEl) { cardEl.style.opacity = '1'; cardEl.style.filter = 'none'; }
    if (tsRadio) {
      if (pKey === myRole || myRole === 'spectator') tsRadio.style.display = 'none';
      else { tsRadio.style.display = 'inline-block'; let spanT = document.getElementById(`label-t-${pKey}`); if(spanT && pData.username) spanT.innerText = pData.username; }
    }
  }

  if (hpEl) {
    hpEl.innerText = `${pData.hp}/${pData.maxHp}`;
    if (pData.hp >= Math.ceil(pData.maxHp * 0.7)) hpEl.style.color = "#3fb950";
    else if (pData.hp >= Math.ceil(pData.maxHp * 0.3)) hpEl.style.color = "#d29922";
    else hpEl.style.color = "#f85149";
  }
  if (ammoEl) { ammoEl.innerText = `${pData.ammo}/${pData.maxAmmo}`; if (pData.ammo > 0) ammoEl.style.color = "#d29922"; else if (pData.ammo === 0) ammoEl.style.color = "#c9d1d9"; else ammoEl.style.color = "#f85149"; }
  if (shieldEl) { shieldEl.innerText = `${pData.shield}/${pData.maxShield}`; shieldEl.style.color = "#58a6ff"; }
}

function updateActionPanel(data) {
  const cap = data.config.capacity;
  const panelContainer = document.getElementById('action-panel-container'); const actionControls = document.getElementById('action-controls'); const actionWaiting = document.getElementById('action-waiting'); const targetSelector = document.getElementById('target-selector');

  if (myRole === 'spectator') { if (panelContainer) panelContainer.style.display = 'none'; return; } 
  else { if (panelContainer) panelContainer.style.display = 'block'; }

  if (targetSelector) { if (cap === 2) targetSelector.style.display = 'none'; else targetSelector.style.display = 'flex'; }

  const shootControls = document.getElementById('shoot-controls'); const fatalShootBtns = document.getElementById('fatal-shoot-btns');

  if (data[myRole]) {
     let htmlStr = `<span>射击强度:</span>`; let fatalStr = ``;
     for (let i = 1; i <= data[myRole].maxAmmo; i++) {
        htmlStr += `<button class="s-btn" id="btn-s${i}" onclick="handleInput('shoot', ${i})">${i}</button>`;
        fatalStr += `<button class="s-btn" id="btn-f${i}" onclick="handleInput('fatal_shoot', ${i})" style="background:var(--purple);">${i}</button>`;
     }
     if (shootControls) shootControls.innerHTML = htmlStr; 
     if (fatalShootBtns) fatalShootBtns.innerHTML = fatalStr; 
  }

  if (myRole && data[myRole] && data[myRole].hp > 0 && data.status === 'playing') {
    if (data.round === 80) {
       let allRerolled = true;
       if (cap >= 1 && data.p1 && data.p1.hp > 0 && !data.p1.rerolled) allRerolled = false;
       if (cap >= 2 && data.p2 && data.p2.hp > 0 && !data.p2.rerolled) allRerolled = false;
       if (cap >= 3 && data.p3 && data.p3.hp > 0 && !data.p3.rerolled) allRerolled = false;
       if (cap >= 4 && data.p4 && data.p4.hp > 0 && !data.p4.rerolled) allRerolled = false;

       if (!allRerolled) {
          if (actionControls) actionControls.style.display = 'none';
          if (actionWaiting) { actionWaiting.style.display = 'block'; actionWaiting.innerHTML = '<div class="spinner">⏳</div><p>命运重铸中，等待全员抉择...</p>'; }
          return;
       }
    }

    if (actionWaiting) actionWaiting.innerHTML = '<div class="spinner">⏳</div><p id="action-waiting-text">指令已安全锁定，正在等待其他玩家深思熟虑...</p>';

    if (data[myRole].move !== "") {
      if (actionControls) actionControls.style.display = 'none';
      if (actionWaiting) actionWaiting.style.display = 'block';
    } else {
      if (actionControls) actionControls.style.display = 'block';
      if (actionWaiting) actionWaiting.style.display = 'none';

      const myAmmo = data[myRole].ammo; const myTalent = data[myRole].talent; const maxA = data[myRole].maxAmmo;

      for (let i = 1; i <= maxA; i++) {
        const btn = document.getElementById(`btn-s${i}`); if (!btn) continue;
        let disabled = false;
        if (i > myAmmo) disabled = true;
        if (myTalent && myTalent.id === 'm_a1' && i > 2) disabled = true;
        if (myTalent && myTalent.id === 'n_d1' && data.round === 1) disabled = true;
        if (disabled) btn.classList.add('disabled'); else btn.classList.remove('disabled');
      }

      const fatalRow = document.getElementById('fatal-shoot-controls'); const fatalLabel = document.getElementById('fatal-shoot-label');
      if (fatalRow) {
        if (myTalent && myTalent.id === 'm_d4') {
          fatalRow.style.display = 'flex'; let globalFatalDisabled = false;
          if (data[myRole].fatalCd > 0) { globalFatalDisabled = true; if(fatalLabel) fatalLabel.innerText = `狂击(CD:${data[myRole].fatalCd}):`; } 
          else { if(fatalLabel) fatalLabel.innerText = `蚀命狂击:`; }
          for (let i = 1; i <= maxA; i++) {
            const btnF = document.getElementById(`btn-f${i}`); if (!btnF) continue;
            let disabled = globalFatalDisabled; if (i > myAmmo) disabled = true;
            if (disabled) btnF.classList.add('disabled'); else btnF.classList.remove('disabled');
          }
        } else fatalRow.style.display = 'none';
      }

      const healBtn = document.querySelector('.t-heal');
      if (healBtn) {
        if (data.round >= 100) { healBtn.classList.add('disabled'); healBtn.innerText = '包扎 (已衰竭)'; } 
        else if (myTalent && myTalent.id === 'm_a2') { healBtn.classList.add('disabled'); healBtn.innerText = '包扎 (已禁用)'; } 
        else if (data[myRole].healCd > 0) { healBtn.classList.add('disabled'); healBtn.innerText = `包扎 (CD:${data[myRole].healCd})`; } 
        else if (data[myRole].shield < 2 || data[myRole].hp >= data[myRole].maxHp) { healBtn.classList.add('disabled'); healBtn.innerText = '包扎'; } 
        else { healBtn.classList.remove('disabled'); healBtn.innerText = '包扎'; }
      }

      const holyBtn = document.getElementById('btn-holy');
      if (holyBtn) {
        if (myTalent && myTalent.id === 'm_a2') {
          holyBtn.style.display = 'inline-block';
          if (data[myRole].holyCd > 0) { holyBtn.classList.add('disabled'); holyBtn.innerText = `圣光 (CD:${data[myRole].holyCd})`; } 
          else { holyBtn.classList.remove('disabled'); holyBtn.innerText = `圣光`; }
        } else holyBtn.style.display = 'none';
      }

      const dualBtn = document.getElementById('btn-dual');
      if (dualBtn) {
        if (myTalent && myTalent.id === 'm_a4') {
          dualBtn.style.display = 'inline-block';
          if (data[myRole].dualCd > 0) { dualBtn.classList.add('disabled'); dualBtn.innerText = `渡灵 (CD:${data[myRole].dualCd})`; } 
          else { dualBtn.classList.remove('disabled'); dualBtn.innerText = `渡灵`; }
        } else dualBtn.style.display = 'none';
      }
    }
  } else {
    if (actionControls) actionControls.style.display = 'none';
    if (actionWaiting) actionWaiting.style.display = 'none';
  }
}