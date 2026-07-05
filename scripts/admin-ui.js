const SUPABASE_URL = "https://rljvzultuyiudhjjfotg.supabase.co";
const IV_B64 = "NRuGBTQkQaCJiJvj";
const CIPHER_B64 = "fF1bdW80i0t6Jfz0v68aXXivIdna0AdPw7RojnJFmjZR40tyw6ojotXpwN0TsoxD2uQ6KjP83IacP/gyvG9wUz3PKUTrCq/fuDfvvNj5/BGWpspOjBUPe3U/gwgpF/4klg4Nnrn5zxJ0q/rqTKj/PwkHpavb0wO1O7iHHFI1NhknMAvkRXJrDcGaJFrT8fzQLa1mxLglVVa5RyPbuVWVqA9XiFOw4QH9ePn+sLCzKrgnyVM7Tdz/++QiWII1tle13zZ7qsSGf0d19AbVNp1rQA6eQZLQmSwUzU/cu/yfgDRB5pUbKdCU7KE15Q==";

let adminKey = null;
let mmrResult = null;

// Base64 helper
function base64ToUint8(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for(let i=0; i<bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function decryptKey(password) {
  try {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), {name: 'PBKDF2'}, false, ['deriveBits', 'deriveKey']);
    const salt = enc.encode('tiertable-salt');
    const key = await crypto.subtle.deriveKey(
      {name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256'},
      keyMaterial,
      {name: 'AES-GCM', length: 256},
      false,
      ['decrypt']
    );
    const iv = base64ToUint8(IV_B64);
    const cipher = base64ToUint8(CIPHER_B64);
    const decrypted = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, key, cipher);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return null;
  }
}

async function fetchMmrData() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/calmsv-assets/tiertable/mmr-result.json?t=${Date.now()}`);
  return await res.json();
}

async function savePhotos() {
  if (!adminKey) return alert('권한이 없습니다.');
  
  // Gather updated photos
  const inputs = document.querySelectorAll('#adminTable input.photo-input');
  let newPhotos = { ...PHOTOS };
  inputs.forEach(inp => {
    const name = inp.dataset.name;
    const val = inp.value.trim();
    if (val) {
      newPhotos[name] = val;
    } else {
      delete newPhotos[name];
    }
  });

  try {
    const bucket = "calmsv-assets";
    const path = "tiertable/photos.json";
    const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
    
    const headers = {
      'apikey': adminKey,
      'Authorization': `Bearer ${adminKey}`,
      'Content-Type': 'application/json'
    };

    let res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(newPhotos, null, 2) });
    if (res.status === 400 || res.status === 409) {
      res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(newPhotos, null, 2) });
    }

    if (!res.ok) throw new Error(await res.text());
    
    alert('사진 정보가 성공적으로 저장되었습니다!');
    // Update local PHOTOS and re-render board
    PHOTOS = newPhotos;
    renderAdminTable();
  } catch (e) {
    alert('저장 실패: ' + e.message);
  }
}

function renderAdminTable() {
  const tbody = document.querySelector('#adminTable tbody');
  tbody.innerHTML = '';

  const allPlayers = [...mmrResult.active, ...mmrResult.hidden].sort((a,b) => b.mmr - a.mmr);

  allPlayers.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.tier}</td>
      <td>${p.name}</td>
      <td>${p.race}</td>
      <td>${Math.round(p.mmr)}</td>
      <td>${p.isTemporaryDormant ? '임시휴면' : p.isHidden ? '완전휴면' : '활동'}</td>
      <td><input type="text" class="photo-input" data-name="${p.name}" value="${PHOTOS[p.name] || ''}" placeholder="이미지 URL"></td>
    `;
    tbody.appendChild(tr);
  });
}

function initAdminUI() {
  const adminBtn = document.createElement('button');
  adminBtn.innerHTML = '⚙️';
  adminBtn.style.cssText = 'position:fixed; bottom:20px; right:20px; width:40px; height:40px; border-radius:50%; background:var(--panel); border:1px solid var(--line); color:white; font-size:20px; cursor:pointer; z-index:9999;';
  document.body.appendChild(adminBtn);

  const adminModal = document.createElement('div');
  adminModal.className = 'modal';
  adminModal.style.cssText = 'display:none;';
  adminModal.innerHTML = `
    <div class="modal-content" style="max-width:800px; padding:30px; border:2px solid var(--terran);">
      <span class="close-btn" id="closeAdmin">&times;</span>
      <h2>관리자 모드 (전체 인원 MMR 현황)</h2>
      
      <div id="adminLoginArea" style="text-align:center; margin: 40px 0;">
        <input type="password" id="adminPwd" placeholder="비밀번호 입력" style="padding:10px; width:200px; background:var(--bg2); color:white; border:1px solid var(--line); border-radius:4px;">
        <button id="adminLoginBtn" style="padding:10px 20px; background:var(--terran); border:none; border-radius:4px; color:white; cursor:pointer;">접속</button>
      </div>

      <div id="adminPanelArea" style="display:none; margin-top:20px;">
        <div style="max-height: 500px; overflow-y: auto; background: var(--bg2); border: 1px solid var(--line);">
          <table id="adminTable" style="width:100%; border-collapse:collapse; text-align:center;">
            <thead>
              <tr style="background:var(--panel); color:var(--text); border-bottom:1px solid var(--line);">
                <th style="padding:10px;">티어</th>
                <th>이름</th>
                <th>종족</th>
                <th>MMR</th>
                <th>상태</th>
                <th>이미지 URL</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <div style="text-align:right; margin-top:20px;">
          <button id="adminSaveBtn" style="padding:12px 24px; background:var(--terran); border:none; border-radius:4px; color:white; cursor:pointer; font-weight:bold;">변경사항 저장</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(adminModal);

  adminBtn.onclick = () => adminModal.style.display = 'block';
  document.getElementById('closeAdmin').onclick = () => adminModal.style.display = 'none';

  document.getElementById('adminLoginBtn').onclick = async () => {
    const pwd = document.getElementById('adminPwd').value;
    const key = await decryptKey(pwd);
    if (!key) {
      alert('비밀번호가 틀렸습니다.');
      return;
    }
    adminKey = key;
    document.getElementById('adminLoginArea').style.display = 'none';
    
    // Fetch MMR data
    mmrResult = await fetchMmrData();
    renderAdminTable();
    
    document.getElementById('adminPanelArea').style.display = 'block';
  };

  document.getElementById('adminSaveBtn').onclick = savePhotos;
}

// Add CSS rules for table inputs
const style = document.createElement('style');
style.innerHTML = `
  #adminTable td { padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #ccc; }
  #adminTable input { width: 100%; box-sizing: border-box; background: #000; color: #fff; border: 1px solid #444; padding: 4px 8px; }
`;
document.head.appendChild(style);

window.addEventListener('DOMContentLoaded', initAdminUI);
