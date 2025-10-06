const vscode = require("vscode");
const DeepSeekChatProvider = require("./src/chat-provider");
const DeepSeekCodeAssistant = require("./src/code-assistant");

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
    () => {
      // Создаем и показываем панель чата
      provider.showChatPanel();
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
    translateCodeCommand
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