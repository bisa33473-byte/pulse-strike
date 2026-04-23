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
let isProcessing = false; // 防抖核心锁：确保结算函数绝对单次触发

// ==================== 动态数据生成器 ====================
// 完全抛弃旧版的硬编码初始状态，改为动态生成，提升扩展性
function getInitialState(capacity) {
  let hp, maxAmmo, maxShield;

  if (capacity === 4) {
    hp = 9;
    maxAmmo = 6;
    maxShield = 6;
  } else if (capacity === 3) {
    hp = 7;
    maxAmmo = 5;
    maxShield = 5;
  } else {
    hp = 5;
    maxAmmo = 4;
    maxShield = 4;
  }

  let state = {
    config: { 
      capacity: capacity, 
      maxAmmo: maxAmmo, 
      maxShield: maxShield, 
      baseHp: hp 
    },
    log: "准备就绪，请出招！", 
    round: 1, 
    status: 'waiting'
  };

  const playerKeys = ['p1', 'p2', 'p3', 'p4'];
  for (let i = 0; i < playerKeys.length; i++) {
    const key = playerKeys[i];
    state[key] = {
      hp: i < capacity ? hp : 0, 
      ammo: 0, 
      shield: 1, 
      move: "", // 严格使用空字符串，严禁使用 null
      val: 0, 
      target: "", 
      talent: null, 
      joined: false, 
      ready: false
    };
  }
  return state;
}

// ==================== 圣魔机缘池 ====================
const TALENT_POOL = {
  numerical: [
    { id: 'n_a1', type: 'angel', category: '数值', name: '战术储备', desc: '护盾 +2，弹药 -1' },
    { id: 'n_a2', type: 'angel', category: '数值', name: '轻装上阵', desc: '初始弹药 +1，护盾 +1，血量 -1' },
    { id: 'n_d1', type: 'demon', category: '数值', name: '军火狂人', desc: '弹药 +4，血量 -3\n代价：第一回合绝对禁止射击。' },
    { id: 'n_d2', type: 'demon', category: '数值', name: '叹息之墙', desc: '护盾 +3，血量 -3\n(容错极低的防御型)' }
  ],
  mechanism: [
    { id: 'm_a1', type: 'angel', category: '机制', name: '圣盾坚壁', desc: '使用防御时获得 2 层护盾。\n代价：单次射击最高被限制为 2 发。' },
    { id: 'm_a2', type: 'angel', category: '机制', name: '神圣庇护', desc: '趴下可无视地刺伤害。\n代价：禁用石头，且弹药上限减少 2。' },
    { id: 'm_d1', type: 'demon', category: '机制', name: '深渊魔弹', desc: '你的射击必定穿甲（无视护盾直接扣血）。\n代价：你永久无法使用防御动作。' },
    { id: 'm_d2', type: 'demon', category: '机制', name: '嗜血狂热', desc: '装弹时流失 1 血量，但获得 3 发子弹。\n(濒死保护：1血时自动失效变为普通装弹)' }
  ]
};

// ==================== 基础 UI 导航 ====================
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

