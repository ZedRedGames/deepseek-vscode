const vscode = require('vscode');
const axios = require('axios');

class DeepSeekChatProvider {
    constructor() {
        this._view = null;
        this._conversationHistory = [];
        this._isProcessing = false;
    }
    
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'media')
            ]
        };
        
        // Инициализируем HTML содержимое
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        
        // Обработка сообщений из вебвью
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
            }
        });
    }
    
    showChatPanel() {
        if (this._view) {
            this._view.show?.(true);
        }
    }
    
    async sendMessage(message) {
        if (this._view) {
            this._view.show?.(true);
            await this._handleUserMessage(message);
        }
    }
    
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
            
            const response = await this._getDeepSeekResponse(message, apiKey, model);
            
            // Убираем индикатор набора
            this._hideTypingIndicator();
            
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
    
    async _getDeepSeekResponse(message, apiKey, model) {
        const client = axios.create({
            baseURL: 'https://api.deepseek.com/v1',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        // Системный промпт на русском
        const systemPrompt = `Ты DeepSeek AI помощник, интегрированный в VS Code. Ты помогаешь пользователям с программированием, объяснением кода, отладкой и общими вопросами. 

Важные инструкции:
- Отвечай на русском языке
- Будь полезным и точным
- Предоставляй примеры кода когда это уместно
- Объясняй сложные концепции простым языком
- Помоги пользователю стать лучшим разработчиком

Форматирование:
- Используй **жирный текст** для важных моментов
- Используй блоки кода для примеров
- Структурируй ответы для лучшей читаемости`;

        const messages = [
            {
                role: 'system',
                content: systemPrompt
            },
            ...this._conversationHistory.slice(-8).map(msg => ({
                role: msg.role,
                content: msg.content
            }))
        ];
        
        const response = await client.post('/chat/completions', {
            model: model,
            messages: messages,
            max_tokens: 4000,
            temperature: 0.7,
            stream: false
        });
        
        return response.data.choices[0].message.content;
    }
    
    _showTypingIndicator() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'typingStart'
            });
        }
    }
    
    _hideTypingIndicator() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'typingEnd'
            });
        }
    }
    
    async _insertCodeToEditor(code) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            // Извлекаем чистый код из markdown блоков если есть
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
    
    _updateWebview() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateChat',
                history: this._conversationHistory
            });
        }
    }
    
    _getHtmlForWebview(webview) {
        return `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>DeepSeek Чат</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: var(--vscode-font-family);
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    font-size: 13px;
                }
                
                .chat-container {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }
                
                .chat-header {
                    padding: 12px 16px;
                    background: var(--vscode-titleBar-activeBackground);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .header-title {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .header-icon {
                    font-size: 20px;
                }
                
                .header-text {
                    display: flex;
                    flex-direction: column;
                }
                
                .header-main {
                    font-weight: 600;
                    font-size: 14px;
                    color: var(--vscode-foreground);
                }
                
                .header-sub {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 2px;
                }
                
                .chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                
                .message {
                    max-width: 85%;
                    margin-bottom: 20px;
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                }
                
                .user-message {
                    flex-direction: row-reverse;
                }
                
                .assistant-message {
                    flex-direction: row;
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
                    font-weight: bold;
                }
                
                .user-message .message-avatar {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                
                .assistant-message .message-avatar {
                    background: linear-gradient(135deg, #00D4AA 0%, #00A8CC 100%);
                    color: white;
                }
                
                .message-content {
                    background: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 12px;
                    padding: 12px 16px;
                    line-height: 1.6;
                    word-wrap: break-word;
                    position: relative;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                
                .user-message .message-content {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border-color: var(--vscode-button-border);
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
                    background: var(--vscode-textCodeBlock-background);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 12px;
                }
                
                .message-content pre {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 12px;
                    border-radius: 6px;
                    overflow-x: auto;
                    margin: 8px 0;
                    border: 1px solid var(--vscode-panel-border);
                }
                
                .message-content pre code {
                    background: none;
                    padding: 0;
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
                    padding: 16px;
                    border-top: 1px solid var(--vscode-panel-border);
                    background: var(--vscode-editor-background);
                }
                
                .chat-input {
                    width: 100%;
                    padding: 10px 12px;
                    background: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    color: var(--vscode-input-foreground);
                    border-radius: 6px;
                    resize: none;
                    font-family: inherit;
                    font-size: 13px;
                    line-height: 1.4;
                }
                
                .chat-input:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
                
                .chat-controls {
                    display: flex;
                    gap: 10px;
                    margin-top: 10px;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .btn {
                    padding: 6px 12px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                }
                
                .btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                
                .btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                
                .btn-secondary {
                    background: transparent;
                    border: 1px solid var(--vscode-button-border);
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
                    color: var(--vscode-descriptionForeground);
                    padding: 40px 20px;
                    line-height: 1.6;
                }
                
                .empty-state h3 {
                    margin-bottom: 8px;
                    color: var(--vscode-foreground);
                }
                
                .status-info {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <div class="chat-container">
                <div class="chat-header">
                    <div class="header-title">
                        <div class="header-icon">🤖</div>
                        <div class="header-text">
                            <div class="header-main">DeepSeek Chat</div>
                            <div class="header-sub">AI-помощник для программирования</div>
                        </div>
                    </div>
                    <button class="btn btn-secondary" id="clearBtn">🗑️ Очистить</button>
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
                
                // Обновление отображения чата
                function updateChatDisplay(history) {
                    chatMessages.innerHTML = '';
                    
                    if (history.length === 0) {
                        chatMessages.innerHTML = \`
                            <div class="empty-state">
                                <h3>Добро пожаловать в DeepSeek Chat!</h3>
                                <p>Я ваш AI-помощник для программирования.</p>
                                <p>Задавайте вопросы, обсуждайте код, или используйте команды из контекстного меню.</p>
                            </div>
                        \`;
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
                        
                        // Время
                        const timeDiv = document.createElement('div');
                        timeDiv.style.fontSize = '11px';
                        timeDiv.style.color = 'var(--vscode-descriptionForeground)';
                        timeDiv.style.marginTop = '4px';
                        timeDiv.textContent = msg.timestamp || '';
                        
                        const contentWrapper = document.createElement('div');
                        contentWrapper.style.flex = '1';
                        contentWrapper.appendChild(contentDiv);
                        contentWrapper.appendChild(timeDiv);
                        
                        messageDiv.appendChild(avatarDiv);
                        messageDiv.appendChild(contentWrapper);
                        
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
                    
                    chatMessages.scrollTop = chatMessages.scrollHeight;
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