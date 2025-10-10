const vscode = require("vscode");
const DeepSeekChatProvider = require("./src/chat-provider");
const DeepSeekCodeAssistant = require("./src/code-assistant");
const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');

function activate(context) {
  console.log("DeepSeek Chat расширение активировано");

  const provider = new DeepSeekChatProvider();
  const codeAssistant = new DeepSeekCodeAssistant();

  // Регистрируем провайдер для вебвью чата
  const providerRegistration = vscode.window.registerWebviewViewProvider(
    "deepseek-chat-view",
    provider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }
  );

  // Команда для открытия чата
  const openChatCommand = vscode.commands.registerCommand(
    "deepseek.openChat",
    async () => {
      // Применяем настройку расположения боковой панели
      try {
        const cfg = vscode.workspace.getConfiguration('deepseek');
        const desired = cfg.get('windowPosition', 'right'); // 'right' | 'left'
        const workbenchCfg = vscode.workspace.getConfiguration('workbench');
        const current = workbenchCfg.get('sideBar.location');
        if (desired === 'right' && current !== 'right') {
          await workbenchCfg.update('sideBar.location', 'right', vscode.ConfigurationTarget.Global);
        } else if (desired === 'left' && current !== 'left') {
          await workbenchCfg.update('sideBar.location', 'left', vscode.ConfigurationTarget.Global);
        }
      } catch {}

      // Создаем и показываем панель чата
      provider.showChatPanel();
      // Явно раскрываем контейнер и view чата
      vscode.commands.executeCommand('workbench.view.extension.deepseek-chat-container');
      vscode.commands.executeCommand('workbench.view.extension.deepseek-chat-view');
      vscode.window.showInformationMessage("DeepSeek Чат открыт! Начните общение с AI.");
    }
  );

  // Команда для быстрого чата
  const quickChatCommand = vscode.commands.registerCommand(
    "deepseek.quickChat",
    async () => {
      const question = await vscode.window.showInputBox({
        prompt: "Спросите DeepSeek о чем угодно...",
        placeHolder: "Введите ваш вопрос здесь",
      });

      if (question) {
        provider.showChatPanel();
        // Даем время для инициализации панели
        setTimeout(() => {
          provider.sendMessage(question);
        }, 500);
      }
    }
  );

  // Команды для работы с кодом
  const explainCodeCommand = vscode.commands.registerCommand(
    "deepseek.explainCode",
    async () => {
      await codeAssistant.explainCode();
    }
  );

  const generateCodeCommand = vscode.commands.registerCommand(
    "deepseek.generateCode",
    async () => {
      await codeAssistant.generateCode();
    }
  );

  const refactorCodeCommand = vscode.commands.registerCommand(
    "deepseek.refactorCode",
    async () => {
      await codeAssistant.refactorCode();
    }
  );

  const debugCodeCommand = vscode.commands.registerCommand(
    "deepseek.debugCode",
    async () => {
      await codeAssistant.debugCode();
    }
  );

  const optimizeCodeCommand = vscode.commands.registerCommand(
    "deepseek.optimizeCode",
    async () => {
      await codeAssistant.optimizeCode();
    }
  );

  const documentCodeCommand = vscode.commands.registerCommand(
    "deepseek.documentCode",
    async () => {
      await codeAssistant.documentCode();
    }
  );

  const translateCodeCommand = vscode.commands.registerCommand(
    "deepseek.translateCode",
    async () => {
      await codeAssistant.translateCode();
    }
  );

  // Провайдер для отображения README.md
  class DeepSeekReadmeProvider {
    resolveWebviewView(webviewView, context, _token) {
      const md = new MarkdownIt();
      const readmePath = path.join(__dirname, 'README.md');
      let readmeContent = '';
      try {
        readmeContent = fs.readFileSync(readmePath, 'utf8');
      } catch (e) {
        readmeContent = 'README.md не найден.';
      }
      const html = md.render(readmeContent);
      webviewView.webview.options = { enableScripts: false };
      webviewView.webview.html = `
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; background: #fff; color: #222; }
            h1, h2, h3 { color: #00A8CC; }
            img { max-width: 100%; border-radius: 8px; }
            pre { background: #f6f8fa; padding: 12px; border-radius: 8px; overflow-x: auto; }
            code { background: #f1f3f4; padding: 2px 6px; border-radius: 4px; }
            a { color: #00A8CC; }
          </style>
        </head>
        <body>${html}</body>
        </html>
      `;
    }
  }

  // Регистрируем провайдер для README
  const readmeProviderRegistration = vscode.window.registerWebviewViewProvider(
    'deepseek-readme-view',
    new DeepSeekReadmeProvider()
  );

  // Команда для открытия вкладки README
  const openReadmeCommand = vscode.commands.registerCommand(
    'deepseek.openReadme',
    () => {
      vscode.commands.executeCommand('workbench.view.extension.deepseek-readme-view');
    }
  );

  // Подписываемся на все команды
  context.subscriptions.push(
    providerRegistration,
    openChatCommand,
    quickChatCommand,
    explainCodeCommand,
    generateCodeCommand,
    refactorCodeCommand,
    debugCodeCommand,
    optimizeCodeCommand,
    documentCodeCommand,
    translateCodeCommand,
    readmeProviderRegistration,
    openReadmeCommand
  );

  // Показываем приветственное сообщение
  vscode.window.showInformationMessage(
    "DeepSeek Chat активирован! Используйте панель Explorer для доступа к чату."
  );
}

function deactivate() {
  console.log("DeepSeek Chat расширение деактивировано");
}

module.exports = {
  activate,
  deactivate,
};