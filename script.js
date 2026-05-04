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
let isRerollingGlobal = false;
let selectedPocketIndex = -1;
let currentLeaderboardTab = 'angel'; // 默认查看天使榜

// ==================== 用户认证与缓存 ====================
let currentUser = { uid: "", username: "", title: "初阶特工", avatar: "", signatureTalent: "", stats: { total: 0, wins: 0 }, factions: { angel: {total:0, wins:0, history:{}}, demon: {total:0, wins:0, history:{}}, heretic: {total:0, wins:0, history:{}} }, friends: {} };

window.onload = function() {
  const cachedUid = localStorage.getItem('pulse_uid');
  if (cachedUid) {
    db.ref('users/' + cachedUid).once('value', function(snap) {
      if (snap.val()) {
        currentUser = snap.val();
        if (!currentUser.stats) currentUser.stats = { total: 0, wins: 0 };
        if (!currentUser.factions) currentUser.factions = { angel: {total:0, wins:0, history:{}}, demon: {total:0, wins:0, history:{}}, heretic: {total:0, wins:0, history:{}} };
        if (!currentUser.friends) currentUser.friends = {};
        if (!currentUser.title) currentUser.title = "初阶特工";
        if (!currentUser.avatar) currentUser.avatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%2330363d'/><text x='50' y='50' font-size='40' text-anchor='middle' dy='.3em' fill='%23fff'>?</text></svg>";
        setupPresence(); showHub();
      } else { localStorage.removeItem('pulse_uid'); }
    });
  }
};

function setupPresence() {
  const connectedRef = db.ref(".info/connected");
  connectedRef.on("value", function(snap) {
    if (snap.val() === true && currentUser.uid) {
      db.ref('users/' + currentUser.uid + '/online').set(true);
      db.ref('users/' + currentUser.uid + '/online').onDisconnect().set(false);
      db.ref('users/' + currentUser.uid + '/roomStatus').onDisconnect().set('idle');
      updateMyPresence('idle', '', 0);
    }
  });
  listenToInvites();
  listenToJoinRequests();
}

function updateMyPresence(status, roomId, round) {
   if (!currentUser.uid) return;
   db.ref('users/' + currentUser.uid + '/roomStatus').set(status);
   db.ref('users/' + currentUser.uid + '/currentRoomId').set(roomId);
   db.ref('users/' + currentUser.uid + '/roomRound').set(round || 0);
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
      const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%2330363d'/><text x='50' y='50' font-size='40' text-anchor='middle' dy='.3em' fill='%23fff'>?</text></svg>";
      const newUserObj = { uid: newUid, username: user, password: pass, title: "初阶特工", avatar: defaultAvatar, signatureTalent: "", stats: { total: 0, wins: 0 }, factions: { angel: {total:0, wins:0, history:{}}, demon: {total:0, wins:0, history:{}}, heretic: {total:0, wins:0, history:{}} }, online: true, roomStatus: 'idle' };
      db.ref('users/' + newUid).set(newUserObj).then(function() {
        currentUser = newUserObj; localStorage.setItem('pulse_uid', newUid);
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
        if (!currentUser.factions) currentUser.factions = { angel: {total:0, wins:0, history:{}}, demon: {total:0, wins:0, history:{}}, heretic: {total:0, wins:0, history:{}} };
        if (!currentUser.friends) currentUser.friends = {};
        if (!currentUser.title) currentUser.title = "初阶特工";
        if (!currentUser.avatar) currentUser.avatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%2330363d'/><text x='50' y='50' font-size='40' text-anchor='middle' dy='.3em' fill='%23fff'>?</text></svg>";
        localStorage.setItem('pulse_uid', currentUser.uid); found = true;
      }
    });
    if (found) { setupPresence(); showHub(); } else { msg.innerText = "密码错误！"; }
  });
}

function handleLogout() {
  if (currentUser.uid) {
      db.ref('users/' + currentUser.uid + '/online').set(false);
      updateMyPresence('idle', '', 0);
  }
  localStorage.removeItem('pulse_uid'); location.reload();
}

// ==================== 头像上传 (前端 Canvas 压缩防爆内存) ====================
function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert("图片过大，请选择 5MB 以内的图片！");

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const MAX_SIZE = 128; // 压缩至128x128，极大节省 RTDB 内存
            let width = img.width; let height = img.height;

            if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
            else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }

            canvas.width = width; canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

            db.ref('users/' + currentUser.uid + '/avatar').set(dataUrl).then(() => {
                currentUser.avatar = dataUrl;
                document.getElementById('hub-avatar').src = dataUrl;
                alert("头像同步至终端成功！");
            });
        }
        img.src = e.target.result;
    }
    reader.readAsDataURL(file);
}

// ==================== 退出大厅/全局聊天 ====================
function closeGlobalChat() {
  document.getElementById('chat-modal').style.display = 'none';
  document.getElementById('hub-overlay').style.display = 'flex';
}

// ==================== 主城 (Hub) 与本命机缘选择 ====================
function showHub() {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('mode-overlay').style.display = 'none';
  document.getElementById('chat-modal').style.display = 'none';
  document.getElementById('hub-overlay').style.display = 'flex';
  document.getElementById('hub-title').innerText = `[${currentUser.title}]`;
  document.getElementById('hub-username').innerText = currentUser.username;
  document.getElementById('hub-uid').innerText = currentUser.uid;
  document.getElementById('hub-avatar').src = currentUser.avatar;

  // 填充本命机缘下拉框
  const sigSelect = document.getElementById('signature-talent-select');
  sigSelect.innerHTML = '<option value="">-- 选择本命机缘 (可选) --</option>';
  const allTalents = [...TALENT_POOL.numerical, ...TALENT_POOL.mechanism];
  allTalents.forEach(t => {
      let icon = t.type === 'angel' ? '👼' : (t.type === 'demon' ? '😈' : '👺');
      let opt = document.createElement('option');
      opt.value = t.name; opt.innerText = `${icon} ${t.name}`;
      if (currentUser.signatureTalent === t.name) opt.selected = true;
      sigSelect.appendChild(opt);
  });

  listenToFriendRequests();
  updateMyPresence('idle', '', 0);
}

function updateCustomTitle() {
  const newTitle = document.getElementById('new-title-input').value.trim();
  if (!newTitle) return alert("称号不能为空！");
  db.ref('users/' + currentUser.uid + '/title').set(newTitle).then(function() {
    currentUser.title = newTitle; document.getElementById('hub-title').innerText = `[${newTitle}]`;
    document.getElementById('new-title-input').value = ""; alert("称号更新成功！");
  });
}

function updateSignatureTalent() {
    const sel = document.getElementById('signature-talent-select').value;
    db.ref('users/' + currentUser.uid + '/signatureTalent').set(sel).then(() => {
        currentUser.signatureTalent = sel;
    });
}

function openGameSelect() { 
  document.getElementById('hub-overlay').style.display = 'none'; 
  document.getElementById('mode-overlay').style.display = 'flex'; 
  document.getElementById('step-version').style.display = 'block';
  document.getElementById('step-mode').style.display = 'none';
  if(document.getElementById('step-pve')) document.getElementById('step-pve').style.display = 'none';
}

function goBackToHub() { 
  document.getElementById('mode-overlay').style.display = 'none'; 
  document.getElementById('hub-overlay').style.display = 'flex'; 
}

function showPveOptions() {
  document.getElementById('step-mode').style.display = 'none';
  document.getElementById('step-pve').style.display = 'block';
}

function hidePveOptions() {
  document.getElementById('step-pve').style.display = 'none';
  document.getElementById('step-mode').style.display = 'block';
}

let pveSetupConfig = { cap: 2, isBossMode: false };

function openPveSetup(cap, isBossMode) {
    pveSetupConfig = { cap, isBossMode };
    const list = document.getElementById('pve-setup-list');
    list.innerHTML = "";

    // 渲染机制机缘下拉
    const mechs = TALENT_POOL.mechanism;
    let mechOptions = `<option value="random">🎲 随机机制机缘</option><option value="none">🚫 无机缘</option>`;
    mechs.forEach(t => { mechOptions += `<option value="${t.id}">[${t.type === 'angel'?'👼':t.type==='demon'?'😈':'👺'}] ${t.name}</option>`; });

    if (isBossMode) {
        list.innerHTML += `<div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px;">
            <label style="color:var(--gold); font-weight:bold;">扮演身份：</label>
            <select id="pve-role-select" class="cyber-select"><option value="boss">😈 深渊领主 (BOSS)</option><option value="player">⚔️ 讨伐特工</option></select>
        </div>`;
    }
    for(let i=1; i<=cap; i++) {
        let label = i===1 ? "你 (Player)" : `AI 人机 ${i-1}`;
        list.innerHTML += `<div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px;">
            <label style="color:var(--cyan); font-weight:bold;">${label} 机制：</label>
            <select id="pve-t-${i}" class="cyber-select">${mechOptions}</select>
            ${isBossMode ? `<select id="pve-num-${i}" class="cyber-select" style="margin-top:5px;"><option value="none">🚫 无数值加成</option><option value="b_n1">军火狂人(Boss专武)</option><option value="b_n2">叹息之墙(Boss专武)</option></select>` : ''}
        </div>`;
    }
    document.getElementById('mode-overlay').style.display = 'none';
    document.getElementById('pve-setup-overlay').style.display = 'flex';
}

function startCustomPve() {
    let isBoss = pveSetupConfig.isBossMode;
    let cap = pveSetupConfig.cap;
    let bossRole = "p4"; 
    if (isBoss) {
        let roleSel = document.getElementById('pve-role-select').value;
        bossRole = roleSel === 'boss' ? 'p1' : `p${cap}`; 
    }

    isPvE = true; myRole = 'p1';
    gameState = getInitialState(cap, isBoss, bossRole);
    gameState.p1.uid = currentUser.uid; gameState.p1.username = currentUser.username; gameState.p1.title = currentUser.title; gameState.p1.avatar = currentUser.avatar;
    gameState.status = 'playing';

    const allMechs = TALENT_POOL.mechanism;
    const allNums = TALENT_POOL.numerical;

    // 严苛赋予机缘
    for (let i = 1; i <= cap; i++) {
        let pk = 'p' + i;
        let pData = gameState[pk];
        if (i > 1) {
            pData.joined = true; pData.ready = true;
            pData.uid = "AI_" + i; pData.username = "AI - 演练机甲"; pData.title = "人机";
        } else {
            pData.joined = true; pData.ready = true;
        }

        let tSel = document.getElementById(`pve-t-${i}`).value;
        if (tSel !== "none") {
            let mech = tSel === "random" ? allMechs[Math.floor(Math.random() * allMechs.length)] : allMechs.find(t=>t.id===tSel);
            pData.talent = mech;
            applyTalentMods(pData, mech, gameState.config);
        }
        if (isBoss && pk === bossRole) {
            let numSel = document.getElementById(`pve-num-${i}`).value;
            if (numSel !== "none") {
                let num = allNums.find(t=>t.id===numSel);
                pData.numTalent = num; 
                applyTalentMods(pData, num, gameState.config); 
            }
        }
    }
    document.getElementById('pve-setup-overlay').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    render(gameState);
}

// ==================== 联机添加 AI ====================
function addAiToRoom() {
    if (!roomRef || myRole !== 'p1') return;
    const cap = gameState.config.capacity;
    let emptySlot = null;
    for (let i = 2; i <= cap; i++) {
        if (!gameState['p' + i] || !gameState['p' + i].joined) { emptySlot = 'p' + i; break; }
    }
    if (emptySlot) {
        let aiNames = ["深渊侍卫", "虚空行者", "机械降神"];
        roomRef.child(emptySlot).update({ joined: true, ready: true, uid: "AI_" + Date.now(), username: aiNames[Math.floor(Math.random()*3)], title: "人机补位" });
    }
}

// ==================== 世界聊天系统 (终端广播) ====================
function openGlobalChat() {
    document.getElementById('hub-overlay').style.display = 'none';
    document.getElementById('chat-modal').style.display = 'flex';
    listenToGlobalChat();
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if(!text) return;
    if(text.length > 30) return alert("内存警告：单条广播不能超过 30 字符！");

    const chatRef = db.ref('global_chat');
    chatRef.once('value', snap => {
        const data = snap.val() || {};
        const keys = Object.keys(data);
        const now = Date.now();
        const threeMins = 3 * 60 * 1000;

        let shouldWipe = false;
        if (keys.length >= 100) shouldWipe = true;
        else if (keys.length > 0) {
            const oldest = data[keys[0]].timestamp;
            if (now - oldest > threeMins * 100) shouldWipe = true; // 延长总兜底清理时间，3分钟只用于界面显示断层
        }

        const msgObj = {
            uid: currentUser.uid, username: currentUser.username, title: currentUser.title || '特工',
            avatar: currentUser.avatar || '', text: text, timestamp: now
        };

        if (shouldWipe) { chatRef.set(null).then(() => chatRef.push(msgObj)); } 
        else { chatRef.push(msgObj); }
        input.value = "";
    });
}

function listenToGlobalChat() {
    db.ref('global_chat').on('value', snap => {
        const list = document.getElementById('chat-list');
        list.innerHTML = "";
        const data = snap.val();
        if (!data) return;

        db.ref('users').once('value', uSnap => {
            const allUsers = uSnap.val() || {};
            const myFriends = Object.keys(currentUser.friends || {});

            let messages = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
            let lastTime = 0;

            messages.forEach(msg => {
                // 3分钟断层时间线
                if (msg.timestamp - lastTime > 180000) {
                    let dateStr = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    const timeDiv = document.createElement('div');
                    timeDiv.className = 'chat-time-divider';
                    timeDiv.innerText = dateStr;
                    list.appendChild(timeDiv);
                }
                lastTime = msg.timestamp;

                let isPossibleFriend = false;
                if (msg.uid !== currentUser.uid && !myFriends.includes(msg.uid)) {
                    const theirFriends = Object.keys((allUsers[msg.uid] && allUsers[msg.uid].friends) || {});
                    const intersection = myFriends.filter(value => theirFriends.includes(value));
                    if (intersection.length > 0) isPossibleFriend = true;
                }

                let isSelf = (msg.uid === currentUser.uid);
                let cssClass = isSelf ? 'chat-msg self' : 'chat-msg';

                const div = document.createElement('div');
                div.className = cssClass;
                let avatarSrc = msg.avatar || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%2330363d'/></svg>";
                let badge = isPossibleFriend ? `<span class="possible-friend-badge">你的可能好友</span>` : "";

                div.innerHTML = `
                    <img src="${avatarSrc}" class="chat-avatar" onclick="showProfile('${msg.uid}')">
                    <div class="chat-content">
                        ${!isSelf ? `<div class="chat-header"><span class="chat-title">[${msg.title}]</span><span class="chat-name" onclick="showProfile('${msg.uid}')">${msg.username}</span>${badge}</div>` : ''}
                        <div class="chat-text">${msg.text}</div>
                    </div>
                `;
                list.appendChild(div);
            });
            list.scrollTop = list.scrollHeight;
        });
    });
}

function showProfile(uid) {
    db.ref('users/' + uid).once('value', snap => {
        const u = snap.val(); if(!u) return;
        document.getElementById('profile-avatar').src = u.avatar || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%2330363d'/></svg>";
        document.getElementById('profile-name').innerText = u.username;
        document.getElementById('profile-title').innerText = `[${u.title || '特工'}]`;
        document.getElementById('profile-uid').innerText = u.uid;

        const sigEl = document.getElementById('profile-signature');
        if (u.signatureTalent) { sigEl.style.display = 'block'; sigEl.innerText = `本命: ${u.signatureTalent}`; } 
        else { sigEl.style.display = 'none'; }

        let rate = 0; if (u.stats && u.stats.total > 0) rate = ((u.stats.wins / u.stats.total) * 100).toFixed(1);
        let wins = u.stats ? u.stats.wins : 0; let total = u.stats ? u.stats.total : 0;
        document.getElementById('profile-rate').innerText = `${rate}% 总胜率`;
        document.getElementById('profile-stats').innerText = `${wins}胜 / ${total}局`;

        const btn = document.getElementById('btn-profile-add');
        if (uid === currentUser.uid || (currentUser.friends && currentUser.friends[uid])) { btn.style.display = 'none'; } 
        else { btn.style.display = 'block'; btn.onclick = () => { sendFriendRequestExplicit(uid, u.username); }; }

        document.getElementById('profile-modal').style.display = 'flex';
    });
}

function sendFriendRequestExplicit(targetUid, targetName) {
    db.ref('friend_requests/' + targetUid + '/' + currentUser.uid).set(currentUser.username).then(() => {
        alert("申请已发送给 " + targetName + "！"); document.getElementById('profile-modal').style.display = 'none';
    });
}

// ==================== 社交与好友状态追踪 ====================
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
      let fUser = allUsers[fUid];
      let isOnline = fUser && fUser.online === true;

      let statusDot = "<span style='color:#8b949e;'>⚪ 离线</span>";
      let actionBtn = "";

      if (isOnline) {
          if (fUser.roomStatus === 'playing') {
              statusDot = `<span style='color:var(--red);'>🔴 激战中 (第${fUser.roomRound || 1}回合)</span>`;
              actionBtn = `<button class="setup-btn host-btn" style="padding:4px 8px; font-size:0.7em;" onclick="spectateRoom('${fUser.currentRoomId}')">隐匿观战</button>`;
          } else if (fUser.roomStatus === 'waiting') {
              statusDot = `<span style='color:var(--gold);'>🟡 房间 ${fUser.currentRoomId} 中</span>`;
              actionBtn = `<button class="setup-btn join-btn" style="padding:4px 8px; font-size:0.7em;" onclick="requestJoinRoom('${fUser.currentRoomId}', '${fUid}')">申请跃迁</button>`;
          } else {
              statusDot = `<span style='color:var(--green);'>🟢 大厅闲置</span>`;
              if (gameState && gameState.status === 'waiting' && myRole !== 'spectator' && currentRoomId !== "") {
                  actionBtn = `<button class="setup-btn host-btn" style="padding:4px 8px; font-size:0.7em;" onclick="sendRoomInvite('${fUid}')">邀请</button>`;
              }
          }
      }

      let avatarSrc = fUser.avatar || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%2330363d'/></svg>";
      const item = document.createElement('div');
      item.style.cssText = "background:#21262d; padding:12px; margin-bottom:8px; border-radius:8px; font-size:0.9em; display:flex; justify-content:space-between; align-items:center; border:1px solid #30363d;";
      item.innerHTML = `
          <div style="display:flex; align-items:center; gap:12px;">
              <img src="${avatarSrc}" style="width:38px; height:38px; border-radius:50%; border:1px solid var(--border); object-fit:cover;">
              <div style="display:flex; flex-direction:column; align-items:flex-start;">
                  <b style="color:var(--blue); font-size:1.05em;">${fName}</b>
                  <div style="font-size:0.85em; margin-top:4px;">${statusDot}</div>
              </div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
              <span style="color:#8b949e; font-family:monospace; font-size:0.85em;">UID: ${fUid}</span>
              ${actionBtn}
          </div>
      `;
      fList.appendChild(item);
    }
  });
}

