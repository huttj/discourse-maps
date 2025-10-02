# Discourse Maps

A simple AI-powered interface for data modeling with chat integration.

## Features

- **Main Data Display**: Shows the current state of your model data in a formatted JSON view
- **AI Chat Sidebar**: Interactive chat with OpenRouter integration
- **Tool Calling**: AI can write data to the model using a specialized tool
- **Local Storage**: Model data persists across page refreshes
- **Reset Functionality**: Clear chat context while preserving model data

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file in the root directory:
   ```
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   ```

3. Get your OpenRouter API key from [OpenRouter](https://openrouter.ai/)

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Chat with AI**: Use the chat sidebar to interact with the AI
2. **Write Data**: Ask the AI to write data to the model (e.g., "Write some sample data to the model")
3. **View Data**: The main window displays the current model data
4. **Reset Chat**: Use the "Reset Chat" button to clear the conversation while keeping the model data
5. **Persistence**: Model data is automatically saved to localStorage

## How It Works

- The AI has access to a `write_to_model` tool that accepts JSON data
- When you ask the AI to write data, it will call this tool with the JSON
- The frontend intercepts these tool calls and updates the model data
- All model data is persisted in localStorage
- The system prompt includes the current model data context for the AI

## Example Commands

- "Write some sample data to the model"
- "Add a new field called 'status' with value 'active'"
- "Update the existing data to include a timestamp"
- "Create a simple user profile with name, email, and age"