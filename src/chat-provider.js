// DeepSeekChatProvider — основной класс для интеграции AI-чата в VS Code
const vscode = require('vscode');
const DeepSeekClient = require('./deepseek-client');

class DeepSeekChatProvider {
    constructor() {
        // Ссылка на webview-панель
        this._view = null;
        // История сообщений чата
        this._conversationHistory = [];
        // Флаг обработки сообщения
        this._isProcessing = false;
    }

    /**
     * Инициализация webview-панели и обработка событий от webview
     */
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;

        // Получаем настройки
        const config = vscode.workspace.getConfiguration('deepseek');
        const windowPosition = config.get('windowPosition', 'right');
        const autoScroll = config.get('autoScroll', true);
        const showWelcome = config.get('showWelcome', true);
        const theme = config.get('theme', 'auto');
        const showFeatures = config.get('showFeatures', true);

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'media')
            ]
        };

        // Передаем настройки в webview через глобальный JS-объект
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, {
            windowPosition,
            autoScroll,
            showWelcome,
            theme,
            showFeatures
        });

        // Обработка сообщений от webview (UI)
        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'sendMessage':
                    await this._handleUserMessage(data.value);
                    break;
                case 'clearChat':
                    this._conversationHistory = [];
                    this._updateWebview();
                    break;
                case 'insertCode':
                    await this._insertCodeToEditor(data.value);
                    break;
                case 'closeSidebar':
                    // Закрываем боковую панель VS Code
                    vscode.commands.executeCommand('workbench.action.closeSidebar');
                    break;
                case 'openSettings':
                    // Открываем настройки расширения
                    vscode.commands.executeCommand('workbench.action.openSettings', 'deepseek');
                    break;
                case 'newChat':
                    this._conversationHistory = [];
                    this._updateWebview();
                    vscode.window.showInformationMessage('Начат новый чат');
                    break;
                case 'copyChat':
                    try {
                        const plain = this._conversationHistory.map(m => `${m.role === 'user' ? 'Вы' : 'DeepSeek'}: ${m.content}`).join('\n\n');
                        await vscode.env.clipboard.writeText(plain);
                        vscode.window.showInformationMessage('История чата скопирована в буфер обмена');
                    } catch (e) {
                        vscode.window.showErrorMessage('Не удалось скопировать историю чата');
                    }
                    break;
                case 'exportChat':
                    try {
                        const uri = await vscode.window.showSaveDialog({
                            filters: { 'Markdown': ['md'], 'Text': ['txt'] },
                            saveLabel: 'Сохранить историю чата'
                        });
                        if (uri) {
                            const md = this._conversationHistory.map(m => `**${m.role === 'user' ? 'Вы' : 'DeepSeek'}**: ${m.content}`).join('\n\n');
                            await vscode.workspace.fs.writeFile(uri, Buffer.from(md, 'utf8'));
                            vscode.window.showInformationMessage('История чата сохранена');
                        }
                    } catch (e) {
                        vscode.window.showErrorMessage('Не удалось сохранить историю чата');
                    }
                    break;
                case 'refreshChat':
                    this._updateWebview();
                    break;
                case 'openReadmeView':
                    vscode.commands.executeCommand('workbench.view.extension.deepseek-readme-container');
                    vscode.commands.executeCommand('workbench.view.extension.deepseek-readme-view');
                    break;
            }
        });
    }

    /**
     * Показывает панель чата, если она уже создана
     */
    showChatPanel() {
        if (this._view) {
            this._view.show?.(true);
        }
    }

    /**
     * Отправляет сообщение в чат и показывает панель
     */
    async sendMessage(message) {
        if (this._view) {
            this._view.show?.(true);
            await this._handleUserMessage(message);
        }
    }

    /**
     * Обрабатывает пользовательское сообщение: добавляет в историю, отправляет в AI, обновляет UI
     */
    async _handleUserMessage(message) {
        if (!message.trim() || this._isProcessing) return;

        this._isProcessing = true;

        // Добавляем сообщение пользователя в историю
        this._conversationHistory.push({ 
            role: 'user', 
            content: message,
            timestamp: new Date().toLocaleTimeString('ru-RU')
        });
        this._updateWebview();

        try {
            const config = vscode.workspace.getConfiguration('deepseek');
            const apiKey = config.get('apiKey');
            const model = config.get('model') || 'deepseek-chat';

            if (!apiKey) {
                this._conversationHistory.push({ 
                    role: 'assistant', 
                    content: '❌ **API ключ не настроен!**\n\nПожалуйста, установите ваш DeepSeek API ключ в настройках VS Code:\n1. Откройте Настройки (Ctrl+,)\n2. Найдите "DeepSeek"\n3. Введите ваш API ключ\n\nПолучить ключ можно на platform.deepseek.com',
                    timestamp: new Date().toLocaleTimeString('ru-RU')
                });
                this._updateWebview();
                return;
            }

            // Показываем индикатор набора
            this._showTypingIndicator();

            // Получаем ответ от AI
            const response = await this._getDeepSeekResponse(message, apiKey, model);

            // Убираем индикатор набора
            this._hideTypingIndicator();

            // Добавляем ответ AI в историю
            this._conversationHistory.push({ 
                role: 'assistant', 
                content: response,
                timestamp: new Date().toLocaleTimeString('ru-RU')
            });

        } catch (error) {
            this._hideTypingIndicator();
            this._conversationHistory.push({ 
                role: 'assistant', 
                content: `❌ **Ошибка:** ${error.message}`,
                timestamp: new Date().toLocaleTimeString('ru-RU')
            });
        } finally {
            this._isProcessing = false;
            this._updateWebview();
        }
    }

    /**
     * Получает ответ от DeepSeek AI через DeepSeekClient
     */
    async _getDeepSeekResponse(message, apiKey, model) {
        // Системный промпт для AI
        const systemPrompt = `Ты DeepSeek AI помощник, интегрированный в VS Code. Ты помогаешь пользователям с программированием, объяснением кода, отладкой и общими вопросами.

🤖 **Твоя роль:**
- AI-помощник для программирования
- Эксперт по коду и разработке
- Дружелюбный и профессиональный

📋 **Инструкции:**
- Отвечай на русском языке
- Будь полезным и точным
- Предоставляй примеры кода когда это уместно
- Объясняй сложные концепции простым языком
- Помоги пользователю стать лучшим разработчиком

🎨 **Форматирование:**
- Используй **жирный текст** для важных моментов
- Используй блоки кода для примеров
- Структурируй ответы для лучшей читаемости
- Добавляй эмодзи для лучшего восприятия

💡 **Стиль общения:**
- Будь дружелюбным и профессиональным
- Используй современный язык
- Структурируй ответы с заголовками
- Предлагай дополнительные решения`;

        // Формируем историю сообщений для AI
        const messages = [
            { role: 'system', content: systemPrompt },
            ...this._conversationHistory.slice(-8).map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            { role: 'user', content: message }
        ];

        // Используем DeepSeekClient для общения с API
        const client = new DeepSeekClient(apiKey, model);
        return await client.chatCompletion(messages);
    }

    /**
     * Показывает индикатор "AI печатает..." в UI
     */
    _showTypingIndicator() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'typingStart'
            });
        }
    }

    /**
     * Скрывает индикатор "AI печатает..."
     */
    _hideTypingIndicator() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'typingEnd'
            });
        }
    }

    /**
     * Вставляет сгенерированный код в редактор VS Code
     */
    async _insertCodeToEditor(code) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            // Извлекаем чистый код из markdown-блоков
            const cleanCode = code.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();

            await editor.edit(editBuilder => {
                if (editor.selection.isEmpty) {
                    // Вставляем в текущую позицию курсора
                    const position = editor.selection.active;
                    editBuilder.insert(position, cleanCode);
                } else {
                    // Заменяем выделенный текст
                    editBuilder.replace(editor.selection, cleanCode);
                }
            });

            vscode.window.showInformationMessage('Код вставлен в редактор!');
        } else {
            vscode.window.showWarningMessage('Откройте файл для вставки кода');
        }
    }

    /**
     * Обновляет UI webview с актуальной историей чата
     */
    _updateWebview() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateChat',
                history: this._conversationHistory
            });
        }
    }

    /**
     * Генерирует HTML для webview (UI чата)
     */
    _getHtmlForWebview(webview, settings = {}) {
        return `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>DeepSeek Chat</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #f6f8fa;
                    color: #24292f;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    font-size: 14px;
                    line-height: 1.5;
                }
                
                .chat-container {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #ffffff;
                }
                
                .chat-header {
                    padding: 16px 20px;
                    background: #ffffff;
                    border-bottom: 1px solid #d0d7de;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                
                .header-title {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .header-icon {
                    width: 32px;
                    height: 32px;
                    background: linear-gradient(135deg, #00D4AA 0%, #00A8CC 100%);
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    color: white;
                }
                
                .header-text {
                    display: flex;
                    flex-direction: column;
                }
                
                .header-main {
                    font-weight: 600;
                    font-size: 16px;
                    color: #24292f;
                }
                
                .header-sub {
                    font-size: 12px;
                    color: #656d76;
                    margin-top: 2px;
                }
                
                .chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                }
                
                .message {
                    padding: 16px 20px;
                    border-bottom: 1px solid #f1f3f4;
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                }
                
                .message:last-child {
                    border-bottom: none;
                }
                
                .user-message {
                    background: #f6f8fa;
                }
                
                .assistant-message {
                    background: #ffffff;
                }
                
                .message-avatar {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    font-weight: 600;
                    border: 2px solid #ffffff;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                
                .user-message .message-avatar {
                    background: #0969da;
                    color: white;
                }
                
                .assistant-message .message-avatar {
                    background: linear-gradient(135deg, #00D4AA 0%, #00A8CC 100%);
                    color: white;
                }
                
                .message-content {
                    flex: 1;
                    line-height: 1.6;
                    word-wrap: break-word;
                }
                
                .message-content p {
                    margin: 0 0 8px 0;
                }
                
                .message-content p:last-child {
                    margin-bottom: 0;
                }
                
                .message-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 6px;
                    font-size: 11px;
                    opacity: 0.8;
                }
                
                .message-content {
                    white-space: pre-wrap;
                }
                
                .message-content code {
                    background: #f1f3f4;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
                    font-size: 13px;
                    color: #24292f;
                }
                
                .message-content pre {
                    background: #f6f8fa;
                    padding: 16px;
                    border-radius: 8px;
                    overflow-x: auto;
                    margin: 12px 0;
                    border: 1px solid #d0d7de;
                    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
                    font-size: 13px;
                    line-height: 1.45;
                }
                
                .message-content pre code {
                    background: none;
                    padding: 0;
                    color: #24292f;
                }
                
                .code-actions {
                    margin-top: 8px;
                    display: flex;
                    gap: 8px;
                }
                
                .code-action-btn {
                    padding: 4px 8px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 11px;
                }
                
                .code-action-btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                
                .chat-input-container {
                    padding: 16px 20px;
                    border-top: 1px solid #d0d7de;
                    background: #ffffff;
                    position: sticky;
                    bottom: 0;
                }
                
                .chat-input {
                    width: 100%;
                    padding: 12px 16px;
                    background: #ffffff;
                    border: 1px solid #d0d7de;
                    color: #24292f;
                    border-radius: 8px;
                    resize: none;
                    font-family: inherit;
                    font-size: 14px;
                    line-height: 1.5;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    transition: border-color 0.2s ease;
                }
                
                .chat-input:focus {
                    outline: none;
                    border-color: #0969da;
                    box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
                }
                
                .chat-controls {
                    display: flex;
                    gap: 10px;
                    margin-top: 10px;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .btn {
                    padding: 8px 16px;
                    background: #0969da;
                    color: #ffffff;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: background-color 0.2s ease;
                }
                
                .btn:hover {
                    background: #0860ca;
                }
                
                .btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    background: #8b949e;
                }
                
                .btn-secondary {
                    background: #ffffff;
                    color: #24292f;
                    border: 1px solid #d0d7de;
                }
                
                .btn-secondary:hover {
                    background: #f6f8fa;
                }
                
                .typing-indicator {
                    padding: 12px 16px;
                    align-self: flex-start;
                    background: var(--vscode-input-background);
                    border-radius: 12px;
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                    border: 1px solid var(--vscode-input-border);
                    display: none;
                }
                
                .typing-dots {
                    display: inline-block;
                }
                
                .typing-dots::after {
                    content: '...';
                    animation: typing 1.5s infinite;
                }
                
                @keyframes typing {
                    0%, 20% { content: '.'; }
                    40% { content: '..'; }
                    60%, 100% { content: '...'; }
                }
                
                .empty-state {
                    text-align: center;
                    color: #656d76;
                    padding: 40px 20px;
                    line-height: 1.6;
                }
                
                .empty-icon {
                    width: 64px;
                    height: 64px;
                    background: linear-gradient(135deg, #00D4AA 0%, #00A8CC 100%);
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    color: white;
                    margin: 0 auto 20px;
                }
                
                .empty-state h3 {
                    margin-bottom: 16px;
                    color: #24292f;
                    font-size: 20px;
                    font-weight: 600;
                }
                
                .features-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                    max-width: 400px;
                    margin: 20px auto;
                }
                
                .feature-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px;
                    background: #f6f8fa;
                    border-radius: 8px;
                    border: 1px solid #d0d7de;
                }
                
                .feature-icon {
                    font-size: 16px;
                }
                
                .feature-text {
                    font-size: 14px;
                    color: #24292f;
                }
                
                .start-hint {
                    margin-top: 24px;
                    font-style: italic;
                    color: #0969da;
                    font-size: 14px;
                }
                
                .status-info {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <div class="topbar">
                <button class="topbar-btn" id="newChatBtn" title="Новый чат">🆕</button>
                <button class="topbar-btn" id="copyBtn" title="Копировать последние ответы">📋</button>
                <button class="topbar-btn" id="exportBtn" title="Экспорт истории в файл">💾</button>
                <button class="topbar-btn" id="refreshBtn" title="Обновить">🔄</button>
                <button class="topbar-btn" id="readmeBtn" title="Открыть README">📖</button>
                <span style="flex:1"></span>
                <button class="topbar-btn" id="settingsBtn" title="Настройки">⚙️</button>
                <button class="topbar-btn" id="closeBtn" title="Закрыть">✖</button>
            </div>
            <div class="chat-container">
                <div class="chat-header">
                    <div class="header-title">
                        <div class="header-icon">D</div>
                        <div class="header-text">
                            <div class="header-main">DeepSeek Chat</div>
                            <div class="header-sub">AI-помощник для программирования</div>
                        </div>
                    </div>
                    <button class="btn btn-secondary" id="clearBtn">Очистить</button>
                </div>
                
                <div class="chat-messages" id="chatMessages">
                    <div class="empty-state">
                        <h3>Добро пожаловать в DeepSeek Chat!</h3>
                        <p>Я ваш AI-помощник для программирования.</p>
                        <p>Задавайте вопросы, обсуждайте код, или используйте команды из контекстного меню.</p>
                    </div>
                </div>
                
                <div class="typing-indicator" id="typingIndicator">
                    <span class="typing-dots">DeepSeek печатает</span>
                </div>
                
                <div class="chat-input-container">
                    <textarea 
                        class="chat-input" 
                        id="messageInput" 
                        placeholder="Введите ваше сообщение... (Enter для отправки, Shift+Enter для новой строки)"
                        rows="2"
                    ></textarea>
                    <div class="chat-controls">
                        <div class="status-info" id="statusInfo">
                            Готов к работе
                        </div>
                        <div>
                            <button class="btn" id="sendBtn" disabled>Отправить</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                const chatMessages = document.getElementById('chatMessages');
                const messageInput = document.getElementById('messageInput');
                const sendBtn = document.getElementById('sendBtn');
                const clearBtn = document.getElementById('clearBtn');
                const typingIndicator = document.getElementById('typingIndicator');
                const statusInfo = document.getElementById('statusInfo');
                const closeBtn = document.getElementById('closeBtn');
                const settingsBtn = document.getElementById('settingsBtn');
                const newChatBtn = document.getElementById('newChatBtn');
                const copyBtn = document.getElementById('copyBtn');
                const exportBtn = document.getElementById('exportBtn');
                const refreshBtn = document.getElementById('refreshBtn');
                const readmeBtn = document.getElementById('readmeBtn');
                
                // Обработчик сообщений от расширения
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'updateChat':
                            updateChatDisplay(message.history);
                            break;
                        case 'typingStart':
                            showTypingIndicator();
                            break;
                        case 'typingEnd':
                            hideTypingIndicator();
                            break;
                    }
                });

                // Кнопки верхней панели
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'closeSidebar' });
                    });
                }
                if (settingsBtn) {
                    settingsBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'openSettings' });
                    });
                }
                if (newChatBtn) {
                    newChatBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'newChat' });
                    });
                }
                if (copyBtn) {
                    copyBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'copyChat' });
                    });
                }
                if (exportBtn) {
                    exportBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'exportChat' });
                    });
                }
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'refreshChat' });
                    });
                }
                if (readmeBtn) {
                    readmeBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'openReadmeView' });
                    });
                }
                
                // Внутри <script> webview:
                window.deepseekSettings = window.deepseekSettings || {};
                const { autoScroll, showWelcome, theme, showFeatures } = window.deepseekSettings;

                // Применяем тему
                if (theme && theme !== 'auto') {
                    document.body.classList.add('theme-' + theme);
                }

                // Автоскролл
                function scrollToBottom() {
                    if (autoScroll !== false && chatMessages) {
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                }

                // Модифицируем updateChatDisplay для showWelcome/showFeatures
                function updateChatDisplay(history) {
                    chatMessages.innerHTML = '';
                    if (history.length === 0 && showWelcome !== false) {
                        chatMessages.innerHTML = \`
                            <div class="empty-state">
                                <div class="empty-icon">D</div>
                                <h3>Добро пожаловать в DeepSeek Chat!</h3>
                                <p>Я ваш AI-помощник для программирования.</p>
                                ${showFeatures !== false ? `<p>Могу помочь с:</p>
                                <div class="features-grid">
                                    <div class="feature-item"><div class="feature-icon">📖</div><div class="feature-text">Объяснение кода</div></div>
                                    <div class="feature-item"><div class="feature-icon">✨</div><div class="feature-text">Генерация кода</div></div>
                                    <div class="feature-item"><div class="feature-icon">🔧</div><div class="feature-text">Рефакторинг</div></div>
                                    <div class="feature-item"><div class="feature-icon">🐛</div><div class="feature-text">Отладка</div></div>
                                </div>` : ''}
                                <p class="start-hint">Начните общение, задав вопрос или выделив код!</p>
                            </div>
                        \`;
                        scrollToBottom();
                        return;
                    }
                    
                    history.forEach(msg => {
                        const messageDiv = document.createElement('div');
                        messageDiv.className = \`message \${msg.role === 'user' ? 'user-message' : 'assistant-message'}\`;
                        
                        // Аватар
                        const avatarDiv = document.createElement('div');
                        avatarDiv.className = 'message-avatar';
                        avatarDiv.textContent = msg.role === 'user' ? 'В' : 'D';
                        
                        // Контент сообщения
                        const contentDiv = document.createElement('div');
                        contentDiv.className = 'message-content';
                        contentDiv.innerHTML = formatMessage(msg.content);
                        
                        messageDiv.appendChild(avatarDiv);
                        messageDiv.appendChild(contentDiv);
                        
                        // Добавляем кнопки для кодовых блоков
                        const codeBlocks = contentDiv.querySelectorAll('pre');
                        if (codeBlocks.length > 0) {
                            const actionsDiv = document.createElement('div');
                            actionsDiv.className = 'code-actions';
                            
                            const insertBtn = document.createElement('button');
                            insertBtn.className = 'code-action-btn';
                            insertBtn.textContent = '📋 Вставить код';
                            insertBtn.onclick = () => {
                                const code = codeBlocks[0].textContent;
                                vscode.postMessage({ 
                                    type: 'insertCode', 
                                    value: code 
                                });
                            };
                            
                            actionsDiv.appendChild(insertBtn);
                            messageDiv.appendChild(actionsDiv);
                        }
                        
                        chatMessages.appendChild(messageDiv);
                    });
                    
                    scrollToBottom();
                    updateSendButton();
                }
                
                // Форматирование сообщений (Markdown-like)
                function formatMessage(content) {
                    return content
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                        .replace(/`(.*?)`/g, '<code>$1</code>')
                        .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
                        .replace(/\n/g, '<br>');
                }
                
                // Показать индикатор набора
                function showTypingIndicator() {
                    typingIndicator.style.display = 'block';
                    statusInfo.textContent = 'DeepSeek печатает...';
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                
                // Скрыть индикатор набора
                function hideTypingIndicator() {
                    typingIndicator.style.display = 'none';
                    statusInfo.textContent = 'Готов к работе';
                }
                
                // Отправка сообщения
                function sendMessage() {
                    const message = messageInput.value.trim();
                    if (message) {
                        vscode.postMessage({
                            type: 'sendMessage',
                            value: message
                        });
                        messageInput.value = '';
                        updateSendButton();
                        statusInfo.textContent = 'Отправка...';
                    }
                }
                
                // Обновление состояния кнопки отправки
                function updateSendButton() {
                    const hasText = messageInput.value.trim().length > 0;
                    sendBtn.disabled = !hasText;
                }
                
                // Обработчики событий
                sendBtn.addEventListener('click', sendMessage);
                
                messageInput.addEventListener('input', updateSendButton);
                
                messageInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                });
                
                clearBtn.addEventListener('click', () => {
                    if (confirm('Очистить всю историю чата?')) {
                        vscode.postMessage({ type: 'clearChat' });
                    }
                });
                
                // Фокус на поле ввода
                messageInput.focus();
                
                // Инициализация
                updateSendButton();
            </script>
        </body>
        </html>`;
    }
}

module.exports = DeepSeekChatProvider;