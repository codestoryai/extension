import { LanguageModels, ModelProviders } from 'vscode';
import { ModelSelection } from 'vscode';

export namespace MockModelSelection {
  export const slowModel: string = 'ClaudeSonnet';
  export const fastModel: string = 'ClaudeSonnet';

  export const models: LanguageModels = {
    // Gpt4: {
    //   name: 'GPT-4',
    //   contextLength: 8192,
    //   temperature: 0.2,
    //   provider: {
    //     type: 'codestory',
    //   },
    // },
    // DeepSeekCoder33BInstruct: {
    //   name: 'DeepSeek Coder 33B Instruct',
    //   contextLength: 16384,
    //   temperature: 0.2,
    //   provider: {
    //     type: 'codestory',
    //   },
    // },
    ClaudeSonnet: {
      name: 'Claude Sonnet',
      contextLength: 200000,
      temperature: 0.2,
      provider: {
        type: 'anthropic',
      },
    },
    ClaudeHaiku: {
      name: 'Claude Haiku',
      contextLength: 200000,
      temperature: 0.2,
      provider: {
        type: 'anthropic',
      },
    },
  };

  export const providers: ModelProviders = {
    //"codestory": {
    //    name: "CodeStory"
    //},
    //"ollama": {
    //    name: "Ollama"
    //}
    anthropic: {
      name: 'Anthropic',
    },
    'open-router': {
      name: 'Open Router',
    },
  };

  export function getConfiguration(): ModelSelection {
    return {
      slowModel,
      fastModel,
      models,
      providers,
    };
  }
}
