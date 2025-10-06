const axios = require("axios");

class DeepSeekClient {
  constructor(apiKey, model = "deepseek-chat") {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = "https://api.deepseek.com/v1";

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  async chatCompletion(messages, maxTokens = 4000, temperature = 0.7) {
    try {
      const response = await this.client.post("/chat/completions", {
        model: this.model,
        messages: messages,
        max_tokens: maxTokens,
        temperature: temperature,
        stream: false,
      });

      if (!response.data || !response.data.choices || !response.data.choices[0]) {
        throw new Error("Получен некорректный ответ от API");
      }

      return response.data.choices[0].message.content;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Неверный API ключ. Проверьте настройки.");
      } else if (error.response?.status === 429) {
        throw new Error("Превышен лимит запросов. Попробуйте позже.");
      } else if (error.response?.status === 400) {
        throw new Error("Некорректный запрос. Проверьте параметры.");
      } else if (error.response?.status === 500) {
        throw new Error("Ошибка сервера DeepSeek. Попробуйте позже.");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Превышено время ожидания. Проверьте интернет-соединение.");
      } else {
        throw new Error(
          `Ошибка API DeepSeek: ${
            error.response?.data?.error?.message || error.message
          }`
        );
      }
    }
  }

  async explainCode(code, language) {
    const prompt = `Объясни подробно следующий код на ${language}:\n\n${code}\n\nОбъяснение должно быть на русском языке и включать:
1. Что делает этот код
2. Как работают основные конструкции
3. Примеры использования
4. Возможные улучшения

Объяснение:`;

    return await this.chatCompletion([
      {
        role: "user",
        content: prompt,
      },
    ]);
  }

  async generateCode(description, language) {
    const prompt = `Сгенерируй код на ${language} для следующего описания:\n\n${description}\n\nТребования:
1. Код должен быть чистым и хорошо организованным
2. Добавь комментарии на русском языке
3. Учитывай лучшие практики для ${language}
4. Предусмотри обработку ошибок

Код:`;

    return await this.chatCompletion([
      {
        role: "user",
        content: prompt,
      },
    ]);
  }

  async refactorCode(code, language, instructions = "") {
    const instructionsText = instructions ? ` с учетом: ${instructions}` : "";
    const prompt = `Рефактори следующий код на ${language}${instructionsText}:\n\n${code}\n\nТребования к рефакторингу:
1. Улучши читаемость и структуру
2. Убери дублирование кода
3. Примени лучшие практики
4. Сохрани исходную функциональность
5. Добавь комментарии к изменениям

Рефакторинг код:`;

    return await this.chatCompletion([
      {
        role: "user",
        content: prompt,
      },
    ]);
  }

  async debugCode(code, language) {
    const prompt = `Проанализируй следующий код на ${language} и найди возможные ошибки:\n\n${code}\n\nАнализ должен включать:
1. Поиск синтаксических ошибок
2. Поиск логических ошибок
3. Потенциальные проблемы производительности
4. Рекомендации по исправлению
5. Пример исправленного кода

Анализ ошибок:`;

    return await this.chatCompletion([
      {
        role: "user",
        content: prompt,
      },
    ]);
  }

  async optimizeCode(code, language) {
    const prompt = `Оптимизируй следующий код на ${language}:\n\n${code}\n\nОптимизация должна включать:
1. Улучшение производительности
2. Снижение использования памяти
3. Улучшение читаемости
4. Применение лучших практик оптимизации
5. Объяснение внесенных изменений

Оптимизированный код:`;

    return await this.chatCompletion([
      {
        role: "user",
        content: prompt,
      },
    ]);
  }

  async documentCode(code, language) {
    const prompt = `Создай документацию для следующего кода на ${language}:\n\n${code}\n\nДокументация должна включать:
1. Описание назначения кода
2. Документацию для функций/методов
3. Описание параметров и возвращаемых значений
4. Примеры использования
5. Комментарии к сложным участкам кода

Документация:`;

    return await this.chatCompletion([
      {
        role: "user",
        content: prompt,
      },
    ]);
  }

  async translateCode(code, sourceLanguage, targetLanguage) {
    const prompt = `Переведи следующий код с ${sourceLanguage} на ${targetLanguage}:\n\n${code}\n\nТребования к переводу:
1. Сохрани исходную функциональность
2. Адаптируй идиомы и лучшие практики для ${targetLanguage}
3. Добавь комментарии к переводу
4. Убедись в корректности синтаксиса

Переведенный код:`;

    return await this.chatCompletion([
      {
        role: "user",
        content: prompt,
      },
    ]);
  }

  async codeReview(code, language) {
    const prompt = `Проведи код-ревью для следующего кода на ${language}:\n\n${code}\n\nРевью должно включать:
1. Оценку качества кода
2. Замечания по стилю
3. Рекомендации по улучшению
4. Оценку безопасности
5. Предложения по рефакторингу

Результат код-ревью:`;

    return await this.chatCompletion([
      {
        role: "user",
        content: prompt,
      },
    ]);
  }

  async generateTests(code, language) {
    const prompt = `Сгенерируй unit-тесты для следующего кода на ${language}:\n\n${code}\n\nТребования к тестам:
1. Покрытие основных сценариев
2. Тестирование граничных случаев
3. Использование популярного фреймворка для тестирования
4. Читаемость и поддерживаемость тестов
5. Комментарии к тестовым случаям

Тесты:`;

    return await this.chatCompletion([
      {
        role: "user",
        content: prompt,
      },
    ]);
  }

  async analyzeComplexity(code, language) {
    const prompt = `Проанализируй сложность следующего кода на ${language}:\n\n${code}\n\nАнализ должен включать:
1. Оценку временной сложности (Big O)
2. Оценку пространственной сложности
3. Выявление узких мест производительности
4. Рекомендации по оптимизации
5. Альтернативные подходы

Анализ сложности:`;

    return await this.chatCompletion([
      {
        role: "user",
        content: prompt,
      },
    ]);
  }
}

module.exports = DeepSeekClient;
