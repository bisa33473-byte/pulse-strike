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

// ==================== 全局状态管理 ====================
let myRole = null; 
let roomRef = null;
let isPvE = false;
let gameState = null;
let gameVersion = 'stable';
let isProcessing = false; 

// ==================== 极严谨的数据结构生成器 ====================
function getInitialState(capacity) {
  let hp = 5;
  let maxAmmo = 4;
  let maxShield = 4;

  if (capacity === 4) {
    hp = 9; maxAmmo = 6; maxShield = 6;
  } else if (capacity === 3) {
    hp = 7; maxAmmo = 5; maxShield = 5;
  }

  let state = {
    config: { capacity: capacity, maxAmmo: maxAmmo, maxShield: maxShield, baseHp: hp },
    log: "准备就绪，请出招！", 
    round: 1, 
    status: 'waiting',     
    playAgain: { p1: false, p2: false, p3: false, p4: false }
  };

  // 完全放弃循环的基石级声明
  state.p1 = createBasePlayer(capacity >= 1 ? hp : 0, hp, maxAmmo, maxShield);
  state.p2 = createBasePlayer(capacity >= 2 ? hp : 0, hp, maxAmmo, maxShield);
  state.p3 = createBasePlayer(capacity >= 3 ? hp : 0, hp, maxAmmo, maxShield);
  state.p4 = createBasePlayer(capacity >= 4 ? hp : 0, hp, maxAmmo, maxShield);

  return state;
}

function createBasePlayer(currentHp, maxHp, maxAmmo, maxShield) {
  return {
    hp: currentHp, maxHp: maxHp,
    ammo: 0, maxAmmo: maxAmmo,
    shield: 1, maxShield: maxShield,
    move: "", val: 0, target: "",
    talent: null, joined: false, ready: false,
    healCd: 0,           
    talentCd: 0,         
    holyCd: 0,           
    fatalCd: 0,    
    dualCd: 0      
  };
}

// ==================== 圣魔机缘池 ====================
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

// ==================== 基础 UI 与图鉴系统 ====================
function selectVersion(v) { 
  gameVersion = v; 
  document.getElementById('step-version').style.display = 'none'; 
  document.getElementById('step-mode').style.display = 'block'; 
}

function goBackToVersion() { 
  document.getElementById('step-version').style.display = 'block'; 
  document.getElementById('step-mode').style.display = 'none'; 
}

function toggleRules(show) { 
  if (show) {
    document.getElementById('rules-modal').style.display = 'flex';
  } else {
    document.getElementById('rules-modal').style.display = 'none';
  }
}

function showTalentCodex() {
  const container = document.getElementById('codex-list-container');
  container.innerHTML = "";

  let htmlStr = `<h3 style="color: var(--green); border-bottom: 1px solid #30363d; padding-bottom: 5px;">👼 天使机缘</h3>`;
  for (let i = 0; i < TALENT_POOL.numerical.length; i++) {
    if (TALENT_POOL.numerical[i].type === 'angel') {
      htmlStr += `<div style="margin-bottom: 12px;"><strong style="color:#fff;">${TALENT_POOL.numerical[i].name}</strong> <span style="font-size:0.8em; color:#8b949e;">(数值)</span><br><span style="font-size:0.9em; color:#c9d1d9;">${TALENT_POOL.numerical[i].desc}</span></div>`;
    }
  }
  for (let i = 0; i < TALENT_POOL.mechanism.length; i++) {
    if (TALENT_POOL.mechanism[i].type === 'angel') {
      htmlStr += `<div style="margin-bottom: 12px;"><strong style="color:#fff;">${TALENT_POOL.mechanism[i].name}</strong> <span style="font-size:0.8em; color:#8b949e;">(机制)</span><br><span style="font-size:0.9em; color:#c9d1d9;">${TALENT_POOL.mechanism[i].desc}</span></div>`;
    }
  }

  htmlStr += `<h3 style="color: var(--purple); border-bottom: 1px solid #30363d; padding-bottom: 5px; margin-top: 25px;">😈 恶魔机缘</h3>`;
  for (let i = 0; i < TALENT_POOL.numerical.length; i++) {
    if (TALENT_POOL.numerical[i].type === 'demon') {
      htmlStr += `<div style="margin-bottom: 12px;"><strong style="color:#fff;">${TALENT_POOL.numerical[i].name}</strong> <span style="font-size:0.8em; color:#8b949e;">(数值)</span><br><span style="font-size:0.9em; color:#c9d1d9;">${TALENT_POOL.numerical[i].desc.replace(/\n/g, '<br>')}</span></div>`;
    }
  }
  for (let i = 0; i < TALENT_POOL.mechanism.length; i++) {
    if (TALENT_POOL.mechanism[i].type === 'demon') {
      htmlStr += `<div style="margin-bottom: 12px;"><strong style="color:#fff;">${TALENT_POOL.mechanism[i].name}</strong> <span style="font-size:0.8em; color:#8b949e;">(机制)</span><br><span style="font-size:0.9em; color:#c9d1d9;">${TALENT_POOL.mechanism[i].desc.replace(/\n/g, '<br>')}</span></div>`;
    }
  }

  container.innerHTML = htmlStr;
  document.getElementById('codex-modal').style.display = 'flex';
}

function exitGame() { 
  if (roomRef && myRole) {
    let confirmMsg = "";
    if (myRole === 'p1') {
      confirmMsg = "确定要离开吗？\n你是房主，离开将解散整个房间，所有人会被强制踢出。";
    } else if (myRole === 'spectator') {
      confirmMsg = "确定要退出观战吗？";
    } else {
      confirmMsg = "确定要退出当前房间吗？";
    }

    if (confirm(confirmMsg)) {
      if (myRole === 'p1') {
        roomRef.remove().then(function() { location.reload(); }); 
      } else if (myRole === 'spectator') {
        location.reload();
      } else {
        roomRef.child(myRole).update({ joined: false, ready: false }).then(function() { location.reload(); }); 
      }
    }
  } else { 
    location.reload(); 
  }
}

// ==================== 模式入口控制 ====================
function selectMode(mode) {
  isPvE = (mode === 'pve');
  document.getElementById('mode-overlay').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';

  if (isPvE) {
    document.getElementById('room-setup').style.display = 'none';
    myRole = 'p1';

    gameState = getInitialState(2);
    gameState.status = 'playing';
    gameState.p1.joined = true; 
    gameState.p1.ready = true;
    gameState.p2.joined = true; 
    gameState.p2.ready = true;

    document.getElementById('p2-label').innerText = "COMPUTER (AI)";
    if (gameVersion === 'beta') {
      showTalentSelection();
    } else {
      render(gameState); 
    }
  } else {
    document.getElementById('room-setup').style.display = 'flex';
  }
}

