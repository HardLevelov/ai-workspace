/* =========================================================
   AI Assistant — single-file client-side app
   All state lives in localStorage; API calls go directly
   from the browser to Fireworks AI.
   ========================================================= */

(() => {
    'use strict';

    // ── Constants ──────────────────────────────────────────
    const STORAGE_KEYS = {
        chats: 'ai_chats',
        currentChat: 'ai_current_chat',
        apiKey: 'ai_api_key',
        model: 'ai_model',
        temperature: 'ai_temperature',
        theme: 'ai_theme',
    };

    const MODELS = {
        'accounts/fireworks/models/qwen3p6-plus': 'Qwen 3.6 Plus',
        'accounts/fireworks/models/deepseek-v4-pro': 'DeepSeek V4 Pro',
        'accounts/fireworks/models/kimi-k2p6': 'Kimi 2.6',
    };

    const API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';

    // ── State ─────────────────────────────────────────────
    let chats = {};          // { id: { title, messages: [{role, content}] } }
    let currentChatId = null;
    let isStreaming = false;
    let abortController = null;

    // ── DOM refs ──────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const sidebar       = $('#sidebar');
    const sidebarOverlay= $('#sidebarOverlay');
    const chatList      = $('#chatList');
    const chatMessages  = $('#chatMessages');
    const welcome       = $('#welcome');
    const messageInput  = $('#messageInput');
    const sendBtn       = $('#sendBtn');
    const topbarTitle   = $('#topbarTitle');
    const modelBadge    = $('#modelBadge');
    const settingsModal = $('#settingsModal');
    const apiKeyInput   = $('#apiKeyInput');
    const modelSelect   = $('#modelSelect');
    const tempSlider    = $('#tempSlider');
    const tempValue     = $('#tempValue');

    // ── Persistence helpers ───────────────────────────────
    function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
    function load(key, fallback) {
        try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
        catch { return fallback; }
    }

    function saveChats() { save(STORAGE_KEYS.chats, chats); save(STORAGE_KEYS.currentChat, currentChatId); }
    function getApiKey() { return load(STORAGE_KEYS.apiKey, ''); }
    function getModel() { return load(STORAGE_KEYS.model, 'accounts/fireworks/models/qwen3p6-plus'); }
    function getTemp() { return load(STORAGE_KEYS.temperature, 0.6); }
    function getTheme() { return load(STORAGE_KEYS.theme, 'dark'); }

    // ── Markdown rendering ────────────────────────────────
    function renderMarkdown(text) {
        marked.setOptions({
            highlight: (code, lang) => {
                if (lang && hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                }
                return hljs.highlightAuto(code).value;
            },
            breaks: true,
        });

        let html = marked.parse(text);

        // Wrap code blocks with copy button
        html = html.replace(
            /<pre><code class="language-(\w+)">/g,
            '<pre><div class="code-header"><span>$1</span><button class="btn-copy" onclick="copyCode(this)">Копировать</button></div><code class="language-$1">'
        );
        html = html.replace(
            /<pre><code>/g,
            '<pre><div class="code-header"><span>code</span><button class="btn-copy" onclick="copyCode(this)">Копировать</button></div><code>'
        );

        return html;
    }

    // Global copy function
    window.copyCode = function(btn) {
        const code = btn.closest('pre').querySelector('code').textContent;
        navigator.clipboard.writeText(code).then(() => {
            btn.textContent = 'Скопировано ✓';
            setTimeout(() => btn.textContent = 'Копировать', 1500);
        });
    };

    // ── UI Render ─────────────────────────────────────────
    function renderChatList() {
        chatList.innerHTML = '';
        const ids = Object.keys(chats);
        // newest first
        for (let i = ids.length - 1; i >= 0; i--) {
            const id = ids[i];
            const chat = chats[id];
            const btn = document.createElement('button');
            btn.className = 'chat-item' + (id === currentChatId ? ' active' : '');
            btn.textContent = chat.title || 'Новый чат';
            btn.onclick = () => switchChat(id);
            chatList.appendChild(btn);
        }
    }

    function renderMessages() {
        const chat = chats[currentChatId];
        if (!chat) return;

        topbarTitle.textContent = chat.title || 'Новый чат';

        if (chat.messages.length === 0) {
            welcome.style.display = 'flex';
            chatMessages.classList.remove('visible');
        } else {
            welcome.style.display = 'none';
            chatMessages.classList.add('visible');
            chatMessages.innerHTML = '';
            chat.messages.forEach(msg => {
                appendMessageEl(msg.role, msg.content);
            });
            scrollToBottom();
        }
    }

    function appendMessageEl(role, content, isStreaming = false) {
        const div = document.createElement('div');
        div.className = `message ${role}`;

        const avatarText = role === 'user' ? '👤' : '✨';
        const roleText = role === 'user' ? 'Вы' : 'Ассистент';
        const contentHtml = isStreaming ? '' : renderMarkdown(content);

        div.innerHTML = `
            <div class="message-avatar">${avatarText}</div>
            <div class="message-body">
                <div class="message-role">${roleText}</div>
                <div class="message-content">${contentHtml}</div>
            </div>
        `;

        chatMessages.appendChild(div);

        if (isStreaming) {
            const msgContent = div.querySelector('.message-content');
            msgContent.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
        }

        return div;
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function updateModelBadge() {
        const model = getModel();
        modelBadge.textContent = MODELS[model] || model;
    }

    // ── Chat management ───────────────────────────────────
    function createChat() {
        const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
        chats[id] = { title: 'Новый чат', messages: [] };
        currentChatId = id;
        saveChats();
        renderChatList();
        renderMessages();
        messageInput.focus();
        closeSidebar();
    }

    function switchChat(id) {
        if (isStreaming) return;
        currentChatId = id;
        saveChats();
        renderChatList();
        renderMessages();
        closeSidebar();
    }

    function deleteChat() {
        if (!currentChatId || isStreaming) return;
        if (!confirm('Удалить этот чат?')) return;

        delete chats[currentChatId];
        const ids = Object.keys(chats);
        if (ids.length === 0) {
            createChat();
        } else {
            currentChatId = ids[ids.length - 1];
        }
        saveChats();
        renderChatList();
        renderMessages();
    }

    // ── Toast ─────────────────────────────────────────────
    function showToast(text, isError = false) {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast' + (isError ? ' error' : '');
        toast.textContent = text;
        toast.onclick = () => {
            toast.remove();
            if (!isError) openSettings();
        };
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // ── Send message ──────────────────────────────────────
    async function sendMessage(text) {
        if (!text.trim() || isStreaming) return;

        const apiKey = getApiKey();
        if (!apiKey) {
            showToast('🔑 Сначала добавьте API-ключ в настройках', true);
            openSettings();
            return;
        }

        const chat = chats[currentChatId];

        // Auto-title from first message
        if (chat.messages.length === 0) {
            chat.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
            renderChatList();
        }

        // Show welcome → messages
        welcome.style.display = 'none';
        chatMessages.classList.add('visible');

        // Add user message
        chat.messages.push({ role: 'user', content: text });
        appendMessageEl('user', text);
        scrollToBottom();
        saveChats();

        // Clear input
        messageInput.value = '';
        autoResize();

        // Start streaming
        isStreaming = true;
        sendBtn.disabled = true;

        const assistantEl = appendMessageEl('assistant', '', true);
        const contentEl = assistantEl.querySelector('.message-content');
        scrollToBottom();

        let fullResponse = '';
        abortController = new AbortController();

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: getModel(),
                    max_tokens: 16000,
                    temperature: getTemp(),
                    messages: chat.messages.map(m => ({ role: m.role, content: m.content })),
                    stream: true,
                }),
                signal: abortController.signal,
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `HTTP ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') break;

                    try {
                        const chunk = JSON.parse(data);
                        const content = chunk.choices?.[0]?.delta?.content;
                        if (content) {
                            fullResponse += content;
                            contentEl.innerHTML = renderMarkdown(fullResponse);
                            scrollToBottom();
                        }
                    } catch { /* skip bad chunk */ }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                fullResponse += '\n\n*⏹ Генерация остановлена*';
            } else {
                fullResponse = `❌ Ошибка: ${err.message}`;
                showToast('Ошибка при запросе к API', true);
            }
        }

        contentEl.innerHTML = renderMarkdown(fullResponse || '⚠️ Пустой ответ от модели');

        // Highlight any remaining code blocks
        contentEl.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });

        chat.messages.push({ role: 'assistant', content: fullResponse });
        saveChats();
        renderChatList();

        isStreaming = false;
        sendBtn.disabled = false;
        abortController = null;
        scrollToBottom();
    }

    // ── Textarea auto-resize ──────────────────────────────
    function autoResize() {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
    }

    // ── Sidebar ───────────────────────────────────────────
    function openSidebar() {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('open');
    }
    function closeSidebar() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('open');
    }

    // ── Settings ──────────────────────────────────────────
    function openSettings() {
        apiKeyInput.value = getApiKey();
        modelSelect.value = getModel();
        tempSlider.value = getTemp();
        tempValue.textContent = getTemp();

        const theme = getTheme();
        document.querySelectorAll('.theme-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.theme === theme);
        });

        settingsModal.classList.add('open');
    }

    function closeSettings() {
        // Save all on close
        save(STORAGE_KEYS.apiKey, apiKeyInput.value.trim());
        save(STORAGE_KEYS.model, modelSelect.value);
        save(STORAGE_KEYS.temperature, parseFloat(tempSlider.value));
        updateModelBadge();
        settingsModal.classList.remove('open');
    }

    // ── Theme ─────────────────────────────────────────────
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        save(STORAGE_KEYS.theme, theme);
    }

    // ── Event listeners ───────────────────────────────────
    function bindEvents() {
        // Sidebar
        $('#sidebarToggle').onclick = openSidebar;
        $('#sidebarClose').onclick = closeSidebar;
        sidebarOverlay.onclick = closeSidebar;

        // New chat
        $('#newChatBtn').onclick = createChat;

        // Delete chat
        $('#deleteChatBtn').onclick = deleteChat;

        // Settings
        $('#settingsBtn').onclick = openSettings;
        $('#settingsClose').onclick = closeSettings;
        settingsModal.onclick = (e) => { if (e.target === settingsModal) closeSettings(); };

        // API key visibility toggle
        $('#toggleKeyVisibility').onclick = () => {
            apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
        };

        // Temperature slider
        tempSlider.oninput = () => { tempValue.textContent = tempSlider.value; };

        // Theme buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyTheme(btn.dataset.theme);
            };
        });

        // Clear all data
        $('#clearAllData').onclick = () => {
            if (!confirm('Все чаты и настройки будут удалены. Продолжить?')) return;
            Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
            location.reload();
        };

        // Send message
        sendBtn.onclick = () => sendMessage(messageInput.value);

        messageInput.oninput = autoResize;
        messageInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(messageInput.value);
            }
        };

        // Suggestions
        document.querySelectorAll('.suggestion').forEach(btn => {
            btn.onclick = () => {
                const prompt = btn.dataset.prompt;
                messageInput.value = prompt;
                sendMessage(prompt);
            };
        });

        // Escape key closes modal/sidebar
        document.onkeydown = (e) => {
            if (e.key === 'Escape') {
                if (settingsModal.classList.contains('open')) closeSettings();
                else closeSidebar();

                // Stop streaming
                if (isStreaming && abortController) {
                    abortController.abort();
                }
            }
        };
    }

    // ── Init ──────────────────────────────────────────────
    function init() {
        // Load state
        chats = load(STORAGE_KEYS.chats, {});
        currentChatId = load(STORAGE_KEYS.currentChat, null);

        // Ensure at least one chat exists
        if (!currentChatId || !chats[currentChatId]) {
            const ids = Object.keys(chats);
            if (ids.length > 0) {
                currentChatId = ids[ids.length - 1];
            } else {
                const id = Date.now().toString(36);
                chats[id] = { title: 'Новый чат', messages: [] };
                currentChatId = id;
            }
            saveChats();
        }

        // Apply theme
        applyTheme(getTheme());

        // Render
        renderChatList();
        renderMessages();
        updateModelBadge();
        bindEvents();

        // Show hint if no API key
        if (!getApiKey()) {
            setTimeout(() => showToast('👋 Добавьте API-ключ в настройках для начала работы'), 500);
        }
    }

    init();
})();
