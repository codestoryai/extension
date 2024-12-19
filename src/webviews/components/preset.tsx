import { Provider, ProviderType } from '../../model';
import AnthropicLogo from '../assets/providers-logos/anthropic.svg';
import AWSBedrockLogo from '../assets/providers-logos/aws-bedrock.svg';
// import GeminiLogo from '../assets/providers-logos/gemini.svg';
// import OllamaLogo from '../assets/providers-logos/ollama.svg';
import OpenAILogo from '../assets/providers-logos/openai.svg';
import OpenRouterLogo from '../assets/providers-logos/open-router.svg';
import { cn } from 'utils/cn';

const logoMap = new Map<string, React.FunctionComponent<React.SVGProps<SVGSVGElement>>>();
logoMap.set(Provider.Anthropic, AnthropicLogo);
logoMap.set(Provider.OpenAI, OpenAILogo);
logoMap.set(Provider.OpenRouter, OpenRouterLogo);
// logoMap.set(Provider.GoogleGemini, GeminiLogo);
logoMap.set(Provider.AWSBedrock, AWSBedrockLogo);
logoMap.set(Provider.OpenAICompatible, OpenAILogo);
// logoMap.set(Provider.Ollama, OllamaLogo);

export type PresetLogoProps = React.SVGProps<SVGSVGElement> & {
  provider: ProviderType;
};

export function PresetLogo(props: PresetLogoProps) {
  const { provider, className, ...rest } = props;
  const Logo = logoMap.get(provider);
  return Logo ? <Logo className={cn('h-3 w-3', className)} {...rest} /> : null;
}
