// Default system prompt template
const DEFAULT_SYSTEM_PROMPT = `Please provide the correct answers for each question below strictly in the following format:
1. exact answer
2. exact answer
...
Example:
1. A
2. C
3. B
Do not include extra explanations or conversational text.`;

document.addEventListener('DOMContentLoaded', async () => {
  const unblockCopyToggle = document.getElementById('unblockCopyToggle');
  const autoAppendPromptToggle = document.getElementById('autoAppendPromptToggle');
  const systemPromptInput = document.getElementById('systemPromptInput');
  const toggleDrawerBtn = document.getElementById('toggleDrawerBtn');
  const savePromptBtn = document.getElementById('savePromptBtn');
  const saveStatus = document.getElementById('saveStatus');

  // Load saved preferences
  let data = await chrome.storage.local.get({
    unblockCopy: true,
    autoAppendPrompt: true,
    systemPrompt: DEFAULT_SYSTEM_PROMPT
  });

  // Auto-migrate old prompt if it still contains old 'Option letter or exact answer' text
  if (data.systemPrompt && data.systemPrompt.includes('Option letter or exact answer')) {
    data.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    chrome.storage.local.set({ systemPrompt: DEFAULT_SYSTEM_PROMPT });
  }

  unblockCopyToggle.checked = data.unblockCopy;
  autoAppendPromptToggle.checked = data.autoAppendPrompt;
  systemPromptInput.value = data.systemPrompt;

  // Sync settings helper
  const syncSettings = () => {
    const settings = {
      unblockCopy: unblockCopyToggle.checked,
      autoAppendPrompt: autoAppendPromptToggle.checked,
      systemPrompt: systemPromptInput.value.trim()
    };
    chrome.storage.local.set(settings);
    sendMessageToActiveTab({ action: 'SETTINGS_UPDATED', settings });
  };

  // Event Listeners for Toggles
  unblockCopyToggle.addEventListener('change', syncSettings);
  autoAppendPromptToggle.addEventListener('change', syncSettings);

  const resetPromptBtn = document.getElementById('resetPromptBtn');

  // Save Prompt Button
  if (savePromptBtn) {
    savePromptBtn.addEventListener('click', () => {
      syncSettings();
      if (saveStatus) {
        saveStatus.innerText = 'Saved!';
        saveStatus.classList.remove('hidden');
        setTimeout(() => saveStatus.classList.add('hidden'), 2000);
      }
    });
  }

  // Reset Prompt Button
  if (resetPromptBtn) {
    resetPromptBtn.addEventListener('click', () => {
      systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
      syncSettings();
      if (saveStatus) {
        saveStatus.innerText = 'Reset to Default!';
        saveStatus.classList.remove('hidden');
        setTimeout(() => saveStatus.classList.add('hidden'), 2000);
      }
    });
  }

  // Toggle Drawer Button
  if (toggleDrawerBtn) {
    toggleDrawerBtn.addEventListener('click', () => {
      sendMessageToActiveTab({ action: 'TOGGLE_DRAWER' });
      setTimeout(() => window.close(), 150);
    });
  }
});

// Helper function to send messages to active NPTEL tab with automatic fallback injection
function sendMessageToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      const tabId = tabs[0].id;
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          // Fallback: Inject content script programmatically if connection failed
          if (chrome.scripting) {
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['content/content.js']
            }).then(() => {
              chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ['content/content.css']
              }).catch(() => {});
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, message).catch(() => {});
              }, 120);
            }).catch(err => {
              console.log('Script injection info:', err);
            });
          }
        }
      });
    }
  });
}