function sendRoomInvite(friendUid) {
  if (!currentRoomId) return;
  db.ref('invites/' + friendUid).set({ roomId: currentRoomId, hostName: currentUser.username, version: gameVersion, timestamp: Date.now() }).then(function() { alert("邀请已发送！"); });
}

function listenToInvites() {
  db.ref('invites/' + currentUser.uid).on('value', function(snap) {
    const data = snap.val(); if (!data) return;
    if (Date.now() - data.timestamp > 60000) { db.ref('invites/' + currentUser.uid).remove(); return; }
    document.getElementById('invite-alert-text').innerHTML = `⚠️ <b>${data.hostName}</b> 邀请加入 <span style="color:var(--gold); font-family:monospace; font-size:1.2em;">${data.roomId}</span>`;
    const alertBox = document.getElementById('global-invite-alert');
    alertBox.style.display = 'flex'; alertBox.dataset.targetRoom = data.roomId; alertBox.dataset.targetVersion = data.version || 'stable';
  });
}

function acceptInvite() {
  const alertBox = document.getElementById('global-invite-alert');
  const roomId = alertBox.dataset.targetRoom; const targetVer = alertBox.dataset.targetVersion || 'stable';
  alertBox.style.display = 'none'; db.ref('invites/' + currentUser.uid).remove();

  if (roomRef) roomRef.off(); gameVersion = targetVer;
  document.getElementById('roomInput').value = roomId;
  document.getElementById('hub-overlay').style.display = 'none'; document.getElementById('friends-modal').style.display = 'none'; document.getElementById('mode-overlay').style.display = 'block';
  selectMode('pvp'); joinRoomWithId(roomId);
}
function declineInvite() { document.getElementById('global-invite-alert').style.display = 'none'; db.ref('invites/' + currentUser.uid).remove(); }

// 申请加入好友房间
function requestJoinRoom(rid, fUid) {
    db.ref('join_requests/' + rid + '/' + currentUser.uid).set({ username: currentUser.username, timestamp: Date.now() }).then(() => {
        alert("已向该房间发送跃迁申请，等待房主审核...");
    });
}
// 房主监听申请
function listenToJoinRequests() {
    if(!currentRoomId || myRole !== 'p1') return;
    db.ref('join_requests/' + currentRoomId).on('value', snap => {
        const data = snap.val(); if(!data) return;
        Object.keys(data).forEach(reqUid => {
            let req = data[reqUid];
            if (Date.now() - req.timestamp > 60000) { db.ref('join_requests/' + currentRoomId + '/' + reqUid).remove(); return; }
            if (confirm(`⚠️ 特工 [${req.username}] 申请跃迁加入你的房间，是否同意？`)) {
                db.ref('join_requests/' + currentRoomId + '/' + reqUid).remove();
                sendRoomInvite(reqUid); // 同意即直接反向发送正式邀请
            } else {
                db.ref('join_requests/' + currentRoomId + '/' + reqUid).remove();
            }
        });
    });
}

// 隐匿观战
function spectateRoom(rid) {
    document.getElementById('friends-modal').style.display = 'none';
    document.getElementById('hub-overlay').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    myRole = 'spectator';
    currentRoomId = rid;
    roomRef = db.ref("rooms_v2/" + rid); // 假设默认正式服，若无再搜beta
    roomRef.once('value', snap => {
        if (!snap.exists()) {
             roomRef = db.ref("rooms_beta/" + rid);
        }
        setupRoomListener(rid);
    });
}

// ==================== 排行榜 (三系阵营与优势机缘) ====================
function openLeaderboardModal() {
  document.getElementById('leaderboard-modal').style.display = 'flex';
  switchLeaderboardTab(currentLeaderboardTab);
}

