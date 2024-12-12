import { LanguageModels, ModelProviders } from 'vscode';
import { ModelSelection } from 'vscode';

export namespace MockModelSelection {
  export const slowModel: string = 'ClaudeSonnet';
  export const fastModel: string = 'ClaudeSonnet';

  export const models: LanguageModels = {
   // 'gpt-4': {
   //   name: 'GPT-4',
   //   contextLength: 8192,
  //    temperature: 0.2,
    //  provider: {
   //     type: 'codestory',
   //   },
   // },
  //  'DeepSeekCoder33BInstruct': {
   //   name: 'DeepSeek Coder 33B Instruct',
   //   contextLength: 16384,
   //   temperature: 0.2,
   //   provider: {
    //    type: 'codestory',
    //  },
    //},
    'gpt-4': {
      name: 'GPT-4',
      contextLength: 8192,
      temperature: 0.2,
      provider: {
        type: 'openai',
      },
    },
    'gpt-4-turbo-preview': {
      name: 'GPT-4 Turbo',
      contextLength: 128000,
      temperature: 0.2,
      provider: {
        type: 'openai',
      },
    },
    'gpt-3.5-turbo': {
      name: 'GPT-3.5 Turbo',
      contextLength: 16385,
      temperature: 0.2,
      provider: {
        type: 'openai',
      },
    },
    'gpt-4o': {
      name: 'GPT-4o',
      contextLength: 128000,
      temperature: 0.2,
      provider: {
        type: 'openai',
      },
    },
    'gpt-4o-mini': {
      name: 'GPT-4o Mini',
      contextLength: 16385,
      temperature: 0.2,
      provider: {
        type: 'openai',
      },
    },
    'o1-preview': {
      name: 'O1 Preview',
      contextLength: 128000,
      temperature: 0.2,
      provider: {
        type: 'openai',
      },
    },
    'o1-mini': {
      name: 'O1 Mini',
      contextLength: 16385,
      temperature: 0.2,
      provider: {
        type: 'openai',
      },
    },
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
    'anthropic.claude-3-sonnet-20240229-v1:0': {
      name: 'Claude 3 Sonnet (Bedrock)',
      contextLength: 200000,
      temperature: 0.2,
      provider: {
        type: 'aws-bedrock',
      },
    },
    'anthropic.claude-3-haiku-20240307-v1:0': {
      name: 'Claude 3 Haiku (Bedrock)',
      contextLength: 200000,
      temperature: 0.2,
      provider: {
        type: 'aws-bedrock',
      },
    },
    'anthropic.claude-v2:1': {
      name: 'Claude 2 (Bedrock)',
      contextLength: 100000,
      temperature: 0.2,
      provider: {
        type: 'aws-bedrock',
      },
    },
    'amazon.titan-text-express-v1': {
      name: 'Titan Text Express',
      contextLength: 8000,
      temperature: 0.2,
      provider: {
        type: 'aws-bedrock',
      },
    },
    'meta.llama2-70b-chat-v1': {
      name: 'Llama 2 70B',
      contextLength: 4096,
      temperature: 0.2,
      provider: {
        type: 'aws-bedrock',
      },
    },
  };

  export const providers: ModelProviders = {
    //codestory: {
    //  name: "CodeStory"
    //},
    openai: {
      name: 'OpenAI',
    },
    anthropic: {
      name: 'Anthropic',
    },
    'aws-bedrock': {
      name: 'AWS Bedrock',
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
