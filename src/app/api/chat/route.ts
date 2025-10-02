import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { DISCOURSE_MAP_PROMPT } from '../../lib/prompts';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

export async function POST(request: NextRequest) {
  try {
    const { messages, modelData, isFirstMessage, stream } = await request.json();

    // System prompt that includes the JSON format specification
    const systemPrompt = {
      role: 'system' as const,
      content: `You are a helpful AI assistant that analyzes discourse and returns structured data. 

Current model data: ${JSON.stringify(modelData, null, 2)}

You can respond in two ways:

**OPTION 1: Normal conversation** (for questions, clarifications, discussion):
Just respond normally without any special formatting. Use this when:
- User asks questions about the data or process
- You need clarification before analyzing
- Having a discussion about the analysis
- Providing explanations or guidance

**OPTION 2: Data analysis** (when providing structured data):
Use this EXACT format when you have data to provide:

<!--ANALYSIS_START-->
[Your CONSISE (1-3 sentences) analysis here - NO JSON DATA IN THIS SECTION]
<!--ANALYSIS_END-->

<!--DATA_START-->
[Your JSON data here]
<!--DATA_END-->

<!--NOTES_START-->
[Any additional notes, suggestions, or ideas here]
<!--NOTES_END-->

**ANALYSIS and NOTES sections are OPTIONAL** - only include them if you have something meaningful to say.

SIMPLE RULES:

1. **For simple changes** (replies_to, text, estimation, emoji, author):
   Only include ID + the field(s) changing: {"type": "partial", "data": [{"id": "M1", "replies_to": "M2"}]}

2. **For new axes** (adding axes):
   Include ALL existing axes + new axes + ALL data points with new coordinates:
   {"type": "partial", "axes": [all_existing_axes, new_axes], "data": [all_points_with_new_coords]}

3. **For coordinate updates** (changing existing coordinates):
   Only include ID + new coordinates: {"type": "partial", "data": [{"id": "M1", "coords": [1,2,3]}]}

4. **For complete replacement** (initial analysis or when a full reset is explicitly requested):
   Include everything: {"type": "complete", "axes": [...], "data": [...]}

CRITICAL: When adding new axes, you MUST provide coordinates for ALL data points. The coordinates array length must match the total number of axes.

Always include all three sections with the exact HTML comment markers shown above.`
    };

    // If this is the first message, prepend the discourse mapping prompt
    let allMessages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [systemPrompt];
    
    if (isFirstMessage && messages.length > 0) {
      // Add the discourse mapping prompt followed by the user's data
      allMessages.push({
        role: 'user',
        content: DISCOURSE_MAP_PROMPT + '\n\n' + messages[0].content
      });
    } else {
      // Add all messages normally
      allMessages = [...allMessages, ...messages];
    }

    if (stream) {
      // Streaming response
      const stream = await openai.chat.completions.create({
        model: 'openai/gpt-5',
        messages: allMessages,
        stream: true,
      });

      const encoder = new TextEncoder();
      
      const readable = new ReadableStream({
        async start(controller) {
          let fullContent = '';
          
          for await (const chunk of stream) {
            const choice = chunk.choices[0];
            
            if (choice.delta.content) {
              fullContent += choice.delta.content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: choice.delta.content })}\n\n`));
            }
          }
          
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // Non-streaming response (fallback)
      const response = await openai.chat.completions.create({
        model: 'openai/gpt-5-mini',
        messages: allMessages,
      });

      return NextResponse.json(response);
    }
  } catch (error) {
    console.error('Error calling OpenRouter API:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
}