// ==================== 网络隔离与观战系统 ====================
function createRoom(capacity) {
  const rid = Math.random().toString(36).substring(2, 7).toUpperCase();
  myRole = 'p1';
  document.getElementById('room-setup').style.display = 'none';

  const dbPath = gameVersion === 'beta' ? "rooms_beta/" : "rooms_v2/";
  roomRef = db.ref(dbPath + rid);

  let newRoom = getInitialState(capacity);
  newRoom.p1.joined = true; 
  roomRef.set(newRoom);
  roomRef.onDisconnect().remove(); 
  setupRoomListener(rid);
}

function joinRoom() {
  const ridInput = document.getElementById('roomInput').value;
  if (!ridInput) {
    alert("请输入 5 位正确的房间码！");
    return;
  }
  const rid = ridInput.toUpperCase().trim();

  const dbPath = gameVersion === 'beta' ? "rooms_beta/" : "rooms_v2/";
  const tempRef = db.ref(dbPath + rid);

  tempRef.once('value', snap => {
    let data = snap.val();
    if (!data) {
      alert("❌ 房间不存在或已被房主解散！");
      return;
    }

    const cap = data.config.capacity;
    let isAssigned = false;

    if (data.status === 'playing' || data.status === 'finished') {
      if (cap >= 2 && !data.p2.joined && data.p2.hp > 0) { myRole = 'p2'; isAssigned = true; }
      else if (cap >= 3 && !data.p3.joined && data.p3.hp > 0) { myRole = 'p3'; isAssigned = true; }
      else if (cap === 4 && !data.p4.joined && data.p4.hp > 0) { myRole = 'p4'; isAssigned = true; }
    } else {
      if (cap >= 2 && !data.p2.joined) { myRole = 'p2'; isAssigned = true; }
      else if (cap >= 3 && !data.p3.joined) { myRole = 'p3'; isAssigned = true; }
      else if (cap === 4 && !data.p4.joined) { myRole = 'p4'; isAssigned = true; }
    }

    if (!isAssigned) {
      myRole = 'spectator';
      alert("当前房间已被占满或已开战，系统已为您自动切换至【观战模式】！");
    }

    roomRef = tempRef;
    document.getElementById('room-setup').style.display = 'none';

    if (myRole !== 'spectator') {
      roomRef.child(myRole).update({ joined: true, ready: false });
      roomRef.child(myRole).onDisconnect().update({ joined: false, ready: false });
    }
    setupRoomListener(rid);
  });
}

function setupRoomListener(rid) {
  roomRef.on('value', snap => {
    let data = snap.val();
    if (!data) { 
      alert("⚠️ 房主已离开，房间已自动解散。"); 
      location.reload(); 
      return; 
    }

    gameState = data;
    if (gameState.status === 'waiting') {
      renderLobby(rid);
    } else {
      document.getElementById('waiting-room').style.display = 'none';
      document.getElementById('game-container').style.display = 'block';
      render(gameState);
      checkRoundStart(); 
    }
  });
}

function renderLobby(rid) {
  document.getElementById('game-container').style.display = 'none';
  document.getElementById('waiting-room').style.display = 'block';
  document.getElementById('lobby-rid').innerText = rid;

  const specBanner = document.getElementById('spectator-banner-lobby');
  if (myRole === 'spectator') {
    if (specBanner) specBanner.style.display = 'block';
  } else {
    if (specBanner) specBanner.style.display = 'none';
  }

  const cap = gameState.config.capacity;

  updateLobbyPlayer('p1', gameState.p1, 1 <= cap);
  updateLobbyPlayer('p2', gameState.p2, 2 <= cap);
  updateLobbyPlayer('p3', gameState.p3, 3 <= cap);
  updateLobbyPlayer('p4', gameState.p4, 4 <= cap);

  const actionBtn = document.getElementById('lobby-action-btn');
  if (myRole === 'spectator') {
    actionBtn.style.display = 'none';
  } else {
    actionBtn.style.display = 'inline-block';
    const myData = gameState[myRole];
    if (myData && myData.ready) {
      actionBtn.innerText = "等待其他玩家..."; 
      actionBtn.style.opacity = 0.5; 
      actionBtn.onclick = null;
    } else {
      actionBtn.style.opacity = 1;
      if (gameVersion === 'beta') {
        actionBtn.innerText = "抽取圣魔机缘"; 
        actionBtn.onclick = showTalentSelection;
      } else {
        actionBtn.innerText = "准备就绪"; 
        actionBtn.onclick = function() { 
          if (roomRef) {
            roomRef.child(myRole).update({ ready: true }); 
          }
        };
      }
    }
  }

  if (myRole === 'p1') {
    let allReady = true;
    if (cap >= 1 && (!gameState.p1.joined || !gameState.p1.ready)) allReady = false;
    if (cap >= 2 && (!gameState.p2.joined || !gameState.p2.ready)) allReady = false;
    if (cap >= 3 && (!gameState.p3.joined || !gameState.p3.ready)) allReady = false;
    if (cap >= 4 && (!gameState.p4.joined || !gameState.p4.ready)) allReady = false;

    if (allReady) {
      roomRef.update({ 
        status: 'playing', 
        playAgain: { p1: false, p2: false, p3: false, p4: false } 
      });
    }
  }
}

function updateLobbyPlayer(playerId, pData, isActive) {
  const cardEl = document.getElementById(`lobby-${playerId}-card`);
  const statusEl = document.getElementById(`lobby-${playerId}-status`);

  if (!isActive) {
    if (cardEl) cardEl.style.display = 'none'; 
    return;
  } else {
    if (cardEl) cardEl.style.display = 'block';
  }

  if (!pData || !pData.joined) {
    statusEl.innerText = "等待加入..."; 
    statusEl.style.color = "#8b949e"; 
    if(cardEl) cardEl.style.borderColor = "#30363d";
  } else if (!pData.ready) {
    statusEl.innerText = gameVersion === 'beta' ? "挑选机缘中..." : "已加入，未准备"; 
    statusEl.style.color = "#d29922"; 
    if(cardEl) cardEl.style.borderColor = "#d29922";
  } else {
    statusEl.innerText = "已准备就绪！"; 
    statusEl.style.color = "#3fb950"; 
    if(cardEl) cardEl.style.borderColor = "#3fb950";
  }
}

