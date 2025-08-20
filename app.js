(() => {
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];

  const state = {
    dayIndex: 0,
    display: { jpFull:true, jpHints:true, ptFull:true },
    voices: [],
    jpVoice: null,
    ptVoice: null,
    ptRate: 1.0,
    thinkMs: 1000,
    speaking: false,
    cancelToken: { cancelled:false },
    progress: loadProgress()
  };

  // ---------- init ----------
  window.addEventListener('DOMContentLoaded', () => {
    const hashDay = getHashDay();
    if (hashDay) state.dayIndex = Math.max(0, hashDay - 1);

    setupDayNav();
    bindHeaderControls();
    renderDay();
    initVoices();
    initModal();
  });

  function getHashDay(){
    const m = location.hash.match(/day=(\d+)/);
    return m ? Number(m[1]) : null;
  }

  // ---------- Progress ----------
  function loadProgress(){ try{ return JSON.parse(localStorage.getItem('pi-progress')||'{}'); }catch{ return {}; } }
  function saveProgress(){ localStorage.setItem('pi-progress', JSON.stringify(state.progress)); }
  function rememberDay(){ localStorage.setItem('pi-last-day-index', String(state.dayIndex)); }

  // ---------- Day Navigation ----------
  function setupDayNav(){
    const sel = $('#daySelect'); sel.innerHTML = "";
    (DATA || []).forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = `Day ${d.day}`;
      sel.appendChild(opt);
    });
    sel.value = state.dayIndex;

    sel.addEventListener('change', () => { state.dayIndex = Number(sel.value); renderDay(); rememberDay(); });
    $('#prevDay').addEventListener('click', () => {
      if (state.dayIndex > 0){ state.dayIndex--; sel.value = state.dayIndex; renderDay(); rememberDay(); }
    });
    $('#nextDay').addEventListener('click', () => {
      if (state.dayIndex < DATA.length - 1){ state.dayIndex++; sel.value = state.dayIndex; renderDay(); rememberDay(); }
    });

    // 前後ボタンの有効/無効
    function togglePrevNext(){
      $('#prevDay').classList.toggle('disabled', state.dayIndex <= 0);
      $('#nextDay').classList.toggle('disabled', state.dayIndex >= DATA.length - 1);
    }
    const obs = new MutationObserver(togglePrevNext);
    obs.observe(sel, { attributes:true, childList:true, subtree:true });
    togglePrevNext();
  }

  // ---------- Header Controls ----------
  function bindHeaderControls(){
    ['jpFull','jpHints','ptFull'].forEach(k => {
      const el = $(`#toggle-${k}`);
      el.addEventListener('change', () => { state.display[k] = el.checked; applyGlobalVisibility(); });
    });
    $('#stopAll').addEventListener('click', stopAll);
  }

  // ---------- Render Day ----------
  function renderDay(){
    const day = DATA[state.dayIndex] || { day: 1, theme: "—", items: [] };
    $('#theme').textContent = `Day ${day.day}：${day.theme}`;

    const container = $('#items'); container.innerHTML = "";

    if (!('speechSynthesis' in window)) {
      const warn = document.createElement('div');
      warn.className = 'warn-banner';
      warn.textContent = 'このブラウザは音声読み上げ（Web Speech API）に対応していません。Chrome 等をご利用ください。';
      container.appendChild(warn);
    }

    day.items.forEach((it, idx) => {
      const card = document.createElement('article'); card.className = 'item'; card.dataset.id = it.id;
      const head = document.createElement('div'); head.className = 'item-head';
      head.innerHTML = `
        <div class="badges">
          <span class="badge">#${idx+1}</span>
          <span class="badge">${it.id}</span>
        </div>
        <div class="controls">
          <button class="btn light playA" title="A: 暗記用">A</button>
          <button class="btn light playB" title="B: 瞬間翻訳">B</button>
          <button class="btn light playC" title="C: リスニング">C</button>
        </div>`;

      const body = document.createElement('div'); body.className = 'item-body';
      const lines = document.createElement('div'); lines.className = 'lines';
      const l1 = document.createElement('div'); l1.className = 'line jpFull'; l1.textContent = it.jpFull;
      const l2 = document.createElement('div'); l2.className = 'line hint jpHints';
      const kvs = document.createElement('div'); kvs.className = 'kvs';
      (it.jpHints || []).forEach(h => { const kv = document.createElement('span'); kv.className = 'kv'; kv.textContent = h; kvs.appendChild(kv); });
      l2.appendChild(kvs);
      const l3 = document.createElement('div'); l3.className = 'line ptFull'; l3.textContent = it.ptFull;
      lines.append(l1,l2,l3); body.appendChild(lines);

      const foot = document.createElement('div'); foot.className = 'item-foot';
      const switches = document.createElement('div'); switches.className = 'switches';
      switches.innerHTML = `
        <label><input type="checkbox" class="sw-jpFull" checked> 日本語全文</label>
        <label><input type="checkbox" class="sw-jpHints" checked> 分割日本語</label>
        <label><input type="checkbox" class="sw-ptFull" checked> ポルトガル語全文</label>`;
      const mastered = document.createElement('label'); mastered.className = 'mastered';
      const chk = document.createElement('input'); chk.type = 'checkbox'; chk.className = 'chk-mastered';
      chk.checked = !!state.progress[it.id]?.mastered;
      mastered.append(chk, document.createTextNode('✓ 達成'));

      foot.append(switches, mastered);
      const cardFrag = document.createDocumentFragment();
      [head, body, foot].forEach(e => cardFrag.appendChild(e));
      card.appendChild(cardFrag); container.appendChild(card);

      // 行ごとの表示切替
      const applyLocalVis = () => {
        l1.classList.toggle('hidden', !$('.sw-jpFull', card).checked);
        l2.classList.toggle('hidden', !$('.sw-jpHints', card).checked);
        l3.classList.toggle('hidden', !$('.sw-ptFull', card).checked);
      };
      $$('.switches input', card).forEach(el => el.addEventListener('change', applyLocalVis));
      applyLocalVis();

      // 達成チェック
      chk.addEventListener('change', () => {
        state.progress[it.id] = state.progress[it.id] || {};
        state.progress[it.id].mastered = chk.checked; saveProgress(); updateProgressBar();
      });

      // 再生
      $('.playA', card).addEventListener('click', () => playModeA(it));
      $('.playB', card).addEventListener('click', () => playModeB(it));
      $('.playC', card).addEventListener('click', () => playModeC(it));
    });

    applyGlobalVisibility();
    updateProgressBar();
    rememberDay();
  }

  function applyGlobalVisibility(){
    const { jpFull, jpHints, ptFull } = state.display;
    $$('#items .item').forEach(card => {
      $('.jpFull', card)?.classList.toggle('hidden', !jpFull);
      $('.jpHints', card)?.classList.toggle('hidden', !jpHints);
      $('.ptFull', card)?.classList.toggle('hidden', !ptFull);
      $('.sw-jpFull', card).checked = jpFull;
      $('.sw-jpHints', card).checked = jpHints;
      $('.sw-ptFull', card).checked = ptFull;
    });
  }

  function updateProgressBar(){
    const day = DATA[state.dayIndex];
    const total = day.items.length || 0;
    const done = day.items.filter(it => state.progress[it.id]?.mastered).length;
    const pct = total ? Math.round(100*done/total) : 0;
    $('#progressBar').style.width = `${pct}%`;
    $('#progressText').textContent = `${done}/${total}`;
  }

  // ---------- Modal ----------
  function initModal(){
    const modal = $('#settingsModal');
    const openBtn = $('#openSettings');
    const closeEls = $$('[data-close]', modal);

    openBtn.addEventListener('click', () => modal.classList.add('open'));
    closeEls.forEach(el => el.addEventListener('click', () => modal.classList.remove('open')));
    modal.addEventListener('click', (e) => { if (e.target.classList.contains('modal')) modal.classList.remove('open'); });
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') modal.classList.remove('open'); });
  }

  // ---------- TTS ----------
  function initVoices(){
    const populate = () => {
      if (!('speechSynthesis' in window)) return;
      state.voices = speechSynthesis.getVoices();

      // 日本語
      const jpList = state.voices.filter(v => v.lang?.toLowerCase().startsWith('ja'));
      const $jp = $('#jpVoice'); if ($jp){ $jp.innerHTML = ""; jpList.forEach(v => {
        const op = document.createElement('option'); op.value = v.voiceURI; op.textContent = `${v.name} (${v.lang})`; $jp.appendChild(op);
      }); state.jpVoice = jpList[0] || null; if (state.jpVoice) $jp.value = state.jpVoice.voiceURI;
      $jp.addEventListener('change', () => { state.jpVoice = state.voices.find(v => v.voiceURI === $jp.value) || null; }); }

      // ポルトガル語（優先順：pt-BR > pt > pt-PT）
      const allPt = state.voices.filter(v => v.lang?.toLowerCase().startsWith('pt'));
      const ptBR = allPt.filter(v => v.lang.toLowerCase().startsWith('pt-br'));
      const ptPT = allPt.filter(v => v.lang.toLowerCase().startsWith('pt-pt'));
      const ptPref = ptBR[0] || (allPt[0] || ptPT[0] || null);

      const $pt = $('#ptVoice'); if ($pt){ $pt.innerHTML = "";
        allPt.forEach(v => { const op = document.createElement('option'); op.value = v.voiceURI; op.textContent = `${v.name} (${v.lang})`; $pt.appendChild(op); });
        state.ptVoice = ptPref; if (state.ptVoice) $pt.value = state.ptVoice.voiceURI;
        $pt.addEventListener('change', () => { state.ptVoice = state.voices.find(v => v.voiceURI === $pt.value) || null; });
      }

      // スライダの初期表示
      const rate = $('#ptRate'); const rateVal = $('#ptRateVal');
      if (rate && rateVal){ rateVal.textContent = Number(rate.value).toFixed(2); rate.addEventListener('input', () => {
        state.ptRate = Number(rate.value); rateVal.textContent = state.ptRate.toFixed(2);
      }); }
      const think = $('#thinkMs'); const thinkLabel = $('#thinkLabel');
      if (think && thinkLabel){ thinkLabel.textContent = `${(think.value/1000).toFixed(1)}s`; think.addEventListener('input', () => {
        state.thinkMs = Number(think.value); thinkLabel.textContent = `${(state.thinkMs/1000).toFixed(1)}s`;
      }); }

      // テスト & 停止
      $('#testVoices')?.addEventListener('click', async () => {
        await stopAll();
        await speakText("日本語のテストです。", 'ja-JP', 1.0);
        await smallPause(300);
        await speakText("Teste de voz em português.", 'pt-BR', state.ptRate);
      });
    };

    populate();
    if (speechSynthesis && speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = populate;
    }
  }

  function speakText(text, lang='ja-JP', rate=1.0){
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang; u.rate = rate;
      if (lang.startsWith('ja') && state.jpVoice) u.voice = state.jpVoice;
      if (lang.startsWith('pt') && state.ptVoice) u.voice = state.ptVoice;
      u.onend = resolve; u.onerror = resolve;
      speechSynthesis.speak(u);
    });
  }
  function smallPause(ms){ return new Promise(r => setTimeout(r, ms)); }

  async function stopAll(){
    state.cancelToken.cancelled = true; speechSynthesis.cancel();
    await smallPause(10);
    state.cancelToken = { cancelled:false }; state.speaking = false; setBtnsDisabled(false);
  }
  function setBtnsDisabled(disabled){
    $$('.playA, .playB, .playC').forEach(b => b.disabled = disabled);
    $('#stopAll').disabled = !disabled;
  }

  // ----- Modes -----
  async function playModeA(it){
    if (state.speaking) return; state.speaking = true; setBtnsDisabled(true);
    const token = state.cancelToken;
    const jpHints = it.jpHints || [];
    const ptSplit = it.ptSplit || (it.ptFull || '').split(/\s+/);

    for (let i=0;i<Math.min(jpHints.length, ptSplit.length);i++){
      if (token.cancelled) return finalizeSpeak();
      await speakText(jpHints[i], 'ja-JP', 1.0);
      await smallPause(120);
      await speakText(ptSplit[i], 'pt-BR', state.ptRate);
      await smallPause(200);
    }
    if (token.cancelled) return finalizeSpeak();
    await speakText(it.jpFull, 'ja-JP', 1.0);
    await smallPause(250);
    if (token.cancelled) return finalizeSpeak();
    await speakText(it.ptFull, 'pt-BR', state.ptRate);
    finalizeSpeak();
  }

  async function playModeB(it){
    if (state.speaking) return; state.speaking = true; setBtnsDisabled(true);
    const token = state.cancelToken; const think = state.thinkMs;
    for (const hint of (it.jpHints || [])){
      if (token.cancelled) return finalizeSpeak();
      await speakText(hint, 'ja-JP', 1.0);
      await smallPause(think);
    }
    if (token.cancelled) return finalizeSpeak();
    await speakText(it.jpFull, 'ja-JP', 1.0);
    finalizeSpeak();
  }

  async function playModeC(it){
    if (state.speaking) return; state.speaking = true; setBtnsDisabled(true);
    const token = state.cancelToken;
    if (token.cancelled) return finalizeSpeak();
    await speakText(it.ptFull, 'pt-BR', state.ptRate);
    finalizeSpeak();
  }

  function finalizeSpeak(){ state.speaking = false; setBtnsDisabled(false); }
})();