function exitGame() { 
  if (roomRef && myRole) {
    const isHost = (myRole === 'p1');
    const msg = isHost ? "确定要离开吗？\n你是房主，离开将解散整个房间。" : "确定要退出当前房间吗？";

    if (confirm(msg)) {
      if (isHost) {
        roomRef.remove().then(() => location.reload()); 
      } else {
        roomRef.child(myRole).update({ joined: false, ready: false }).then(() => location.reload()); 
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

// ==================== 网络隔离与房间系统 ====================
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
  const rid = document.getElementById('roomInput').value.toUpperCase().trim();
  if (!rid || rid.length !== 5) {
    alert("请输入 5 位正确的房间码！");
    return;
  }

  const dbPath = gameVersion === 'beta' ? "rooms_beta/" : "rooms_v2/";
  const tempRef = db.ref(dbPath + rid);

  tempRef.once('value', snap => {
    let data = snap.val();
    if (!data) {
      alert("❌ 房间不存在或已被解散！");
      return;
    }

    const cap = data.config.capacity;

    // 严谨的补位逻辑展开
    if (data.status === 'playing') {
      if (cap >= 2 && !data.p2.joined && data.p2.hp > 0) { 
        myRole = 'p2'; 
      } else if (cap >= 3 && !data.p3.joined && data.p3.hp > 0) { 
        myRole = 'p3'; 
      } else if (cap === 4 && !data.p4.joined && data.p4.hp > 0) { 
        myRole = 'p4'; 
      } else {
        alert("❌ 房间已开战且无断线空位！");
        return;
      }
    } else {
      if (cap >= 2 && !data.p2.joined) { 
        myRole = 'p2'; 
      } else if (cap >= 3 && !data.p3.joined) { 
        myRole = 'p3'; 
      } else if (cap === 4 && !data.p4.joined) { 
        myRole = 'p4'; 
      } else {
        alert("❌ 房间已满！");
        return;
      }
    }

    roomRef = tempRef;
    document.getElementById('room-setup').style.display = 'none';

    roomRef.child(myRole).update({ joined: true, ready: false });
    roomRef.child(myRole).onDisconnect().update({ joined: false, ready: false });

    setupRoomListener(rid);
  });
}

function setupRoomListener(rid) {
  roomRef.on('value', snap => {
    let data = snap.val();
    if (!data) { 
      alert("⚠️ 房主已解散房间。"); 
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

  const cap = gameState.config.capacity;
  const playerKeys = ['p1', 'p2', 'p3', 'p4'];

  for (let i = 0; i < playerKeys.length; i++) {
    const p = playerKeys[i];
    const cardEl = document.getElementById(`lobby-${p}-card`);
    const statusEl = document.getElementById(`lobby-${p}-status`);

    if (i >= cap) {
      if (cardEl) cardEl.style.display = 'none';
      continue;
    } else {
      if (cardEl) cardEl.style.display = 'block';
    }

    const pData = gameState[p];
    if (!pData || !pData.joined) {
      statusEl.innerText = "等待加入..."; 
      statusEl.style.color = "#8b949e"; 
      cardEl.style.borderColor = "#30363d";
    } else if (!pData.ready) {
      statusEl.innerText = gameVersion === 'beta' ? "挑选机缘中..." : "已加入，未准备"; 
      statusEl.style.color = "#d29922"; 
      cardEl.style.borderColor = "#d29922";
    } else {
      statusEl.innerText = "已准备就绪！"; 
      statusEl.style.color = "#3fb950"; 
      cardEl.style.borderColor = "#3fb950";
    }
  }

  const myData = gameState[myRole];
  const actionBtn = document.getElementById('lobby-action-btn');

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
      actionBtn.onclick = () => { 
        if (roomRef) {
          roomRef.child(myRole).update({ ready: true }); 
        }
      };
    }
  }

  // 房主负责检测全员就绪并切入战斗态
  let allReady = true;
  for (let i = 1; i <= cap; i++) {
    let pt = gameState['p' + i];
    if (!pt || !pt.joined || !pt.ready) {
      allReady = false;
      break;
    }
  }

  if (allReady && myRole === 'p1') {
    roomRef.update({ status: 'playing' });
  }
}

// ==================== 天赋分配核心逻辑 ====================
function showTalentSelection() {
  const overlay = document.getElementById('talent-overlay');
  const list = document.getElementById('talent-list');

  overlay.style.display = 'flex';
  list.innerHTML = '';

  let options = [];

  // 确保至少包含 1 数值 和 1 机制
  let numTalent = TALENT_POOL.numerical[Math.floor(Math.random() * TALENT_POOL.numerical.length)];
  let mechTalent = TALENT_POOL.mechanism[Math.floor(Math.random() * TALENT_POOL.mechanism.length)];
  options.push(numTalent);
  options.push(mechTalent);

  // 补齐 4 个
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
    const t = options[i];
    const card = document.createElement('div');
    card.className = `talent-card ${t.type}`;
    card.innerHTML = `<h4>${t.name}</h4><small>${t.category}类</small><p>${t.desc}</p>`;
    card.onclick = () => applyTalent(t);
    list.appendChild(card);
  }
}

function applyTalentMods(playerData, t) {
  if (!t || !t.mod) return;
  if (t.id === 'n_a1') { 
    playerData.shield += 2; 
    playerData.ammo -= 1; 
  } else if (t.id === 'n_a2') { 
    playerData.ammo += 1; 
    playerData.shield += 1; 
    playerData.hp -= 1; 
  } else if (t.id === 'n_d1') { 
    playerData.ammo += 4; 
    playerData.hp -= 3; 
  } else if (t.id === 'n_d2') { 
    playerData.shield += 3; 
    playerData.hp -= 3; 
  }
}

function applyTalent(t) {
  document.getElementById('talent-overlay').style.display = 'none';

  if (isPvE) {
    gameState.p1.talent = t;
    applyTalentMods(gameState.p1, t);

    // 为 AI 完整分配并应用天赋数值
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

// ==================== 动作控制与校验 ====================
function checkRoundStart() {
  if (isPvE || !gameState || gameState.status !== 'playing') return;

  const cap = gameState.config.capacity;
  const pKeys = ['p1', 'p2', 'p3', 'p4'].slice(0, cap);

  let alivePlayers = [];
  for (let i = 0; i < pKeys.length; i++) {
    const k = pKeys[i];
    if (gameState[k] && gameState[k].hp > 0) {
      alivePlayers.push(k);
    }
  }

  let allMoved = true;
  for (let i = 0; i < alivePlayers.length; i++) {
    // 防御型校验：如果 move 是空字符串或者假值，视为未出招
    if (!gameState[alivePlayers[i]].move) {
      allMoved = false; 
      break;
    }
  }

  if (allMoved && alivePlayers.length > 0 && myRole === alivePlayers[0]) {
    if (isProcessing) return;
    isProcessing = true;

    setTimeout(() => {
      roomRef.once('value', snap => {
        const currentData = snap.val();
        if (currentData) {
          // 双重保险：再次验证是否每个人都已经安全上传了数据
          let stillAllMoved = true;
          for (let i = 0; i < alivePlayers.length; i++) {
             if (!currentData[alivePlayers[i]].move) {
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

function handleInput(move, val = 0) {
  if (!gameState || !myRole || !gameState[myRole]) return;

  // 如果已出招或已阵亡，直接熔断点击事件
  if (gameState[myRole].move || gameState[myRole].hp <= 0) return;

  const t = gameState[myRole].talent;

  // 天赋拦截体系展开
  if (t) {
    if (t.id === 'm_a1' && move === 'shoot' && val > 2) {
      alert("【圣盾坚壁】限制：单次射击最高 2 发");
      return;
    }
    if (t.id === 'm_a2' && move === 'rock') {
      alert("【神圣庇护】限制：无法使用石头");
      return;
    }
    if (t.id === 'm_d1' && move === 'shield') {
      alert("【深渊魔弹】限制：无法进行防御");
      return;
    }
    if (t.id === 'n_d1' && move === 'shoot' && gameState.round === 1) {
      alert("【军火狂人】限制：第一回合绝对禁止开枪射击！");
      return;
    }
  }

  if (move === 'shoot' && gameState[myRole].ammo < val) {
    alert("弹药不足！");
    return;
  }

  let target = "";
  if (move === 'shoot' || move === 'ground_spike') {
    if (gameState.config.capacity === 2) {
      // 2人模式无需选目标，自动检索对方
      const pKeys = ['p1', 'p2'];
      for (let i = 0; i < pKeys.length; i++) {
        if (pKeys[i] !== myRole && gameState[pKeys[i]].hp > 0) {
          target = pKeys[i];
          break;
        }
      }
    } else {
      // 多人模式强制检查面板选项
      const tRadio = document.querySelector('input[name="atk-target"]:checked');
      if (!tRadio) {
        alert("施放攻击性动作前，请在上方【锁定目标 🎯】处选择你要攻击的玩家！");
        return;
      }
      target = tRadio.value;

      if (gameState[target] && gameState[target].hp <= 0) {
        alert("目标已阵亡，请重新选择存活目标！");
        return;
      }
    }
  }

  if (isPvE) {
    gameState.p1.move = move; 
    gameState.p1.val = val; 
    gameState.p1.target = target;

    const aiMove = getSmartAiMove('p2', 'p1');
    gameState.p2.move = aiMove.move; 
    gameState.p2.val = aiMove.val; 
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

// ==================== 单机 AI 决策大脑 ====================
function getSmartAiMove(aiKey, oppKey) {
  const ai = gameState[aiKey]; 
  const human = gameState[oppKey];
  const moves = ['reload', 'shield', 'duck', 'ground_spike', 'rock'];

  if (ai.talent && ai.talent.id === 'm_a2') {
    moves.splice(moves.indexOf('rock'), 1);
  }
  if (ai.talent && ai.talent.id === 'm_d1') {
    moves.splice(moves.indexOf('shield'), 1);
  }

  let canShoot = true;
  if (ai.ammo <= 0) canShoot = false;
  if (ai.talent && ai.talent.id === 'n_d1' && gameState.round === 1) canShoot = false;

  if (canShoot && ai.ammo >= human.hp && human.shield === 0) {
    return { move: 'shoot', val: Math.min(ai.ammo, gameState.config.maxAmmo) };
  }

  if (!canShoot) {
    if (Math.random() < 0.7) {
      return { move: 'reload', val: 0 };
    } else {
      return { move: moves[Math.floor(Math.random() * moves.length)], val: 0 };
    }
  }

  moves.push('shoot');
  let m = moves[Math.floor(Math.random() * moves.length)];
  let v = 0;

  if (m === 'shoot') {
    v = Math.floor(Math.random() * Math.min(ai.ammo, gameState.config.maxAmmo)) + 1;
    if (ai.talent && ai.talent.id === 'm_a1' && v > 2) {
      v = 2; 
    }
  }

  return { move: m, val: v };
}

// ==================== 终极回合结算处理器 ====================
function processRound() {
  let data = gameState; 
  let logs = [];
  const moveMap = {reload:'装弹', shield:'防御', duck:'趴下', ground_spike:'地刺', rock:'石头', shoot:'射击'};

  const cap = data.config.capacity;
  const pKeys = ['p1', 'p2', 'p3', 'p4'].slice(0, cap);

  let alive = [];
  for (let i = 0; i < pKeys.length; i++) {
    if (data[pKeys[i]] && data[pKeys[i]].hp > 0) {
      alive.push(pKeys[i]);
    }
  }

  // 1. 生成顶部动作追踪文字
  let actionStrs = [];
  for (let i = 0; i < alive.length; i++) {
    const p = alive[i];
    let m = data[p].move;
    if (!m) continue; 

    let mStr = "";
    if (m === 'shoot') {
      mStr = `${data[p].val}发${moveMap[m]}`;
    } else {
      mStr = moveMap[m];
    }

    if (data[p].target && cap > 2) {
      mStr += `(➡${data[p].target.replace('p','').toUpperCase()})`;
    }
    actionStrs.push(`${p.replace('p','').toUpperCase()}:${mStr}`);
  }
  const actionHeader = `【${actionStrs.join(' | ')}】`;

  // 2. 资源前置结算与防御天赋处理
  for (let i = 0; i < alive.length; i++) {
    const p = alive[i];
    let player = data[p];
    if (!player.move) continue;

    let maxA = data.config.maxAmmo;
    if (player.talent && player.talent.id === 'm_a2') {
      maxA = Math.max(1, maxA - 2);
    }

    if (player.move === 'reload') {
      let gain = 1;
      // 嗜血狂热判定
      if (player.talent && player.talent.id === 'm_d2') {
        if (player.hp > 1) {
          gain = 3; 
          player.hp -= 1;
          logs.push(`${p.toUpperCase()} 触发嗜血狂热，流失 1 血量换取激昂火力`); 
        } else {
          logs.push(`<span style="color:#d29922;">${p.toUpperCase()} 触发濒死保护，嗜血狂热中止，转为安全装弹</span>`);
        }
      }
      player.ammo = Math.min(player.ammo + gain, maxA);
    }

    if (player.move === 'shield') {
      let gain = 1;
      if (player.talent && player.talent.id === 'm_a1') {
        gain = 2;
      }
      player.shield = Math.min(player.shield + gain, data.config.maxShield);
    }

    // 强制截断非射击状态下的弹药溢出
    if (player.move !== 'shoot' && player.ammo > maxA) {
      player.ammo = maxA;
    }
  }

  // 3. 攻击类动作相互判定
  for (let i = 0; i < alive.length; i++) {
    const attKey = alive[i];
    let att = data[attKey];

    if (!att || (att.move !== 'shoot' && att.move !== 'ground_spike')) {
      continue;
    }

    let defKey = att.target;
    let def = data[defKey];
    let attN = attKey.replace('p', '').toUpperCase();
    let defN = defKey ? defKey.replace('p', '').toUpperCase() : '空气';

    if (!def || def.hp <= 0) { 
      if (cap > 2) {
        logs.push(`<span style="color:#8b949e">${attN} 的攻击落空了。</span>`); 
      }
      continue; 
    }

    if (att.move === 'shoot') {
      att.ammo -= att.val;
      const piercer = (att.talent && att.talent.id === 'm_d1'); 

      if (def.move === 'duck' || def.move === 'ground_spike') {
        logs.push(`<span class="log-safe">${defN} 避开了 ${attN} 的射击</span>`);
      } else if (def.move === 'shield' && !piercer) {
        if (att.val > def.shield) {
          let dmg = att.val - def.shield; 
          def.hp -= dmg; 
          def.shield = 0;
          logs.push(`<span class="log-dmg">${attN} 击穿 ${defN} 护盾造成 ${dmg} 伤</span>`);
        } else {
          def.shield -= att.val; 
          logs.push(`<span class="log-safe">${defN} 的护盾吸收了 ${attN} 的伤害</span>`);
        }
      } else {
        def.hp -= att.val; 
        let dmgType = piercer ? '无视护盾' : '直接';
        logs.push(`<span class="log-dmg">${attN} ${dmgType}对 ${defN} 造成 ${att.val} 伤</span>`);
      }
    }

    if (att.move === 'ground_spike') {
      const superDuck = (def.talent && def.talent.id === 'm_a2' && def.move === 'duck');

      if (def.move === 'rock') { 
        att.hp -= 1; 
        logs.push(`<span class="log-dmg">${defN} 将地刺反弹，${attN} 受到 1 伤</span>`); 
      } else if (def.move === 'duck' && !superDuck) { 
        def.hp -= 2; 
        logs.push(`<span class="log-dmg">${attN} 的地刺贯穿了 ${defN}，造成 2 伤</span>`); 
      } else if (superDuck) { 
        logs.push(`<span class="log-safe">${defN} 的神圣庇护无视了地刺</span>`); 
      }
    }
  }

  // 4. 生成最终战报与对象重置
  const battleResult = logs.length > 0 ? logs.join('<br>') : '<span style="color:#8b949e">双方相互试探，无实质伤害产生</span>';
  data.log = `<div class="action-header">${actionHeader}</div><div class="result-body" style="margin-top:10px;">${battleResult}</div>`;

  for (let i = 0; i < pKeys.length; i++) {
    const p = pKeys[i];
    if (data[p]) { 
      data[p].move = ""; 
      data[p].target = ""; 
    } 
  }

  data.round += 1;

  // 5. 胜负检测
  let stillAlive = [];
  for (let i = 0; i < pKeys.length; i++) {
    const p = pKeys[i];
    if (data[p] && data[p].hp > 0) {
      stillAlive.push(p);
    }
  }

  if (stillAlive.length <= 1) {
    let winStr = "";
    if (stillAlive.length === 0) {
      winStr = "惨烈战况，全军覆没！";
    } else {
      winStr = `🎉 PLAYER ${stillAlive[0].replace('p','').toUpperCase()} 取得最终胜利！`;
    }
    data.log += `<div class="win-msg" style="margin-top:20px;">${winStr}</div>`;
  }

  // 6. 最终提交
  if (!isPvE && roomRef) { 
    roomRef.set(data); 
  } else { 
    render(data); 
  }
}

// ==================== UI 渲染引擎 ====================
function render(data) {
  if (!data) return;

  const cap = data.config.capacity;
  const pKeys = ['p1', 'p2', 'p3', 'p4'];

  for (let idx = 0; idx < pKeys.length; idx++) {
    const p = pKeys[idx];
    const cardEl = document.getElementById(`${p}-card`);
    const tsRadio = document.getElementById(`ts-${p}`);

    // 超出容量，或单机模式下隐藏其余 AI
    if (idx >= cap || !data[p] || (data[p].hp <= 0 && p === 'p3' && isPvE)) {
      if (cardEl) cardEl.style.display = 'none'; 
      if (tsRadio) tsRadio.style.display = 'none';
      continue; 
    } else {
      if (cardEl) cardEl.style.display = 'block';
    }

    const hpEl = document.getElementById(`${p}-hp`);
    const ammoEl = document.getElementById(`${p}-ammo`);
    const shieldEl = document.getElementById(`${p}-shield`);
    const talentEl = document.getElementById(`${p}-talent-name`);
    const connEl = document.getElementById(`${p}-conn`);
    const turnStatusEl = document.getElementById(`${p}-turn-status`);

    if (connEl) {
      if (!isPvE && data[p].hp > 0 && !data[p].joined) {
        connEl.style.display = 'inline';
      } else {
        connEl.style.display = 'none';
      }
    }

    if (turnStatusEl) {
      if (data[p].hp > 0 && data.status === 'playing') {
        if (data[p].move !== "") {
          turnStatusEl.innerHTML = `<span style="color: #3fb950;">(✅ 已出招)</span>`;
        } else {
          turnStatusEl.innerHTML = `<span style="color: #d29922;">(🤔 思考中...)</span>`;
        }
      } else { 
        turnStatusEl.innerHTML = ''; 
      }
    }

    if (talentEl) {
      if (data[p].talent) {
        talentEl.innerHTML = `◈ ${data[p].talent.name} <span style="opacity:0.8; font-size:1.1em; cursor:pointer;">ℹ️</span>`;
        talentEl.style.display = 'inline-block';
        talentEl.onclick = () => showTalentDetail(data[p].talent);
      } else {
        talentEl.innerText = "无天赋"; 
        talentEl.style.display = 'none'; 
        talentEl.onclick = null;
      }
    }

    if (data[p].hp <= 0) {
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
        if (p === myRole) {
          tsRadio.style.display = 'none';
        } else {
          tsRadio.style.display = 'inline-block';
        }
      }
    }

    if (hpEl) {
      hpEl.innerText = `${data[p].hp}/${data.config.baseHp}`;
      if (data[p].hp >= Math.ceil(data.config.baseHp * 0.7)) {
        hpEl.style.color = "#3fb950";
      } else if (data[p].hp >= Math.ceil(data.config.baseHp * 0.3)) {
        hpEl.style.color = "#d29922";
      } else {
        hpEl.style.color = "#f85149";
      }
    }

    if (ammoEl) {
      let maxA = data.config.maxAmmo;
      if (data[p].talent && data[p].talent.id === 'm_a2') {
        maxA = Math.max(1, maxA - 2);
      }
      ammoEl.innerText = `${data[p].ammo}/${maxA}`;

      if (data[p].ammo > 0) {
        ammoEl.style.color = "#d29922";
      } else if (data[p].ammo === 0) {
        ammoEl.style.color = "#c9d1d9";
      } else {
        ammoEl.style.color = "#f85149"; 
      }
    }

    if (shieldEl) {
      shieldEl.innerText = `${data[p].shield}/${data.config.maxShield}`;
      shieldEl.style.color = "#58a6ff";
    }
  }

  const logInner = document.getElementById('battle-log-inner');
  if (logInner) logInner.innerHTML = data.log;

  const roundEl = document.getElementById('current-round');
  if (roundEl) roundEl.innerText = data.round;

  const actionControls = document.getElementById('action-controls');
  const actionWaiting = document.getElementById('action-waiting');
  const targetSelector = document.getElementById('target-selector');

  if (targetSelector) {
    if (cap === 2) {
      targetSelector.style.display = 'none';
    } else {
      targetSelector.style.display = 'flex';
    }
  }

  const shootControls = document.getElementById('shoot-controls');
  if (shootControls && data[myRole]) {
     let maxA = data.config.maxAmmo;
     if (data[myRole].talent && data[myRole].talent.id === 'm_a2') {
       maxA = Math.max(1, maxA - 2);
     }
     let htmlStr = `<span>射击强度:</span>`;
     for (let i = 1; i <= maxA; i++) {
        htmlStr += `<button class="s-btn" id="btn-s${i}" onclick="handleInput('shoot', ${i})">${i}</button>`;
     }
     shootControls.innerHTML = htmlStr;
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
      let maxA = data.config.maxAmmo;

      if (myTalent && myTalent.id === 'm_a2') {
        maxA = Math.max(1, maxA - 2);
      }

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
    }
  } else {
    if (actionControls) actionControls.style.display = 'none';
    if (actionWaiting) actionWaiting.style.display = 'none';
  }
}