// ==================== 天赋分配与数值写入 ====================
function showTalentSelection() {
  const overlay = document.getElementById('talent-overlay');
  const list = document.getElementById('talent-list');
  overlay.style.display = 'flex';
  list.innerHTML = '';

  let options = [];
  let numTalent = TALENT_POOL.numerical[Math.floor(Math.random() * TALENT_POOL.numerical.length)];
  let mechTalent = TALENT_POOL.mechanism[Math.floor(Math.random() * TALENT_POOL.mechanism.length)];
  options.push(numTalent);
  options.push(mechTalent);

  const combinedPool = [...TALENT_POOL.numerical, ...TALENT_POOL.mechanism];
  while (options.length < 4) {
    const pick = combinedPool[Math.floor(Math.random() * combinedPool.length)];
    let alreadyExists = false;
    for (let i = 0; i < options.length; i++) { 
      if (options[i].id === pick.id) { 
        alreadyExists = true; 
        break; 
      } 
    }
    if (!alreadyExists) {
      options.push(pick);
    }
  }

  for (let i = 0; i < options.length; i++) {
    let t = options[i];
    const card = document.createElement('div');
    card.className = `talent-card ${t.type}`;
    card.innerHTML = `<h4>${t.name}</h4><small>${t.category}类</small><p>${t.desc}</p>`;
    card.onclick = function() { applyTalent(t); };
    list.appendChild(card);
  }
}

function applyTalentMods(playerData, t) {
  if (!t) return;

  // 完全移除有关 m_a2 减弹药上限的错误旧代码
  if (t.id === 'n_a1') { 
    playerData.shield += 2; 
    playerData.ammo -= 1; 
  } else if (t.id === 'n_a2') { 
    playerData.ammo += 1; 
    playerData.shield += 1; 
    playerData.maxHp -= 1; 
    playerData.hp -= 1; 
  } else if (t.id === 'n_d1') { 
    playerData.ammo += 4; 
    playerData.maxHp -= 3; 
    playerData.hp -= 3; 
  } else if (t.id === 'n_d2') { 
    playerData.shield += 3; 
    playerData.maxHp -= 3; 
    playerData.hp -= 3; 
  } else if (t.id === 'm_d3') {
    playerData.maxHp -= 2; 
    playerData.hp -= 2; 
    playerData.maxShield = 2;
    if (playerData.shield > 2) {
      playerData.shield = 2;
    }
  }
}

function applyTalent(t) {
  document.getElementById('talent-overlay').style.display = 'none';

  if (isPvE) {
    gameState.p1.talent = t;
    applyTalentMods(gameState.p1, t);

    const aiTalents = [...TALENT_POOL.numerical, ...TALENT_POOL.mechanism];
    const aiT = aiTalents[Math.floor(Math.random() * aiTalents.length)];
    gameState.p2.talent = aiT;
    applyTalentMods(gameState.p2, aiT);

    render(gameState); 
  } else {
    let pData = gameState[myRole];
    pData.talent = t;
    pData.ready = true; 
    applyTalentMods(pData, t);

    if (roomRef) {
      roomRef.child(myRole).set(pData);
    }
  }
}

function showTalentDetail(t) {
  if (!t) return;
  document.getElementById('td-name').innerText = t.name;

  const typeBadge = document.getElementById('td-type');
  if (t.type === 'angel') {
    typeBadge.innerText = '👼 天使 | ' + t.category + '类';
    typeBadge.style.background = '#3fb950';
  } else {
    typeBadge.innerText = '😈 恶魔 | ' + t.category + '类';
    typeBadge.style.background = '#a371f7';
  }

  document.getElementById('td-desc').innerText = t.desc;
  document.getElementById('talent-detail-modal').style.display = 'flex';
}

// ==================== 稳固回合锁控制 ====================
function checkRoundStart() {
  if (isPvE) return; 
  if (!gameState || gameState.status !== 'playing') return;

  const cap = gameState.config.capacity;

  let alivePlayers = [];
  if (cap >= 1 && gameState.p1 && gameState.p1.hp > 0) alivePlayers.push('p1');
  if (cap >= 2 && gameState.p2 && gameState.p2.hp > 0) alivePlayers.push('p2');
  if (cap >= 3 && gameState.p3 && gameState.p3.hp > 0) alivePlayers.push('p3');
  if (cap >= 4 && gameState.p4 && gameState.p4.hp > 0) alivePlayers.push('p4');

  let allMoved = true;
  for (let i = 0; i < alivePlayers.length; i++) {
    const pKey = alivePlayers[i];
    if (gameState[pKey].move === "") {
      allMoved = false; 
      break;
    }
  }

  if (allMoved && alivePlayers.length > 0 && myRole === alivePlayers[0]) {
    if (isProcessing) return; 
    isProcessing = true;

    setTimeout(function() {
      roomRef.once('value', function(snap) {
        const currentData = snap.val();
        if (currentData) {
          let stillAllMoved = true;
          for (let i = 0; i < alivePlayers.length; i++) {
             if (currentData[alivePlayers[i]].move === "") {
               stillAllMoved = false;
               break;
             }
          }
          if (stillAllMoved) {
            gameState = currentData; 
            processRound(); 
          }
        }
        isProcessing = false; 
      });
    }, 500); 
  }
}

