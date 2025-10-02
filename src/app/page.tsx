'use client';

import { useState, useEffect, useRef } from 'react';
import DiscourseMap from './components/DiscourseMap';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  parsedData?: {
    analysis: string;
    data?: any;
    dataRaw?: string;
    notes: string;
    hasAnalysisStarted?: boolean;
    hasDataStarted?: boolean;
    hasNotesStarted?: boolean;
    dataType?: 'complete' | 'partial';
  };
  isStreaming?: boolean;
  showJsonPreview?: boolean;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
  }>;
}

export default function Home() {
  const [modelData, setModelData] = useState<any>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatWidth, setChatWidth] = useState(384); // Default 384px (w-96)
  const [isResizing, setIsResizing] = useState(false);
  const [streamController, setStreamController] = useState<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  // Load model data and chat history from localStorage on component mount
  useEffect(() => {
    const savedData = localStorage.getItem('modelData');
    if (savedData) {
      try {
        setModelData(JSON.parse(savedData));
      } catch (error) {
        console.error('Error parsing saved model data:', error);
      }
    }
    
    const savedMessages = localStorage.getItem('chatHistory');
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (error) {
        console.error('Error parsing saved chat history:', error);
      }
    }
  }, []);

  // Save model data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('modelData', JSON.stringify(modelData));
  }, [modelData]);

  // Save chat history to localStorage whenever messages change (but not during streaming)
  useEffect(() => {
    if (!isStreaming) {
      localStorage.setItem('chatHistory', JSON.stringify(messages));
    }
  }, [messages, isStreaming]);

  // Handle chat resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = window.innerWidth - e.clientX;
        setChatWidth(Math.max(300, Math.min(800, newWidth))); // Min 300px, max 800px
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || isStreaming) return;

    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);

    // Create abort controller for streaming
    const controller = new AbortController();
    setStreamController(controller);

    // Add streaming message placeholder
    const streamingMessage: Message = { 
      role: 'assistant', 
      content: '', 
      isStreaming: true 
    };
    setMessages([...newMessages, streamingMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages,
          modelData,
          isFirstMessage: messages.length === 0,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      let fullContent = '';
      let lastUpdateTime = 0;
      const UPDATE_INTERVAL = 50; // Update UI every 50ms max

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                
                // Throttle updates to reduce re-renders
                const now = Date.now();
                if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                  lastUpdateTime = now;
                  
                  // Update the streaming message with optimistic parsing
                  setMessages(prev => {
                    const updated = [...prev];
                    const lastIndex = updated.length - 1;
                    if (updated[lastIndex]?.isStreaming) {
                      const streamingData = parseStreamingContent(fullContent);
                      updated[lastIndex] = { 
                        ...updated[lastIndex], 
                        content: fullContent,
                        parsedData: (streamingData.hasAnalysisStarted || streamingData.hasDataStarted || streamingData.hasNotesStarted) ? {
                          analysis: streamingData.analysis,
                          dataRaw: streamingData.dataRaw,
                          notes: streamingData.notes,
                          dataType: streamingData.dataType,
                          hasAnalysisStarted: streamingData.hasAnalysisStarted,
                          hasDataStarted: streamingData.hasDataStarted,
                          hasNotesStarted: streamingData.hasNotesStarted
                        } : undefined
                      };
                    }
                    return updated;
                  });
                }
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      // Parse the final content for structured data
      const parsedData = parseResponseFormat(fullContent);

      // Convert to streaming format to maintain UI consistency
      const finalStreamingData = parsedData ? {
        analysis: parsedData.analysis,
        dataRaw: JSON.stringify(parsedData.data, null, 2), // Convert back to raw JSON string
        notes: parsedData.notes,
        dataType: parsedData.dataType,
        hasAnalysisStarted: true,
        hasDataStarted: true,
        hasNotesStarted: true
      } : undefined;

      // Finalize the message
      setMessages(prev => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (updated[lastIndex]?.isStreaming) {
          updated[lastIndex] = {
            ...updated[lastIndex], // Preserve all existing properties including showJsonPreview
            role: 'assistant',
            content: fullContent || 'Data analyzed successfully.',
            parsedData: finalStreamingData,
            isStreaming: false,
          };
        }
        return updated;
      });

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // User interrupted the stream
        setMessages(prev => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (updated[lastIndex]?.isStreaming) {
            updated[lastIndex] = {
              ...updated[lastIndex], // Preserve all existing properties including showJsonPreview
              role: 'assistant',
              content: 'Response interrupted by user.',
              isStreaming: false,
            };
          }
          return updated;
        });
      } else {
        console.error('Error sending message:', error);
        setMessages(prev => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (updated[lastIndex]?.isStreaming) {
            updated[lastIndex] = {
              ...updated[lastIndex], // Preserve all existing properties including showJsonPreview
              role: 'assistant',
              content: 'Sorry, there was an error processing your request.',
              isStreaming: false,
            };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      setStreamController(null);
    }
  };

  const handleInterrupt = () => {
    if (streamController) {
      streamController.abort();
    }
  };

  const handleUseData = (data: any, dataType: 'complete' | 'partial' = 'complete') => {
    if (dataType === 'complete') {
      // Replace all data
      setModelData(data);
    } else {
      // Merge with existing data
      setModelData(prevData => {
        if (!prevData || !prevData.data) {
          return data; // If no existing data, use new data
        }
        
        // Merge axes - only update if new axes are provided
        const mergedAxes = data.axes ? data.axes : prevData.axes;
        
        // Merge data points - update existing ones, add new ones
        const existingDataMap = new Map(prevData.data.map((item: any) => [item.id, item]));
        const newDataMap = new Map(data.data.map((item: any) => [item.id, item]));
        
        // Start with existing data
        const mergedData = [...prevData.data];
        
        // Update or add data points
        data.data.forEach((newItem: any) => {
          const existingIndex = mergedData.findIndex((item: any) => item.id === newItem.id);
          if (existingIndex >= 0) {
            // Update existing item with only the fields that are provided
            mergedData[existingIndex] = {
              ...mergedData[existingIndex],
              ...(newItem.coords && { coords: newItem.coords }),
              ...(newItem.text && { text: newItem.text }),
              ...(newItem.estimation && { estimation: newItem.estimation }),
              ...(newItem.emoji && { emoji: newItem.emoji }),
              ...(newItem.author && { author: newItem.author }),
              ...(newItem.replies_to !== undefined && { replies_to: newItem.replies_to })
            };
          } else {
            // Add new item
            mergedData.push(newItem);
          }
        });
        
        return {
          ...prevData,
          axes: mergedAxes,
          data: mergedData
        };
      });
    }
  };

  const handleReset = () => {
    setMessages([]);
  };

  // Parse the LLM response format with robust markers
  const parseResponseFormat = (content: string) => {
    const analysisMatch = content.match(/<!--ANALYSIS_START-->([\s\S]*?)<!--ANALYSIS_END-->/);
    const dataMatch = content.match(/<!--DATA_START-->([\s\S]*?)<!--DATA_END-->/);
    const notesMatch = content.match(/<!--NOTES_START-->([\s\S]*?)<!--NOTES_END-->/);
    
    if (!dataMatch) return null;
    
    try {
      const data = JSON.parse(dataMatch[1].trim());
      return {
        analysis: analysisMatch?.[1]?.trim() || '',
        data: data,
        dataType: data.type || 'complete',
        notes: notesMatch?.[1]?.trim() || ''
      };
    } catch (error) {
      console.error('Error parsing JSON data:', error);
      return null;
    }
  };

  // Parse streaming content optimistically - show sections immediately
  const parseStreamingContent = (content: string) => {
    const analysisMatch = content.match(/<!--ANALYSIS_START-->([\s\S]*?)(?=<!--ANALYSIS_END-->|<!--DATA_START-->|$)/);
    const dataMatch = content.match(/<!--DATA_START-->([\s\S]*?)(?=<!--DATA_END-->|<!--NOTES_START-->|$)/);
    const notesMatch = content.match(/<!--NOTES_START-->([\s\S]*?)(?=<!--NOTES_END-->|$)/);
    
    // Try to extract data type from partial JSON
    let dataType: 'complete' | 'partial' = 'complete';
    if (dataMatch) {
      try {
        const partialData = JSON.parse(dataMatch[1].trim());
        dataType = partialData.type || 'complete';
      } catch (e) {
        // If we can't parse yet, check for type in the raw string
        if (dataMatch[1].includes('"type": "partial"')) {
          dataType = 'partial';
        }
      }
    }
    
    return {
      analysis: analysisMatch?.[1]?.trim() || '',
      dataRaw: dataMatch?.[1]?.trim() || '', // Keep as raw string
      notes: notesMatch?.[1]?.trim() || '',
      dataType: dataType,
      hasCompleteData: dataMatch && content.includes('<!--DATA_END-->'),
      hasCompleteAnalysis: analysisMatch && content.includes('<!--ANALYSIS_END-->'),
      hasCompleteNotes: notesMatch && content.includes('<!--NOTES_END-->'),
      // Show sections as soon as they start
      hasAnalysisStarted: content.includes('<!--ANALYSIS_START-->'),
      hasDataStarted: content.includes('<!--DATA_START-->'),
      hasNotesStarted: content.includes('<!--NOTES_START-->')
    };
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Message Component with collapsible content and JSON preview
  const MessageComponent = ({ message, onUseData }: { message: Message; onUseData: (data: any) => void }) => {
    const [isCollapsed, setIsCollapsed] = useState(true); // Default to collapsed
    const [parsedData, setParsedData] = useState<any>(null);
    
    const isLongMessage = message.content.length > 200;
    const shouldShowCollapse = isLongMessage && !message.isStreaming;
    const hasStructuredData = message.parsedData && (message.parsedData.analysis || message.parsedData.dataRaw || message.parsedData.notes);

    // Parse data when user clicks load button
    const handleLoadData = () => {
      if (!message.parsedData?.dataRaw) return;
      
      try {
        const data = JSON.parse(message.parsedData.dataRaw);
        
        // Validate the data structure based on type
        const isPartial = data.type === 'partial';
        
        // For partial updates, axes are optional
        if (!isPartial && (!data.axes || !Array.isArray(data.axes))) {
          alert('Invalid data: missing or invalid axes array');
          return;
        }
        
        if (!data.data || !Array.isArray(data.data)) {
          alert('Invalid data: missing or invalid data array');
          return;
        }
        
        // Validate axes structure (only if axes are provided)
        if (data.axes) {
          for (const axis of data.axes) {
            if (!axis.label || !axis.positive || !axis.negative) {
              alert('Invalid data: axes must have label, positive, and negative properties');
              return;
            }
          }
        }
        
        // Validate data points structure (relaxed for partial updates)
        for (const point of data.data) {
          if (!point.id) {
            alert('Invalid data: data points must have an id');
            return;
          }
          
          // For complete data, require all fields
          if (!isPartial) {
            if (!point.author || !point.text || !point.coords || !Array.isArray(point.coords)) {
              alert('Invalid data: data points must have id, author, text, and coords array');
              return;
            }
          }
          // For partial data, only validate coords if provided
          else if (point.coords && !Array.isArray(point.coords)) {
            alert('Invalid data: coords must be an array');
            return;
          }
        }
        
        setParsedData(data);
        onUseData(data, message.parsedData.dataType || 'complete');
      } catch (error) {
        console.error('Error parsing JSON data:', error);
        alert('Invalid JSON data: ' + (error as Error).message);
      }
    };

    return (
      <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[80%]">
          {/* Only show raw content if no structured data or if user wants to see it */}
          {(!hasStructuredData || !isCollapsed) && (
            <div
            className={`p-3 rounded-lg ${
              message.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-800'
            } ${message.isStreaming ? 'opacity-70' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                {shouldShowCollapse && isCollapsed ? (
                  <div>
                    <div className="text-sm opacity-75">
                      {message.content.substring(0, 200)}...
                    </div>
                    <button
                      onClick={() => setIsCollapsed(false)}
                      className="text-blue-600 hover:text-blue-800 text-sm mt-1"
                    >
                      Show more
                    </button>
                  </div>
                ) : (
                  <div>
                    {message.content}
                    {shouldShowCollapse && (
                      <button
                        onClick={() => setIsCollapsed(true)}
                        className="text-blue-600 hover:text-blue-800 text-sm mt-1 ml-2"
                      >
                        Show less
                      </button>
                    )}
                  </div>
                )}
              </div>
              {message.isStreaming && (
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              )}
            </div>
          </div>
          )}
          
          {/* Show "Show all" button when structured data exists */}
          {hasStructuredData && isCollapsed && (
            <div className="mt-2">
              <button
                onClick={() => setIsCollapsed(false)}
                className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors"
              >
                Show full message
              </button>
            </div>
          )}
          
          {/* Parsed Data Section */}
          {message.parsedData && (
            <div className="mt-2 space-y-2">
              {/* Analysis */}
              {(message.parsedData.analysis || message.parsedData.hasAnalysisStarted) && (
                <div className="p-2 bg-blue-600 border border-blue-700 rounded text-sm">
                  <div className="font-semibold text-white mb-1">📊 Analysis:</div>
                  <div className="text-white">{message.parsedData.analysis || 'Starting analysis...'}</div>
                  {message.isStreaming && !message.content.includes('<!--ANALYSIS_END-->') && (
                    <div className="text-xs text-blue-200 mt-1">⏳ Streaming...</div>
                  )}
                </div>
              )}
              
              {/* Data Preview */}
              {(message.parsedData.dataRaw || message.parsedData.hasDataStarted || (message.isStreaming && message.content.includes('<!--DATA_START-->'))) && (
                <div className="bg-gray-100 border rounded p-3 text-xs">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">📋 Data Preview:</span>
                    {message.parsedData.dataType && (
                      <span className={`px-2 py-1 text-xs rounded ${
                        message.parsedData.dataType === 'complete' 
                          ? 'bg-red-100 text-red-800 border border-red-200' 
                          : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                      }`}>
                        {message.parsedData.dataType === 'complete' ? '🔄 Replace All' : '➕ Merge'}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setMessages(prev => prev.map(msg => 
                          msg === message ? { ...msg, showJsonPreview: !(msg.showJsonPreview || false) } : msg
                        ));
                      }}
                      className="px-2 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors"
                    >
                      {(message.showJsonPreview || false) ? 'Hide' : (message.isStreaming ? 'Show Live' : 'Show All')}
                    </button>
                    {!message.isStreaming && message.parsedData.dataRaw && (
                      <button
                        onClick={handleLoadData}
                        className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors"
                      >
                        Load This Data
                      </button>
                    )}
                  </div>
                </div>
                
                {(message.showJsonPreview || false) ? (
                  <div>
                    <pre className="whitespace-pre-wrap overflow-x-auto">
                      {message.isStreaming && (message.parsedData.hasDataStarted || message.content.includes('<!--DATA_START-->')) ? (
                        // Show streaming JSON content
                        message.content.match(/<!--DATA_START-->([\s\S]*?)(?=<!--DATA_END-->|<!--NOTES_START-->|$)/)?.[1]?.trim() || 'Building JSON...'
                      ) : (
                        // Show final JSON content
                        message.parsedData.dataRaw || 'No data available'
                      )}
                    </pre>
                    {message.isStreaming && (message.parsedData.hasDataStarted || message.content.includes('<!--DATA_START-->')) && (
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        Live streaming JSON...
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-gray-600">
                    <div>Raw JSON: {message.parsedData.dataRaw ? 'Available' : 'Not available'}</div>
                    {parsedData && (
                      <>
                        <div>Axes: {parsedData.axes?.length || 0} dimensions</div>
                        <div>Data points: {parsedData.data?.length || 0} messages</div>
                      </>
                    )}
                    {message.isStreaming && !message.content.includes('<!--DATA_END-->') && (
                      <div className="text-xs text-gray-500 mt-1">⏳ Building data structure...</div>
                    )}
                    {!message.isStreaming && (
                      <div className="text-xs mt-1 opacity-75">Click "Show All" to see full JSON</div>
                    )}
                  </div>
                )}
              </div>
              )}
              
              {/* Notes */}
              {(message.parsedData.notes || message.parsedData.hasNotesStarted) && (
                <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                  <div className="font-semibold text-yellow-800 mb-1">💡 Notes:</div>
                  <div className="text-yellow-700">{message.parsedData.notes || 'Adding suggestions...'}</div>
                  {message.isStreaming && !message.content.includes('<!--NOTES_END-->') && (
                    <div className="text-xs text-yellow-500 mt-1">⏳ Adding suggestions...</div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Show streaming indicator for incomplete sections */}
          {message.isStreaming && message.content.includes('<!--ANALYSIS_START-->') && !message.parsedData && (
            <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-sm">
              <div className="text-gray-600">⏳ Parsing response structure...</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Main Data Display Area */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full bg-white">
          <div className="h-full overflow-hidden">
            {Object.keys(modelData).length > 0 ? (
              <DiscourseMap initialData={modelData} />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-700">
                <div className="text-center">
                  <div className="text-6xl mb-4">🗺️</div>
                  <h2 className="text-xl font-semibold mb-2">No Data Yet</h2>
                  <p className="text-sm">Paste some messages in the chat to analyze and visualize discourse patterns.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Chat Sidebar */}
      <div 
        ref={chatRef}
        className="bg-white shadow-lg flex flex-col overflow-hidden relative"
        style={{ width: `${chatWidth}px` }}
      >
        {/* Resize handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 bg-gray-300 hover:bg-gray-400 cursor-col-resize z-10"
          onMouseDown={() => setIsResizing(true)}
        />
        
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">AI Chat</h2>
          <div className="flex gap-2">
            {isStreaming && (
              <button
                onClick={handleInterrupt}
                className="px-3 py-1 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 transition-colors"
              >
                Stop
              </button>
            )}
            <button
              onClick={handleReset}
              className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <MessageComponent 
              key={index} 
              message={message} 
              onUseData={handleUseData}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex space-x-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="flex-1 p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              rows={3}
              disabled={isLoading || isStreaming}
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading || isStreaming}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}