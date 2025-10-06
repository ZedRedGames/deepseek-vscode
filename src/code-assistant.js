const vscode = require("vscode");
const DeepSeekClient = require("./deepseek-client");

class DeepSeekCodeAssistant {
  constructor() {
    this.client = null;
    this._initializeClient();
  }

  _initializeClient() {
    const config = vscode.workspace.getConfiguration("deepseek");
    const apiKey = config.get("apiKey");
    const model = config.get("model") || "deepseek-coder";

    if (apiKey) {
      this.client = new DeepSeekClient(apiKey, model);
    }
  }

  async _checkAPI() {
    if (!this.client) {
      this._initializeClient();
    }

    const config = vscode.workspace.getConfiguration("deepseek");
    const apiKey = config.get("apiKey");

    if (!apiKey) {
      vscode.window.showErrorMessage(
        "API ключ DeepSeek не настроен! Пожалуйста, установите его в настройках VS Code."
      );
      return false;
    }
    return true;
  }

  async _getSelectedCode() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("Активный редактор не найден");
      return null;
    }

    const selection = editor.selection;
    let code = editor.document.getText(selection);

    // Если ничего не выделено, берем весь файл
    if (!code.trim() && editor.document.getText().trim()) {
      const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(editor.document.getText().length)
      );
      code = editor.document.getText(fullRange);
    }

    if (!code.trim()) {
      vscode.window.showWarningMessage(
        "Пожалуйста, выделите код или откройте файл с кодом"
      );
      return null;
    }

    return {
      code: code,
      language: editor.document.languageId,
      editor: editor,
      selection: selection,
    };
  }

  async explainCode() {
    if (!(await this._checkAPI())) return;

    const codeData = await this._getSelectedCode();
    if (!codeData) return;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "DeepSeek: Анализирую код...",
        cancellable: false,
      },
      async (progress) => {
        try {
          const explanation = await this.client.explainCode(
            codeData.code,
            codeData.language
          );
          this._showResult(
            `📖 Объяснение кода (${codeData.language}):`,
            explanation,
            codeData.code
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Ошибка: ${error.message}`);
        }
      }
    );
  }

  async generateCode() {
    if (!(await this._checkAPI())) return;

    const description = await vscode.window.showInputBox({
      prompt: "Опишите код, который хотите сгенерировать",
      placeHolder: "Например: функция для вычисления факториала на JavaScript",
    });

    if (!description) return;

    const languages = [
      "javascript",
      "typescript",
      "python",
      "java",
      "c",
      "c++",
      "c#",
      "php",
      "ruby",
      "go",
      "rust",
      "swift",
      "kotlin",
      "html",
      "css",
    ];

    const language = await vscode.window.showQuickPick(
      languages.map((lang) => ({
        label: lang,
        description: `Генерировать ${lang} код`,
      })),
      {
        placeHolder: "Выберите язык программирования",
      }
    );

    if (!language) return;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "DeepSeek: Генерирую код...",
        cancellable: false,
      },
      async (progress) => {
        try {
          const generatedCode = await this.client.generateCode(
            description,
            language.label
          );
          this._showResult(
            `✨ Сгенерированный код (${language.label}):`,
            generatedCode,
            description
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Ошибка: ${error.message}`);
        }
      }
    );
  }

  async refactorCode() {
    if (!(await this._checkAPI())) return;

    const codeData = await this._getSelectedCode();
    if (!codeData) return;

    const instructions = await vscode.window.showInputBox({
      prompt: "Инструкции для рефакторинга (опционально)",
      placeHolder:
        "Например: улучшить читаемость, оптимизировать производительность",
    });

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "DeepSeek: Рефакторю код...",
        cancellable: false,
      },
      async (progress) => {
        try {
          const refactoredCode = await this.client.refactorCode(
            codeData.code,
            codeData.language,
            instructions
          );
          this._showResult(
            `🔧 Рефакторинг кода (${codeData.language}):`,
            refactoredCode,
            codeData.code
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Ошибка: ${error.message}`);
        }
      }
    );
  }

  async debugCode() {
    if (!(await this._checkAPI())) return;

    const codeData = await this._getSelectedCode();
    if (!codeData) return;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "DeepSeek: Ищу ошибки...",
        cancellable: false,
      },
      async (progress) => {
        try {
          const debugInfo = await this.client.debugCode(
            codeData.code,
            codeData.language
          );
          this._showResult(
            `🐛 Анализ ошибок (${codeData.language}):`,
            debugInfo,
            codeData.code
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Ошибка: ${error.message}`);
        }
      }
    );
  }

  async optimizeCode() {
    if (!(await this._checkAPI())) return;

    const codeData = await this._getSelectedCode();
    if (!codeData) return;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "DeepSeek: Оптимизирую код...",
        cancellable: false,
      },
      async (progress) => {
        try {
          const optimizedCode = await this.client.optimizeCode(
            codeData.code,
            codeData.language
          );
          this._showResult(
            `⚡ Оптимизация кода (${codeData.language}):`,
            optimizedCode,
            codeData.code
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Ошибка: ${error.message}`);
        }
      }
    );
  }

  async documentCode() {
    if (!(await this._checkAPI())) return;

    const codeData = await this._getSelectedCode();
    if (!codeData) return;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "DeepSeek: Документирую код...",
        cancellable: false,
      },
      async (progress) => {
        try {
          const documentation = await this.client.documentCode(
            codeData.code,
            codeData.language
          );
          this._showResult(
            `📝 Документация кода (${codeData.language}):`,
            documentation,
            codeData.code
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Ошибка: ${error.message}`);
        }
      }
    );
  }

  async translateCode() {
    if (!(await this._checkAPI())) return;

    const codeData = await this._getSelectedCode();
    if (!codeData) return;

    const targetLanguages = [
      "javascript",
      "python",
      "java",
      "c++",
      "c#",
      "go",
      "rust",
      "php",
    ];

    const targetLanguage = await vscode.window.showQuickPick(
      targetLanguages.map((lang) => ({
        label: lang,
        description: `Перевести на ${lang}`,
      })),
      {
        placeHolder: "Выберите целевой язык программирования",
      }
    );

    if (!targetLanguage) return;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "DeepSeek: Перевожу код...",
        cancellable: false,
      },
      async (progress) => {
        try {
          const translatedCode = await this.client.translateCode(
            codeData.code,
            codeData.language,
            targetLanguage.label
          );
          this._showResult(
            `🌐 Перевод кода (${codeData.language} → ${targetLanguage.label}):`,
            translatedCode,
            codeData.code
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Ошибка: ${error.message}`);
        }
      }
    );
  }

  _showResult(title, content, original) {
    const panel = vscode.window.createWebviewPanel(
      "deepseekResult",
      "DeepSeek Результат",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    panel.webview.html = this._getWebviewContent(title, content, original);
  }

  _getWebviewContent(title, content, original) {
    return `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>DeepSeek Результат</title>
            <style>
                body { 
                    padding: 20px; 
                    font-family: var(--vscode-font-family); 
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    line-height: 1.6;
                }
                .header { 
                    color: var(--vscode-textLink-foreground); 
                    margin-bottom: 20px; 
                    border-bottom: 2px solid var(--vscode-panel-border);
                    padding-bottom: 15px;
                    font-size: 18px;
                    font-weight: bold;
                }
                .content { 
                    background: var(--vscode-textCodeBlock-background); 
                    padding: 20px; 
                    border-radius: 8px; 
                    white-space: pre-wrap;
                    border: 1px solid var(--vscode-panel-border);
                    margin-bottom: 20px;
                    font-family: var(--vscode-editor-font-family);
                    line-height: 1.5;
                }
                .original { 
                    margin-top: 25px; 
                    padding: 15px; 
                    background: var(--vscode-input-background);
                    border-left: 4px solid var(--vscode-inputValidation-infoBorder);
                    border-radius: 4px;
                }
                .original-title {
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: var(--vscode-descriptionForeground);
                }
                code {
                    font-family: 'Courier New', monospace;
                    background: var(--vscode-textCodeBlock-background);
                    padding: 2px 6px;
                    border-radius: 3px;
                }
                pre {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 15px;
                    border-radius: 6px;
                    overflow-x: auto;
                    margin: 10px 0;
                    border: 1px solid var(--vscode-panel-border);
                }
            </style>
        </head>
        <body>
            <div class="header">${title}</div>
            <div class="content">${this._escapeHtml(content)}</div>
            ${
              original
                ? `
            <div class="original">
                <div class="original-title">Исходный код/запрос:</div>
                <code>${this._escapeHtml(original)}</code>
            </div>
            `
                : ""
            }
        </body>
        </html>`;
  }

  _escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/\n/g, "<br>")
      .replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;")
      .replace(/  /g, "&nbsp;&nbsp;");
  }
}

module.exports = DeepSeekCodeAssistant;