// ==================== 输入拦截与安全中心 ====================
function handleInput(move, val = 0) {
  if (!gameState || !myRole || myRole === 'spectator' || !gameState[myRole]) return;

  const myData = gameState[myRole];
  if (myData.move !== "" || myData.hp <= 0) return;

  const t = myData.talent;

  // ---------- 1. 强禁手与天赋机制校验 ----------
  if (t) {
    if (t.id === 'm_a1' && move === 'shoot' && val > 2) {
      alert("【圣盾坚壁】限制：单次射击最高 2 发");
      return;
    }
    if (t.id === 'm_d1' && move === 'shield') {
      alert("【深渊魔弹】代价：深渊剥夺了你的防御能力");
      return;
    }
    if (t.id === 'n_d1' && (move === 'shoot' || move === 'fatal_shoot') && gameState.round === 1) {
      alert("【军火狂人】制约：第一回合绝对禁止开火，请选择其他战术！");
      return;
    }
    if (t.id === 'm_a2' && move === 'heal') {
      alert("【圣戒】代价：获得了神圣力量，你将永远无法使用凡人的包扎手段。");
      return;
    }
  }

  // ---------- 2. 资源与冷却 (CD) 与衰竭 校验 ----------
  if ((move === 'shoot' || move === 'fatal_shoot') && myData.ammo < val) {
    alert("弹药不足，无法完成射击！");
    return;
  }

  if (move === 'heal') {
    if (gameState.round >= 100) {
      alert("【生体衰竭】第100回合起，包扎能力已被永久禁用！");
      return;
    }
    if (myData.healCd > 0) {
      alert("【包扎】正在冷却中，还需等待 " + myData.healCd + " 回合！");
      return;
    }
    if (myData.shield < 2) {
      alert("【包扎】战术要求：至少需要消耗 2 层护盾作为材料！");
      return;
    }
    if (myData.hp >= myData.maxHp) {
      alert("生命值已达当前上限，无需包扎。");
      return;
    }
  }

  if (move === 'holy_light') {
    if (!t || t.id !== 'm_a2') {
      alert("非法操作：你并未获得圣戒！");
      return;
    }
    if (myData.holyCd > 0) {
      alert("【圣光】正在充能，还需等待 " + myData.holyCd + " 回合！");
      return;
    }
  }

  if (move === 'dual_heal') {
    if (!t || t.id !== 'm_a4') {
      alert("非法操作：你并未掌握双向渡灵！");
      return;
    }
    if (myData.dualCd > 0) {
      alert("【渡灵】正在冷却，还需等待 " + myData.dualCd + " 回合！");
      return;
    }
  }

  if (move === 'fatal_shoot') {
    if (!t || t.id !== 'm_d4') {
      alert("非法操作：你并未掌握蚀命狂击！");
      return;
    }
    if (myData.fatalCd > 0) {
      alert("【狂击】正在冷却，还需等待 " + myData.fatalCd + " 回合！");
      return;
    }
  }

  // ---------- 3. 目标获取防漏 ----------
  let target = "";
  if (move === 'shoot' || move === 'ground_spike' || move === 'holy_light' || move === 'fatal_shoot') {
    if (gameState.config.capacity === 2) {
      if (myRole === 'p1') {
        target = 'p2';
      } else {
        target = 'p1';
      }
    } else {
      const tRadio = document.querySelector('input[name="atk-target"]:checked');
      if (!tRadio) {
        alert("施放该战术动作需要目标支持！请在上方【锁定目标 🎯】处点选你要攻击的玩家。");
        return;
      }
      target = tRadio.value;

      if (gameState[target] && gameState[target].hp <= 0) {
        alert("你锁定的目标已是冢中枯骨，请重新选择存活目标！");
        return;
      }
    }
  }

  // ---------- 4. 数据路由 ----------
  if (isPvE) {
    gameState.p1.move = move; 
    gameState.p1.val = val; 
    gameState.p1.target = target;

    const aiDecision = getSmartAiMove('p2', 'p1');
    gameState.p2.move = aiDecision.move; 
    gameState.p2.val = aiDecision.val; 
    gameState.p2.target = 'p1';

    processRound();
  } else {
    if (roomRef) {
      roomRef.child(myRole).update({ 
        move: move, 
        val: val, 
        target: target 
      });
    }
  }
}

// ==================== 单机模式：高智能 AI 大脑 ====================
function getSmartAiMove(aiKey, oppKey) {
  const ai = gameState[aiKey]; 
  const human = gameState[oppKey];
  const moves = ['reload', 'shield', 'duck', 'ground_spike', 'rock'];

  if (ai.talent && ai.talent.id === 'm_d1') {
    moves.splice(moves.indexOf('shield'), 1);
  }

  if (ai.talent && ai.talent.id === 'm_a2') {
    if (ai.holyCd === 0) {
      moves.push('holy_light', 'holy_light', 'holy_light');
    }
  } 

  if (ai.talent && ai.talent.id === 'm_a4') {
    if (ai.dualCd === 0 && ai.hp < ai.maxHp) {
      if (ai.hp <= 3 && Math.random() < 0.7) {
        return { move: 'dual_heal', val: 0 };
      }
      moves.push('dual_heal', 'dual_heal');
    }
  }

  // 严格判定衰竭期的AI包扎
  if (!ai.talent || ai.talent.id !== 'm_a2') {
    if (gameState.round < 100) {
      if (ai.shield >= 2 && ai.hp < ai.maxHp && ai.healCd === 0) {
        if (ai.hp <= 2 && Math.random() < 0.8) {
          return { move: 'heal', val: 0 };
        }
        moves.push('heal', 'heal'); 
      }
    }
  }

  let canShoot = true;
  if (ai.ammo <= 0) canShoot = false;
  if (ai.talent && ai.talent.id === 'n_d1' && gameState.round === 1) {
    canShoot = false;
  }

  if (canShoot && ai.ammo >= human.hp && human.shield === 0) {
    if (ai.talent && ai.talent.id === 'm_d4' && ai.fatalCd === 0) {
      return { move: 'fatal_shoot', val: Math.min(ai.ammo, ai.maxAmmo) };
    }
    return { move: 'shoot', val: Math.min(ai.ammo, ai.maxAmmo) };
  }

  if (!canShoot) {
    if (Math.random() < 0.6) {
      return { move: 'reload', val: 0 };
    } else {
      return { move: moves[Math.floor(Math.random() * moves.length)], val: 0 };
    }
  }

  let chosenMove = 'shoot';
  if (ai.talent && ai.talent.id === 'm_d4' && ai.fatalCd === 0) {
    if (Math.random() < 0.5) {
      chosenMove = 'fatal_shoot';
    } else {
      moves.push('shoot');
      chosenMove = moves[Math.floor(Math.random() * moves.length)];
    }
  } else {
    moves.push('shoot');
    chosenMove = moves[Math.floor(Math.random() * moves.length)];
  }

  let shootVal = 0;
  if (chosenMove === 'shoot' || chosenMove === 'fatal_shoot') {
    shootVal = Math.floor(Math.random() * Math.min(ai.ammo, ai.maxAmmo)) + 1;
    if (ai.talent && ai.talent.id === 'm_a1' && shootVal > 2) {
      shootVal = 2; 
    }
  }

  return { move: chosenMove, val: shootVal };
}

