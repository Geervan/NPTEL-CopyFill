/**
 * NPTEL CopyFill Content Script
 * Features: Dynamic Full-Height Consensus Table, Zero Clipping, Dark Sleek Scrollbars, LinkedIn Credits
 */

(function () {
  if (window.nptelCompanionLoaded) return;

  const currentHost = window.location.hostname || '';
  const currentHref = window.location.href || '';
  const isNptelDomain = currentHost.includes('nptel.ac.in') || 
                        currentHost.includes('swayam.gov.in') || 
                        currentHref.includes('test_nptel_page.html');

  if (!isNptelDomain) return;
  window.nptelCompanionLoaded = true;

  let settings = {
    unblockCopy: true,
    autoAppendPrompt: true,
    systemPrompt: `Please provide the correct answers for each question below strictly in the following format:
1. Option letter or exact answer
2. Option letter or exact answer
...
Example:
1. A
2. C
3. B
Do not include extra explanations or conversational text.`,
    llmModels: [
      { id: 'm1', name: 'ChatGPT', isPrimary: true, text: '' },
      { id: 'm2', name: 'Gemini', isPrimary: false, text: '' }
    ],
    activeModelTabId: 'm1'
  };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(settings, (res) => {
      if (res) {
        if (res.unblockCopy !== undefined) settings.unblockCopy = res.unblockCopy;
        if (res.autoAppendPrompt !== undefined) settings.autoAppendPrompt = res.autoAppendPrompt;
        if (res.systemPrompt !== undefined) settings.systemPrompt = res.systemPrompt;
        if (res.llmModels && Array.isArray(res.llmModels) && res.llmModels.length > 0) {
          settings.llmModels = res.llmModels;
        }
      }
    });
  }

  function saveModelsToStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ llmModels: settings.llmModels });
    }
  }

  /* ==========================================================================
     1. UNIFIED COPY & PASTE UNBLOCKER
     ========================================================================== */
  function injectMainWorldUnblocker() {
    const scriptId = 'nptel-main-world-unblocker';
    if (document.getElementById(scriptId)) return;

    const script = document.createElement('script');
    script.id = scriptId;
    script.textContent = `(function() {
      const eventsToUnblock = ['contextmenu', 'selectstart', 'dragstart', 'mousedown', 'mouseup'];
      eventsToUnblock.forEach(function(eventType) {
        window.addEventListener(eventType, function(e) {
          e.stopImmediatePropagation();
        }, true);
      });

      const props = ['oncopy', 'oncut', 'onpaste', 'oncontextmenu', 'onselectstart', 'ondragstart', 'onkeydown', 'onkeyup'];
      props.forEach(function(prop) {
        try {
          Object.defineProperty(document, prop, {
            get: function() { return null; },
            set: function() { return true; },
            configurable: true
          });
          if (document.body) {
            Object.defineProperty(document.body, prop, {
              get: function() { return null; },
              set: function() { return true; },
              configurable: true
            });
          }
        } catch(e) {}
      });
    })();`;

    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  function enableCopyAndSelection() {
    const styleId = 'nptel-unblock-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        html, body, div, span, p, a, label, input, table, tr, td, th, form, fieldset, section, article, h1, h2, h3, h4, h5, h6 {
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          user-select: text !important;
        }
        .toast, .toast-warning, .alert-warning, div[class*="toast"], div[class*="alert"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    injectMainWorldUnblocker();

    const events = ['paste', 'contextmenu', 'selectstart', 'dragstart'];
    events.forEach(eventType => {
      window.addEventListener(eventType, (e) => {
        if (!settings.unblockCopy) return;
        e.stopImmediatePropagation();
      }, true);
    });

    ['keydown', 'keyup'].forEach(eventType => {
      window.addEventListener(eventType, (e) => {
        if (!settings.unblockCopy) return;
        if (e.ctrlKey || e.metaKey) {
          const key = (e.key || '').toLowerCase();
          const code = e.keyCode || e.which;
          if (key === 'c' || key === 'v' || key === 'x' || key === 'a' ||
              code === 67 || code === 86 || code === 88 || code === 65) {
            e.stopImmediatePropagation();
          }
        }
      }, true);
    });

    window.addEventListener('copy', (e) => {
      if (!settings.unblockCopy) return;
      e.stopImmediatePropagation();

      const selection = window.getSelection().toString().trim();
      if (!selection) return;

      let textToCopy = selection;
      if (settings.autoAppendPrompt && !selection.includes('[SYSTEM PROMPT]')) {
        textToCopy = `[SYSTEM PROMPT]:
${settings.systemPrompt}

--- QUESTION / CONTENT ---
${selection}`;
      }

      if (e.clipboardData) {
        e.clipboardData.setData('text/plain', textToCopy);
        e.preventDefault();
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).catch(() => {});
      }

      showToast('Copied to clipboard');
    }, true);

    document.oncontextmenu = null;
    document.onselectstart = null;
    document.ondragstart = null;
    document.oncopy = null;
    document.oncut = null;
    document.onpaste = null;
  }

  enableCopyAndSelection();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enableCopyAndSelection);
  }

  /* ==========================================================================
     2. PARSER & CLEAN SANITIZER
     ========================================================================== */
  function parseAnswerText(text) {
    if (!text) return {};

    let cleanText = text;
    if (cleanText.includes('--- QUESTION / CONTENT ---')) {
      cleanText = cleanText.split('--- QUESTION / CONTENT ---').pop();
    } else if (cleanText.includes('[SYSTEM PROMPT]')) {
      cleanText = cleanText.replace(/\[SYSTEM PROMPT\][\s\S]*?(?=\n\n|\n[A-Z0-9]|$)/gi, '');
    }

    const answers = {};
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (lines.length === 0) return {};

    const hasExplicitNumbers = lines.some(l => /^(?:Q|q|Question)?\s*\d+[\.\:\)\-]/i.test(l));

    if (hasExplicitNumbers) {
      for (let line of lines) {
        const match = line.match(/^(?:Q|q|Question)?\s*(\d+)[\.\:\)\-]?\s*(.+)/i);
        if (match) {
          const qNum = parseInt(match[1], 10);
          let rawAns = match[2].trim();
          answers[qNum] = normalizeAnsVal(rawAns);
        }
      }
    } else {
      lines.forEach((line, idx) => {
        let rawAns = line.replace(/^[\-\*\•]\s*/, '').trim();
        answers[idx + 1] = normalizeAnsVal(rawAns);
      });
    }

    return answers;
  }

  function normalizeAnsVal(raw) {
    if (!raw) return '';
    const trimmed = raw.trim();
    if (/^[a-fA-F]$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    if (/^[A-F](?:\s*[\,\;\/]\s*[A-F])+$/i.test(trimmed)) {
      return trimmed.toUpperCase().split(/[\,\;\/]/).map(s=>s.trim()).filter(Boolean).sort().join(', ');
    }
    return trimmed;
  }

  /* ==========================================================================
     3. PRECISION STRING & DOM MATCHING ALGORITHM
     ========================================================================== */
  function getNPTELQuestions() {
    const allInputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"], input[type="text"], textarea'))
      .filter(i => !i.closest('#nptel-companion-shadow-host') && !i.closest('#nptel-floating-trigger'));

    if (allInputs.length === 0) return [];

    const choiceInputs = allInputs.filter(i => i.type === 'radio' || i.type === 'checkbox');
    const textInputs = allInputs.filter(i => i.type === 'text' || i.tagName === 'TEXTAREA');

    const questionGroups = [];

    if (choiceInputs.length > 0) {
      const groupsByName = {};
      const ungrouped = [];

      choiceInputs.forEach(input => {
        if (input.name) {
          if (!groupsByName[input.name]) groupsByName[input.name] = [];
          groupsByName[input.name].push(input);
        } else {
          ungrouped.push(input);
        }
      });

      Object.keys(groupsByName).forEach(name => {
        const inputs = groupsByName[name];
        const container = inputs[0].closest('mat-radio-group, fieldset, .gcb-question-row, div[class*="question"], div[class*="q-item"], tr, li, form > div') || inputs[0].parentElement.parentElement.parentElement;
        questionGroups.push({
          container: container,
          inputs: inputs
        });
      });

      if (ungrouped.length > 0) {
        const parentMap = new Map();
        ungrouped.forEach(input => {
          const parent = input.closest('mat-radio-group, fieldset, .gcb-question-row, div[class*="question"], tr, li') || input.parentElement.parentElement.parentElement;
          if (!parentMap.has(parent)) parentMap.set(parent, []);
          parentMap.get(parent).push(input);
        });
        parentMap.forEach((inputs, parent) => {
          questionGroups.push({
            container: parent,
            inputs: inputs
          });
        });
      }
    }

    textInputs.forEach(tInput => {
      questionGroups.push({
        container: tInput.parentElement,
        inputs: [tInput]
      });
    });

    return questionGroups.map((group, idx) => ({
      index: idx + 1,
      container: group.container,
      inputs: group.inputs
    }));
  }

  function cleanOptionStr(str) {
    return (str || '')
      .replace(/^(?:[a-fA-F0-9][\.\)\:]|\([a-fA-F0-9]\))\s*/, '')
      .replace(/[\s\t\n\r]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function findMatchingInputIndices(inputs, targetAns) {
    if (!inputs || inputs.length === 0 || !targetAns) return [];

    const rawTarget = targetAns.trim();
    const cleanTarget = cleanOptionStr(rawTarget);
    const targetUpper = rawTarget.toUpperCase();
    const isSingleLetter = /^[A-F]$/.test(targetUpper);

    const optionsInfo = inputs.map((input, optIdx) => {
      const letterChar = String.fromCharCode(65 + optIdx);
      const valUpper = (input.value || '').trim().toUpperCase();
      const wrapper = input.closest('mat-radio-button, mat-checkbox, .mat-radio-button, .mat-checkbox, label, .mat-radio-label, .mat-radio-label-content') || input.parentElement;
      const rawText = (wrapper ? wrapper.innerText : '').trim();
      const cleanText = cleanOptionStr(rawText);

      return {
        input,
        optIdx,
        letterChar,
        valUpper,
        rawText,
        cleanText
      };
    });

    // 1. EXACT FULL STRING MATCH
    const exactMatch = optionsInfo.find(opt => opt.cleanText === cleanTarget);
    if (exactMatch) {
      return [exactMatch.optIdx];
    }

    // 2. SINGLE LETTER MATCH ('A', 'B', 'C', 'D')
    if (isSingleLetter) {
      const letterMatch = optionsInfo.find(opt => opt.letterChar === targetUpper || opt.valUpper === targetUpper);
      if (letterMatch) {
        return [letterMatch.optIdx];
      }
    }

    // 3. MULTI-PART MATCH (e.g. "DNS / SNMP", "DNS; SNMP", "DNS, SNMP", "A, B")
    const parts = rawTarget.split(/[\,\;\/\&]|\bamp\b|\band\b/i).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      const matchedIndices = [];
      parts.forEach(part => {
        const pClean = cleanOptionStr(part);
        const pUpper = part.toUpperCase();
        const isLetter = /^[A-F]$/.test(pUpper);

        let found = optionsInfo.find(opt => opt.cleanText === pClean);
        if (!found && isLetter) {
          found = optionsInfo.find(opt => opt.letterChar === pUpper || opt.valUpper === pUpper);
        }
        if (!found && pClean.length > 1) {
          found = optionsInfo.find(opt => opt.cleanText.includes(pClean) || pClean.includes(opt.cleanText));
        }
        if (found && !matchedIndices.includes(found.optIdx)) {
          matchedIndices.push(found.optIdx);
        }
      });

      if (matchedIndices.length > 0) {
        return matchedIndices;
      }
    }

    // 4. BEST OVERLAP MATCH FOR SINGLE OPTION
    let bestIdx = -1;
    let maxOverlapScore = 0;

    optionsInfo.forEach(opt => {
      if (opt.cleanText.length < 2 || cleanTarget.length < 2) return;

      let score = 0;
      if (cleanTarget.startsWith(opt.cleanText) || opt.cleanText.startsWith(cleanTarget)) {
        score = Math.min(cleanTarget.length, opt.cleanText.length) * 10;
      } else if (cleanTarget.includes(opt.cleanText) || opt.cleanText.includes(cleanTarget)) {
        score = Math.min(cleanTarget.length, opt.cleanText.length);
      }

      if (score > maxOverlapScore) {
        maxOverlapScore = score;
        bestIdx = opt.optIdx;
      }
    });

    if (bestIdx >= 0) {
      return [bestIdx];
    }

    return [];
  }

  function autoFillForm(answersMap) {
    const questions = getNPTELQuestions();
    let filledCount = 0;

    questions.forEach((qObj) => {
      const targetAns = answersMap[qObj.index];
      if (!targetAns) return;

      const inputs = qObj.inputs;
      if (!inputs || inputs.length === 0) return;

      if (inputs[0].type === 'radio' || inputs[0].type === 'checkbox') {
        const matchedIndices = findMatchingInputIndices(inputs, targetAns);

        matchedIndices.forEach(idx => {
          const matchedInput = inputs[idx];
          if (!matchedInput) return;

          matchedInput.checked = true;
          try { matchedInput.click(); } catch(e) {}

          const clickableParent = matchedInput.closest('mat-radio-button, mat-checkbox, label, .mat-radio-label, .mat-checkbox-layout, div[class*="option"], li');
          if (clickableParent) {
            try { clickableParent.click(); } catch(e) {}
          }

          ['mousedown', 'mouseup', 'click', 'change', 'input'].forEach(evtType => {
            matchedInput.dispatchEvent(new Event(evtType, { bubbles: true, cancelable: true }));
            if (clickableParent) {
              clickableParent.dispatchEvent(new Event(evtType, { bubbles: true, cancelable: true }));
            }
          });
        });

        if (matchedIndices.length > 0) filledCount++;
      } else if (inputs[0].type === 'text' || inputs[0].tagName === 'TEXTAREA') {
        inputs[0].value = targetAns.trim();
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        filledCount++;
      }
    });

    showToast(`Auto-filled ${filledCount} fields`);
  }

  function runSanityCheck(answersMap) {
    const questions = getNPTELQuestions();
    let totalQuestions = questions.length;
    let matchedCount = 0;
    let missingCount = 0;
    let conflictCount = 0;

    document.querySelectorAll('.nptel-companion-highlight-valid, .nptel-companion-highlight-invalid, .nptel-companion-highlight-missing').forEach(el => {
      el.classList.remove('nptel-companion-highlight-valid', 'nptel-companion-highlight-invalid', 'nptel-companion-highlight-missing');
    });

    questions.forEach((qObj) => {
      const container = qObj.container;
      const expectedAns = answersMap[qObj.index];

      const inputs = qObj.inputs;
      const checkedInputs = inputs.filter(i => i.checked || (i.type === 'text' && i.value.trim()));

      if (checkedInputs.length === 0) {
        missingCount++;
        if (container) container.classList.add('nptel-companion-highlight-missing');
        return;
      }

      if (!expectedAns) return;

      const checkedIndices = checkedInputs.map(i => inputs.indexOf(i));
      const expectedIndices = findMatchingInputIndices(inputs, expectedAns);

      const isMatch = expectedIndices.length > 0 &&
                      checkedIndices.length === expectedIndices.length &&
                      expectedIndices.every(idx => checkedIndices.includes(idx));

      if (isMatch) {
        matchedCount++;
        checkedInputs.forEach(input => {
          const wrapper = input.closest('mat-radio-button, mat-checkbox, label, .mat-radio-container') || input.parentElement;
          if (wrapper) wrapper.classList.add('nptel-companion-highlight-valid');
        });
      } else {
        conflictCount++;
        checkedInputs.forEach(input => {
          const wrapper = input.closest('mat-radio-button, mat-checkbox, label, .mat-radio-container') || input.parentElement;
          if (wrapper) wrapper.classList.add('nptel-companion-highlight-invalid');
        });
        expectedIndices.forEach(idx => {
          const input = inputs[idx];
          if (input) {
            const wrapper = input.closest('mat-radio-button, mat-checkbox, label, .mat-radio-container') || input.parentElement;
            if (wrapper) wrapper.classList.add('nptel-companion-highlight-valid');
          }
        });
      }
    });

    const confidenceScore = totalQuestions > 0 ? Math.round((matchedCount / totalQuestions) * 100) : 0;
    showSanityBanner(confidenceScore, matchedCount, totalQuestions, conflictCount, missingCount);
  }

  function showSanityBanner(score, matched, total, conflicts, missing) {
    let banner = document.getElementById('nptel-sanity-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'nptel-sanity-banner';
      document.body.appendChild(banner);
    }

    banner.innerHTML = `
      <div>
        <div style="font-size: 10px; opacity: 0.7; font-weight: 500; text-transform: uppercase;">Sanity Score</div>
        <div class="sanity-banner-score">${score}% Confidence</div>
      </div>
      <div style="font-size: 11px; border-left: 1px solid rgba(255,255,255,0.15); padding-left: 12px;">
        <div>Matched: <strong>${matched}/${total}</strong></div>
        <div style="color: ${conflicts > 0 ? '#f87171' : '#a7f3d0'}">Conflicts: <strong>${conflicts}</strong></div>
        <div style="color: ${missing > 0 ? '#fbbf24' : '#a7f3d0'}">Unanswered: <strong>${missing}</strong></div>
      </div>
    `;

    setTimeout(() => {
      if (banner) banner.remove();
    }, 6000);
  }

  /* ==========================================================================
     4. FULL-HEIGHT DYNAMIC MATRIX & CONSENSUS FLEXBOX
     ========================================================================== */
  let shadowHost = null;
  let shadowRoot = null;

  function createSideDrawer() {
    if (shadowHost) return;

    shadowHost = document.createElement('div');
    shadowHost.id = 'nptel-companion-shadow-host';
    document.body.appendChild(shadowHost);

    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    const styles = document.createElement('style');
    styles.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
      
      .drawer-overlay {
        position: fixed;
        top: 0; right: 0;
        width: 440px;
        max-width: 85vw;
        height: 100vh;
        background: #09090b;
        border-left: 1px solid #27272a;
        box-shadow: -10px 0 35px rgba(0, 0, 0, 0.95);
        z-index: 9999999;
        display: flex;
        flex-direction: column;
        transform: translateX(100%);
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        color: #f4f4f5;
        overflow: hidden;
      }
      
      .drawer-overlay.open {
        transform: translateX(0);
      }

      .drawer-header {
        height: 38px;
        padding: 0 16px;
        background: #18181b;
        border-bottom: 1px solid #27272a;
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;
        flex-shrink: 0;
        z-index: 10;
      }

      .drawer-title {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.3px;
        color: #f4f4f5;
        text-align: center;
      }

      .close-btn {
        background: none;
        border: none;
        color: #71717a;
        font-size: 16px;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
      }
      .close-btn:hover { color: #fff; }

      .drawer-body {
        flex: 1;
        overflow: hidden;
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 0;
      }

      .model-tabs-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        border-bottom: 1px solid #27272a;
        padding-bottom: 8px;
        overflow-x: auto;
        flex-shrink: 0;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .model-tabs-bar::-webkit-scrollbar {
        display: none;
      }

      .model-tab {
        background: #18181b;
        border: 1px solid #27272a;
        color: #a1a1aa;
        font-size: 11px;
        font-weight: 500;
        padding: 5px 10px;
        border-radius: 6px;
        cursor: pointer;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s ease;
      }

      .model-tab.active {
        background: #27272a;
        color: #f4f4f5;
        border-color: #52525b;
      }

      .btn-add-tab {
        background: none;
        border: 1px dashed #3f3f46;
        color: #71717a;
        font-size: 11px;
        padding: 5px 8px;
        border-radius: 6px;
        cursor: pointer;
        flex-shrink: 0;
      }
      .btn-add-tab:hover { color: #fff; border-color: #71717a; }

      .active-model-view {
        background: #18181b;
        border: 1px solid #27272a;
        border-radius: 8px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex-shrink: 0;
      }

      .model-view-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .model-name-input {
        background: #09090b;
        border: 1px solid #27272a;
        border-radius: 4px;
        color: #f4f4f5;
        font-size: 11px;
        font-weight: 500;
        padding: 4px 8px;
        width: 130px;
        outline: none;
      }
      .model-name-input:focus { border-color: #52525b; }

      .model-actions-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .btn-sm-action {
        background: #27272a;
        border: none;
        color: #a1a1aa;
        font-size: 10px;
        font-weight: 500;
        padding: 3px 8px;
        border-radius: 4px;
        cursor: pointer;
      }
      .btn-sm-action:hover { color: #fff; background: #3f3f46; }
      .btn-sm-action.is-primary { background: #3f3f46; color: #f4f4f5; }

      .btn-delete-model {
        background: none;
        border: none;
        color: #ef4444;
        font-size: 14px;
        cursor: pointer;
        padding: 0 4px;
        opacity: 0.6;
      }
      .btn-delete-model:hover { opacity: 1; }

      textarea {
        width: 100%;
        height: 85px;
        background: #09090b;
        border: 1px solid #27272a;
        border-radius: 6px;
        color: #f4f4f5;
        padding: 8px;
        font-size: 11px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        resize: vertical;
        outline: none;
      }
      textarea:focus { border-color: #52525b; }

      textarea::-webkit-scrollbar {
        width: 5px;
      }
      textarea::-webkit-scrollbar-track {
        background: #09090b;
      }
      textarea::-webkit-scrollbar-thumb {
        background: #27272a;
        border-radius: 3px;
      }
      textarea::-webkit-scrollbar-thumb:hover {
        background: #3f3f46;
      }

      .consensus-card {
        background: #18181b;
        border: 1px solid #27272a;
        border-radius: 8px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
        min-height: 0;
      }

      .consensus-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
      }

      .consensus-title {
        font-size: 11px;
        font-weight: 600;
        color: #a1a1aa;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .btn-run-comparison {
        background: #27272a;
        border: 1px solid #3f3f46;
        color: #f4f4f5;
        font-size: 11px;
        font-weight: 500;
        padding: 4px 10px;
        border-radius: 5px;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .btn-run-comparison:hover {
        background: #3f3f46;
      }

      .table-wrapper {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
      }

      .table-wrapper::-webkit-scrollbar {
        width: 5px;
      }
      .table-wrapper::-webkit-scrollbar-track {
        background: #18181b;
      }
      .table-wrapper::-webkit-scrollbar-thumb {
        background: #3f3f46;
        border-radius: 3px;
      }
      .table-wrapper::-webkit-scrollbar-thumb:hover {
        background: #52525b;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }

      th, td {
        padding: 6px 8px;
        text-align: left;
        border-bottom: 1px solid #27272a;
      }

      th { color: #71717a; font-weight: 500; font-size: 10px; }

      .badge-match {
        color: #4ade80;
        background: rgba(74, 222, 128, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 500;
      }

      .badge-conflict {
        color: #f87171;
        background: rgba(248, 113, 113, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 500;
      }

      .drawer-footer {
        padding: 10px 16px;
        border-top: 1px solid #27272a;
        background: #09090b;
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex-shrink: 0;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 14px;
        border-radius: 6px;
        border: none;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .btn-primary {
        background: #f4f4f5;
        color: #09090b;
      }
      .btn-primary:hover { background: #e4e4e7; }

      .btn-secondary {
        background: #27272a;
        color: #f4f4f5;
      }
      .btn-secondary:hover { background: #3f3f46; }

      .creator-credit {
        text-align: center;
        font-size: 11px;
        color: #71717a;
        padding-top: 2px;
      }
      .creator-credit a {
        color: #a1a1aa;
        text-decoration: underline;
        font-weight: 600;
        transition: color 0.15s ease;
      }
      .creator-credit a:hover {
        color: #f4f4f5;
      }
    `;

    const container = document.createElement('div');
    container.className = 'drawer-overlay';
    container.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title">NPTEL CopyFill</div>
        <button class="close-btn" id="closeDrawer">&times;</button>
      </div>

      <div class="drawer-body" id="drawerBody">
        <div class="model-tabs-bar" id="modelTabsBar"></div>

        <div class="active-model-view" id="activeModelView"></div>

        <div class="consensus-card">
          <div class="consensus-header-row">
            <span class="consensus-title">Matrix & Consensus</span>
            <div style="display:flex; align-items:center; gap:8px;">
              <button class="btn-run-comparison" id="runComparisonBtn">Run Comparison</button>
              <span id="consensusSummary" style="font-size: 10px; color: #a1a1aa;">0 Parsed</span>
            </div>
          </div>
          <div class="table-wrapper">
            <table>
              <thead id="matrixHead"></thead>
              <tbody id="matrixBody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="drawer-footer">
        <button class="btn btn-primary" id="autoFillBtn">Auto-Fill Answers</button>
        <button class="btn btn-secondary" id="sanityCheckBtn">Run Sanity Check</button>
        <div class="creator-credit">
          Crafted with care by <a id="drawerLinkedInLink" href="https://www.linkedin.com/in/geervan/" target="_blank" rel="noopener noreferrer">Geervan</a>
        </div>
      </div>
    `;

    shadowRoot.appendChild(styles);
    shadowRoot.appendChild(container);

    renderTabsAndActiveModel();
    updateConsensusMatrix();

    // Event Bindings
    shadowRoot.getElementById('closeDrawer').addEventListener('click', toggleDrawer);

    shadowRoot.getElementById('runComparisonBtn').addEventListener('click', () => {
      updateConsensusMatrix();
      showToast('Run Comparison updated');
    });

    shadowRoot.getElementById('autoFillBtn').addEventListener('click', () => {
      const mergedMap = getConsensusAnswersMap();
      autoFillForm(mergedMap);
    });

    shadowRoot.getElementById('sanityCheckBtn').addEventListener('click', () => {
      const mergedMap = getConsensusAnswersMap();
      runSanityCheck(mergedMap);
    });
  }

  function renderTabsAndActiveModel() {
    const tabsBar = shadowRoot.getElementById('modelTabsBar');
    const activeModelView = shadowRoot.getElementById('activeModelView');
    if (!tabsBar || !activeModelView) return;

    tabsBar.innerHTML = '';

    if (!settings.activeModelTabId || !settings.llmModels.some(m => m.id === settings.activeModelTabId)) {
      settings.activeModelTabId = settings.llmModels[0] ? settings.llmModels[0].id : 'm1';
    }

    settings.llmModels.forEach(model => {
      const tab = document.createElement('button');
      tab.className = `model-tab ${model.id === settings.activeModelTabId ? 'active' : ''}`;
      tab.dataset.id = model.id;
      tab.innerHTML = `<span class="tab-label">${escapeHtml(model.name)}</span>${model.isPrimary ? '<span class="tab-star" style="color:#f4f4f5;">*</span>' : ''}`;
      tab.addEventListener('click', () => {
        settings.activeModelTabId = model.id;
        renderTabsAndActiveModel();
      });
      tabsBar.appendChild(tab);
    });

    const addTabBtn = document.createElement('button');
    addTabBtn.className = 'btn-add-tab';
    addTabBtn.textContent = '+ Add';
    addTabBtn.addEventListener('click', () => {
      const newId = 'm_' + Date.now();
      const newModel = {
        id: newId,
        name: `Model ${settings.llmModels.length + 1}`,
        isPrimary: false,
        text: ''
      };
      settings.llmModels.push(newModel);
      settings.activeModelTabId = newId;
      saveModelsToStorage();
      renderTabsAndActiveModel();
      updateConsensusMatrix();
    });
    tabsBar.appendChild(addTabBtn);

    const activeModel = settings.llmModels.find(m => m.id === settings.activeModelTabId) || settings.llmModels[0];

    if (!activeModel) return;

    activeModelView.innerHTML = `
      <div class="model-view-header">
        <input type="text" class="model-name-input" value="${escapeHtml(activeModel.name)}" placeholder="Model Name" />
        <div class="model-actions-row">
          <button class="btn-sm-action" id="pasteClipBtn">Paste</button>
          <button class="btn-sm-action ${activeModel.isPrimary ? 'is-primary' : ''}" id="makePrimaryBtn">
            ${activeModel.isPrimary ? 'Primary' : 'Make Primary'}
          </button>
          ${settings.llmModels.length > 1 ? `<button class="btn-delete-model" id="deleteModelBtn">&times;</button>` : ''}
        </div>
      </div>
      <textarea id="activeModelTextArea" placeholder="Paste ${escapeHtml(activeModel.name)} output here...">${escapeHtml(activeModel.text || '')}</textarea>
    `;

    const nameInput = activeModelView.querySelector('.model-name-input');
    nameInput.addEventListener('input', (e) => {
      activeModel.name = e.target.value;
      saveModelsToStorage();

      const activeTabElem = tabsBar.querySelector(`.model-tab[data-id="${activeModel.id}"] .tab-label`);
      if (activeTabElem) {
        activeTabElem.textContent = e.target.value;
      }
      updateConsensusMatrix();
    });

    const textArea = activeModelView.querySelector('#activeModelTextArea');
    textArea.addEventListener('input', (e) => {
      activeModel.text = e.target.value;
      saveModelsToStorage();
      updateConsensusMatrix();
    });

    const pasteClipBtn = activeModelView.querySelector('#pasteClipBtn');
    pasteClipBtn.addEventListener('click', async () => {
      try {
        let clipboardText = '';
        if (navigator.clipboard && navigator.clipboard.readText) {
          clipboardText = await navigator.clipboard.readText();
        }
        if (clipboardText) {
          activeModel.text = clipboardText;
          textArea.value = clipboardText;
          saveModelsToStorage();
          updateConsensusMatrix();
          showToast(`Pasted into ${activeModel.name}`);
        } else {
          showToast('Clipboard empty');
        }
      } catch(err) {
        showToast('Press Ctrl+V inside box');
      }
    });

    const makePrimaryBtn = activeModelView.querySelector('#makePrimaryBtn');
    makePrimaryBtn.addEventListener('click', () => {
      settings.llmModels.forEach(m => m.isPrimary = (m.id === activeModel.id));
      saveModelsToStorage();
      renderTabsAndActiveModel();
      updateConsensusMatrix();
    });

    const deleteModelBtn = activeModelView.querySelector('#deleteModelBtn');
    if (deleteModelBtn) {
      deleteModelBtn.addEventListener('click', () => {
        settings.llmModels = settings.llmModels.filter(m => m.id !== activeModel.id);
        if (!settings.llmModels.some(m => m.isPrimary) && settings.llmModels.length > 0) {
          settings.llmModels[0].isPrimary = true;
        }
        settings.activeModelTabId = settings.llmModels[0] ? settings.llmModels[0].id : 'm1';
        saveModelsToStorage();
        renderTabsAndActiveModel();
        updateConsensusMatrix();
      });
    }
  }

  function getConsensusAnswersMap() {
    const primaryModel = settings.llmModels.find(m => m.isPrimary) || settings.llmModels[0];
    const primaryMap = parseAnswerText(primaryModel ? primaryModel.text : '');
    const finalMap = { ...primaryMap };

    settings.llmModels.forEach(model => {
      const parsed = parseAnswerText(model.text);
      Object.keys(parsed).forEach(qNum => {
        if (!finalMap[qNum]) {
          finalMap[qNum] = parsed[qNum];
        }
      });
    });

    return finalMap;
  }

  /* ==========================================================================
     EQUIVALENCE STRING & DOM OPTION MATRIX COMPARATOR
     ========================================================================== */
  function areAnswersMatching(ans1, ans2, qObj) {
    if (ans1 === ans2) return true;
    if (!ans1 || !ans2 || ans1 === '-' || ans2 === '-') return false;

    const c1 = cleanOptionStr(ans1);
    const c2 = cleanOptionStr(ans2);

    if (c1 === c2) return true;
    if (c1.length > 3 && c2.length > 3) {
      if (c1.startsWith(c2) || c2.startsWith(c1)) return true;
      if (c1.includes(c2) || c2.includes(c1)) return true;
    }

    if (qObj && qObj.inputs && qObj.inputs.length > 0) {
      const idxs1 = findMatchingInputIndices(qObj.inputs, ans1).sort().join(',');
      const idxs2 = findMatchingInputIndices(qObj.inputs, ans2).sort().join(',');
      if (idxs1 && idxs2 && idxs1 === idxs2) {
        return true;
      }
    }

    return false;
  }

  function updateConsensusMatrix() {
    const matrixHead = shadowRoot.getElementById('matrixHead');
    const matrixBody = shadowRoot.getElementById('matrixBody');
    const consensusSummary = shadowRoot.getElementById('consensusSummary');

    if (!matrixHead || !matrixBody) return;

    let headHtml = `<tr><th>#</th>`;
    settings.llmModels.forEach(m => {
      headHtml += `<th>${escapeHtml(m.name)}${m.isPrimary ? ' *' : ''}</th>`;
    });
    headHtml += `<th>Consensus</th></tr>`;
    matrixHead.innerHTML = headHtml;

    const parsedMaps = settings.llmModels.map(m => parseAnswerText(m.text));
    const allQNumsSet = new Set();
    parsedMaps.forEach(map => Object.keys(map).forEach(k => allQNumsSet.add(Number(k))));

    const allQNums = Array.from(allQNumsSet).sort((a,b) => a - b);

    if (allQNums.length === 0) {
      matrixBody.innerHTML = `<tr><td colspan="${settings.llmModels.length + 2}" style="text-align:center; color:#71717a;">Paste LLM outputs above</td></tr>`;
      consensusSummary.textContent = '0 Parsed';
      return;
    }

    const questions = getNPTELQuestions();

    let matches = 0;
    let conflicts = 0;
    let rowsHtml = '';

    const primaryIndex = settings.llmModels.findIndex(m => m.isPrimary);

    allQNums.forEach(qNum => {
      const answersForQ = parsedMaps.map(map => map[qNum] || '-');
      const validAnswers = answersForQ.filter(a => a !== '-');
      const qObj = questions.find(q => q.index === qNum);

      let isConsensusMatch = false;

      if (validAnswers.length === 0) {
        isConsensusMatch = false;
      } else if (validAnswers.length === 1) {
        isConsensusMatch = true;
      } else {
        const firstAns = validAnswers[0];
        isConsensusMatch = validAnswers.every(ans => areAnswersMatching(firstAns, ans, qObj));
      }

      let statusBadge = '';

      if (validAnswers.length === 0) {
        statusBadge = `<span style="color:#71717a;">No Data</span>`;
      } else if (isConsensusMatch && validAnswers.length > 1) {
        statusBadge = `<span class="badge-match">Match</span>`;
        matches++;
      } else if (isConsensusMatch) {
        statusBadge = `<span class="badge-match">Single</span>`;
        matches++;
      } else {
        statusBadge = `<span class="badge-conflict">Conflict</span>`;
        conflicts++;
      }

      rowsHtml += `<tr><td><strong>Q${qNum}</strong></td>`;
      answersForQ.forEach((ans, i) => {
        const isPrimaryCol = (i === primaryIndex);
        const displayAns = ans.length > 18 ? ans.substring(0, 18) + '…' : ans;
        rowsHtml += `<td style="${isPrimaryCol ? 'color:#f4f4f5; font-weight:600;' : 'color:#a1a1aa;'}" title="${escapeHtml(ans)}">${escapeHtml(displayAns)}</td>`;
      });
      rowsHtml += `<td>${statusBadge}</td></tr>`;
    });

    matrixBody.innerHTML = rowsHtml;
    consensusSummary.textContent = `${allQNums.length} Qs | ${matches} M | ${conflicts} C`;
  }

  function toggleDrawer() {
    createSideDrawer();
    const overlay = shadowRoot.querySelector('.drawer-overlay');
    overlay.classList.toggle('open');
  }

  function createFloatingTrigger() {
    if (document.getElementById('nptel-floating-trigger')) return;

    const btn = document.createElement('button');
    btn.id = 'nptel-floating-trigger';
    btn.innerHTML = `<span>NPTEL CopyFill</span>`;
    btn.addEventListener('click', toggleDrawer);
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createFloatingTrigger);
  } else {
    createFloatingTrigger();
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'TOGGLE_DRAWER') {
        toggleDrawer();
        sendResponse({ status: 'ok' });
      } else if (request.action === 'RUN_SANITY_CHECK') {
        const mergedMap = getConsensusAnswersMap();
        runSanityCheck(mergedMap);
        sendResponse({ status: 'ok' });
      } else if (request.action === 'HIGHLIGHT_QUESTIONS') {
        const questions = getNPTELQuestions();
        questions.forEach(q => {
          q.container.style.border = '2px solid #52525b';
          setTimeout(() => { q.container.style.border = ''; }, 3000);
        });
        showToast(`Highlighted ${questions.length} questions`);
        sendResponse({ status: 'ok' });
      } else if (request.action === 'SETTINGS_UPDATED') {
        if (request.settings) Object.assign(settings, request.settings);
        sendResponse({ status: 'ok' });
      }
      return true;
    });
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 60px;
      right: 20px;
      z-index: 9999999;
      background: #18181b;
      color: #f4f4f5;
      border: 1px solid #3f3f46;
      padding: 8px 14px;
      border-radius: 6px;
      font-family: -apple-system, sans-serif;
      font-size: 11px;
      font-weight: 500;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      transition: all 0.2s ease;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 2500);
  }

})();
