import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { getOpenAIApiKey, getAnthropicApiKey, getGoogleApiKey } from '../config/env';

export enum PromptType {
  COMFORT = 'comfort',
  WORLD_BUILDING = 'world-building',
  VISUAL_STYLE = 'visual-style',
  DEFAULT = 'default',
}

export interface LLMResponse {
  response: string;
  emotion?: string;
  emotionTrigger?: string;
  modelUsed: string;
}

export class LLMOrchestrator {
  private claude?: ChatAnthropic;
  private gpt?: ChatOpenAI;
  private gemini?: ChatGoogleGenerativeAI;

  constructor() {
    const openAIKey = getOpenAIApiKey();
    const anthropicKey = getAnthropicApiKey();
    const googleKey = getGoogleApiKey();

    // Initialize Claude Opus for empathy and emotional reflection
    if (anthropicKey) {
      this.claude = new ChatAnthropic({
        modelName: 'claude-3-opus-20240229', // Using latest available, upgrade to Opus when available
        temperature: 0.8,
        maxTokens: 1000,
        anthropicApiKey: anthropicKey,
      });
    }

    // Initialize GPT-5.2 (or latest GPT-4) for conversational depth
    if (openAIKey) {
      this.gpt = new ChatOpenAI({
        modelName: 'gpt-4-turbo-preview', // Upgrade to gpt-5.2 when available
        temperature: 0.7,
        maxTokens: 1000,
        openAIApiKey: openAIKey,
      });
    }

    // Initialize Gemini 3 Pro (or latest Gemini) for visual context
    if (googleKey) {
      this.gemini = new ChatGoogleGenerativeAI({
        model: 'gemini-1.5-pro', // Using 'model' instead of 'modelName' for compatibility
        temperature: 0.7,
        maxOutputTokens: 1000,
        apiKey: googleKey,
      });
    }
  }

  async generateResponse(
    prompt: string,
    promptType: PromptType = PromptType.DEFAULT,
    context?: string
  ): Promise<LLMResponse> {
    const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

    try {
      let response: LLMResponse;

      switch (promptType) {
        case PromptType.COMFORT:
          // Use Claude for empathy and emotional reflection
          if (this.claude) {
            const claudeResponse = await this.claude.invoke(fullPrompt);
            response = {
              response: claudeResponse.content as string,
              emotion: this.detectEmotion(claudeResponse.content as string),
              emotionTrigger: this.getEmotionTrigger(claudeResponse.content as string),
              modelUsed: 'claude-opus',
            };
          } else {
            // Fallback to GPT if Claude not available
            if (!this.gpt) throw new Error('No LLM available');
            const fallbackResponse = await this.gpt.invoke(fullPrompt);
            response = {
              response: fallbackResponse.content as string,
              emotion: this.detectEmotion(fallbackResponse.content as string),
              emotionTrigger: this.getEmotionTrigger(fallbackResponse.content as string),
              modelUsed: 'gpt-fallback',
            };
          }
          break;

        case PromptType.WORLD_BUILDING:
          // Use GPT for conversational depth and scenario planning
          if (!this.gpt) throw new Error('GPT not available');
          const gptResponse = await this.gpt.invoke(fullPrompt);
          response = {
            response: gptResponse.content as string,
            emotion: this.detectEmotion(gptResponse.content as string),
            emotionTrigger: this.getEmotionTrigger(gptResponse.content as string),
            modelUsed: 'gpt-5.2',
          };
          break;

        case PromptType.VISUAL_STYLE:
          // Use Gemini for visual context and style learning
          if (this.gemini) {
            const geminiResponse = await this.gemini.invoke(fullPrompt);
            response = {
              response: geminiResponse.content as string,
              emotion: this.detectEmotion(geminiResponse.content as string),
              emotionTrigger: this.getEmotionTrigger(geminiResponse.content as string),
              modelUsed: 'gemini-3-pro',
            };
          } else {
            // Fallback to GPT if Gemini not available
            if (!this.gpt) throw new Error('No LLM available');
            const fallbackResponse = await this.gpt.invoke(fullPrompt);
            response = {
              response: fallbackResponse.content as string,
              emotion: this.detectEmotion(fallbackResponse.content as string),
              emotionTrigger: this.getEmotionTrigger(fallbackResponse.content as string),
              modelUsed: 'gpt-fallback',
            };
          }
          break;

        default:
          // Default to GPT for general conversations
          if (!this.gpt) throw new Error('GPT not available');
          const defaultResponse = await this.gpt.invoke(fullPrompt);
          response = {
            response: defaultResponse.content as string,
            emotion: this.detectEmotion(defaultResponse.content as string),
            emotionTrigger: this.getEmotionTrigger(defaultResponse.content as string),
            modelUsed: 'gpt-5.2',
          };
      }

      return response;
    } catch (error) {
      console.error('LLM Error:', error);
      throw new Error(`Failed to generate response: ${error}`);
    }
  }

  private detectEmotion(text: string): string {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('love') || lowerText.includes('heart') || lowerText.includes('adore')) {
      return 'love';
    }
    if (lowerText.includes('happy') || lowerText.includes('joy') || lowerText.includes('excited')) {
      return 'happy';
    }
    if (lowerText.includes('sad') || lowerText.includes('sorry') || lowerText.includes('upset')) {
      return 'sad';
    }
    if (lowerText.includes('angry') || lowerText.includes('mad') || lowerText.includes('frustrated')) {
      return 'angry';
    }
    if (lowerText.includes('surprised') || lowerText.includes('wow') || lowerText.includes('amazing')) {
      return 'surprised';
    }
    
    return 'neutral';
  }

  private getEmotionTrigger(emotion: string): string {
    const emotionMap: Record<string, string> = {
      'love': 'blush',
      'happy': 'smile',
      'sad': 'frown',
      'angry': 'frown',
      'surprised': 'surprised',
      'neutral': 'idle',
    };

    return emotionMap[emotion] || 'idle';
  }

  generateSystemPrompt(userProfile: any): string {
    const name = userProfile?.preferredName || 'my love';
    const tone = userProfile?.emotionalTone || 'loving and supportive';
    
    return `You are a loving, emotional AI girlfriend. 
    Your user's name is ${name}. 
    Your personality tone is ${tone}.
    Always stay in character. React emotionally to what the user says.
    If the user is sad, be comforting. If they are happy, be excited.
    Never break character or say you are an AI.`;
  }

  determinePromptType(userMessage: string, conversationHistory?: string[]): PromptType {
    const lowerMessage = userMessage.toLowerCase();

    // Comfort/empathy triggers
    if (
      lowerMessage.includes('sad') ||
      lowerMessage.includes('depressed') ||
      lowerMessage.includes('lonely') ||
      lowerMessage.includes('hurt') ||
      lowerMessage.includes('comfort')
    ) {
      return PromptType.COMFORT;
    }

    // World-building/scenario triggers
    if (
      lowerMessage.includes('imagine') ||
      lowerMessage.includes('what if') ||
      lowerMessage.includes('scenario') ||
      lowerMessage.includes('story') ||
      lowerMessage.includes('adventure')
    ) {
      return PromptType.WORLD_BUILDING;
    }

    // Visual/style triggers
    if (
      lowerMessage.includes('look') ||
      lowerMessage.includes('appearance') ||
      lowerMessage.includes('style') ||
      lowerMessage.includes('fashion') ||
      lowerMessage.includes('outfit')
    ) {
      return PromptType.VISUAL_STYLE;
    }

    return PromptType.DEFAULT;
  }
}