// ==================== 终极回合结算矩阵 (极致净化防穿透版) ====================
function processRound() {
  let data = gameState; 
  let logs = [];
  const moveMap = {
    reload: '装弹', shield: '防御', duck: '趴下', 
    ground_spike: '地刺', rock: '石头', shoot: '射击', 
    heal: '包扎', holy_light: '圣光', dual_heal: '渡灵', fatal_shoot: '狂击'
  };

  const cap = data.config.capacity;
  let alive = [];
  if (cap >= 1 && data.p1 && data.p1.hp > 0) alive.push('p1');
  if (cap >= 2 && data.p2 && data.p2.hp > 0) alive.push('p2');
  if (cap >= 3 && data.p3 && data.p3.hp > 0) alive.push('p3');
  if (cap >= 4 && data.p4 && data.p4.hp > 0) alive.push('p4');

  // 0. 重置受击状态
  for (let i = 0; i < alive.length; i++) { 
    data[alive[i]].tookDamage = false; 
  }

  // 1. 生成顶部动作栏
  let actionStrs = [];
  for (let i = 0; i < alive.length; i++) {
    const p = alive[i];
    let m = data[p].move;
    if (m === "") continue; 

    let mStr = "";
    if (m === 'shoot' || m === 'fatal_shoot') {
      mStr = `${data[p].val}发${moveMap[m]}`;
    } else {
      mStr = moveMap[m];
    }

    if (data[p].target && cap > 2 && (m === 'shoot' || m === 'fatal_shoot' || m === 'ground_spike' || m === 'holy_light')) {
      mStr += `(➡${data[p].target.replace('p', '').toUpperCase()})`;
    }
    actionStrs.push(`${p.replace('p', '').toUpperCase()}:${mStr}`);
  }
  const actionHeader = `【${actionStrs.join(' | ')}】`;

  // 2. 自身资源与防守动作结算
  for (let i = 0; i < alive.length; i++) {
    const p = alive[i];
    let player = data[p];
    if (player.move === "") continue;

    if (player.move === 'reload') {
      let gain = 1;
      if (player.talent && player.talent.id === 'm_d2') {
        if (player.talentCd === 0) {
          if (player.hp > 1) {
            gain = 3; 
            player.hp -= 1; 
            player.talentCd = 3; 
            logs.push(`${p.toUpperCase()} 触发嗜血狂热，流失 1 血量换取大量弹药`); 
          } else {
            logs.push(`<span style="color:#d29922;">${p.toUpperCase()} 触发濒死保护，嗜血中止，转为安全装弹</span>`);
          }
        } else {
          logs.push(`<span style="color:#8b949e;">${p.toUpperCase()} 嗜血狂热仍在冷却中，执行普通装弹</span>`);
        }
      }
      player.ammo = Math.min(player.ammo + gain, player.maxAmmo);
    }

    if (player.move === 'shield') {
      let gain = 1;
      if (player.talent && player.talent.id === 'm_a1') {
        gain = 2;
      }
      player.shield = Math.min(player.shield + gain, player.maxShield);
    }

    if (player.move === 'heal') {
      player.shield -= 2;
      player.hp = Math.min(player.hp + 1, player.maxHp);

      let baseWait = 2; 
      if (data.round >= 80) {
        baseWait = 4;
      }
      player.healCd = baseWait + 1; 

      logs.push(`<span class="log-safe">${p.toUpperCase()} 消耗护盾完成包扎，生命值恢复！</span>`);
    }

    // 双向渡灵
    if (player.move === 'dual_heal') {
      player.dualCd = 5; 
      let r = Math.random();
      if (r < 0.5) {
        player.hp = Math.min(player.hp + 1, player.maxHp);
        logs.push(`<span class="log-safe">✨ ${p.toUpperCase()} 渡灵法阵眷顾，为自身恢复了 1 点生命！</span>`);
      } else {
        let enemies = [];
        for (let k = 0; k < alive.length; k++) {
          if (alive[k] !== p) enemies.push(alive[k]);
        }
        if (enemies.length > 0) {
          let randEnemyKey = enemies[Math.floor(Math.random() * enemies.length)];
          let eDef = data[randEnemyKey];
          eDef.hp = Math.min(eDef.hp + 1, eDef.maxHp);
          logs.push(`<span class="log-dmg">💀 ${p.toUpperCase()} 渡灵反转！造化弄人，竟然为敌人 ${randEnemyKey.replace('p','').toUpperCase()} 恢复了 1 点生命！</span>`);
        } else {
          logs.push(`<span style="color:#8b949e;">✨ ${p.toUpperCase()} 的渡灵法阵落入了虚无...</span>`);
        }
      }
    }

    if (player.move !== 'shoot' && player.move !== 'fatal_shoot' && player.ammo > player.maxAmmo) {
      player.ammo = player.maxAmmo;
    }
  }

  // 3. 攻击互动结算 
  for (let i = 0; i < alive.length; i++) {
    const attKey = alive[i];
    let att = data[attKey];

    if (!att || (att.move !== 'shoot' && att.move !== 'ground_spike' && att.move !== 'holy_light' && att.move !== 'fatal_shoot')) {
      continue;
    }

    let defKey = att.target;
    let def = data[defKey];
    let attN = attKey.replace('p', '').toUpperCase();
    let defN = defKey ? defKey.replace('p', '').toUpperCase() : '空气';
    let actualDmg = 0;

    if (!def || def.hp <= 0) { 
      if (cap > 2) {
        logs.push(`<span style="color:#8b949e">${attN} 的攻击落向了虚无。</span>`); 
      }
      if (att.move === 'shoot') {
        att.ammo -= att.val;
      }
      if (att.move === 'holy_light') {
        att.holyCd = 6;
      }
      if (att.move === 'fatal_shoot') {
        att.fatalCd = 4;
      }
      continue; 
    }

    if (att.move === 'holy_light') {
      att.holyCd = 6; 
      def.hp -= 1;
      def.tookDamage = true;
      att.hp = Math.min(att.hp + 1, att.maxHp);
      logs.push(`<span class="log-safe">✨ ${attN} 降下圣光，无视防御强行抽取了 ${defN} 1点生命！</span>`);
    }

    if (att.move === 'shoot' || att.move === 'fatal_shoot') {
      const isPiercing = (att.talent && att.talent.id === 'm_d1'); 
      let isFatal = (att.move === 'fatal_shoot');
      let dmgToApply = att.val;
      let shouldProceedShoot = true;

      // 蚀命狂击 命运轮盘
      if (isFatal) {
        att.fatalCd = 4; 
        let roll = Math.random();
        if (roll < 0.60) {
          att.ammo -= att.val;
          dmgToApply = att.val * 2;
          logs.push(`<span class="log-dmg">🩸 ${attN} 狂击暴走！弹药造成了恐怖的双倍伤害！</span>`);
        } else if (roll < 0.80) {
          shouldProceedShoot = false; 
          let selfDmg = Math.floor(att.val / 2);
          if (selfDmg > 0) {
            att.hp -= selfDmg; 
            att.tookDamage = true;
            logs.push(`<span class="log-dmg">💀 ${attN} 狂击惨遭反噬！射击失效且自身承受了 ${selfDmg} 点伤害！</span>`);
          } else {
            logs.push(`<span style="color:#d29922;">💀 ${attN} 狂击反噬！射击失效，但因威力过小幸免于难。</span>`);
          }
        } else {
          shouldProceedShoot = false;
          att.ammo -= att.val;
          logs.push(`<span style="color:#8b949e;">💨 ${attN} 狂击哑火！白白浪费了弹药...</span>`);
        }
      } else {
        att.ammo -= att.val;
      }

      if (shouldProceedShoot) {
        if (def.move === 'duck' || def.move === 'ground_spike') {
          logs.push(`<span class="log-safe">${defN} 避开了 ${attN} 的射击</span>`);
        } else if (def.move === 'shield' && !isPiercing) {
          if (dmgToApply > def.shield) {
            let dmg = dmgToApply - def.shield; 
            def.hp -= dmg; 
            def.shield = 0; 
            def.tookDamage = true; 
            actualDmg = dmg;
            logs.push(`<span class="log-dmg">${attN} 击穿 ${defN} 护盾造成 ${dmg} 伤</span>`);
          } else {
            def.shield -= dmgToApply; 
            logs.push(`<span class="log-safe">${defN} 的护盾完全吸收了 ${attN} 的伤害</span>`);
          }
        } else {
          def.hp -= dmgToApply; 
          def.tookDamage = true; 
          actualDmg = dmgToApply;
          let hitType = isPiercing ? '无视护盾' : '直接';
          logs.push(`<span class="log-dmg">${attN} ${hitType}对 ${defN} 造成 ${dmgToApply} 伤</span>`);
        }
      }
    }

    // 彻底修复的地刺结算逻辑
    if (att.move === 'ground_spike') {
      if (def.move === 'rock') { 
        att.hp -= 1; 
        att.tookDamage = true;
        logs.push(`<span class="log-dmg">${defN} 将地刺反弹，${attN} 受到 1 伤</span>`); 
      } else if (def.move === 'duck') { 
        def.hp -= 2; 
        def.tookDamage = true;
        logs.push(`<span class="log-dmg">${attN} 的地刺贯穿了 ${defN}，造成 2 伤</span>`); 
      }
    }

    // 贪婪吞噬
    if (actualDmg > 0 && (att.move === 'shoot' || att.move === 'fatal_shoot') && att.talent && att.talent.id === 'm_d3') {
      if (att.talentCd === 0) {
        if (att.hp < att.maxHp) {
          att.hp = Math.min(att.hp + 1, att.maxHp);
          att.talentCd = 3; 
          logs.push(`<span class="log-dmg">😈 ${attN} 的贪婪吞噬生效，残忍吸取了 1 点鲜血！</span>`);
        }
      }
    }
  }

  // 阶段 4：天使【神圣复苏】回合末判定
  for (let i = 0; i < alive.length; i++) {
    const p = alive[i];
    let player = data[p];
    if (player.talent && player.talent.id === 'm_a3') {
      if (player.talentCd === 0) {
        if (!player.tookDamage && player.move !== 'shoot' && player.move !== 'fatal_shoot' && player.hp < player.maxHp) {
          player.hp = Math.min(player.hp + 1, player.maxHp);
          player.talentCd = 3; 
          logs.push(`<span class="log-safe">👼 ${p.toUpperCase()} 沐浴在神圣复苏中，缓慢恢复了 1 点血量</span>`);
        }
      }
    }
    delete player.tookDamage; 
  }

  // 阶段 5：生成战报
  let battleResult = "";
  if (logs.length > 0) {
    battleResult = logs.join('<br>');
  } else {
    battleResult = '<span style="color:#8b949e">双方相互试探，未爆发实质冲突</span>';
  }

  data.log = `<div class="action-header">${actionHeader}</div><div class="result-body" style="margin-top:10px;">${battleResult}</div>`;

  // 阶段 6：大清洗与 CD 衰减
  const allKeys = ['p1', 'p2', 'p3', 'p4'];
  for (let i = 0; i < allKeys.length; i++) {
    const p = allKeys[i];
    if (data[p]) { 
      data[p].move = ""; 
      data[p].target = ""; 

      if (data[p].healCd > 0) {
        data[p].healCd -= 1;
      }
      if (data[p].talentCd > 0) {
        data[p].talentCd -= 1;
      }
      if (data[p].holyCd > 0) {
        data[p].holyCd -= 1;
      }
      if (data[p].dualCd > 0) {
        data[p].dualCd -= 1;
      }
      if (data[p].fatalCd > 0) {
        data[p].fatalCd -= 1;
      }
    } 
  }

  data.round += 1;

  // --- 阶段 6.5：生体衰竭触发判定 (100回合死锁系统) ---
  if (data.round === 100) {
    data.log += `<div style="color:var(--red); font-weight:bold; margin-top:10px; background:rgba(248, 81, 73, 0.1); padding:10px; border-radius:8px; border:1px solid rgba(248, 81, 73, 0.3);">⚠️ 警告：战局已达第100回合，触发【生体衰竭】！包扎永久禁用，全员护盾上限强制降至4！</div>`;
    for (let i = 0; i < allKeys.length; i++) {
      const p = allKeys[i];
      if (data[p]) {
        if (data[p].maxShield > 4) {
          data[p].maxShield = 4;
        }
        if (data[p].shield > 4) {
          data[p].shield = 4;
        }
      }
    }
  }

  // 阶段 7：死神收割与轮回开启
  let stillAliveCount = 0;
  let winner = "";
  for (let i = 0; i < allKeys.length; i++) {
    if (data[allKeys[i]] && data[allKeys[i]].hp > 0) {
      stillAliveCount++;
      winner = allKeys[i];
    }
  }

  if (stillAliveCount <= 1) {
    let winStr = "";
    if (stillAliveCount === 0) {
      winStr = "惨烈战况，全军覆没！";
    } else {
      winStr = `🎉 PLAYER ${winner.replace('p','').toUpperCase()} 取得最终胜利！`;
    }
    data.log += `<div class="win-msg" style="margin-top:20px;">${winStr}</div>`;

    data.status = 'finished';
    data.playAgain = { p1: false, p2: false, p3: false, p4: false };
  }

  // 阶段 8：原子写入
  if (!isPvE && roomRef) { 
    roomRef.set(data); 
  } else { 
    render(data); 
  }
}