function switchLeaderboardTab(faction) {
    currentLeaderboardTab = faction;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn.${faction}`).classList.add('active');

    const list = document.getElementById('leaderboard-list'); 
    list.innerHTML = "<div style='text-align: center; color: #8b949e;'>正在拉取机密数据...</div>";

    db.ref('users').once('value', function(snap) {
        const data = snap.val(); if (!data) return;
        let players = []; const uKeys = Object.keys(data);

        for (let i = 0; i < uKeys.length; i++) {
            let uData = data[uKeys[i]];
            if (uData.factions && uData.factions[faction] && uData.factions[faction].total > 0) {
                let fStats = uData.factions[faction];
                let rate = (fStats.wins / fStats.total) * 100;

                // 计算优势机缘
                let advTalent = "无数据"; let maxCount = 0;
                if (fStats.history) {
                    for (let tName in fStats.history) {
                        if (fStats.history[tName] > maxCount) { maxCount = fStats.history[tName]; advTalent = tName; }
                    }
                }

                players.push({ 
                    uid: uData.uid, avatar: uData.avatar, name: uData.username, title: uData.title || "特工", 
                    total: fStats.total, wins: fStats.wins, rate: rate, advantage: advTalent 
                });
            }
        }

        players.sort(function(a, b) { if (b.rate !== a.rate) return b.rate - a.rate; return b.total - a.total; });
        list.innerHTML = "";
        if (players.length === 0) { list.innerHTML = "<div style='text-align: center; color: #8b949e;'>暂无数据</div>"; return; }

        for (let i = 0; i < players.length; i++) {
            let p = players[i]; let rankColor = "#c9d1d9"; if (i === 0) rankColor = "#d29922"; if (i === 1) rankColor = "#c0c0c0"; if (i === 2) rankColor = "#cd7f32";
            let avSrc = p.avatar || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%2330363d'/></svg>";
            const item = document.createElement('div');
            item.style.cssText = `background:rgba(0,0,0,0.5); padding:12px; margin-bottom:8px; border-radius:8px; border-left:4px solid ${rankColor}; display:flex; justify-content:space-between; align-items:center;`;
            item.innerHTML = `
               <div style="display:flex; align-items:center; flex:1;">
                   <span style="font-weight:bold; font-size:1.1em; color:${rankColor}; margin-right:10px; width:25px;">#${i+1}</span>
                   <img src="${avSrc}" style="width:36px; height:36px; border-radius:50%; border:1px solid var(--border); margin-right:10px; object-fit:cover;">
                   <div style="display:flex; flex-direction:column; line-height:1.3;">
                       <span><span style="font-size:0.75em; color:var(--gold);">[${p.title}]</span> <span style="font-weight:bold; color:#fff;">${p.name}</span></span>
                       <span class="advantage-badge">优势: ${p.advantage}</span>
                   </div>
               </div>
               <div style="text-align:right;">
                   <div style="color:var(--green); font-weight:bold; font-size:1.1em;">${p.rate.toFixed(1)}%</div>
                   <div style="color:#8b949e; font-size:0.7em;">${p.wins}胜 / ${p.total}局</div>
               </div>
            `;
            list.appendChild(item);
        }
    });
}

// ==================== 核心机制判定辅助函数 ====================
function hasTalent(p, tid) {
  if (!p) return false;
  if (p.talent && p.talent.id === tid) return true;
  if (p.extraTalent && p.extraTalent.id === tid) return true;
  return false;
}

function getBaseCd(talentId) {
    const map = { 'm_a2':5, 'm_a4':4, 'm_d4':4, 'm_h2':5, 'm_h4':3, 'm_a6':10, 'm_h5':15 }; // 狂击回调至 4CD
    return map[talentId] || 3;
}

function getTalentCdKey(id) {
    if (id === 'm_a2') return 'holyCd';
    if (id === 'm_a4') return 'dualCd';
    if (id === 'm_d4') return 'fatalCd';
    if (id === 'm_h2') return 'talentCd'; 
    if (id === 'm_h4') return 'symCd';
    if (id === 'm_a6') return 'stealthCd';
    if (id === 'm_h5') return 'talentCd';
    return 'talentCd';
}

function isMoveFromTalent(move, talentId) {
    const map = { 'm_a2': 'holy_light', 'm_a4': 'dual_heal', 'm_d4': 'fatal_shoot', 'm_h2': 'heretic_seal', 'm_h4': 'symbiosis', 'm_a6': 'stealth_action', 'm_h5': 'crimson_illusion' };
    return map[talentId] === move;
}

// 异教徒(heretic)与圣魔机缘池
  const TALENT_POOL = {
    numerical: [
      { id: 'n_d1', type: 'demon', category: '数值', name: '军火狂人', desc: '弹药 +4，血量与上限 -3\n代价：第一回合绝对禁止射击。' },
      { id: 'n_d2', type: 'demon', category: '数值', name: '叹息之墙', desc: '护盾 +3，血量与上限 -3\n代价：容错极低的防御型，考验身法。' },
      { id: 'b_n1', type: 'demon', category: '数值', name: '军火狂人(Boss)', desc: '弹药上限改为14，血量上限降低2。' },
      { id: 'b_n2', type: 'demon', category: '数值', name: '叹息之墙(Boss)', desc: '护盾上限改为14，血量上限降低2。' }
    ],
  mechanism: [
    { id: 'm_a1', type: 'angel', category: '机制', name: '圣盾坚壁', desc: '使用防御时获得 2 层护盾。\n代价：单次射击最高被限制为 2 发。' },
    { id: 'm_a2', type: 'angel', category: '机制', name: '圣戒', desc: '专属动作【圣光】(每5回合可用)：无视防御抽取目标1血量反哺自身。发动该动作的回合，自身进入霸体状态，免疫一切外界伤害。\n代价：丧失【包扎】能力。' },
    { id: 'm_a3', type: 'angel', category: '机制', name: '神圣复苏', desc: '回合末，若本回合未受伤害且未射击，恢复 1 点血。\n(触发后进入 2 回合冷却)' },
    { id: 'm_a4', type: 'angel', category: '机制', name: '双向渡灵', desc: '专属动作【渡灵】(每4回合可用)：无消耗。50%概率恢复自身1血，50%概率随机给一名存活敌人恢复1血。' },
    { id: 'm_a5', type: 'angel', category: '机制', name: '归光还魂', desc: '受致命伤时复活并回满血但清空弹盾。复活后血盾上限降低(双人-2/三人-3/四人-4)，15回合后上限部分恢复。若上限归零则被教廷彻底抹杀。\n充能：开局自带1次，第80、120回合及之后每40回合补充至1次。' },
    { id: 'm_a6', type: 'angel', category: '机制', name: '缄默无声', desc: '血量上限-2。专属动作【缄默】(每10回合可用)：进入持续5回合的隐匿状态。隐匿期间所有CD冻结，无法开火或装弹，无法被指定为攻击目标，持续伤害Buff不生效；期间防卫技能(防御/趴下)只能使用1次。\n(血量首次低于3时会自动触发一次免费隐匿)' },
    { id: 'm_d1', type: 'demon', category: '机制', name: '深渊魔弹', desc: '你的射击必定穿甲（无视护盾直接扣血）。\n代价：你永久无法使用防御动作。' },
    { id: 'm_d2', type: 'demon', category: '机制', name: '嗜血狂热', desc: '装弹时流失 1 血量，但获得 3 发子弹。\n(触发后 2 回合内只能普通装弹；1血时触发濒死保护停止扣血)' },
    { id: 'm_d3', type: 'demon', category: '机制', name: '贪婪吞噬', desc: '射击若对目标造成掉血，吸取 1 点生命。\n(触发后进入 2 回合冷却) 代价：血量上限 -2，护盾上限固定为 2。' },
    { id: 'm_d4', type: 'demon', category: '机制', name: '蚀命狂击', desc: '专属动作【狂击】(每4回合可用)：单次最多消耗5发弹药。60%概率伤害翻倍；20%射击失效且反噬一半伤害(不耗弹)；20%哑火空枪(耗弹)。' },
    { id: 'm_d5', type: 'demon', category: '机制', name: '封血鸩毒', desc: '被动：血量上限-1，护盾上限+1。\n装弹替换为【调制】获取鸩毒(上限5)。开火替换为【下毒】(耗鸩毒对未中毒目标使用)。\n目标每3回合受1点真实伤害，至多受(下毒层数+1)次伤害。' },
    { id: 'm_h7', type: 'heretic', category: '机制', name: '安魂协奏', desc: '无法普通攻击。装弹替换为【渐强】(积攒韵律，上限8)。\n开火替换为【和鸣】(消耗韵律)，每消耗1点韵律，使目标下次攻击偏离目标概率+12.5%。\n消耗8点韵律时，目标下次攻击必定命中其自身。' },

    { id: 'm_h1', type: 'heretic', category: '机制', name: '苟且偷生', desc: '被动：全场唯一候选。获取时三维上限-2。场上其他玩家死亡时，机缘自动收入你的“万能口袋”。\n【苟且形态】(1个机缘)：每3回合自动回盾；遇袭自动消耗护盾抵御非穿甲伤害；造成的伤害-1。\n【偷生形态】(2个机缘)：可消耗提取次数从口袋装备机缘，需进行等价交换(一项上限-1另一项+1)。数值机缘持续8回合，机制机缘可用1次，结束后退回口袋并恢复苟且形态。' },
    { id: 'm_h2', type: 'heretic', category: '机制', name: '蚀骨封行', desc: '专属动作【封行】(上限2次，每5回合恢复1次，使用后CD3回合)：指定一位玩家，使其下回合被禁锢，且受封行影响期间受到的伤害减半且免疫致死。\n代价：每次使用后经过3回合，自身会受1点反噬伤害(无视防御)。' },
    { id: 'm_h3', type: 'heretic', category: '机制', name: '勿视勿听', desc: '被动：血盾弹上限及初始值均+1。周期性切换状态。初始【勿视】:禁用开火，护盾+1，持续5回合。\n【勿听】:禁用防御与趴下，造成伤害+2，持续3回合。' },
    { id: 'm_h4', type: 'heretic', category: '机制', name: '共生', desc: '专属动作【共生】(每3回合可用)：与指定目标血量绑定一回合。若你本回合受到攻击扣血，对方将同时扣除同等血量。\n代价：若对方在本回合死亡，你将同时殉葬死亡。' },
    { id: 'm_h5', type: 'heretic', category: '机制', name: '血色幻境', desc: '全场唯一。专属动作【血色幻境】(CD15):消耗4弹4盾。幻境持续5回合。幻境中所有伤害翻倍，血量判定被替换为“理智值”(上限为血量上限1.5倍)，存活者继承上轮幻境的理智。若理智归零则在幻境结束时暴毙。\n(有此机缘的局解锁全局额外动作【绷带】:耗2盾回1理智)' },
    { id: 'm_h6', type: 'heretic', category: '机制', name: '冥骸有声', desc: '被动: 血盾上限各-1。\n专属动作【招魂】: 当场上有其他特工阵亡时，你获得1次招魂机会。消耗次数将亡者短暂唤醒3回合，其以半血半盾满弹状态为你死战。被招魂者无法攻击你，若亡魂离线则由暴虐AI接管。' }
  ]
};

// ==================== 数据生成器 ====================
function getInitialState(capacity, isBossMode = false, explicitBossRole = "") {
  let hp = 5; let maxAmmo = 4; let maxShield = 4;
  if (capacity === 4) { hp = 9; maxAmmo = 6; maxShield = 6; } else if (capacity === 3) { hp = 7; maxAmmo = 5; maxShield = 5; }

  let candidates = [];
  if (capacity >= 1) candidates.push('p1');
  if (capacity >= 2) candidates.push('p2');
  if (capacity >= 3) candidates.push('p3');
  if (capacity >= 4) candidates.push('p4');

  let bossRole = "";
  if (isBossMode) { bossRole = explicitBossRole || candidates[Math.floor(Math.random() * candidates.length)]; }

  // 严格划定全局唯一使用者名单，避免撞车
  let h1Candidate = candidates[Math.floor(Math.random() * candidates.length)];
  let h5Candidate = candidates[Math.floor(Math.random() * candidates.length)];
  let d5Candidate = candidates[Math.floor(Math.random() * candidates.length)];
  let h7Candidate = candidates[Math.floor(Math.random() * candidates.length)];

  let state = { 
    config: { capacity: capacity, maxAmmo: maxAmmo, maxShield: maxShield, baseHp: hp, h1_candidate: h1Candidate, h5_candidate: h5Candidate, d5_candidate: d5Candidate, h7_candidate: h7Candidate, isBossMode: isBossMode, bossRole: bossRole }, 
    log: "准备就绪，请出招！", round: 1, status: 'waiting', playAgain: { p1: false, p2: false, p3: false, p4: false },
    illusionTimer: 0, sanityData: {}
  };

  const createPlayer = (slot) => {
      let php = hp; let pammo = maxAmmo; let pshield = maxShield;
      if (isBossMode && slot === bossRole) {
          php = Math.ceil(hp * 2.5);
          pammo = Math.ceil(maxAmmo * 1.5);
      }
      let p = createBasePlayer(slot, capacity >= candidates.length ? php : 0, php, pammo, pshield);
      if (isBossMode && slot === bossRole) p.bossRevived = false;
      return p;
  };

  state.p1 = createPlayer('p1'); state.p2 = createPlayer('p2');
  state.p3 = createPlayer('p3'); state.p4 = createPlayer('p4');
  return state;
}

function createBasePlayer(roleSlot, currentHp, maxHp, maxAmmo, maxShield) {
  return { role: roleSlot, uid: "", username: "", title: "", avatar: "", hp: currentHp, maxHp: maxHp, ammo: 0, maxAmmo: maxAmmo, shield: 1, maxShield: maxShield, move: "", val: 0, target: "", 
    talent: null, extraTalent: null, numTalent: null, joined: false, ready: false, healCd: 0, talentCd: 0, holyCd: 0, fatalCd: 0, dualCd: 0, symCd: 0, stealthCd: 0, 
    sealCharges: 1, sealDmgTimer: 0, rerolled: false, 
    reviveCount: 0, reviveCharges: 0, a5Recoveries: [], actionCount: 0, silenced: 0, h3State: '勿视', h3Timer: 0, roundDmg: 0, roundSanityDmg: 0,
    pocketInventory: [], pocketUses: 0, h1SurviveTimer: 0, extraTalentTimer: 0,
    stealthTimer: 0, stealthDefUsed: false, autoStealthUsed: false,
    necroCharges: 0, zombieTimer: 0, zombieMaster: "",
    pendingLoot: null, lootedMark: false,
    poison: 0, poisonStacks: 0, poisonTimer: 0, poisonDmgTaken: 0, 
    rhythm: 0, confusedRate: 0 
  };
}

// ==================== 建立与加入 ====================
function selectMode(mode, cap) {
  cap = cap || 2;
  isPvE = (mode === 'pve');
  document.getElementById('mode-overlay').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';
  if (isPvE) {
    document.getElementById('room-setup').style.display = 'none'; myRole = 'p1';
    gameState = getInitialState(cap);
    gameState.p1.uid = currentUser.uid; gameState.p1.username = currentUser.username; gameState.p1.title = currentUser.title; gameState.p1.avatar = currentUser.avatar;
    let aiNames = ["机甲卫士", "深渊投影", "虚空矩阵"];
    for (let i = 2; i <= cap; i++) {
      let pk = 'p' + i;
      gameState[pk].uid = "00000" + i; gameState[pk].username = "AI - " + aiNames[i-2]; gameState[pk].title = "机械领主";
      gameState[pk].talent = null; gameState[pk].extraTalent = null; gameState[pk].pendingLoot = null; gameState[pk].reviveCharges = 0;
      gameState[pk].joined = true; gameState[pk].ready = true;
    }
    gameState.p1.talent = null; gameState.p1.extraTalent = null; gameState.p1.pendingLoot = null; gameState.p1.reviveCharges = 0;
    gameState.status = 'playing'; gameState.p1.joined = true; gameState.p1.ready = true;
    if (gameVersion === 'beta') triggerPrayerPhase(false); else render(gameState);
  } else { document.getElementById('room-setup').style.display = 'flex'; }
}

function createRoom(capacity, isBossMode = false) {
  const rid = Math.random().toString(36).substring(2, 7).toUpperCase();
  myRole = 'p1'; currentRoomId = rid; document.getElementById('room-setup').style.display = 'none';
  const dbPath = gameVersion === 'beta' ? "rooms_beta/" : "rooms_v2/";
  roomRef = db.ref(dbPath + rid);
  let newRoom = getInitialState(capacity, isBossMode);
  newRoom.p1.joined = true; newRoom.p1.uid = currentUser.uid; newRoom.p1.username = currentUser.username; newRoom.p1.title = currentUser.title; newRoom.p1.avatar = currentUser.avatar;
  roomRef.set(newRoom);
  roomRef.onDisconnect().remove();
  updateMyPresence('waiting', rid, 0);
  document.getElementById('room-chat-panel').style.display = 'flex';
  listenToJoinRequests();
  setupRoomListener(rid);
}

function joinRoomWithId(explicitId) {
  const rid = (explicitId || "").toUpperCase().trim();
  if (rid.length !== 5) { alert("房间码为5位！"); return; }
  const dbPath = gameVersion === 'beta' ? "rooms_beta/" : "rooms_v2/";
  roomRef = db.ref(dbPath + rid);
  roomRef.once('value', function(snap) {
    const data = snap.val();
    if (!data) { alert("找不到该房间，请确认房间码。"); return; }
    if (data.status !== 'waiting') { alert("该房间已在游戏中，无法加入。"); return; }
    const cap = data.config.capacity;
    let slot = null;
    if (cap >= 2 && (!data.p2 || !data.p2.joined)) slot = 'p2';
    else if (cap >= 3 && (!data.p3 || !data.p3.joined)) slot = 'p3';
    else if (cap >= 4 && (!data.p4 || !data.p4.joined)) slot = 'p4';
    if (!slot) { alert("该房间已满！"); return; }
    myRole = slot; currentRoomId = rid;
    document.getElementById('room-setup').style.display = 'none';
    roomRef.child(slot).update({ joined: true, uid: currentUser.uid, username: currentUser.username, title: currentUser.title, avatar: currentUser.avatar });
    updateMyPresence('waiting', rid, 0);
    document.getElementById('room-chat-panel').style.display = 'flex';
    setupRoomListener(rid);
  });
}

function joinRoom() {
  const rid = document.getElementById('roomInput').value.trim().toUpperCase();
  joinRoomWithId(rid);
}

// 核心更新：局内房间聊天
function sendRoomChat() {
    const input = document.getElementById('room-chat-input');
    const text = input.value.trim();
    if (!text || !currentRoomId) return;
    if (text.length > 40) return alert("内容过长！");

    const msgObj = {
        uid: currentUser.uid, username: currentUser.username, 
        avatar: currentUser.avatar || '', text: text, timestamp: Date.now()
    };
    db.ref(`rooms_chat/${currentRoomId}`).push(msgObj);
    input.value = '';
}

function listenToRoomChat(rid) {
    db.ref(`rooms_chat/${rid}`).on('value', snap => {
        const list = document.getElementById('room-chat-list');
        list.innerHTML = "";
        const data = snap.val(); if (!data) return;

        let messages = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
        let lastTime = 0;

        messages.forEach(msg => {
            // 局内时间断层线：15分钟
            if (msg.timestamp - lastTime > 900000) {
                let dateStr = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const timeDiv = document.createElement('div');
                timeDiv.className = 'chat-time-divider';
                timeDiv.innerText = dateStr;
                list.appendChild(timeDiv);
            }
            lastTime = msg.timestamp;

            let isSelf = (msg.uid === currentUser.uid);
            let cssClass = isSelf ? 'chat-msg self' : 'chat-msg';

            const div = document.createElement('div');
            div.className = cssClass;
            let avatarSrc = msg.avatar || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%2330363d'/></svg>";

            div.innerHTML = `
                <img src="${avatarSrc}" class="chat-avatar">
                <div class="chat-content">
                    ${!isSelf ? `<div class="chat-header"><span class="chat-name">${msg.username}</span></div>` : ''}
                    <div class="chat-text">${msg.text}</div>
                </div>
            `;
            list.appendChild(div);
        });
        list.scrollTop = list.scrollHeight;
    });

    document.getElementById('room-chat-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendRoomChat();
    });
}

function setupRoomListener(rid) {
  roomRef.on('value', function(snap) {
    let data = snap.val(); if (!data) { alert("房间解散。"); location.reload(); return; }
    gameState = data;
    if (myRole !== 'spectator' && data.status === 'playing') updateMyPresence('playing', currentRoomId, data.round);
    if (gameState.status === 'waiting') renderLobby(rid);
    else { document.getElementById('waiting-room').style.display = 'none'; document.getElementById('game-container').style.display = 'block'; render(gameState); checkRoundStart(); }
  });

  if (myRole !== 'spectator' && !isPvE) { listenToRoomChat(rid); }
}

function renderLobby(rid) {
  document.getElementById('game-container').style.display = 'none'; document.getElementById('waiting-room').style.display = 'block'; document.getElementById('lobby-rid').innerText = rid;
  document.getElementById('spectator-banner-lobby').style.display = myRole === 'spectator' ? 'block' : 'none';
  const cap = gameState.config.capacity;
  updateLobbyPlayer('p1', gameState.p1, 1 <= cap); updateLobbyPlayer('p2', gameState.p2, 2 <= cap); updateLobbyPlayer('p3', gameState.p3, 3 <= cap); updateLobbyPlayer('p4', gameState.p4, 4 <= cap);
  const actionBtn = document.getElementById('lobby-action-btn');
  const aiBtn = document.getElementById('lobby-add-ai-btn');
  if (aiBtn) {
      if (myRole === 'p1' && gameState.config.isBossMode) aiBtn.style.display = 'inline-block';
      else aiBtn.style.display = 'none';
  }
  if (myRole === 'spectator') actionBtn.style.display = 'none';
  else {
    actionBtn.style.display = 'inline-block'; const myData = gameState[myRole];
    if (myData && myData.ready) { actionBtn.innerText = "等待玩家..."; actionBtn.style.opacity = 0.5; actionBtn.onclick = null; } 
    else {
      actionBtn.style.opacity = 1;
      if (gameVersion === 'beta') { actionBtn.innerText = "命运祈祷"; actionBtn.onclick = function() { triggerPrayerPhase(false); }; } 
      else { actionBtn.innerText = "准备就绪"; actionBtn.onclick = function() { if (roomRef) roomRef.child(myRole).update({ ready: true }); }; }
    }
  }
  if (myRole === 'p1') {
    let allReady = true;
    if (cap >= 1 && (!gameState.p1.joined || !gameState.p1.ready)) allReady = false;
    if (cap >= 2 && (!gameState.p2.joined || !gameState.p2.ready)) allReady = false;
    if (cap >= 3 && (!gameState.p3.joined || !gameState.p3.ready)) allReady = false;
    if (cap >= 4 && (!gameState.p4.joined || !gameState.p4.ready)) allReady = false;
    if (allReady) {
        roomRef.update({ status: 'playing', playAgain: { p1: false, p2: false, p3: false, p4: false } });
        updateMyPresence('playing', currentRoomId, 1);
    }
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

// ==================== 退出与认输机制 ====================
function exitGame() { 
  if (roomRef && myRole) {
    if (myRole === 'spectator') { location.reload(); return; }
    let msg = myRole === 'p1' && gameState.status === 'waiting' ? "你是房主，大厅阶段离开将解散房间。" : "确定退出战区？退出后你将被系统强行抹杀，且其余特工将继续游戏！";
    if (confirm(msg)) {
      if (myRole === 'p1' && gameState.status === 'waiting') {
          db.ref(`rooms_chat/${currentRoomId}`).remove(); 
          roomRef.remove().then(function(){location.reload();}); 
      } else {
         if (gameState.status === 'playing') {
             roomRef.child(myRole).update({ joined: false, move: 'quit' }).then(function(){location.reload();});
         } else {
             roomRef.child(myRole).update({ joined: false, ready: false }).then(function(){location.reload();});
         }
      }
    }
  } else location.reload(); 
}

function handleSurrender() {
   if (!gameState || !myRole || myRole === 'spectator' || !gameState[myRole]) return;
   if (gameState.status !== 'playing') return; 
   if (gameState[myRole].hp <= 0) return;
   if (confirm("是否确认荣誉殉国 (认输)？你的机缘将被他人搜刮！")) {
       if (isPvE) {
           gameState.p1.move = 'surrender';
           processRound();
       } else {
           roomRef.child(myRole).update({ move: 'surrender' });
       }
   }
}

// ==================== 祈祷与机缘系统 ====================
function triggerPrayerPhase(isReroll) {
  isRerollingGlobal = isReroll;
  const pool = ['angel', 'demon', 'heretic'];
  const shuffled = pool.sort(() => 0.5 - Math.random());
  const pick2 = shuffled.slice(0, 2);
  pick2.push('atheist'); // 加入无神论者选项

  const container = document.getElementById('prayer-options-container');
  container.innerHTML = "";

  pick2.forEach(bias => {
    const btn = document.createElement('button');
    btn.className = "setup-btn"; btn.style.cssText = "flex:1; padding:15px; display:flex; flex-direction:column; align-items:center;";
    let icon, label, color, boostName;

    if (bias === 'atheist') {
      icon = '🎲'; label = '无神论者'; color = '#6e7681'; boostName = '纯随机分配';
    } else {
      icon = bias === 'angel' ? '👼' : (bias === 'demon' ? '😈' : '👺');
      label = bias === 'angel' ? '祈求圣光' : (bias === 'demon' ? '聆听深渊' : '追随禁忌');
      color = bias === 'angel' ? 'var(--green)' : (bias === 'demon' ? 'var(--purple)' : 'var(--red)');
      let faction = bias === 'angel' ? '天使' : (bias === 'demon' ? '恶魔' : '异教徒');
      boostName = `${faction}机缘 +50%`;
    }

    btn.style.background = color; btn.style.borderColor = color;
    btn.innerHTML = `<span style='font-size:2em; margin-bottom:10px;'>${icon}</span><span style='font-weight:bold;'>${label}</span><span style='font-size:0.75em; opacity:0.8; margin-top:5px;'>(${boostName})</span>`;
    btn.onclick = () => showTalentSelection(isReroll, bias);
    container.appendChild(btn);
  });

  document.getElementById('prayer-overlay').style.display = 'flex';
  document.getElementById('prayer-keep-btn').style.display = isReroll ? 'inline-block' : 'none';
  if (isReroll) {
    document.getElementById('prayer-title-text').innerText = "🙏 机缘重铸 (第80回合)";
    document.getElementById('prayer-subtitle-text').innerText = "命运之轮再次转动，请选择祈祷方向，或直接保留当前机缘。";
  } else {
    document.getElementById('prayer-title-text').innerText = "🙏 命运祈祷";
    document.getElementById('prayer-subtitle-text').innerText = "万物皆有回响，系统已为你呈现信仰选项，选择其一可大幅提升该阵营降临概率，或选择成为无神论者。";
  }
}

function confirmPrayer(bias) {
  document.getElementById('prayer-overlay').style.display = 'none';
  if (bias === 'keep') { applyTalent('keep', isRerollingGlobal); return; }
  showTalentSelection(isRerollingGlobal, bias);
}

function showTalentSelection(isReroll, bias) {
  document.getElementById('prayer-overlay').style.display = 'none';
  const overlay = document.getElementById('talent-overlay'); const list = document.getElementById('talent-list');
  const title = document.getElementById('talent-title-text'); const subtitle = document.getElementById('talent-subtitle-text');
  if (isReroll) { title.innerText = "✨ 降临机缘 (重铸) ✨"; subtitle.innerText = "祈祷已获回应，请选择一项作为核心"; } 
  else { title.innerText = "✨ 降临机缘 ✨"; subtitle.innerText = "祈祷已获回应，请选择一项作为核心"; }
  overlay.style.display = 'flex'; list.innerHTML = '';

  const weightedPool = [];
  const allItems = [...TALENT_POOL.numerical, ...TALENT_POOL.mechanism];
  for (let i = 0; i < allItems.length; i++) {
    let item = allItems[i];
    // 限制：全场唯一机缘只展示给特定的候选人
    if (item.id === 'm_h1' && gameState.config.h1_candidate !== myRole) continue;
    if (item.id === 'm_h5' && gameState.config.h5_candidate !== myRole) continue;
    if (item.id === 'm_d5' && gameState.config.d5_candidate !== myRole) continue;
    if (item.id === 'm_h7' && gameState.config.h7_candidate !== myRole) continue;

    let weight = 1;
    if (bias !== 'atheist') {
      if (bias === 'angel' && item.type === 'angel') weight = 3;
      if (bias === 'demon' && item.type === 'demon') weight = 3;
      if (bias === 'heretic' && item.type === 'heretic') weight = 3;
    }
    for (let w = 0; w < weight; w++) weightedPool.push(item);
  }

  let options = [];
  while (options.length < 4) {
    const pick = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    let exists = false; for (let j = 0; j < options.length; j++) { if (options[j].id === pick.id) { exists = true; break; } }
    if (!exists) options.push(pick);
  }

  for (let i = 0; i < options.length; i++) {
    let t = options[i]; const card = document.createElement('div'); card.className = `talent-card ${t.type}`;
    card.innerHTML = `<h4>${t.name}</h4><small>${t.category}类</small><p>${t.desc}</p>`; card.onclick = function() { applyTalent(t, isReroll); }; list.appendChild(card);
  }
}

function removeTalentMods(playerData, t, config) {
  if (!t) return;
  // 计算基于Boss的基础上限以备重置
  let baseHp = (config.isBossMode && playerData.role === config.bossRole) ? Math.ceil(config.baseHp * 2.5) : config.baseHp;
  let baseAmmo = (config.isBossMode && playerData.role === config.bossRole) ? Math.ceil(config.maxAmmo * 1.5) : config.maxAmmo;

  if (t.id === 'n_d1') { playerData.ammo -= 4; playerData.maxHp += 3; playerData.hp += 3; } 
  else if (t.id === 'n_d2') { playerData.shield += 3; playerData.maxHp += 3; playerData.hp += 3; } 
  else if (t.id === 'm_d3') {
    playerData.maxHp += 2; playerData.hp += 2; playerData.maxShield = config.maxShield;
    if (gameState && gameState.round >= 120) { playerData.maxShield -= 2; if (playerData.maxShield < 0) playerData.maxShield = 0; playerData.maxHp -= 2; if (playerData.maxHp < 1) playerData.maxHp = 1; }
  } else if (t.id === 'm_a5' || t.id === 'm_h3') {
    playerData.maxHp = baseHp; playerData.maxAmmo = baseAmmo; playerData.maxShield = config.maxShield;
    if (gameState && gameState.round >= 120) { playerData.maxShield -= 2; if (playerData.maxShield < 0) playerData.maxShield = 0; playerData.maxHp -= 2; if (playerData.maxHp < 1) playerData.maxHp = 1; }
  } else if (t.id === 'm_h6') {
    playerData.maxHp += 1; playerData.maxShield += 1; 
  } else if (t.id === 'm_d4') { 
    playerData.maxAmmo = baseAmmo; 
  } else if (t.id === 'm_d5') { 
    playerData.maxHp += 1; 
    playerData.maxShield = Math.max(0, playerData.maxShield - 1); 
  }

  if (playerData.hp > playerData.maxHp) playerData.hp = playerData.maxHp;
  if (playerData.ammo > playerData.maxAmmo) playerData.ammo = playerData.maxAmmo;
  if (playerData.shield > playerData.maxShield) playerData.shield = playerData.maxShield;
}

function applyTalentMods(playerData, t, config) {
  if (!t) return;
  // Boss专属数值机缘
  if (t.id === 'b_n1') { playerData.maxAmmo = 14; playerData.maxHp -= 2; playerData.hp = Math.min(playerData.hp, playerData.maxHp); }
  else if (t.id === 'b_n2') { playerData.maxShield = 14; playerData.maxHp -= 2; playerData.hp = Math.min(playerData.hp, playerData.maxHp); }

  if (t.id === 'n_d1') { playerData.ammo += 4; playerData.maxHp -= 3; playerData.hp -= 3; } 
  else if (t.id === 'n_d2') { playerData.shield += 3; playerData.maxHp -= 3; playerData.hp -= 3; } 
  else if (t.id === 'm_d3') { playerData.maxHp -= 2; playerData.hp -= 2; playerData.maxShield = 2; if (playerData.shield > 2) playerData.shield = 2; }
  else if (t.id === 'm_a5') { playerData.reviveCharges = 1; }
  else if (t.id === 'm_a6') {
    playerData.maxHp = Math.max(1, playerData.maxHp - 2); 
    playerData.hp = Math.min(playerData.hp, playerData.maxHp);
  }
  else if (t.id === 'm_h1') {
    playerData.maxHp = Math.max(1, playerData.maxHp - 2);
    playerData.hp = Math.min(playerData.hp, playerData.maxHp);
    playerData.maxShield = Math.max(0, playerData.maxShield - 2);
    playerData.shield = Math.min(playerData.shield, playerData.maxShield);
    playerData.maxAmmo = Math.max(0, playerData.maxAmmo - 2);
    playerData.ammo = Math.min(playerData.ammo, playerData.maxAmmo);
    playerData.pocketUses = gameState ? gameState.config.capacity : 2;
    playerData.pocketInventory = [];
    playerData.h1SurviveTimer = 0;
    playerData.extraTalent = null;
  }
  else if (t.id === 'm_h2') { playerData.sealCharges = 1; playerData.sealDmgTimer = 0; }
  else if (t.id === 'm_h3') {
    playerData.maxHp += 1; playerData.hp += 1; playerData.maxShield += 1; playerData.shield += 1; playerData.maxAmmo += 1; playerData.ammo += 1;
    playerData.h3State = '勿视'; playerData.h3Timer = 5;
  }
  else if (t.id === 'm_h6') {
    playerData.maxHp = Math.max(1, playerData.maxHp - 1);
    playerData.hp = Math.min(playerData.hp, playerData.maxHp);
    playerData.maxShield = Math.max(0, playerData.maxShield - 1);
    playerData.shield = Math.min(playerData.shield, playerData.maxShield);
  }
  else if (t.id === 'm_d4') { 
    playerData.maxAmmo = 6; 
  }
  else if (t.id === 'm_d5') {
    playerData.maxHp = Math.max(1, playerData.maxHp - 1); 
    playerData.hp = Math.min(playerData.hp, playerData.maxHp);
    playerData.maxShield += 1; 
  }
}

// 核心更新：多位 AI 机缘随机赋予
function applyTalent(t, isReroll) {
  document.getElementById('talent-overlay').style.display = 'none';
  if (isPvE) {
    if (isReroll) {
      if (t !== 'keep') { 
        if (gameState.p1.talent && gameState.p1.talent.id === 'm_h1') {
           if (gameState.p1.extraTalent) removeTalentMods(gameState.p1, gameState.p1.extraTalent, gameState.config);
           gameState.p1.extraTalent = t; applyTalentMods(gameState.p1, t);
        } else {
           removeTalentMods(gameState.p1, gameState.p1.talent, gameState.config); gameState.p1.talent = t; applyTalentMods(gameState.p1, t); 
        }
      }
      gameState.p1.rerolled = true;
      for (let i = 2; i <= gameState.config.capacity; i++) {
        let pk = 'p' + i;
        if (gameState[pk] && gameState[pk].hp > 0) {
          if (Math.random() > 0.2) {
            if (gameState[pk].talent && gameState[pk].talent.id === 'm_h1') {
               if (gameState[pk].extraTalent) removeTalentMods(gameState[pk], gameState[pk].extraTalent, gameState.config);
            } else { removeTalentMods(gameState[pk], gameState[pk].talent, gameState.config); }

            const aiBiasOptions = ['angel', 'demon', 'heretic', 'atheist'];
            const aiBias = aiBiasOptions[Math.floor(Math.random() * aiBiasOptions.length)];
            const weightedPool = []; const allItems = [...TALENT_POOL.numerical, ...TALENT_POOL.mechanism];
              for (let j = 0; j < allItems.length; j++) {
                if (allItems[j].id === 'm_h1' && gameState.config.h1_candidate !== pk) continue;
                if (allItems[j].id === 'm_h5' && gameState.config.h5_candidate !== pk) continue;
                if (allItems[j].id === 'm_d5' && gameState.config.d5_candidate !== pk) continue;
                if (allItems[j].id === 'm_h7' && gameState.config.h7_candidate !== pk) continue;
                let weight = 1;
              if (aiBias !== 'atheist') {
                  if (aiBias === 'angel' && allItems[j].type === 'angel') weight = 3; 
                  if (aiBias === 'demon' && allItems[j].type === 'demon') weight = 3; 
                  if (aiBias === 'heretic' && allItems[j].type === 'heretic') weight = 3;
              }
              for (let w = 0; w < weight; w++) weightedPool.push(allItems[j]);
            }
            const aiT = weightedPool[Math.floor(Math.random() * weightedPool.length)];
            if (gameState[pk].talent && gameState[pk].talent.id === 'm_h1') {
               gameState[pk].extraTalent = aiT; applyTalentMods(gameState[pk], aiT);
            } else {
               gameState[pk].talent = aiT; applyTalentMods(gameState[pk], aiT);
            }
          }
          gameState[pk].rerolled = true;
        }
      }
      render(gameState); checkRoundStart(); 
    } else {
      gameState.p1.talent = t; applyTalentMods(gameState.p1, t);
      const allItems = [...TALENT_POOL.numerical, ...TALENT_POOL.mechanism];

        for (let i = 2; i <= gameState.config.capacity; i++) {
           let pk = 'p' + i;
           const aiItems = allItems.filter(item => 
               !(item.id === 'm_h1' && gameState.config.h1_candidate !== pk) && 
               !(item.id === 'm_h5' && gameState.config.h5_candidate !== pk) && 
               !(item.id === 'm_d5' && gameState.config.d5_candidate !== pk) && 
               !(item.id === 'm_h7' && gameState.config.h7_candidate !== pk)
           );
           const aiT = aiItems[Math.floor(Math.random() * aiItems.length)];
         gameState[pk].talent = aiT; applyTalentMods(gameState[pk], aiT);
      }
      render(gameState); 
    }
  } else {
    let pData = gameState[myRole];
    if (isReroll) {
      if (t !== 'keep') { 
         if (pData.talent && pData.talent.id === 'm_h1') {
            if (pData.extraTalent) removeTalentMods(pData, pData.extraTalent, gameState.config);
            pData.extraTalent = t; applyTalentMods(pData, t);
         } else {
            removeTalentMods(pData, pData.talent, gameState.config); pData.talent = t; applyTalentMods(pData, t); 
         }
      }
      pData.rerolled = true;
    } else { pData.talent = t; pData.ready = true; applyTalentMods(pData, t); }
    if (roomRef) roomRef.child(myRole).set(pData);
  }
}

function showTalentDetail(t) {
  if (!t) return;
  const nameEl = document.getElementById('td-name');
  if (!nameEl) return; 

  nameEl.innerText = t.name;
  const typeBadge = document.getElementById('td-type');
  if (t.type === 'angel') { typeBadge.innerText = '👼 天使 | ' + t.category + '类'; typeBadge.style.background = '#3fb950'; } 
  else if (t.type === 'demon') { typeBadge.innerText = '😈 恶魔 | ' + t.category + '类'; typeBadge.style.background = '#a371f7'; }
  else { typeBadge.innerText = '👺 异教徒 | ' + t.category + '类'; typeBadge.style.background = 'var(--red)'; }
  document.getElementById('td-desc').innerText = t.desc; document.getElementById('talent-detail-modal').style.display = 'flex';
}

function openPocket() {
    let myP = gameState[myRole];
    if (!myP || !myP.pocketInventory || myP.pocketInventory.length === 0) return alert("口袋目前空空如也！");
    let listStr = "";
    myP.pocketInventory.forEach((item, index) => {
        if (item.pocketCd > 0) {
            listStr += `<button class="setup-btn disabled" style="width:100%; margin-bottom:10px; padding:12px; font-size:0.9em; cursor:not-allowed;">${item.talent.name} (口袋冷却中: ${item.pocketCd} 回合)</button>`;
        } else {
            listStr += `<button class="setup-btn host-btn" style="width:100%; margin-bottom:10px; padding:12px; font-size:0.9em;" onclick="selectPocketItem(${index})">提取：${item.talent.name}</button>`;
        }
    });
    document.getElementById('pocket-list').innerHTML = listStr;
    document.getElementById('pocket-modal').style.display = 'flex';
}

function selectPocketItem(index) {
    selectedPocketIndex = index;
    document.getElementById('pocket-modal').style.display = 'none';
    document.getElementById('conservation-modal').style.display = 'flex';
}

function confirmConservation() {
    let decStat = document.querySelector('input[name="cons-dec"]:checked');
    let incStat = document.querySelector('input[name="cons-inc"]:checked');
    if (!decStat || !incStat) return alert("请完成等价交换的选择！");
    if (decStat.value === incStat.value) return alert("不能选择同一属性进行加减！");

    let myP = gameState[myRole];
    if (decStat.value === 'hp' && myP.maxHp <= 1) return alert("生命上限不能低于1！");
    if (decStat.value === 'shield' && myP.maxShield <= 0) return alert("护盾上限已为0，无法降低！");
    if (decStat.value === 'ammo' && myP.maxAmmo <= 0) return alert("弹药上限已为0，无法降低！");

    if (decStat.value === 'hp') { myP.maxHp--; myP.hp = Math.min(myP.hp, myP.maxHp); }
    if (decStat.value === 'shield') { myP.maxShield--; myP.shield = Math.min(myP.shield, myP.maxShield); }
    if (decStat.value === 'ammo') { myP.maxAmmo--; myP.ammo = Math.min(myP.ammo, myP.maxAmmo); }

    if (incStat.value === 'hp') { myP.maxHp++; myP.hp++; } 
    if (incStat.value === 'shield') { myP.maxShield++; }
    if (incStat.value === 'ammo') { myP.maxAmmo++; }

    let item = myP.pocketInventory[selectedPocketIndex];
    myP.extraTalent = item.talent;

    if (item.talent.category === '机制') {
        let cdKey = getTalentCdKey(item.talent.id);
        if (cdKey) myP[cdKey] = 3; 
    } else {
        myP.extraTalentTimer = 8;
        applyTalentMods(myP, item.talent); 
    }

    myP.pocketUses--;
    document.getElementById('conservation-modal').style.display = 'none';
    if (isPvE) { render(gameState); } else { roomRef.child(myRole).set(myP); }
}

// ==================== 安全校验与动作处理 ====================
function checkRoundStart() {
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
  for (let i = 0; i < aliveKeys.length; i++) {
    let pk = aliveKeys[i];
    // 处理掉线的亡魂AI或单机AI
    if ((isPvE && pk !== 'p1') || (!isPvE && gameState[pk].zombieTimer > 0 && !gameState[pk].joined && myRole === 'p1')) {
        if (gameState[pk].move === "") {
            let enemies = aliveKeys.filter(k => k !== pk && !(gameState[k].stealthTimer > 0));
            const aiDecision = getSmartAiMove(pk, enemies);
            if (isPvE) {
                gameState[pk].move = aiDecision.move; gameState[pk].val = aiDecision.val;
                gameState[pk].target = (['shoot', 'fatal_shoot', 'ground_spike', 'holy_light', 'heretic_seal', 'symbiosis', 'necromancy'].includes(aiDecision.move)) ? (enemies[0]||"") : "";
            } else {
                let target = (['shoot', 'fatal_shoot', 'ground_spike', 'holy_light', 'heretic_seal', 'symbiosis', 'necromancy'].includes(aiDecision.move)) ? (enemies[0]||"") : "";
                roomRef.child(pk).update({ move: aiDecision.move, val: aiDecision.val, target: target });
                allMoved = false; // 等 Firebase 触发
            }
        }
    } else {
        if (gameState[pk].move === "") allMoved = false;
    }
  }

  if (allMoved && aliveKeys.length > 0 && myRole === aliveKeys[0]) {
    if (isProcessing) return; isProcessing = true;
    setTimeout(function() {
      if (isPvE) { processRound(); isProcessing = false; return; }
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

  if (myData.silenced > 0 && move !== 'skip') return alert("你已被【蚀骨封行】禁锢，只能结束回合！");

  if (myData.stealthTimer > 0) {
      if (move === 'reload' || move === 'shoot' || move === 'fatal_shoot' || move === 'crimson_illusion') return alert("隐匿状态下无法进行开火或装弹指令！");
      if (move === 'shield' || move === 'duck') {
          if (myData.stealthDefUsed) return alert("隐匿期间，防卫性技能仅能使用 1 次！");
      }
  }

  if (hasTalent(myData, 'm_a1') && move === 'shoot' && val > 2) return alert("【圣盾坚壁】单次射击最高 2 发");
  if (hasTalent(myData, 'm_d1') && move === 'shield') return alert("【深渊魔弹】无法使用防御");
  if (hasTalent(myData, 'n_d1') && (move === 'shoot' || move === 'fatal_shoot') && gameState.round === 1) return alert("【军火狂人】第一回合禁止开火");
  if (hasTalent(myData, 'm_a2') && move === 'heal') return alert("【圣戒】丧失包扎能力");
  if (hasTalent(myData, 'm_h3')) {
    if (myData.h3State === '勿视' && (move === 'shoot' || move === 'fatal_shoot')) return alert("【勿视】状态下，禁止开火！");
    if (myData.h3State === '勿听' && (move === 'shield' || move === 'duck')) return alert("【勿听】状态下，舍弃一切防御动作！");
  }

  // 【修改】：根据不同机缘（鸩毒/韵律/普通弹药）判定射击资源的消耗
  if (move === 'shoot') {
    if (hasTalent(myData, 'm_d5') && (myData.poison || 0) < val) return alert("鸩毒层数不足！");
    else if (hasTalent(myData, 'm_h7') && (myData.rhythm || 0) < val) return alert("韵律点数不足！");
    else if (!hasTalent(myData, 'm_d5') && !hasTalent(myData, 'm_h7') && myData.ammo < val) return alert("弹药不足！");
  }
  if (move === 'fatal_shoot' && myData.ammo < val) return alert("弹药不足！");
  
  if (move === 'heal') {
    if (gameState.round >= 100) return alert("【生体衰竭】100回合后包扎永久禁用！");
    if (myData.healCd > 0) return alert("【包扎】冷却中，还需 " + myData.healCd + " 回合！");
    if (myData.shield < 2) return alert("【包扎】需要消耗 2 护盾！");
    if (myData.hp >= myData.maxHp) return alert("生命值已满。");
  }
  if (move === 'bandage') {
    if (myData.shield < 2) return alert("【绷带】需要消耗 2 护盾！");
    if (!gameState.sanityData || gameState.sanityData[myRole] >= Math.floor(myData.maxHp * 1.5)) return alert("理智值已满或不在幻境内。");
  }
  if (move === 'holy_light') {
    if (!hasTalent(myData, 'm_a2')) return alert("非法操作！");
    if (myData.holyCd > 0) return alert("【圣光】冷却中，还需 " + myData.holyCd + " 回合！");
  }
  if (move === 'stealth_action') {
    if (!hasTalent(myData, 'm_a6')) return alert("非法操作！");
    if (myData.stealthCd > 0) return alert("【缄默】冷却中，还需 " + myData.stealthCd + " 回合！");
  }
  if (move === 'dual_heal') {
    if (!hasTalent(myData, 'm_a4')) return alert("非法操作！");
    if (myData.dualCd > 0) return alert("【渡灵】冷却中，还需 " + myData.dualCd + " 回合！");
  }
  if (move === 'fatal_shoot') {
    if (!hasTalent(myData, 'm_d4')) return alert("非法操作！");
    if (myData.fatalCd > 0) return alert("【狂击】冷却中，还需 " + myData.fatalCd + " 回合！");
    if (val > 5) return alert("【狂击】单次最多消耗 5 发弹药！");
  }
  if (move === 'heretic_seal') {
    if (!hasTalent(myData, 'm_h2')) return alert("非法操作！");
    if (myData.sealCharges <= 0) return alert("【蚀骨封行】可用次数不足！");
    if (myData.talentCd > 0) return alert("【蚀骨封行】冷却中，还需 " + myData.talentCd + " 回合！");
  }
  if (move === 'symbiosis') {
    if (!hasTalent(myData, 'm_h4')) return alert("非法操作！");
    if (myData.symCd > 0) return alert("【共生】冷却中，还需 " + myData.symCd + " 回合！");
  }
  if (move === 'crimson_illusion') {
    if (!hasTalent(myData, 'm_h5')) return alert("非法操作！");
    if (myData.talentCd > 0) return alert("【血色幻境】冷却中，还需 " + myData.talentCd + " 回合！");
    if (myData.ammo < 4 || myData.shield < 4) return alert("【血色幻境】需要消耗 4 弹药与 4 护盾！");
  }
  if (move === 'necromancy') {
    if (!hasTalent(myData, 'm_h6')) return alert("非法操作！");
    if (!myData.necroCharges || myData.necroCharges <= 0) return alert("【招魂】次数不足！");
  }

  let target = "";
  if (move === 'shoot' || move === 'ground_spike' || move === 'holy_light' || move === 'fatal_shoot' || move === 'heretic_seal' || move === 'symbiosis' || move === 'necromancy') {
    if (gameState.config.capacity === 2) { 
        target = myRole === 'p1' ? 'p2' : 'p1'; 
    } else {
      const tRadio = document.querySelector('input[name="atk-target"]:checked');
      if (!tRadio) return alert("请先锁定目标🎯！");
      target = tRadio.value;
    }
    if (move === 'necromancy') {
        if (gameState[target] && gameState[target].hp > 0) return alert("【招魂】目标必须已阵亡！");
    } else {
        if (gameState[target] && gameState[target].hp <= 0) return alert("目标已阵亡！");
        if (gameState[target] && gameState[target].stealthTimer > 0) return alert("目标处于隐匿状态，无法被锁定！");
        if (myData.zombieTimer > 0 && target === myData.zombieMaster) return alert("被招魂者无法攻击自己的主子！");

        // 【新增】：封血鸩毒 拦截重复下毒
        if (move === 'shoot' && hasTalent(myData, 'm_d5') && gameState[target] && gameState[target].poisonStacks > 0) {
           return alert("目标已处于中毒状态，无法叠加施毒！");
            }
          }
        }

  if (isPvE) {
    gameState.p1.move = move; gameState.p1.val = val; gameState.p1.target = target;
    checkRoundStart(); // 单机直接触发 AI
  } else {
    roomRef.child(myRole).update({ move: move, val: val, target: target });
  }
}

function getSmartAiMove(aiKey, enemiesArray) {
  const ai = gameState[aiKey]; 

  // ================= 智能且非偏心的寻敌逻辑 =================
  let validEnemies = [];
  if (gameState.config.isBossMode) {
      if (aiKey === gameState.config.bossRole) {
          // 如果 AI 是 Boss，随机挑选活着的玩家，绝不偏袒 p1
          validEnemies = enemiesArray.filter(e => e !== aiKey && gameState[e].hp > 0 && gameState[e].stealthTimer <= 0);
      } else {
          // 如果 AI 是玩家，死咬 Boss
          validEnemies = [gameState.config.bossRole].filter(e => gameState[e] && gameState[e].hp > 0 && gameState[e].stealthTimer <= 0);
      }
  } else {
      // 混战模式：谁也不帮，随机打一个倒霉蛋
      validEnemies = enemiesArray.filter(e => gameState[e].hp > 0 && gameState[e].stealthTimer <= 0);
  }

  let oppKey = validEnemies.length > 0 ? validEnemies[Math.floor(Math.random() * validEnemies.length)] : null;
  const human = oppKey ? gameState[oppKey] : null; 
  let allowedMoves = [];

  if (ai.silenced > 0) return { move: 'skip', val: 0 };

  let isAggressive = (ai.zombieTimer > 0);

  if (ai.stealthTimer > 0) {
      if (!ai.stealthDefUsed) {
          if (!hasTalent(ai, 'm_h3') || ai.h3State !== '勿听') allowedMoves.push('duck');
          if (!hasTalent(ai, 'm_d1') && (!hasTalent(ai, 'm_h3') || ai.h3State !== '勿听')) allowedMoves.push('shield');
      }
      allowedMoves.push('ground_spike', 'rock');
      if (hasTalent(ai, 'm_a2') && ai.holyCd === 0 && human) allowedMoves.push('holy_light');
      if (allowedMoves.length === 0) return { move: 'rock', val: 0 }; 
      return { move: allowedMoves[Math.floor(Math.random() * allowedMoves.length)], val: 0 };
  }

  let baseMoves = ['reload', 'shield', 'duck', 'ground_spike', 'rock'];
  if (isAggressive) baseMoves = ['reload', 'ground_spike', 'rock']; 

  for (let i = 0; i < baseMoves.length; i++) {
    let m = baseMoves[i]; let pushIt = true;
    if (m === 'shield' && hasTalent(ai, 'm_d1')) pushIt = false;
    if (hasTalent(ai, 'm_h3') && ai.h3State === '勿听' && (m === 'shield' || m === 'duck')) pushIt = false;
    if (pushIt) allowedMoves.push(m);
  }

  if (hasTalent(ai, 'm_h5') && ai.talentCd === 0 && ai.ammo >= 4 && ai.shield >= 4) { allowedMoves.push('crimson_illusion', 'crimson_illusion'); }
  if (hasTalent(ai, 'm_a6') && ai.stealthCd === 0 && !isAggressive) { if (ai.hp <= 3 || Math.random() < 0.4) allowedMoves.push('stealth_action'); }
  if (hasTalent(ai, 'm_a2') && ai.holyCd === 0 && human) allowedMoves.push('holy_light', 'holy_light');
  if (hasTalent(ai, 'm_a4') && ai.dualCd === 0 && ai.hp < ai.maxHp && !isAggressive) {
    if (ai.hp <= 3 && Math.random() < 0.7) return { move: 'dual_heal', val: 0 };
    allowedMoves.push('dual_heal');
  }
  if (hasTalent(ai, 'm_h2') && ai.talentCd === 0 && ai.sealCharges > 0) { if (human && human.hp > 0) return { move: 'heretic_seal', val: 0 }; }
  if (hasTalent(ai, 'm_h4') && ai.symCd === 0 && validEnemies.length > 0) {
    if (ai.hp >= 3 || Math.random() < 0.6) allowedMoves.push('symbiosis', 'symbiosis');
  }

  if (!hasTalent(ai, 'm_a2') && gameState.round < 100 && !isAggressive) {
    if (ai.shield >= 2 && ai.hp < ai.maxHp && ai.healCd === 0) {
      if (ai.hp <= 2 && Math.random() < 0.8) return { move: 'heal', val: 0 };
      allowedMoves.push('heal'); 
    }
  }

  let canShoot = true; 
  if (hasTalent(ai, 'm_d5') && ai.poison <= 0) canShoot = false;
  else if (hasTalent(ai, 'm_h7') && ai.rhythm <= 0) canShoot = false;
  else if (!hasTalent(ai, 'm_d5') && !hasTalent(ai, 'm_h7') && ai.ammo <= 0) canShoot = false;

  if (!human) canShoot = false;
  if (hasTalent(ai, 'n_d1') && gameState.round === 1) canShoot = false;
  if (hasTalent(ai, 'm_h3') && ai.h3State === '勿视') canShoot = false;
  if (hasTalent(ai, 'm_d5') && human && human.poisonStacks > 0) canShoot = false; // 不重复下毒

  if (human && human.ammo >= 3 && ai.shield === 0 && Math.random() < 0.7 && !isAggressive) {
    let defMoves = [];
    if (!hasTalent(ai, 'm_d1') && !(hasTalent(ai, 'm_h3') && ai.h3State === '勿听')) defMoves.push('shield');
    if (!(hasTalent(ai, 'm_h3') && ai.h3State === '勿听')) defMoves.push('duck');
    if (defMoves.length > 0) return { move: defMoves[Math.floor(Math.random() * defMoves.length)], val: 0 };
  }

  let isPiercing = hasTalent(ai, 'm_d1'); let effectiveShield = isPiercing ? 0 : (human ? human.shield : 0);
  if (canShoot) {
    let maxVal = hasTalent(ai, 'm_d5') ? ai.poison : (hasTalent(ai, 'm_h7') ? ai.rhythm : ai.ammo); 
    if (hasTalent(ai, 'm_a1') && maxVal > 2) maxVal = 2;
    let canFatal = (hasTalent(ai, 'm_d4') && ai.fatalCd === 0);

    if (human && maxVal > effectiveShield && (maxVal - effectiveShield) >= human.hp && !hasTalent(ai,'m_d5') && !hasTalent(ai,'m_h7')) return { move: 'shoot', val: maxVal };

    if (canFatal && human) {
      let fatalMax = Math.min(maxVal, 5); // 修复狂击 AI 上限为 5
      if ((fatalMax * 2) > effectiveShield && (fatalMax * 2 - effectiveShield) >= human.hp && Math.random() < 0.7) return { move: 'fatal_shoot', val: fatalMax };
      if (Math.random() < 0.4 || isAggressive) return { move: 'fatal_shoot', val: fatalMax };
    }
    allowedMoves.push('shoot', 'shoot');
    if (isAggressive) allowedMoves.push('shoot', 'shoot', 'shoot');
  } else {
    if (Math.random() < 0.7) return { move: 'reload', val: 0 };
  }

  let chosenMove = allowedMoves[Math.floor(Math.random() * allowedMoves.length)]; let shootVal = 0;
  if (chosenMove === 'shoot' || chosenMove === 'fatal_shoot') {
    let maxVal = hasTalent(ai, 'm_d5') ? ai.poison : (hasTalent(ai, 'm_h7') ? ai.rhythm : ai.ammo);
    if (hasTalent(ai, 'm_a1') && maxVal > 2) maxVal = 2;
    if (chosenMove === 'fatal_shoot') maxVal = Math.min(maxVal, 5); // 修复上限
    shootVal = Math.floor(Math.random() * maxVal) + 1;
    if (isAggressive) shootVal = maxVal; 
  }
  return { move: chosenMove, val: shootVal };
}

// 核心更新：全局引入 roundDmg 变量以支撑共生机制
function processRound() {
  let data = gameState; let logs = [];
  const moveMap = { reload:'装弹', shield:'防御', duck:'趴下', ground_spike:'地刺', rock:'石头', shoot:'射击', heal:'包扎', bandage:'绷带', holy_light:'圣光', dual_heal:'渡灵', fatal_shoot:'狂击', heretic_seal:'封行', symbiosis:'共生', stealth_action:'缄默', crimson_illusion:'幻境', necromancy:'招魂', skip:'禁锢(跳过)', surrender:'认输', quit:'强退' };
  const cap = data.config.capacity; const allKeys = ['p1', 'p2', 'p3', 'p4'];

  for (let i = 0; i < allKeys.length; i++) { 
     if(data[allKeys[i]]) { data[allKeys[i]].roundDmg = 0; data[allKeys[i]].roundSanityDmg = 0; }
  }

  let alive = [];
  for (let i = 0; i < allKeys.length; i++) {
    const k = allKeys[i]; if (i < cap && data[k] && data[k].hp > 0) alive.push(k);
  }
  for (let i = 0; i < alive.length; i++) { data[alive[i]].tookDamage = false; data[alive[i]].lastAttacker = null; }

  let actionStrs = [];
  for (let i = 0; i < alive.length; i++) {
    const p = alive[i]; let m = data[p].move; if (m === "") continue; 
    let mStr = (m === 'shoot' || m === 'fatal_shoot') ? `${data[p].val}发${moveMap[m]}` : moveMap[m];
    if (data[p].target && cap > 2 && (m === 'shoot' || m === 'fatal_shoot' || m === 'ground_spike' || m === 'holy_light' || m === 'heretic_seal' || m === 'symbiosis' || m === 'necromancy')) mStr += `(➡${data[p].target.replace('p', '').toUpperCase()})`;
    actionStrs.push(`${p.replace('p', '').toUpperCase()}:${mStr}`);
  }
  const actionHeader = `【${actionStrs.join(' | ')}】`;

  // 1. 预处理：记录圣光霸体与缄默防卫限制，处理认输与强退
  let isInvincible = {};
  for(let i=0; i<alive.length; i++) {
      let p = alive[i]; let player = data[p];
      if (player.move === 'surrender') {
          let dmg = player.hp; player.hp = 0; player.roundDmg += dmg; player.lastAttacker = 'self'; player.tookDamage = true;
          logs.push(`💀 ${player.username || p.toUpperCase()} 选择了荣誉殉国 (认输)！`);
          continue;
      }
      if (player.move === 'quit') {
          let dmg = player.hp; player.hp = 0; player.roundDmg += dmg; player.lastAttacker = 'system'; player.tookDamage = true;
          logs.push(`⚠️ ${player.username || p.toUpperCase()} 失去连接，系统将其强行抹杀！`);
          continue;
      }
      if (player.move === 'crimson_illusion') {
          player.ammo -= 4; player.shield -= 4; player.talentCd = 15;
          data.illusionTimer = 5;
          if (!data.sanityData) data.sanityData = {};
          for(let k of allKeys) {
              if (data[k] && data[k].joined) {
                  if (data.sanityData[k] === undefined) data.sanityData[k] = Math.floor(data[k].maxHp * 1.5);
              }
          }
          logs.push(`<div style="color:var(--red); font-weight:bold; font-size:1.1em; background:rgba(248,81,73,0.15); padding:10px; border-radius:8px;">🩸 【血色幻境】降临！全场伤害翻倍，生与死被理智接管！</div>`);
      }
      if (player.move === 'necromancy') {
          player.necroCharges--;
          let t = player.target;
          if (data[t] && data[t].hp <= 0) {
              data[t].hp = Math.ceil(data[t].maxHp / 2);
              data[t].shield = Math.ceil(data[t].maxShield / 2);
              data[t].ammo = data[t].maxAmmo;
              data[t].zombieTimer = 3;
              data[t].zombieMaster = p;
              alive.push(t); // 加入存活列表处理结算
              logs.push(`<div style="color:#8957e5; font-weight:bold; background:rgba(137,87,229,0.15); padding:10px; border-radius:8px;">💀 【冥骸有声】回响！${data[t].username} 的亡魂被强行唤醒，为 ${player.username} 卖命！</div>`);
          }
      }
      if (player.move === 'holy_light' && hasTalent(player, 'm_a2')) {
          isInvincible[p] = true;
          logs.push(`<span class="log-safe">👼 ${player.username || p.toUpperCase()} 沐浴在圣光之中，本回合进入霸体状态！</span>`);
      }
      if (player.stealthTimer > 0 && (player.move === 'shield' || player.move === 'duck')) {
          player.stealthDefUsed = true;
      }
  }

  let isIllusion = data.illusionTimer > 0;
  let dmgMult = isIllusion ? 2 : 1;

  // 2. 异教徒状态切换
  for (let i = 0; i < alive.length; i++) {
    const p = alive[i]; let player = data[p];
    if (player.hp <= 0) continue;
    if (hasTalent(player, 'm_h3')) {
      player.h3Timer -= 1;
      if (player.h3Timer <= 0) {
        if (player.h3State === '勿视') {
          player.h3State = '勿听'; player.h3Timer = 3;
          logs.push(`👺 ${player.username || p.toUpperCase()} 状态切换：进入【勿听】，攻击狂暴但舍弃防御！`);
        } else {
          player.h3State = '勿视'; player.h3Timer = 5;
          player.shield = Math.min(player.shield + 1, player.maxShield);
          logs.push(`👺 ${player.username || p.toUpperCase()} 状态切换：进入【勿视】，护盾充能但禁止开火！`);
        }
      }
    }
  }

      // 3. 自我资源与特殊状态结算
      for (let i = 0; i < alive.length; i++) {
        const p = alive[i]; let player = data[p]; if (player.hp <= 0 || player.move === "" || player.move === "skip" || player.move === "surrender" || player.move === "quit") continue;
        if (player.move === 'reload') {
          if (hasTalent(player, 'm_d5')) {
              player.poison = Math.min((player.poison || 0) + 1, 5);
              logs.push(`<span class="log-safe">😈 ${p.toUpperCase()} 进行调制，获得 1 层鸩毒。</span>`);
          } else if (hasTalent(player, 'm_h7')) {
              player.rhythm = Math.min((player.rhythm || 0) + 1, 8);
              logs.push(`<span class="log-safe">👺 ${p.toUpperCase()} 弹奏渐强，积攒 1 点韵律。</span>`);
          } else {
              let gain = 1;
              if (hasTalent(player, 'm_d2')) {
                if (player.talentCd === 0) {
                  if (player.hp > 1) { gain = 3; player.hp -= 1; player.roundDmg += 1; player.talentCd = 3; logs.push(`${p.toUpperCase()} 触发嗜血，流失 1 血换取 3 弹药`); } 
                  else logs.push(`<span style="color:#d29922;">${p.toUpperCase()} 触发濒死保护，转为安全装弹</span>`);
                } else logs.push(`<span style="color:#8b949e;">${p.toUpperCase()} 嗜血冷却中，普通装弹</span>`);
              }
              player.ammo = Math.min(player.ammo + gain, player.maxAmmo);
          }
        }
        if (player.move === 'shield') {
      let gain = hasTalent(player, 'm_a1') ? 2 : 1;
      player.shield = Math.min(player.shield + gain, player.maxShield);
    }
    if (player.move === 'heal') {
      player.shield -= 2; player.hp = Math.min(player.hp + 1, player.maxHp);
      let baseWait = (data.round >= 80) ? 4 : 2; player.healCd = baseWait + 1; 
      logs.push(`<span class="log-safe">${p.toUpperCase()} 包扎完成，生命恢复！</span>`);
    }
    if (player.move === 'bandage') {
      player.shield -= 2; 
      if (data.sanityData && data.sanityData[p] !== undefined) {
         data.sanityData[p] = Math.min(data.sanityData[p] + 1, Math.floor(player.maxHp * 1.5));
         logs.push(`<span class="log-safe">🩹 ${p.toUpperCase()} 使用绷带，理智恢复！</span>`);
      }
    }
    if (player.move === 'dual_heal') {
      player.dualCd = 5; 
      if (Math.random() < 0.5) {
        player.hp = Math.min(player.hp + 1, player.maxHp); logs.push(`<span class="log-safe">✨ ${p.toUpperCase()} 渡灵法阵眷顾，恢复自身 1 点生命！</span>`);
      } else {
        let enemies = []; for (let k = 0; k < alive.length; k++) { if (alive[k] !== p && data[alive[k]].stealthTimer <= 0 && data[alive[k]].hp > 0) enemies.push(alive[k]); }
        if (enemies.length > 0) {
          let randEnemyKey = enemies[Math.floor(Math.random() * enemies.length)];
          data[randEnemyKey].hp = Math.min(data[randEnemyKey].hp + 1, data[randEnemyKey].maxHp);
          logs.push(`<span class="log-dmg">💀 ${p.toUpperCase()} 渡灵反转！为敌人 ${randEnemyKey.replace('p','').toUpperCase()} 恢复了 1 点生命！</span>`);
        } else logs.push(`<span style="color:#8b949e;">✨ ${p.toUpperCase()} 渡灵找不到目标，法阵消散...</span>`);
      }
    }
    if (player.move === 'heretic_seal') {
       player.talentCd = 4; // 3回合CD
       player.sealCharges -= 1;
       player.sealDmgTimer = 3; // 延迟3回合反噬
       let target = player.target;
       if (data[target] && data[target].hp > 0) {
           data[target].silenced = 2; 
           logs.push(`<span class="log-dmg">🔮 ${p.toUpperCase()} 释放了【蚀骨封行】，死死禁锢了 ${data[target].username || target.toUpperCase()}！</span>`);
       }
    }
    if (player.move === 'symbiosis') {
       player.symCd = 4; // 3回合CD
       let target = player.target;
       if (data[target] && data[target].hp > 0) {
           logs.push(`<span class="log-dmg">🔮 ${p.toUpperCase()} 释放了【共生】，强行将宿命与 ${data[target].username || target.toUpperCase()} 捆绑于一线！</span>`);
       }
    }
    if (player.move === 'stealth_action') {
       player.stealthCd = 10;
       player.stealthTimer = 5;
       player.stealthDefUsed = false;
       logs.push(`<span class="log-safe">👼 ${p.toUpperCase()} 释放了【缄默】，遁入无声的隐匿深渊！</span>`);
    }
    if (player.move !== 'shoot' && player.move !== 'fatal_shoot' && player.move !== 'crimson_illusion' && player.ammo > player.maxAmmo) player.ammo = player.maxAmmo;
  }

  // 4. 攻击判定与 LastAttacker 记录 (结合幻境伤害翻倍与理智值)
  function applyDmg(defKey, defPlayer, attKey, attN, defN, dmgToApply, hitType) {
      if (defPlayer.silenced > 0) dmgToApply = Math.floor(dmgToApply / 2);

      if (isIllusion) {
          data.sanityData[defKey] -= dmgToApply;
          defPlayer.roundSanityDmg += dmgToApply;
          logs.push(`<span class="log-dmg">${attN} ${hitType}对 ${defN} 造成 ${dmgToApply} 点理智损伤！</span>`);
      } else {
          if (defPlayer.silenced > 0 && defPlayer.hp - dmgToApply <= 0) { dmgToApply = Math.max(0, defPlayer.hp - 1); logs.push(`🔮 【封行】庇护！${defN} 免疫致命一击苟活！`); }
          defPlayer.hp -= dmgToApply; defPlayer.roundDmg += dmgToApply; 
          logs.push(`<span class="log-dmg">${attN} ${hitType}对 ${defN} 造成 ${dmgToApply} 伤</span>`);
      }
      defPlayer.tookDamage = true; defPlayer.lastAttacker = attKey;
  }

      for (let i = 0; i < alive.length; i++) {
        const attKey = alive[i]; let att = data[attKey];
        if (!att || att.hp <= 0 || (att.move !== 'shoot' && att.move !== 'ground_spike' && att.move !== 'holy_light' && att.move !== 'fatal_shoot')) continue;
        let defKey = att.target; let def = data[defKey];
        let attN = attKey.replace('p', '').toUpperCase(); let defN = defKey ? defKey.replace('p', '').toUpperCase() : '空气';
        let actualDmg = 0;

        // 🎵 安魂协奏干扰结算 (在检查目标生死前先进行偏转)
        if (att.confusedRate > 0 && (att.move === 'shoot' || att.move === 'fatal_shoot')) {
            if (att.confusedRate >= 1) {
                defKey = attKey; def = data[defKey]; defN = attN;
                logs.push(`<span class="log-dmg">🎵 协奏乱心！${attN} 完全失去理智，强制对自身发动攻击！</span>`);
            } else if (Math.random() < att.confusedRate) {
                let possibleTargets = alive.filter(k => data[k].stealthTimer <= 0);
                if (possibleTargets.length > 0) {
                    defKey = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
                    def = data[defKey]; defN = defKey.replace('p', '').toUpperCase();
                    logs.push(`<span style="color:#d29922">🎵 协奏干扰！${attN} 攻击偏离，意外锁定了 ${defN}！</span>`);
                }
            }
            att.confusedRate = 0;
        }

        if (!def || def.hp <= 0) {
      if (cap > 2) logs.push(`<span style="color:#8b949e">${attN} 的攻击落空。</span>`); 
      if (att.move === 'shoot') att.ammo -= att.val;
      if (att.move === 'fatal_shoot') { att.ammo -= att.val; att.fatalCd = 4; }
      if (att.move === 'holy_light') att.holyCd = 6;
      continue; 
    }

      // [计算攻击方伤害衰减] 苟且偷生形态A，伤害-1
      let attDmgMod = (hasTalent(att, 'm_h1') && !att.extraTalent) ? -1 : 0;

      // ☠️ 鸩毒与和鸣结算拦截
      if (att.move === 'shoot') {
          if (hasTalent(att, 'm_d5')) {
              att.poison -= att.val;
              if (def && def.hp > 0) {
                  def.poisonStacks = att.val; def.poisonTimer = 3; def.poisonDmgTaken = 0;
                  logs.push(`<span class="log-dmg">☠️ ${attN} 淬毒匕见！向 ${defN} 注入了 ${att.val} 层鸩毒！</span>`);
              }
              continue; 
          } else if (hasTalent(att, 'm_h7')) {
              att.rhythm -= att.val;
              if (def && def.hp > 0) {
                  def.confusedRate = att.val * 0.125;
                  logs.push(`<span class="log-dmg">🎵 ${attN} 弹奏和鸣！${defN} 的心智被侵蚀！</span>`);
              }
              continue; 
          }
      }

      if (att.move === 'holy_light') {
      att.holyCd = 6; 
      if (isInvincible[defKey]) {
          logs.push(`<span class="log-safe">🛡️ ${defN} 处于圣光霸体，免疫了 ${attN} 的抽取！</span>`);
      } else {
          let hlDmg = Math.max(0, 1 + attDmgMod) * dmgMult;
          applyDmg(defKey, def, attKey, attN, defN, hlDmg, "圣光抽取");
          att.hp = Math.min(att.hp + 1, att.maxHp);
      }
    }

    if (att.move === 'shoot' || att.move === 'fatal_shoot') {
      const isPiercing = hasTalent(att, 'm_d1'); 
      let isFatal = (att.move === 'fatal_shoot'); let baseDmg = att.val; let shouldProceedShoot = true;

      if (hasTalent(att, 'm_h3') && att.h3State === '勿听') { baseDmg += 2; }

      if (isFatal) {
        att.fatalCd = 4; let roll = Math.random();
        if (roll < 0.60 || att.zombieTimer > 0) { // 亡魂必定暴走
          att.ammo -= att.val; baseDmg = att.val * 2; logs.push(`<span class="log-dmg">🩸 ${attN} 狂击暴走！造成致命伤害！</span>`);
        } else if (roll < 0.80) {
          shouldProceedShoot = false; let selfDmg = Math.floor(att.val / 2) * dmgMult;
          if (selfDmg > 0) { 
              if(isIllusion) { data.sanityData[attKey] -= selfDmg; att.roundSanityDmg += selfDmg; } else { att.hp -= selfDmg; att.roundDmg += selfDmg; }
              att.tookDamage = true; logs.push(`<span class="log-dmg">💀 ${attN} 狂击反噬！承受 ${selfDmg} 伤害！</span>`); 
          } 
          else logs.push(`<span style="color:#d29922;">💀 ${attN} 狂击反噬，威力过小幸免于难。</span>`);
        } else {
          shouldProceedShoot = false; att.ammo -= att.val; logs.push(`<span style="color:#8b949e;">💨 ${attN} 狂击哑火...</span>`);
        }
      } else { att.ammo -= att.val; }

      if (shouldProceedShoot) {
        let dmgToApply = Math.max(0, baseDmg + attDmgMod) * dmgMult;

        if (isInvincible[defKey]) {
            logs.push(`<span class="log-safe">🛡️ ${defN} 处于圣光霸体，无视了 ${attN} 的射击！</span>`);
        }
        else if (def.move === 'duck' || def.move === 'ground_spike') logs.push(`<span class="log-safe">${defN} 避开了 ${attN} 的射击</span>`);
        else if (!isPiercing && hasTalent(def, 'm_h1') && !def.extraTalent && def.shield > 0 && def.move !== 'shield') {
            if (dmgToApply > def.shield) {
                let dmg = dmgToApply - def.shield; def.shield = 0; actualDmg = dmgToApply;
                logs.push(`👺 ${defN} 自动举盾挡下部分伤害`);
                applyDmg(defKey, def, attKey, attN, defN, dmg, "破盾后");
            } else { def.shield -= dmgToApply; actualDmg = dmgToApply; logs.push(`👺 ${defN} 自动举盾完全吸收伤害`); }
            def.tookDamage = true; def.lastAttacker = attKey;
        }
        else if (def.move === 'shield' && !isPiercing) {
          if (dmgToApply > def.shield) {
            let dmg = dmgToApply - def.shield; def.shield = 0; actualDmg = dmg;
            applyDmg(defKey, def, attKey, attN, defN, dmg, "破盾");
          } else { def.shield -= dmgToApply; logs.push(`<span class="log-safe">${defN} 的护盾吸收了 ${attN} 的伤害</span>`); }
        } else {
          actualDmg = dmgToApply;
          applyDmg(defKey, def, attKey, attN, defN, dmgToApply, isPiercing ? "无视护盾" : "直接");
        }
      }
    }

    if (att.move === 'ground_spike') {
      let gsDmg = Math.max(0, 2 + attDmgMod) * dmgMult;
      let reboundDmg = Math.max(0, 1 + attDmgMod) * dmgMult;

      if (def.move === 'rock') { 
          if (!isInvincible[attKey]) {
              applyDmg(attKey, att, defKey, defN, attN, reboundDmg, "反弹地刺");
          } else { logs.push(`<span class="log-safe">${defN} 反弹地刺，但 ${attN} 圣光免疫！</span>`); }
      } 
      else if (def.move === 'duck') { 
          if (isInvincible[defKey]) { logs.push(`<span class="log-safe">🛡️ ${defN} 圣光免疫地刺！</span>`); } 
          else { applyDmg(defKey, def, attKey, attN, defN, gsDmg, "地刺贯穿"); }
      }
    }

    if (actualDmg > 0 && (att.move === 'shoot' || att.move === 'fatal_shoot') && hasTalent(att, 'm_d3')) {
      if (att.talentCd === 0 && att.hp < att.maxHp) { 
          att.hp = Math.min(att.hp + 1, att.maxHp); att.talentCd = 3; logs.push(`<span class="log-dmg">😈 ${attN} 吞噬生效，吸取 1 点鲜血！</span>`); 
      }
    }
  }

  // 5. 共生伤害传递与反噬核算 (生死结算前触发)
  for (let i = 0; i < alive.length; i++) {
     let p = alive[i]; let player = data[p];
     if (player.hp <= 0) continue;
     if (player.move === 'symbiosis' && player.target) {
        let t = player.target; let targetPlayer = data[t];
        if (targetPlayer) {
           let sharedDmg = player.roundDmg || 0;
           if (sharedDmg > 0 && targetPlayer.hp > 0) {
               if (isInvincible[t]) {
                   logs.push(`<span class="log-safe">🛡️ 圣光庇护着 ${targetPlayer.username || t.toUpperCase()}，免疫了共生的诅咒传递！</span>`);
               } else {
                   if (targetPlayer.silenced > 0) { sharedDmg = Math.floor(sharedDmg / 2); }
                   if (targetPlayer.silenced > 0 && targetPlayer.hp - sharedDmg <= 0) { sharedDmg = Math.max(0, targetPlayer.hp - 1); logs.push(`🔮 【封行】庇护！${targetPlayer.username || t.toUpperCase()} 免疫了共生的致命一击苟活！`); }

                   targetPlayer.hp -= sharedDmg;
                   targetPlayer.roundDmg += sharedDmg;
                   if (sharedDmg > 0) logs.push(`<span class="log-dmg">🩸 【共生】触动！${player.username || p.toUpperCase()} 受到的 ${sharedDmg} 点伤害同步绞杀了 ${targetPlayer.username || t.toUpperCase()}！</span>`);
               }
           }
           // 反噬代价
           if (targetPlayer.hp <= 0 && player.hp > 0) {
               if (isInvincible[p]) {
                   logs.push(`<span class="log-safe">🛡️ 宿主 ${targetPlayer.username || t.toUpperCase()} 死亡，但 ${player.username || p.toUpperCase()} 的圣光霸体免疫了殉葬反噬！</span>`);
               } else {
                   player.hp = 0;
                   logs.push(`<span class="log-dmg">💀 【共生】反噬！因宿主 ${targetPlayer.username || t.toUpperCase()} 死亡，${player.username || p.toUpperCase()} 被强行扯入深渊一同殉葬！</span>`);
               }
           }
        }
     }
  }

  // 6. 蚀骨封行回合末核算(延迟反噬与充能恢复) & 苟且回盾
  for (let i = 0; i < allKeys.length; i++) {
      let pData = data[allKeys[i]];
      if (pData && pData.hp > 0) {
          if (hasTalent(pData, 'm_h2')) {
              if (pData.sealDmgTimer > 0) {
                  if (pData.stealthTimer > 0) {
                      // 隐匿期间，封行延迟伤害不生效也不递减
                  } else {
                      pData.sealDmgTimer -= 1;
                      if (pData.sealDmgTimer === 0) {
                          pData.hp -= 1; pData.roundDmg += 1;
                          logs.push(`<span class="log-dmg">🩸 【蚀骨封行】反噬期至！${pData.username || allKeys[i].toUpperCase()} 吐出一口黑血，流失 1 点生命！</span>`);
                      }
                  }
              }
              if (data.round % 5 === 0) {
                  if (pData.sealCharges < 2) {
                      pData.sealCharges += 1;
                      logs.push(`<span class="log-safe">🔮 邪力汇聚：${pData.username || allKeys[i].toUpperCase()} 恢复了 1 次【蚀骨封行】使用机会！</span>`);
                  }
              }
          }
  if (hasTalent(pData, 'm_h1') && !pData.extraTalent) {
              pData.h1SurviveTimer = (pData.h1SurviveTimer || 0) + 1;
              if (pData.h1SurviveTimer % 3 === 0 && pData.shield < pData.maxShield) {
                  pData.shield += 1;
                  logs.push(`<span class="log-safe">👺 ${pData.username || allKeys[i].toUpperCase()} 处于【苟且】状态，悄悄恢复了 1 点护盾。</span>`);
              }
          }

          if (pData.poisonStacks > 0) {
              if (pData.stealthTimer <= 0) {
                  pData.poisonTimer -= 1;
                  if (pData.poisonTimer <= 0) {
                      if (isIllusion) {
                          data.sanityData[allKeys[i]] -= 2; pData.roundSanityDmg += 2;
                          logs.push(`<span class="log-dmg">☠️ 鸩毒发作！${pData.username || allKeys[i].toUpperCase()} 承受了 2 点理智反噬！</span>`);
                      } else {
                          pData.hp -= 1; pData.roundDmg += 1;
                          logs.push(`<span class="log-dmg">☠️ 鸩毒发作！${pData.username || allKeys[i].toUpperCase()} 毒血攻心，流失 1 点生命！</span>`);
                      }
                      pData.poisonDmgTaken += 1; pData.tookDamage = true;
                      if (pData.poisonDmgTaken >= pData.poisonStacks + 1) {
                          pData.poisonStacks = 0;
                          logs.push(`<span class="log-safe">✨ ${pData.username || allKeys[i].toUpperCase()} 体内的鸩毒已代谢完毕！</span>`);
                      } else { pData.poisonTimer = 3; }
                  }
              }
          }
      }
  }

  for (let i = 0; i < alive.length; i++) {
    const p = alive[i]; let player = data[p];
    if (hasTalent(player, 'm_a3') && player.talentCd === 0) {
      if (!player.tookDamage && player.move !== 'shoot' && player.move !== 'fatal_shoot' && player.hp < player.maxHp) {
        player.hp = Math.min(player.hp + 1, player.maxHp); player.talentCd = 3; logs.push(`<span class="log-safe">👼 ${p.toUpperCase()} 缓慢恢复了 1 点血量</span>`);
      }
    }
    delete player.tookDamage; 
  }

  // 7. 机缘退回口袋核算 (苟且偷生)
  for (let i = 0; i < allKeys.length; i++) {
      let pData = data[allKeys[i]];
      if (pData && pData.extraTalent) {
          if (pData.extraTalent.category === '机制') {
              if (isMoveFromTalent(pData.move, pData.extraTalent.id)) {
                  let pt = pData.pocketInventory.find(t => t.talent.id === pData.extraTalent.id);
                  if (pt) pt.pocketCd = getBaseCd(pData.extraTalent.id);
                  pData.extraTalent = null;
                  logs.push(`<span style="color:#d29922;">👺 ${pData.username || allKeys[i].toUpperCase()} 的【偷生】机制机缘耗尽，退回口袋冷却！</span>`);
              }
          } else if (pData.extraTalent.category === '数值') {
              pData.extraTalentTimer -= 1;
              if (pData.extraTalentTimer <= 0) {
                  removeTalentMods(pData, pData.extraTalent, data.config);
                  pData.extraTalent = null;
                  logs.push(`<span style="color:#d29922;">👺 ${pData.username || allKeys[i].toUpperCase()} 的【偷生】数值机缘时效已过，退回口袋！</span>`);
              }
          }
      }
  }

  // 8. 死亡与复活搜刮判定
  let newlyDead = [];
  for (let i = 0; i < allKeys.length; i++) {
      const k = allKeys[i];
      if (data[k] && data[k].joined && data[k].hp <= 0 && !data[k].lootedMark) {
          newlyDead.push(k);
      }
  }

  // 为冥骸有声充能
  newlyDead.forEach(deadKey => {
     for (let pk in data) {
         if (data[pk] && data[pk].hp > 0 && pk !== deadKey && hasTalent(data[pk], 'm_h6')) {
             data[pk].necroCharges = (data[pk].necroCharges || 0) + 1;
             logs.push(`<span style="color:#8957e5; font-weight:bold;">👁️ 亡魂的气息被捕捉，${data[pk].username} 获得了 1 次【招魂】充能！</span>`);
         }
     }
  });

        newlyDead.forEach(k => {
          let pData = data[k];

          // Boss 复活裁决
          if (data.config.isBossMode && k === data.config.bossRole && !pData.bossRevived) {
              pData.bossRevived = true;
              pData.hp = pData.maxHp;
              pData.ammo = pData.maxAmmo;
              pData.shield = pData.maxShield;
              pData.lootedMark = false; 
              pData.silenced = 0; pData.poisonStacks = 0; pData.poisonTimer = 0; pData.rhythm = 0;
              logs.push(`<div style="color:var(--red); font-weight:bold; font-size:1.2em; background:rgba(248,81,73,0.2); padding:10px; border-radius:8px;">💥 绝境狂暴！深渊领主 [${pData.username}] 触发重生，三维状态瞬间重回巅峰！</div>`);
              return; 
          }

          if (hasTalent(data[k], 'm_a5') && data[k].reviveCharges > 0) {
        data[k].reviveCharges = 0;
        data[k].reviveCount = (data[k].reviveCount || 0) + 1;
        let pName = data[k].username || k.toUpperCase();
        let penalty = cap === 2 ? 2 : (cap === 3 ? 3 : 4);
        data[k].maxHp -= penalty; data[k].maxShield -= penalty;

        if (data[k].maxHp <= 0 || data[k].maxShield <= 0) {
           data[k].hp = 0; data[k].lootedMark = true; 
           logs.push(`<span class="log-dmg">💀 ${pName} 触犯生命法则，教廷介入调查，将其彻底抹杀！(上限归零)</span>`);
        } else {
           data[k].hp = data[k].maxHp; data[k].shield = 0; data[k].ammo = 0;
           data[k].a5Recoveries = data[k].a5Recoveries || []; data[k].a5Recoveries.push(data.round + 15);
           logs.push(`<span class="log-safe">👼 ${pName} 触发【归光还魂】，死而复生！(血盾上限-${penalty})</span>`);
        }
      } else {
        data[k].lootedMark = true; 
        // 自动收入口袋
        let h1Owner = null;
        for (let pk in data) { if (data[pk] && data[pk].hp > 0 && hasTalent(data[pk], 'm_h1')) { h1Owner = data[pk]; break; } }
        if (h1Owner && data[k].talent) {
            h1Owner.pocketInventory = h1Owner.pocketInventory || [];
            h1Owner.pocketInventory.push({ talent: data[k].talent, pocketCd: 0 });
            logs.push(`<span style='color:var(--red)'>👺 【苟且偷生】暗中运作，死者遗留的机缘被无声地收入了万能口袋...</span>`);
        }
      }
  });

  let battleResult = logs.length > 0 ? logs.join('<br>') : '<span style="color:#8b949e">双方试探，未爆发冲突</span>';
  data.log = `<div class="action-header">${actionHeader}</div><div class="result-body" style="margin-top:10px;">${battleResult}</div>`;

  for (let i = 0; i < allKeys.length; i++) {
    const p = allKeys[i];
    if (data[p]) { 
      data[p].move = ""; data[p].target = ""; 
      if (data[p].stealthTimer > 0) {
          data[p].stealthTimer -= 1;
          if (data[p].stealthTimer === 0) data[p].stealthDefUsed = false;
      } else {
          if (data[p].healCd > 0) data[p].healCd -= 1;
          if (data[p].talentCd > 0) data[p].talentCd -= 1;
          if (data[p].holyCd > 0) data[p].holyCd -= 1;
          if (data[p].dualCd > 0) data[p].dualCd -= 1;
          if (data[p].fatalCd > 0) data[p].fatalCd -= 1;
          if (data[p].symCd > 0) data[p].symCd -= 1;
          if (data[p].stealthCd > 0) data[p].stealthCd -= 1;
      }
      if (data[p].silenced > 0) data[p].silenced -= 1;
      if (data[p].zombieTimer > 0) {
          data[p].zombieTimer -= 1;
          if (data[p].zombieTimer === 0 && data[p].hp > 0) {
              data[p].hp = 0; data[p].lootedMark = true;
              data.log += `<div style="color:#8957e5; font-weight:bold; margin-top:10px;">💀 招魂时间结束，${data[p].username || p.toUpperCase()} 的亡魂化为齑粉！</div>`;
          }
      }
      if (data[p].pocketInventory) {
          data[p].pocketInventory.forEach(pt => { if (pt.pocketCd > 0) pt.pocketCd -= 1; });
      }
    } 
  }

  // 10. 全局幻境 Timer 结算 (理智归零死亡)
  if (data.illusionTimer > 0) {
      data.illusionTimer -= 1;
      if (data.illusionTimer === 0) {
          data.log += `<div style="color:var(--red); font-weight:bold; margin-top:10px;">🩸 【血色幻境】溃散！开始理智清算...</div>`;
          for (let p in data.sanityData) {
              if (data[p] && data[p].hp > 0 && data.sanityData[p] <= 0) {
                  data[p].hp = 0; data[p].lootedMark = true;
                  data.log += `<div style="color:var(--gold); font-weight:bold;">💀 ${data[p].username || p.toUpperCase()} 理智崩溃，在幻境中暴毙！</div>`;
              }
          }
      }
  }

  // 缄默自动触发核算(放于回合末，供下回合使用)
  for (let i = 0; i < allKeys.length; i++) {
      let pData = data[allKeys[i]];
      if (pData && pData.hp > 0 && pData.hp < 3 && hasTalent(pData, 'm_a6') && !pData.autoStealthUsed) {
          pData.autoStealthUsed = true;
          pData.stealthTimer = 5;
          pData.stealthDefUsed = false;
          data.log += `<div style="color:var(--cyan); font-weight:bold; margin-top:10px;">👼 濒死警报：[${pData.username || allKeys[i].toUpperCase()}] 生命值危急，自动遁入【缄默】无声状态！</div>`;
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
    data.log += `<div style="color:var(--red); font-weight:bold; margin-top:10px; background:rgba(248,81,73,0.1); padding:10px; border-radius:8px;">💀 警告：第120回合【死亡竞赛】，全员血盾上限 -2！</div>`;
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

  // 归光还魂(m_a5) 充能逻辑
  if (data.round === 80 || data.round === 120 || (data.round > 120 && (data.round - 120) % 40 === 0)) {
     for (let i = 0; i < allKeys.length; i++) {
        let pData = data[allKeys[i]];
        if (pData && pData.hp > 0 && hasTalent(pData, 'm_a5')) {
           pData.reviveCharges = 1;
           data.log += `<div style="color:var(--green); font-weight:bold; margin-top:10px;">✨ 圣光补给：[${pData.username || allKeys[i].toUpperCase()}] 获得了1次归光还魂充能！</div>`;
        }
     }
  }
  // 归光还魂(m_a5) 15回合血盾上限恢复逻辑
  for (let i = 0; i < allKeys.length; i++) {
     let p = data[allKeys[i]];
     if (p && p.hp > 0 && p.a5Recoveries && p.a5Recoveries.length > 0) {
        let newRecoveries = [];
        for (let r=0; r<p.a5Recoveries.length; r++) {
           if (data.round === p.a5Recoveries[r]) {
              let bonus = cap === 2 ? 1 : (cap === 3 ? 2 : 3);
              p.maxHp += bonus; p.maxShield += bonus;
              data.log += `<div style="color:var(--green); font-weight:bold; margin-top:10px;">✨ 生机复苏：[${p.username || allKeys[i].toUpperCase()}] 挺过虚弱期，血盾上限恢复 ${bonus} 点！</div>`;
           } else { newRecoveries.push(p.a5Recoveries[r]); }
        }
        p.a5Recoveries = newRecoveries;
     }
  }

  let aliveKeysFinal = []; let sortedRanks = [];
  for (let i = 0; i < allKeys.length; i++) {
      if (data[allKeys[i]] && data[allKeys[i]].joined) {
          sortedRanks.push(data[allKeys[i]]);
          if (data[allKeys[i]].hp > 0) aliveKeysFinal.push(allKeys[i]);
      }
  }

  if (aliveKeysFinal.length <= 1) {
    let winStr = (aliveKeysFinal.length === 0) ? "惨烈战况，全军覆没！" : `🎉 玩家 [${data[aliveKeysFinal[0]].username || aliveKeysFinal[0].toUpperCase()}] 取得胜利！`;
    data.log += `<div class="win-msg" style="margin-top:20px;">${winStr}</div>`;
    data.status = 'finished'; data.playAgain = { p1: false, p2: false, p3: false, p4: false };

    if (myRole === 'p1' && !isPvE) {
      // 计算阵营胜率 (排名前50%算赢)
      sortedRanks.sort((a,b) => b.hp - a.hp);
      let threshold = Math.ceil(cap / 2); // 2人前1, 3人前2(按要求你想要3人前1? 这里按通用向上取整, 如你所说3人第1算胜，那直接阈值为1？我尊重你的原话：三人模式里第一名，所以我修正阈值)
      if (cap === 3) threshold = 1;
      if (cap === 2) threshold = 1;
      if (cap === 4) threshold = 2;

      for (let r = 0; r < sortedRanks.length; r++) {
          let pkData = sortedRanks[r];
          if (!pkData.uid) continue;
          let isWinner = r < threshold && pkData.hp > 0;
          let uUid = pkData.uid;
          let factionUsed = pkData.talent ? pkData.talent.type : null;
          let tName = pkData.talent ? pkData.talent.name : null;

          db.ref('users/' + uUid).once('value', snap => {
              let u = snap.val(); if (!u) return;
              if (!u.factions) u.factions = { angel: {total:0, wins:0, history:{}}, demon: {total:0, wins:0, history:{}}, heretic: {total:0, wins:0, history:{}} };
              if (!u.stats) u.stats = { total: 0, wins: 0 };

              u.stats.total += 1;
              if (isWinner) u.stats.wins += 1;

              if (factionUsed && u.factions[factionUsed]) {
                  u.factions[factionUsed].total += 1;
                  if (isWinner) {
                      u.factions[factionUsed].wins += 1;
                      if (!u.factions[factionUsed].history) u.factions[factionUsed].history = {};
                      u.factions[factionUsed].history[tName] = (u.factions[factionUsed].history[tName] || 0) + 1;
                  }
              }
              db.ref('users/' + uUid).set(u);
          });
      }
    }
  }
  if (!isPvE && roomRef) roomRef.set(data); else render(data); 
}

function handleRematchAction() {
  if (isPvE) { selectMode('pve', gameState.config.capacity); return; }
  if (roomRef && myRole && myRole !== 'spectator') roomRef.child('playAgain').child(myRole).set(true);
}

// ==========================================
// 【核心 BUG 修复区】：深度数据清洗
// ==========================================
function resetRoomForRematch(oldData) {
  let cap = oldData.config.capacity; let newData = getInitialState(cap);
  const pKeys = ['p1', 'p2', 'p3', 'p4'];

  for (let i = 0; i < pKeys.length; i++) {
    const p = pKeys[i];
    if (oldData[p] && oldData[p].joined) {
      newData[p].joined = true; newData[p].ready = false; 
      newData[p].uid = oldData[p].uid; newData[p].username = oldData[p].username; newData[p].title = oldData[p].title; newData[p].avatar = oldData[p].avatar;

      // 【深度清洗】：确保彻底断绝上一局状态残留与机缘数值污染
      newData[p].talent = null;
      newData[p].extraTalent = null;
      newData[p].pendingLoot = null;
      newData[p].lootedMark = false;
      newData[p].reviveCharges = 0;
      newData[p].a5Recoveries = [];
      newData[p].actionCount = 0;
      newData[p].silenced = 0;
      newData[p].h3State = '勿视';
      newData[p].h3Timer = 0;
      newData[p].symCd = 0;
      newData[p].stealthCd = 0;
      newData[p].stealthTimer = 0;
      newData[p].stealthDefUsed = false;
      newData[p].autoStealthUsed = false;
      newData[p].sealCharges = 1;
      newData[p].sealDmgTimer = 0;
      newData[p].roundDmg = 0;
      newData[p].roundSanityDmg = 0;
      newData[p].pocketInventory = [];
      newData[p].pocketUses = 0;
      newData[p].h1SurviveTimer = 0;
      newData[p].extraTalentTimer = 0;
      newData[p].rerolled = false;
      newData[p].move = "";
      newData[p].target = "";
      newData[p].necroCharges = 0;
      newData[p].zombieTimer = 0;
      newData[p].zombieMaster = "";

      // 强制覆盖基础三维上限，避免被上一局机缘永久拔高
      let resetHp = 5, resetAmmo = 4, resetShield = 4;
      if (cap === 4) { resetHp = 9; resetAmmo = 6; resetShield = 6; } 
      else if (cap === 3) { resetHp = 7; resetAmmo = 5; resetShield = 5; }

      newData[p].maxHp = resetHp; newData[p].hp = resetHp;
      newData[p].maxAmmo = resetAmmo; newData[p].ammo = 0;
      newData[p].maxShield = resetShield; newData[p].shield = 1;
    }
  }

  newData.globalEvents = null;
  newData.lastRoundLogs = null;
  newData.round = 1;
  newData.status = 'waiting';

  if (roomRef) {
      db.ref(`rooms_chat/${currentRoomId}`).remove(); // 重开清理聊天
      roomRef.set(newData);
  }
}

// ==================== 渲染引擎 (DOM 接驳) ====================
function render(data) {
  if (!data) return;

  if (data.status === 'playing' && data.round === 80) {
    if (myRole && myRole !== 'spectator' && data[myRole] && data[myRole].hp > 0 && !data[myRole].rerolled) {
      const overlay = document.getElementById('talent-overlay');
      const prayer = document.getElementById('prayer-overlay');
      if (overlay && overlay.style.display !== 'flex' && prayer && prayer.style.display !== 'flex') triggerPrayerPhase(true);
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

function buildTalentHtml(tObj, pData) {
  let cdText = "";
  if (tObj.id === 'm_a2' && pData.holyCd > 0) cdText = ` <span style="color:#f85149; font-size:0.85em;">(CD:${pData.holyCd})</span>`;
  else if (tObj.id === 'm_a4' && pData.dualCd > 0) cdText = ` <span style="color:#f85149; font-size:0.85em;">(CD:${pData.dualCd})</span>`;
  else if (tObj.id === 'm_d4' && pData.fatalCd > 0) cdText = ` <span style="color:#f85149; font-size:0.85em;">(CD:${pData.fatalCd})</span>`;
  else if (tObj.id === 'm_h2' && pData.talentCd > 0) cdText = ` <span style="color:#f85149; font-size:0.85em;">(CD:${pData.talentCd})</span>`;
  else if (tObj.id === 'm_h4' && pData.symCd > 0) cdText = ` <span style="color:#f85149; font-size:0.85em;">(CD:${pData.symCd})</span>`;
  else if (tObj.id === 'm_a5' && pData.talentCd > 0) cdText = ` <span style="color:#f85149; font-size:0.85em;">(CD:${pData.talentCd})</span>`;
  else if (tObj.id === 'm_a6' && pData.stealthCd > 0) cdText = ` <span style="color:#f85149; font-size:0.85em;">(CD:${pData.stealthCd})</span>`;
  else if (tObj.id === 'm_h5' && pData.talentCd > 0) cdText = ` <span style="color:#f85149; font-size:0.85em;">(CD:${pData.talentCd})</span>`;
  let tState = ""; 
  if (tObj.id === 'm_h3') tState = ` [${pData.h3State}]`;
  if (tObj.id === 'm_a6' && pData.stealthTimer > 0) tState = ` [隐匿: ${pData.stealthTimer}回合]`;
  return `◈ ${tObj.name}${tState}${cdText}`;
}

// ==================== 局内卡片机缘色彩动态映射 ====================
function updatePlayerCardDOM(pKey, pData, isVisible, fullData) {
  const cardEl = document.getElementById(`${pKey}-card`); const tsRadio = document.getElementById(`ts-${pKey}`);
  if (!isVisible || !pData) { if (cardEl) cardEl.style.display = 'none'; if (tsRadio) tsRadio.style.display = 'none'; return; } 
  else { if (cardEl) cardEl.style.display = 'block'; }

  const hpEl = document.getElementById(`${pKey}-hp`); const ammoEl = document.getElementById(`${pKey}-ammo`);
  const shieldEl = document.getElementById(`${pKey}-shield`); const talentEl = document.getElementById(`${pKey}-talent-name`);
  const playerLabelEl = document.getElementById(`${pKey}-label`);
  const sanityContainer = document.getElementById(`${pKey}-sanity-container`);
  const sanityEl = document.getElementById(`${pKey}-sanity`);

  if (playerLabelEl && pData.username) {
    let tStr = pData.title ? `[${pData.title}] ` : ""; let baseName = `${tStr}${pData.username}`;
    let avatarSrc = pData.avatar || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%2330363d'/></svg>";
    let existingAvatar = document.getElementById(`${pKey}-avatar`);
    if (existingAvatar) existingAvatar.src = avatarSrc;

    let existingNameSpan = document.getElementById(`${pKey}-name-display`);
    if (existingNameSpan) existingNameSpan.innerText = baseName;
  }

  const newConnEl = document.getElementById(`${pKey}-conn`); const newTurnStatusEl = document.getElementById(`${pKey}-turn-status`);

  if (newConnEl) newConnEl.style.display = (!isPvE && pData.hp > 0 && !pData.joined) ? 'inline' : 'none';
  if (newTurnStatusEl) {
    if (pData.hp > 0 && fullData.status === 'playing') {
       if (pData.pendingLoot) newTurnStatusEl.innerHTML = `<span style="color: #d29922;">(抉择中...)</span>`;
       else newTurnStatusEl.innerHTML = (pData.move !== "") ? `<span style="color: #3fb950;">(✅ 已出招)</span>` : `<span style="color: #d29922;">(🤔 思考中...)</span>`;
    } else newTurnStatusEl.innerHTML = ''; 
  }

  if (talentEl) {
    if (pData.talent) {
      let tHtml = buildTalentHtml(pData.talent, pData);
      if (pData.extraTalent) tHtml += `\n<span style="color:#d29922; font-size:0.9em;">+ ${buildTalentHtml(pData.extraTalent, pData)}</span>`;
      talentEl.innerHTML = `${tHtml} <span style="opacity:0.8; font-size:1.1em; cursor:pointer;">ℹ️</span>`;
      talentEl.style.display = 'inline-block'; 

      let mainType = pData.talent.type;
      if (mainType === 'angel') {
        talentEl.style.background = 'rgba(63, 185, 80, 0.15)'; // --green
        talentEl.style.border = '1px solid rgba(63, 185, 80, 0.4)';
      } else if (mainType === 'demon') {
        talentEl.style.background = 'rgba(163, 113, 247, 0.15)'; // --purple
        talentEl.style.border = '1px solid rgba(163, 113, 247, 0.4)';
      } else if (mainType === 'heretic') {
        talentEl.style.background = 'rgba(248, 81, 73, 0.15)'; // --red
        talentEl.style.border = '1px solid rgba(248, 81, 73, 0.4)';
      }

      talentEl.onclick = function() { showTalentDetail(pData.extraTalent || pData.talent); };
    } else { 
      talentEl.innerText = "无机缘"; 
      talentEl.style.display = 'none'; 
      talentEl.style.background = '';
      talentEl.style.border = '';
      talentEl.onclick = null; 
    }
  }

  if (pData.hp <= 0) {
    if (cardEl) { cardEl.style.opacity = '0.3'; cardEl.style.filter = 'grayscale(1)'; }
    if (tsRadio) { tsRadio.style.display = 'none'; }
  } else {
    if (cardEl) { cardEl.style.opacity = '1'; cardEl.style.filter = 'none'; }
    if (tsRadio) {
      if (pKey === myRole || myRole === 'spectator' || pData.stealthTimer > 0) tsRadio.style.display = 'none';
      else { tsRadio.style.display = 'inline-block'; let spanT = document.getElementById(`label-t-${pKey}`); if(spanT && pData.username) spanT.innerText = pData.username; }
    }
  }

  // 幻境理智值接管显示
  if (fullData && fullData.illusionTimer > 0 && fullData.sanityData && fullData.sanityData[pKey] !== undefined) {
      if(sanityContainer) sanityContainer.style.display = 'block';
      if(sanityEl) sanityEl.innerText = `${fullData.sanityData[pKey]}/${Math.floor(pData.maxHp * 1.5)}`;
      if(hpEl) hpEl.parentElement.style.opacity = '0.3';
  } else {
      if(sanityContainer) sanityContainer.style.display = 'none';
      if(hpEl) hpEl.parentElement.style.opacity = '1';
  }

if (hpEl) {
    hpEl.innerText = `${pData.hp}/${pData.maxHp}`;
    if (pData.hp >= Math.ceil(pData.maxHp * 0.7)) hpEl.style.color = "#3fb950";
    else if (pData.hp >= Math.ceil(pData.maxHp * 0.3)) hpEl.style.color = "#d29922";
    else hpEl.style.color = "#f85149";
  }

  // 动态接管弹药 UI，支持鸩毒与韵律
  const ammoLabelEl = document.getElementById(`${pKey}-ammo-label`);
  if (hasTalent(pData, 'm_d5')) {
      if (ammoLabelEl) ammoLabelEl.innerText = "鸩毒";
      if (ammoEl) { ammoEl.innerText = `${pData.poison || 0}/5`; ammoEl.style.color = "#a371f7"; }
  } else if (hasTalent(pData, 'm_h7')) {
      if (ammoLabelEl) ammoLabelEl.innerText = "韵律";
      if (ammoEl) { ammoEl.innerText = `${pData.rhythm || 0}/8`; ammoEl.style.color = "#d29922"; }
  } else {
      if (ammoLabelEl) ammoLabelEl.innerText = "弹药";
      if (ammoEl) { ammoEl.innerText = `${pData.ammo}/${pData.maxAmmo}`; if (pData.ammo > 0) ammoEl.style.color = "#d29922"; else if (pData.ammo === 0) ammoEl.style.color = "#c9d1d9"; else ammoEl.style.color = "#f85149"; }
  }

  if (shieldEl) { shieldEl.innerText = `${pData.shield}/${pData.maxShield}`; shieldEl.style.color = "#58a6ff"; }

  // 顺带把 Boss 的双机缘 UI 挂载上去
  if (pData.numTalent && talentEl) {
      talentEl.innerHTML += `<br><span style="color:#f85149; font-size:0.9em;">+ [专属] ${pData.numTalent.name}</span>`;
  }
}

function updateActionPanel(data) {
  const cap = data.config.capacity;
  const panelContainer = document.getElementById('action-panel-container'); 
  const actionControls = document.getElementById('action-controls'); 
  const actionWaiting = document.getElementById('action-waiting'); 
  const targetSelector = document.getElementById('target-selector');
  const lootPanel = document.getElementById('loot-panel');
  const silencedPanel = document.getElementById('silenced-panel');

  if (myRole === 'spectator') { if (panelContainer) panelContainer.style.display = 'none'; return; } 
  else { if (panelContainer) panelContainer.style.display = 'block'; }

  if (targetSelector) {
    if (cap === 2) targetSelector.style.display = 'none'; else targetSelector.style.display = 'flex';
  }

  const shootControls = document.getElementById('shoot-controls'); const fatalShootBtns = document.getElementById('fatal-shoot-btns');

    if (data[myRole]) {
       let htmlStr = `<span>动作强度:</span>`; let fatalStr = ``;
       let maxVal = hasTalent(data[myRole], 'm_d5') ? 5 : (hasTalent(data[myRole], 'm_h7') ? 8 : data[myRole].maxAmmo);
       for (let i = 1; i <= maxVal; i++) {
          htmlStr += `<button class="s-btn" id="btn-s${i}" onclick="handleInput('shoot', ${i})">${i}</button>`;
          if (i <= 5 && hasTalent(data[myRole], 'm_d4')) {
              fatalStr += `<button class="s-btn" id="btn-f${i}" onclick="handleInput('fatal_shoot', ${i})" style="background:var(--purple);">${i}</button>`;
          }
       }
     if (shootControls) shootControls.innerHTML = htmlStr; 
     if (fatalShootBtns) fatalShootBtns.innerHTML = fatalStr; 
  }

  if (myRole && data[myRole] && data[myRole].hp > 0 && data.status === 'playing') {
    const myP = data[myRole];

    if (data.round === 80) {
       let allRerolled = true;
       if (cap >= 1 && data.p1 && data.p1.hp > 0 && !data.p1.rerolled) allRerolled = false;
       if (cap >= 2 && data.p2 && data.p2.hp > 0 && !data.p2.rerolled) allRerolled = false;
       if (cap >= 3 && data.p3 && data.p3.hp > 0 && !data.p3.rerolled) allRerolled = false;
       if (cap >= 4 && data.p4 && data.p4.hp > 0 && !data.p4.rerolled) allRerolled = false;
       if (!allRerolled) {
          if (actionControls) actionControls.style.display = 'none';
          if (lootPanel) lootPanel.style.display = 'none';
          if (silencedPanel) silencedPanel.style.display = 'none';
          if (actionWaiting) { actionWaiting.style.display = 'block'; actionWaiting.innerHTML = '<div class="spinner">⏳</div><p>命运祈祷与重铸中，等待全员抉择...</p>'; }
          return;
       }
    }

    if (myP.pendingLoot) {
       if (actionControls) actionControls.style.display = 'none';
       if (actionWaiting) actionWaiting.style.display = 'none';
       if (silencedPanel) silencedPanel.style.display = 'none';
       if (lootPanel) {
          lootPanel.style.display = 'block';
          document.getElementById('loot-text').innerText = `发现死去的特工遗留的机缘：\n【${myP.pendingLoot.talent.name}】\n\n是否夺取并替换你当前的机缘？`;
       }
       return;
    } else {
       if (lootPanel) lootPanel.style.display = 'none';
    }

    if (myP.silenced > 0) {
       if (actionControls) actionControls.style.display = 'none';
       if (actionWaiting) actionWaiting.style.display = 'none';
       if (silencedPanel) silencedPanel.style.display = 'block';
       return;
    } else {
       if (silencedPanel) silencedPanel.style.display = 'none';
    }

    if (actionWaiting) actionWaiting.innerHTML = '<div class="spinner">⏳</div><p id="action-waiting-text">指令已安全锁定，正在等待其他玩家深思熟虑...</p>';

    if (myP.move !== "") {
      if (actionControls) actionControls.style.display = 'none';
      if (actionWaiting) actionWaiting.style.display = 'block';
    } else {
      if (actionControls) actionControls.style.display = 'block';
      if (actionWaiting) actionWaiting.style.display = 'none';

      const myAmmo = hasTalent(myP, 'm_d5') ? (myP.poison || 0) : (hasTalent(myP, 'm_h7') ? (myP.rhythm || 0) : myP.ammo);
      const maxA = hasTalent(myP, 'm_d5') ? 5 : (hasTalent(myP, 'm_h7') ? 8 : myP.maxAmmo);
      const reloadBtn = document.getElementById('btn-reload');
      if (reloadBtn) {
         if (hasTalent(myP, 'm_d5')) { reloadBtn.innerText = `调制 (鸩毒: ${myAmmo}/5)`; }
         else if (hasTalent(myP, 'm_h7')) { reloadBtn.innerText = `渐强 (韵律: ${myAmmo}/8)`; }
         else { reloadBtn.innerText = '装弹 (RELOAD)'; }

         let disabled = false;
         if (myP.stealthTimer > 0) disabled = true;
         if (hasTalent(myP, 'm_d5') && myP.poison >= 5) disabled = true;
         if (hasTalent(myP, 'm_h7') && myP.rhythm >= 8) disabled = true;
         if (disabled) reloadBtn.classList.add('disabled');
         else reloadBtn.classList.remove('disabled');
      }

      for (let i = 1; i <= maxA; i++) {
        const btn = document.getElementById(`btn-s${i}`); if (!btn) continue;
        let disabled = false;
        if (myP.stealthTimer > 0) disabled = true;
        if (i > myAmmo) disabled = true;
        if (hasTalent(myP, 'm_a1') && i > 2) disabled = true;
        if (hasTalent(myP, 'n_d1') && data.round === 1) disabled = true;
        if (hasTalent(myP, 'm_h3') && myP.h3State === '勿视') disabled = true;
        if (disabled) { btn.classList.add('disabled'); } else { btn.classList.remove('disabled'); }
      }

      const fatalRow = document.getElementById('fatal-shoot-controls'); const fatalLabel = document.getElementById('fatal-shoot-label');
      if (fatalRow) {
        if (hasTalent(myP, 'm_d4')) {
          fatalRow.style.display = 'flex'; let globalFatalDisabled = false;
          if (myP.stealthTimer > 0) globalFatalDisabled = true;
          if (myP.fatalCd > 0) { globalFatalDisabled = true; if(fatalLabel) { fatalLabel.innerText = `狂击(CD:${myP.fatalCd}):`; } } 
          else { if(fatalLabel) { fatalLabel.innerText = `蚀命狂击:`; } }

          let fatalMax = Math.min(maxA, 5);
          for (let i = 1; i <= fatalMax; i++) {
            const btnF = document.getElementById(`btn-f${i}`); if (!btnF) continue;
            let disabled = globalFatalDisabled; if (i > myAmmo) disabled = true;
            if (hasTalent(myP, 'm_h3') && myP.h3State === '勿视') disabled = true;
            if (disabled) { btnF.classList.add('disabled'); } else { btnF.classList.remove('disabled'); }
          }
        } else { fatalRow.style.display = 'none'; }
      }

      const hereticRow = document.getElementById('heretic-action-controls');
      if (hereticRow) {
         if (hasTalent(myP, 'm_h2') || hasTalent(myP, 'm_h4')) {
            hereticRow.style.display = 'flex';

            const sealBtn = document.getElementById('btn-heretic-seal');
            if (sealBtn) {
               if(hasTalent(myP, 'm_h2')) {
                 sealBtn.style.display = 'inline-block';
                 let chargesStr = `(剩余:${myP.sealCharges||0}次)`;
                 if (myP.sealCharges <= 0) { sealBtn.classList.add('disabled'); sealBtn.innerText = `蚀骨封行 (次数不足)`; }
                 else if (myP.talentCd > 0) { sealBtn.classList.add('disabled'); sealBtn.innerText = `蚀骨封行 (CD:${myP.talentCd})`; }
                 else { sealBtn.classList.remove('disabled'); sealBtn.innerText = `蚀骨封行 ${chargesStr}`; }
               } else sealBtn.style.display = 'none';
            }

            const symBtn = document.getElementById('btn-symbiosis');
            if (symBtn) {
               if(hasTalent(myP, 'm_h4')) {
                 symBtn.style.display = 'inline-block';
                 if (myP.symCd > 0) { symBtn.classList.add('disabled'); symBtn.innerText = `共生 (CD:${myP.symCd})`; }
                 else { symBtn.classList.remove('disabled'); symBtn.innerText = `共生 (绑定血量共享伤害)`; }
               } else symBtn.style.display = 'none';
            }
         } else { hereticRow.style.display = 'none'; }
      }

      const healBtn = document.querySelector('.t-heal');
      if (healBtn) {
        if (data.round >= 100) { healBtn.classList.add('disabled'); healBtn.innerText = '包扎 (已衰竭)'; } 
        else if (hasTalent(myP, 'm_a2')) { healBtn.classList.add('disabled'); healBtn.innerText = '包扎 (已禁用)'; } 
        else if (myP.healCd > 0) { healBtn.classList.add('disabled'); healBtn.innerText = `包扎 (CD:${myP.healCd})`; } 
        else if (myP.shield < 2 || myP.hp >= myP.maxHp) { healBtn.classList.add('disabled'); healBtn.innerText = '包扎'; } 
        else { healBtn.classList.remove('disabled'); healBtn.innerText = '包扎'; }
      }

      const shieldBtn = document.getElementById('btn-shield');
      const duckBtn = document.getElementById('btn-duck');
      if (shieldBtn) {
         if (hasTalent(myP, 'm_h3') && myP.h3State === '勿听') { shieldBtn.classList.add('disabled'); } 
         else if (myP.stealthTimer > 0 && myP.stealthDefUsed) { shieldBtn.classList.add('disabled'); }
         else { shieldBtn.classList.remove('disabled'); }
      }
      if (duckBtn) {
         if (hasTalent(myP, 'm_h3') && myP.h3State === '勿听') { duckBtn.classList.add('disabled'); }
         else if (myP.stealthTimer > 0 && myP.stealthDefUsed) { duckBtn.classList.add('disabled'); } 
         else { duckBtn.classList.remove('disabled'); }
      }

      const holyBtn = document.getElementById('btn-holy');
      if (holyBtn) {
        if (hasTalent(myP, 'm_a2')) {
          holyBtn.style.display = 'inline-block';
          if (myP.holyCd > 0) { holyBtn.classList.add('disabled'); holyBtn.innerText = `圣光 (CD:${myP.holyCd})`; } 
          else { holyBtn.classList.remove('disabled'); holyBtn.innerText = `圣光 (带霸体)`; }
        } else { holyBtn.style.display = 'none'; }
      }

      const dualBtn = document.getElementById('btn-dual');
      if (dualBtn) {
        if (hasTalent(myP, 'm_a4')) {
          dualBtn.style.display = 'inline-block';
          if (myP.dualCd > 0) { dualBtn.classList.add('disabled'); dualBtn.innerText = `渡灵 (CD:${myP.dualCd})`; } 
          else { dualBtn.classList.remove('disabled'); dualBtn.innerText = `渡灵`; }
        } else { dualBtn.style.display = 'none'; }
      }

      const stealthBtn = document.getElementById('btn-stealth');
      if (stealthBtn) {
          if (hasTalent(myP, 'm_a6')) {
              stealthBtn.style.display = 'inline-block';
              if (myP.stealthCd > 0) { stealthBtn.classList.add('disabled'); stealthBtn.innerText = `缄默 (CD:${myP.stealthCd})`; }
              else { stealthBtn.classList.remove('disabled'); stealthBtn.innerText = `缄默`; }
          } else { stealthBtn.style.display = 'none'; }
      }

      const pocketBtn = document.getElementById('btn-pocket');
      if (pocketBtn) {
          if (hasTalent(myP, 'm_h1') && !myP.extraTalent && myP.pocketUses > 0 && myP.pocketInventory && myP.pocketInventory.length > 0) {
              pocketBtn.style.display = 'inline-block';
              pocketBtn.innerText = `万能口袋 (${myP.pocketUses})`;
          } else { pocketBtn.style.display = 'none'; }
      }

      const bandageBtn = document.getElementById('btn-bandage');
      if (bandageBtn) {
          if (data.illusionTimer > 0) {
              bandageBtn.style.display = 'inline-block';
          } else {
              bandageBtn.style.display = 'none';
          }
      }

      const necroBtn = document.getElementById('btn-necro');
      if (necroBtn) {
          if (hasTalent(myP, 'm_h6')) {
              necroBtn.style.display = 'inline-block';
              necroBtn.innerText = `招魂 (${myP.necroCharges || 0}次)`;
              if (!myP.necroCharges || myP.necroCharges <= 0) necroBtn.classList.add('disabled');
              else necroBtn.classList.remove('disabled');
          } else {
              necroBtn.style.display = 'none';
          }
      }
    }
  } else {
    if (actionControls) { actionControls.style.display = 'none'; }
    if (actionWaiting) { actionWaiting.style.display = 'none'; }
    const lootPanel = document.getElementById('loot-panel'); if(lootPanel) lootPanel.style.display='none';
    const silencedPanel = document.getElementById('silenced-panel'); if(silencedPanel) silencedPanel.style.display='none';
  }
}

function selectVersion(version) {
  gameVersion = version;
  document.getElementById('step-version').style.display = 'none';
  document.getElementById('step-mode').style.display = 'block';
}

function toggleRules(show) {
  document.getElementById('rules-modal').style.display = show ? 'flex' : 'none';
}

function sendFriendRequestFromProfile() {
  const targetUid = document.getElementById('profile-uid').innerText.trim();
  if (!targetUid || targetUid === currentUser.uid) return;
  db.ref('friend_requests/' + targetUid + '/' + currentUser.uid).set(currentUser.username).then(function() {
    alert("好友申请已发送！");
    document.getElementById('profile-modal').style.display = 'none';
  });
}

function showTalentCodex() {
  const container = document.getElementById('codex-list-container');
  if (!container) return;
  container.innerHTML = '';
  const allTalents = (TALENT_POOL.numerical || []).concat(TALENT_POOL.mechanism || []);
  const groups = { angel: [], demon: [], heretic: [] };
  allTalents.forEach(function(t) { if (groups[t.type]) groups[t.type].push(t); });

  const groupMeta = [
    { key: 'angel',   label: '👼 天使阵营',   color: '#3fb950' },
    { key: 'demon',   label: '😈 恶魔阵营',   color: '#a371f7' },
    { key: 'heretic', label: '👺 异教徒阵营', color: 'var(--red)' }
  ];

  groupMeta.forEach(function(g) {
    if (!groups[g.key] || groups[g.key].length === 0) return;
    const header = document.createElement('div');
    header.style.cssText = 'color:' + g.color + '; font-weight:bold; font-size:1em; margin:15px 0 8px 0; border-bottom:1px solid ' + g.color + '; padding-bottom:5px;';
    header.innerText = g.label;
    container.appendChild(header);

    groups[g.key].forEach(function(t) {
      const item = document.createElement('div');
      item.style.cssText = 'background:rgba(0,0,0,0.3); border:1px solid var(--border); border-radius:8px; padding:10px 14px; margin-bottom:8px; cursor:pointer;';
      item.innerHTML = '<div style="display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:bold; color:#c9d1d9;">' + t.name + '</span><span style="font-size:0.75em; background:' + g.color + '; color:#fff; padding:2px 8px; border-radius:12px;">' + t.category + '类</span></div>';
      item.onclick = function() { showTalentDetail(t); };
      container.appendChild(item);
    });
  });

  document.getElementById('codex-modal').style.display = 'flex';
}