// ==================== 房间轮回重启 ====================
function handleRematchAction() {
  if (isPvE) {
    selectMode('pve');
    return;
  }
  if (roomRef && myRole && myRole !== 'spectator') {
    roomRef.child('playAgain').child(myRole).set(true);
  }
}

function resetRoomForRematch(oldData) {
  let cap = oldData.config.capacity;
  let newData = getInitialState(cap);

  const pKeys = ['p1', 'p2', 'p3', 'p4'];
  for (let i = 0; i < pKeys.length; i++) {
    const p = pKeys[i];
    if (oldData[p] && oldData[p].joined) {
      newData[p].joined = true;
      newData[p].ready = false; 
    }
  }

  if (roomRef) {
    roomRef.set(newData);
  }
}

// ==================== 解耦与防弹 UI 渲染引擎 ====================
function render(data) {
  if (!data) return;

  const cap = data.config.capacity;

  updatePlayerCardDOM('p1', data.p1, 1 <= cap && !(isPvE && data.p1 && data.p1.hp <= 0 && 'p1' === 'p3'), data);
  updatePlayerCardDOM('p2', data.p2, 2 <= cap && !(isPvE && data.p2 && data.p2.hp <= 0 && 'p2' === 'p3'), data);
  updatePlayerCardDOM('p3', data.p3, 3 <= cap && !(isPvE && data.p3 && data.p3.hp <= 0 && 'p3' === 'p3'), data);
  updatePlayerCardDOM('p4', data.p4, 4 <= cap && !(isPvE && data.p4 && data.p4.hp <= 0 && 'p4' === 'p3'), data);

  const logInner = document.getElementById('battle-log-inner');
  if (logInner) {
    logInner.innerHTML = data.log;
  }

  const roundEl = document.getElementById('current-round');
  if (roundEl) {
    roundEl.innerText = data.round;
  }

  const specBanner = document.getElementById('spectator-banner-game');
  if (myRole === 'spectator') {
    if (specBanner) specBanner.style.display = 'block';
  } else {
    if (specBanner) specBanner.style.display = 'none';
  }

  updateActionPanel(data);
  updateRematchPanel(data);
}

function updateRematchPanel(data) {
  const panel = document.getElementById('rematch-panel');
  const statusText = document.getElementById('rematch-status');
  const actionBtn = document.getElementById('btn-rematch-action');

  if (data.status !== 'finished') {
    if (panel) panel.style.display = 'none';
    return;
  }

  if (panel) panel.style.display = 'block';

  if (isPvE) {
    statusText.innerText = "单机模式已结束";
    actionBtn.innerText = "再来一局";
    actionBtn.onclick = handleRematchAction;
    return;
  }

  if (myRole === 'spectator') {
    statusText.innerText = "战局已结束，等待房主选择是否再来一局...";
    actionBtn.style.display = 'none';
    return;
  }

  actionBtn.style.display = 'inline-block';
  if (!data.playAgain) {
    data.playAgain = {};
  }

  if (myRole === 'p1') {
    if (!data.playAgain.p1) {
      statusText.innerText = "你是房主，是否保留原班人马发起再来一局？";
      actionBtn.innerText = "发起再来一局";
      actionBtn.onclick = handleRematchAction;
    } else {
      let waitCount = 0;
      const cap = data.config.capacity;

      if (cap >= 2 && data.p2 && data.p2.joined && !data.playAgain.p2) waitCount++;
      if (cap >= 3 && data.p3 && data.p3.joined && !data.playAgain.p3) waitCount++;
      if (cap >= 4 && data.p4 && data.p4.joined && !data.playAgain.p4) waitCount++;

      if (waitCount > 0) {
        statusText.innerText = `已发起！等待其他 ${waitCount} 名玩家同意...`;
        actionBtn.style.display = 'none';
      } else {
        statusText.innerText = "全体同意！正在重置战局并返回大厅...";
        actionBtn.style.display = 'none';

        if (!isProcessing) {
          isProcessing = true;
          setTimeout(function() {
            resetRoomForRematch(data);
            isProcessing = false;
          }, 800);
        }
      }
    }
  } else {
    // 组员视角
    if (!data.playAgain.p1) {
      statusText.innerText = "等待房主发起再来一局...";
      actionBtn.style.display = 'none';
    } else {
      if (!data.playAgain[myRole]) {
        statusText.innerText = "房主已发起再来一局，是否同意重归战场？";
        actionBtn.innerText = "同意开启新局";
        actionBtn.onclick = handleRematchAction;
      } else {
        statusText.innerText = "已同意，等待其他玩家...";
        actionBtn.style.display = 'none';
      }
    }
  }
}

function updatePlayerCardDOM(pKey, pData, isVisible, fullData) {
  const cardEl = document.getElementById(`${pKey}-card`);
  const tsRadio = document.getElementById(`ts-${pKey}`);

  if (!isVisible || !pData) {
    if (cardEl) cardEl.style.display = 'none'; 
    if (tsRadio) tsRadio.style.display = 'none';
    return; 
  } else {
    if (cardEl) cardEl.style.display = 'block';
  }

  const hpEl = document.getElementById(`${pKey}-hp`);
  const ammoEl = document.getElementById(`${pKey}-ammo`);
  const shieldEl = document.getElementById(`${pKey}-shield`);
  const talentEl = document.getElementById(`${pKey}-talent-name`);
  const connEl = document.getElementById(`${pKey}-conn`);
  const turnStatusEl = document.getElementById(`${pKey}-turn-status`);

  if (connEl) {
    if (!isPvE && pData.hp > 0 && !pData.joined) {
      connEl.style.display = 'inline';
    } else {
      connEl.style.display = 'none';
    }
  }

  if (turnStatusEl) {
    if (pData.hp > 0 && fullData.status === 'playing') {
      if (pData.move !== "") {
        turnStatusEl.innerHTML = `<span style="color: #3fb950;">(✅ 已出招)</span>`;
      } else {
        turnStatusEl.innerHTML = `<span style="color: #d29922;">(🤔 思考中...)</span>`;
      }
    } else { 
      turnStatusEl.innerHTML = ''; 
    }
  }

  if (talentEl) {
    if (pData.talent) {
      let cdText = "";
      if (pData.talent.id === 'm_a2' && pData.holyCd > 0) {
        cdText = ` <span style="color:#f85149; font-size:0.85em; font-weight:normal;">(CD:${pData.holyCd})</span>`;
      } else if (pData.talent.id === 'm_a4' && pData.dualCd > 0) {
        cdText = ` <span style="color:#f85149; font-size:0.85em; font-weight:normal;">(CD:${pData.dualCd})</span>`;
      } else if (pData.talent.id === 'm_d4' && pData.fatalCd > 0) {
        cdText = ` <span style="color:#f85149; font-size:0.85em; font-weight:normal;">(CD:${pData.fatalCd})</span>`;
      } else if (pData.talentCd > 0) {
        cdText = ` <span style="color:#f85149; font-size:0.85em; font-weight:normal;">(CD:${pData.talentCd})</span>`;
      }

      talentEl.innerHTML = `◈ ${pData.talent.name}${cdText} <span style="opacity:0.8; font-size:1.1em; cursor:pointer;">ℹ️</span>`;
      talentEl.style.display = 'inline-block';
      talentEl.onclick = function() { showTalentDetail(pData.talent); };
    } else {
      talentEl.innerText = "无天赋"; 
      talentEl.style.display = 'none'; 
      talentEl.onclick = null;
    }
  }

  if (pData.hp <= 0) {
    if (cardEl) {
      cardEl.style.opacity = '0.3'; 
      cardEl.style.filter = 'grayscale(1)';
    }
    if (tsRadio) {
      tsRadio.style.display = 'none';
    }
  } else {
    if (cardEl) {
      cardEl.style.opacity = '1'; 
      cardEl.style.filter = 'none';
    }
    if (tsRadio) {
      if (pKey === myRole || myRole === 'spectator') {
        tsRadio.style.display = 'none';
      } else {
        tsRadio.style.display = 'inline-block';
      }
    }
  }

  if (hpEl) {
    hpEl.innerText = `${pData.hp}/${pData.maxHp}`;
    if (pData.hp >= Math.ceil(pData.maxHp * 0.7)) {
      hpEl.style.color = "#3fb950";
    } else if (pData.hp >= Math.ceil(pData.maxHp * 0.3)) {
      hpEl.style.color = "#d29922";
    } else {
      hpEl.style.color = "#f85149";
    }
  }

  if (ammoEl) {
    ammoEl.innerText = `${pData.ammo}/${pData.maxAmmo}`;
    if (pData.ammo > 0) {
      ammoEl.style.color = "#d29922";
    } else if (pData.ammo === 0) {
      ammoEl.style.color = "#c9d1d9";
    } else {
      ammoEl.style.color = "#f85149"; 
    }
  }

  if (shieldEl) {
    shieldEl.innerText = `${pData.shield}/${pData.maxShield}`;
    shieldEl.style.color = "#58a6ff";
  }
}

function updateActionPanel(data) {
  const cap = data.config.capacity;
  const panelContainer = document.getElementById('action-panel-container');
  const actionControls = document.getElementById('action-controls');
  const actionWaiting = document.getElementById('action-waiting');
  const targetSelector = document.getElementById('target-selector');

  if (myRole === 'spectator') {
    if (panelContainer) panelContainer.style.display = 'none';
    return;
  } else {
    if (panelContainer) panelContainer.style.display = 'block';
  }

  if (targetSelector) {
    if (cap === 2) {
      targetSelector.style.display = 'none';
    } else {
      targetSelector.style.display = 'flex';
    }
  }

  const shootControls = document.getElementById('shoot-controls');
  const fatalShootBtns = document.getElementById('fatal-shoot-btns');

  if (data[myRole]) {
     let htmlStr = `<span>射击强度:</span>`;
     let fatalStr = ``;
     for (let i = 1; i <= data[myRole].maxAmmo; i++) {
        htmlStr += `<button class="s-btn" id="btn-s${i}" onclick="handleInput('shoot', ${i})">${i}</button>`;
        fatalStr += `<button class="s-btn" id="btn-f${i}" onclick="handleInput('fatal_shoot', ${i})" style="background:var(--purple);">${i}</button>`;
     }
     if (shootControls) { shootControls.innerHTML = htmlStr; }
     if (fatalShootBtns) { fatalShootBtns.innerHTML = fatalStr; }
  }

  if (myRole && data[myRole] && data[myRole].hp > 0 && data.status === 'playing') {
    if (data[myRole].move !== "") {
      if (actionControls) actionControls.style.display = 'none';
      if (actionWaiting) actionWaiting.style.display = 'block';
    } else {
      if (actionControls) actionControls.style.display = 'block';
      if (actionWaiting) actionWaiting.style.display = 'none';

      const myAmmo = data[myRole].ammo;
      const myTalent = data[myRole].talent;
      const maxA = data[myRole].maxAmmo;

      // 1. 普通射击
      for (let i = 1; i <= maxA; i++) {
        const btn = document.getElementById(`btn-s${i}`);
        if (!btn) continue;

        let disabled = false;
        if (i > myAmmo) disabled = true;
        if (myTalent && myTalent.id === 'm_a1' && i > 2) disabled = true;
        if (myTalent && myTalent.id === 'n_d1' && data.round === 1) disabled = true;

        if (disabled) {
          btn.classList.add('disabled');
        } else {
          btn.classList.remove('disabled');
        }
      }

      // 2. 蚀命狂击
      const fatalRow = document.getElementById('fatal-shoot-controls');
      const fatalLabel = document.getElementById('fatal-shoot-label');
      if (fatalRow) {
        if (myTalent && myTalent.id === 'm_d4') {
          fatalRow.style.display = 'flex';
          let globalFatalDisabled = false;
          if (data[myRole].fatalCd > 0) {
            globalFatalDisabled = true;
            if(fatalLabel) fatalLabel.innerText = `狂击(CD:${data[myRole].fatalCd}):`;
          } else {
            if(fatalLabel) fatalLabel.innerText = `蚀命狂击:`;
          }

          for (let i = 1; i <= maxA; i++) {
            const btnF = document.getElementById(`btn-f${i}`);
            if (!btnF) continue;
            let disabled = globalFatalDisabled;
            if (i > myAmmo) disabled = true;
            if (disabled) {
              btnF.classList.add('disabled');
            } else {
              btnF.classList.remove('disabled');
            }
          }
        } else {
          fatalRow.style.display = 'none';
        }
      }

      // 3. 包扎状态与衰竭判定
      const healBtn = document.querySelector('.t-heal');
      if (healBtn) {
        if (data.round >= 100) {
          healBtn.classList.add('disabled');
          healBtn.innerText = '包扎 (已衰竭)';
        } else if (myTalent && myTalent.id === 'm_a2') {
          healBtn.classList.add('disabled');
          healBtn.innerText = '包扎 (已禁用)';
        } else if (data[myRole].healCd > 0) {
          healBtn.classList.add('disabled');
          healBtn.innerText = `包扎 (CD:${data[myRole].healCd})`;
        } else if (data[myRole].shield < 2 || data[myRole].hp >= data[myRole].maxHp) {
          healBtn.classList.add('disabled');
          healBtn.innerText = '包扎';
        } else {
          healBtn.classList.remove('disabled');
          healBtn.innerText = '包扎';
        }
      }

      // 4. 圣光
      const holyBtn = document.getElementById('btn-holy');
      if (holyBtn) {
        if (myTalent && myTalent.id === 'm_a2') {
          holyBtn.style.display = 'inline-block';
          if (data[myRole].holyCd > 0) {
            holyBtn.classList.add('disabled');
            holyBtn.innerText = `圣光 (CD:${data[myRole].holyCd})`;
          } else {
            holyBtn.classList.remove('disabled');
            holyBtn.innerText = `圣光`;
          }
        } else {
          holyBtn.style.display = 'none';
        }
      }

      // 5. 渡灵
      const dualBtn = document.getElementById('btn-dual');
      if (dualBtn) {
        if (myTalent && myTalent.id === 'm_a4') {
          dualBtn.style.display = 'inline-block';
          if (data[myRole].dualCd > 0) {
            dualBtn.classList.add('disabled');
            dualBtn.innerText = `渡灵 (CD:${data[myRole].dualCd})`;
          } else {
            dualBtn.classList.remove('disabled');
            dualBtn.innerText = `渡灵`;
          }
        } else {
          dualBtn.style.display = 'none';
        }
      }
    }
  } else {
    if (actionControls) actionControls.style.display = 'none';
    if (actionWaiting) actionWaiting.style.display = 'none';
  }
}